/**
 * cart-checkout.service.ts
 *
 * Phase 5A + B2B Idempotency — Converts a completed B2B cart into a Store order.
 *
 * Architecture (post-062):
 *   Checkout submission uses place_b2b_cart_order_idempotent, a single PostgreSQL
 *   transaction that atomically owns:
 *     1. Checkout attempt insert / completed-replay
 *     2. Cart row lock + ownership + version guard
 *     3. Order creation via canonical place_order()
 *     4. Order ↔ attempt + cart linkage
 *     5. Attempt completion + cart conversion
 *
 *   If ANY step fails, the entire transaction rolls back:
 *     - No committed order
 *     - No stock decrement
 *     - Cart remains active
 *     - No stranded checkout_in_progress
 *
 * Critical Replay Contract:
 *   When checkout_attempt_id is supplied AND the attempt is already COMPLETED:
 *     - Return existing order_id, order_number, reused=true
 *     - Do NOT require an active cart
 *     - Do NOT re-run product availability, stock, delivery, or commercial pricing
 *     - A completed checkout is historical truth
 *
 * Security:
 *   - All pricing comes from DB, not from cart items snapshot or client payload
 *   - B2B identity derived entirely from verified X-Store-Session claims
 *   - No client-supplied prices, totals, or financial data accepted
 *   - Payment method is always 'cod' for Phase 5 (COD only)
 */

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { JenniPricingService } from "../jenni/jenni-pricing.service";
import { OrderFinanceService } from "../finance/order-finance.service";
import { StoreSessionClaims, ViewerContext } from "../store-integration/store-integration.types";
import { CartCheckoutPreviewDto, CartCheckoutSubmitDto } from "./cart.dto";
import { CartRecord, CartItemRecord } from "./cart.types";
import { normalizeIraqiPhone } from "../../common/validators/iraqi-phone.validator";
import { CheckoutAttemptsService } from "../orders/checkout-attempts.service";

const BARBER_APP_CHECKOUT_CHANNEL = "barber_app_checkout";

import { ProductPurchaseEligibilityService } from "../store-integration/product-purchase-eligibility.service";

type ProductRow = {
  id: string;
  name: string | null;
  price: number | string | null;
  discount_price: number | string | null;
  offer_ends_at: string | null;
  stock: number | null;
  is_active: boolean | null;
  is_published: boolean | null;
  visibility_status: string | null;
  purchase_mode: string[] | string | null;
  merchant_id: string;
  category_id: string | null;
  min_order_qty: number | null;
  max_order_qty: number | null;
  // Visibility segmentation fields (Fix 2)
  visible_in: string[] | null;
  target_audience: string[] | null;
  business_type_tags: string[] | null;
  requires_verified_salon: boolean | null;
};

type ResolvedLine = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type ResolvedCart = {
  merchant_id: string;
  lines: ResolvedLine[];
  merchandise_subtotal: number;
  rpc_items: Array<{ product_id: string; product_name: string; quantity: number; price: number }>;
  category_ids: string[];
};

@Injectable()
export class CartCheckoutService {
  private readonly logger = new Logger(CartCheckoutService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly jenniPricing: JenniPricingService,
    private readonly orderFinanceService: OrderFinanceService,
    private readonly eligibilityService: ProductPurchaseEligibilityService,
    private readonly checkoutAttempts: CheckoutAttemptsService,
  ) {}


  // ─── Private helpers ──────────────────────────────────────────────────────

  private effectiveUnitPrice(row: Pick<ProductRow, "price" | "discount_price" | "offer_ends_at">): number {
    const price = Number(row.price ?? 0);
    const rawDisc = row.discount_price;
    const disc = rawDisc != null && rawDisc !== "" ? Number(rawDisc) : null;
    const offerOk = !row.offer_ends_at || new Date(row.offer_ends_at) > new Date();
    if (disc != null && !Number.isNaN(disc) && disc >= 0 && disc < price && offerOk) {
      return disc;
    }
    return price;
  }

  private async findActiveCart(linkedProfileId: string): Promise<CartRecord | null> {
    const { data, error } = await this.supabaseAdmin.client
      .from("store_carts")
      .select("*")
      .eq("store_linked_profile_id", linkedProfileId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data as CartRecord | null;
  }

  private async fetchCartItems(cartId: string): Promise<CartItemRecord[]> {
    const { data, error } = await this.supabaseAdmin.client
      .from("store_cart_items")
      .select("*")
      .eq("cart_id", cartId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []) as CartItemRecord[];
  }

  /**
   * Re-validates all cart items against live DB data.
   *
   * Guarantees at checkout time:
   *   - Prices re-fetched from DB (cart snapshot not trusted for calculations)
   *   - Product visibility re-checked via ProductVisibilityService (Fix 2)
   *   - Stock ≥ requested quantity
   *   - Quantity within [min_order_qty, max_order_qty] range (Fix 3)
   *   - Single merchant enforcement
   *   - Merchant is active
   */
  private async resolveCartLines(items: CartItemRecord[], claims: StoreSessionClaims): Promise<ResolvedCart> {
    if (items.length === 0) {
      throw new BadRequestException("السلة فارغة. أضف منتجات قبل إتمام الطلب.");
    }

    const productIds = [...new Set(items.map((i) => i.product_id))];
    const { data: rows, error } = await this.supabaseAdmin.client
      .from("products")
      .select(
        "id, name, price, discount_price, offer_ends_at, stock, is_active, " +
        "is_published, visibility_status, purchase_mode, " +
        "merchant_id, category_id, min_order_qty, max_order_qty, " +
        "visible_in, target_audience, business_type_tags, requires_verified_salon",
      )
      .in("id", productIds);
    if (error) throw error;

    const byId = new Map((rows as unknown as ProductRow[] | null)?.map((r) => [r.id, r]) ?? []);
    const merchantIds = new Set<string>();

    for (const id of productIds) {
      const row = byId.get(id);
      if (!row) throw new BadRequestException(`المنتج غير موجود: ${id}`);
      merchantIds.add(row.merchant_id);
    }

    if (merchantIds.size !== 1) {
      throw new BadRequestException("السلة تحتوي على منتجات من أكثر من تاجر. يجب أن تكون جميع المنتجات من تاجر واحد.");
    }

    const merchantId = [...merchantIds][0];

    const { data: merchantRow, error: merchantErr } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, status")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantErr) throw merchantErr;
    if (!merchantRow || (merchantRow as { status: string }).status !== "active") {
      throw new BadRequestException("التاجر غير متاح حاليًا. يرجى المحاولة لاحقًا.");
    }

    // Build viewer context from verified session claims for visibility re-check
    const viewerCtx: ViewerContext = {
      surface: "barber_app",
      segment: claims.segment,
      businessType: claims.businessType,
      salonVerified: claims.salonVerified === true,
      sourceApp: claims.sourceApp,
      isTrusted: true,
      requiresVerifiedSalonCheck: true,
    };

    const lines: ResolvedLine[] = [];
    const categoryIds = new Set<string>();
    let merchandise_subtotal = 0;

    for (const cartItem of items) {
      const row = byId.get(cartItem.product_id)!;
      const qty = Math.max(1, Math.floor(Number(cartItem.quantity)));

      // Canonical purchase eligibility evaluation at checkout
      const eligibility = this.eligibilityService.evaluate(row as any, {
        channel: "barber_app",
        viewerContext: viewerCtx,
        merchantStatus: (merchantRow as { status: string }).status,
        quantity: qty,
      });

      if (!eligibility.eligible) {
        throw new BadRequestException(
          eligibility.message ?? `أحد المنتجات لم يعد متاحاً للشراء: ${row.name ?? row.id}`,
        );
      }

      const unit = this.effectiveUnitPrice(row);
      if (unit <= 0 || Number.isNaN(unit)) {
        throw new BadRequestException(`سعر المنتج غير صالح: ${row.name ?? row.id}`);
      }

      const line_total = unit * qty;
      merchandise_subtotal += line_total;

      const product_name = (row.name ?? "").trim() || "Product";
      lines.push({ product_id: row.id, product_name, quantity: qty, unit_price: unit, line_total });
      if (row.category_id) categoryIds.add(String(row.category_id));
    }


    const rpc_items = lines.map((l) => ({
      product_id: l.product_id,
      product_name: l.product_name,
      quantity: l.quantity,
      price: l.unit_price,
    }));

    return { merchant_id: merchantId, lines, merchandise_subtotal, rpc_items, category_ids: [...categoryIds] };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Preview checkout totals for the active cart.
   * Does NOT modify cart state or create any order.
   * Returns subtotal, discount, delivery_cost, total, and item list.
   */
  async previewCartCheckout(claims: StoreSessionClaims, dto: CartCheckoutPreviewDto) {
    const cart = await this.findActiveCart(claims.linkedProfileId);

    if (!cart) {
      return {
        cart: null,
        items: [],
        subtotal: 0,
        discount: 0,
        delivery_cost: null as number | null,
        total: 0,
        itemCount: 0,
      };
    }

    const cartItems = await this.fetchCartItems(cart.id);
    if (cartItems.length === 0) {
      return {
        cart: { id: cart.id, status: cart.status },
        items: [],
        subtotal: 0,
        discount: 0,
        delivery_cost: null as number | null,
        total: 0,
        itemCount: 0,
      };
    }

    const resolved = await this.resolveCartLines(cartItems, claims);
    const delivery_cost = await this.jenniPricing.resolveJenniDeliveryPrice(dto.governorate_id);
    const total = Math.max(0, resolved.merchandise_subtotal + delivery_cost);

    return {
      cart: { id: cart.id, merchant_id: cart.merchant_id },
      items: resolved.lines.map((l) => ({
        product_id: l.product_id,
        product_name: l.product_name,
        quantity: l.quantity,
        unit_price: l.unit_price,
        line_total: l.line_total,
      })),
      subtotal: resolved.merchandise_subtotal,
      discount: 0,
      delivery_cost,
      total,
      itemCount: cartItems.reduce((acc, i) => acc + Number(i.quantity), 0),
    };
  }

  /**
   * Submits the active cart as a real Store order.
   *
   * Architecture (post-062):
   *   Uses place_b2b_cart_order_idempotent for atomic single-transaction checkout.
   *
   * Critical Replay Contract:
   *   When checkout_attempt_id is supplied AND the attempt is already COMPLETED:
   *     - Short-circuit: return existing order immediately
   *     - Do NOT require an active cart
   *     - Do NOT re-run product/pricing/delivery/commercial validation
   *     - A completed checkout is historical truth
   *
   *   When the attempt is new or not completed:
   *     - Resolve active cart, compute live products/pricing
   *     - Capture cart version (updated_at)
   *     - Execute atomic RPC
   *
   * Guarantees:
   *   - Cart lock + order + cart conversion are ONE DB transaction
   *   - Process crash before commit → full rollback, cart active
   *   - No stranded checkout_in_progress possible
   *   - Same attempt replay → same order (reused=true)
   *   - Same attempt + different hash → 409
   *   - One Store cart → at most one order (DB unique constraint)
   */
  async submitCartCheckout(
    claims: StoreSessionClaims,
    dto: CartCheckoutSubmitDto,
  ): Promise<{
    id?: string | null;
    order_number: string;
    checkout_attempt_id: string;
    reused: boolean;
    totals: { subtotal: number; discount: number; delivery_cost: number; total: number };
  }> {
    // ── Step 0: Generate or accept attempt ID ──
    const attemptId = dto.checkout_attempt_id || crypto.randomUUID();

    // ── Step 1: Check for completed replay (before ANY cart/product resolution) ──
    //
    // Critical: a completed checkout is historical truth.
    // Replay must never fail because cart is converted, product became inactive,
    // stock changed, price changed, or commercial terms changed.
    const { data: existingAttempt } = await this.supabaseAdmin.client
      .from("checkout_attempts")
      .select("*")
      .eq("id", attemptId)
      .maybeSingle();

    if (existingAttempt) {
      // Ownership verification
      if (existingAttempt.store_linked_profile_id !== claims.linkedProfileId) {
        throw new ForbiddenException("غير مسموح بالوصول لمحاولة طلب مرتبطة بحساب آخر");
      }

      // Completed replay: return existing order immediately
      if (existingAttempt.status === "completed" && existingAttempt.order_number) {
        const normalizedPhone = normalizeIraqiPhone(dto.customer_phone);

        // Verify request hash using the attempt's persisted store_cart_id and submitted delivery data
        // Pure historical verification — never re-reads live cart items or merchant status
        const storedCartId = existingAttempt.store_cart_id;
        if (storedCartId) {
          const requestHash = this.checkoutAttempts.computeB2BRequestHash({
            store_linked_profile_id: claims.linkedProfileId,
            store_cart_id: storedCartId,
            customer_name: dto.customer_name,
            customer_phone: normalizedPhone,
            governorate_id: dto.governorate_id,
            area: dto.area,
            nearest_landmark: dto.nearest_landmark,
            notes: dto.notes,
            latitude: dto.latitude ?? undefined,
            longitude: dto.longitude ?? undefined,
            map_url: dto.map_url ?? undefined,
          });

          if (existingAttempt.request_hash !== requestHash) {
            throw new ConflictException({
              code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
              message: "تم استخدام مفتاح المحاولة السابق مع بيانات طلب مختلفة.",
            });
          }
        }

        this.logger.log(
          `[cart-checkout] Replay: returning existing order ${existingAttempt.order_number} for attempt ${attemptId}`,
        );

        // Fetch totals from the existing order for response
        const { data: orderRow } = await this.supabaseAdmin.client
          .from("orders")
          .select("id, subtotal, discount, delivery_cost, total")
          .eq("id", existingAttempt.order_id)
          .maybeSingle();

        return {
          id: existingAttempt.order_id,
          order_number: existingAttempt.order_number,
          checkout_attempt_id: attemptId,
          reused: true,
          totals: {
            subtotal: Number((orderRow as any)?.subtotal ?? 0),
            discount: Number((orderRow as any)?.discount ?? 0),
            delivery_cost: Number((orderRow as any)?.delivery_cost ?? 0),
            total: Number((orderRow as any)?.total ?? 0),
          },
        };
      }

      // Hash mismatch for non-completed attempt
      // We'll verify hash consistency in the atomic RPC as well
    }

    // ── Step 2: Resolve active cart + live products/pricing ──
    const cart = await this.findActiveCart(claims.linkedProfileId);

    if (!cart) {
      throw new BadRequestException("لا توجد سلة نشطة. أضف منتجات إلى السلة أولًا.");
    }

    const cartItems = await this.fetchCartItems(cart.id);
    if (cartItems.length === 0) {
      throw new BadRequestException("السلة فارغة. أضف منتجات قبل إتمام الطلب.");
    }

    // Check: another checkout attempt may already be in progress (race condition guard)
    if ((cart as any).status === "checkout_in_progress") {
      throw new ConflictException("الطلب قيد المعالجة بالفعل. يرجى الانتظار لحظة وإعادة المحاولة.");
    }

    // Capture cart version for optimistic lock
    const cartUpdatedAt = (cart as any).updated_at;

    // ── Step 3: Re-validate products / prices / stock / visibility from DB ──
    const resolved = await this.resolveCartLines(cartItems, claims);

    // ── Step 4: Delivery cost from Jenni ──
    const deliveryCost = await this.jenniPricing.resolveJenniDeliveryPrice(dto.governorate_id);

    // ── Step 5: Financial snapshot ──
    const terms = await this.orderFinanceService.resolveCommercialTerms({
      merchant_id: resolved.merchant_id,
      channel: BARBER_APP_CHECKOUT_CHANNEL,
      order_value: resolved.merchandise_subtotal + deliveryCost,
      category_ids: resolved.category_ids,
    });

    const financialSnapshot = this.orderFinanceService.computeOrderFinancialSnapshot({
      subtotal: resolved.merchandise_subtotal,
      discount: 0,
      deliveryFeeCharged: deliveryCost,
      channel: BARBER_APP_CHECKOUT_CHANNEL,
      categoryIds: resolved.category_ids,
      terms,
    });

    const orderTotal = Math.max(0, resolved.merchandise_subtotal + deliveryCost);

    // ── Step 6: Normalize phone ──
    const normalizedPhone = normalizeIraqiPhone(dto.customer_phone);

    // ── Step 7: Compute B2B request hash ──
    const requestHash = this.checkoutAttempts.computeB2BRequestHash({
      store_linked_profile_id: claims.linkedProfileId,
      store_cart_id: cart.id,
      customer_name: dto.customer_name,
      customer_phone: normalizedPhone,
      governorate_id: dto.governorate_id,
      area: dto.area,
      nearest_landmark: dto.nearest_landmark,
      notes: dto.notes,
      latitude: dto.latitude ?? undefined,
      longitude: dto.longitude ?? undefined,
      map_url: dto.map_url ?? undefined,
    });

    // ── Step 8: Call atomic B2B checkout RPC ──
    try {
      const { data, error } = await this.supabaseAdmin.client.rpc("place_b2b_cart_order_idempotent", {
        // Idempotency
        p_checkout_attempt_id: attemptId,
        p_checkout_request_hash: requestHash,
        // B2B Identity
        p_store_linked_profile_id: claims.linkedProfileId,
        p_store_cart_id: cart.id,
        p_expected_cart_updated_at: cartUpdatedAt,
        // Customer / Delivery
        p_customer_name: dto.customer_name,
        p_customer_phone: normalizedPhone,
        p_governorate_id: dto.governorate_id,
        p_area: dto.area,
        p_nearest_landmark: dto.nearest_landmark ?? null,
        p_notes: dto.notes ?? null,
        // Financials
        p_subtotal: resolved.merchandise_subtotal,
        p_delivery_cost: deliveryCost,
        p_discount: 0,
        p_total: orderTotal,
        p_coupon_id: null,
        p_items: resolved.rpc_items,
        // GPS
        p_latitude: dto.latitude ?? null,
        p_longitude: dto.longitude ?? null,
        p_map_url: dto.map_url ?? null,
        // Merchant
        p_merchant_id: resolved.merchant_id,
        // Financial Snapshot
        p_merchandise_subtotal: financialSnapshot.merchandise_subtotal,
        p_discount_total: financialSnapshot.discount_total,
        p_delivery_fee_charged: financialSnapshot.delivery_fee_charged,
        p_platform_commission_type: financialSnapshot.platform_commission_type,
        p_platform_commission_rate: financialSnapshot.platform_commission_rate,
        p_platform_commission_amount: financialSnapshot.platform_commission_amount,
        p_platform_assisted_fee_amount: financialSnapshot.platform_assisted_fee_amount,
        p_platform_extra_fee_amount: financialSnapshot.platform_extra_fee_amount,
        p_courier_fee_payable: financialSnapshot.courier_fee_payable,
        p_merchant_gross_amount: financialSnapshot.merchant_gross_amount,
        p_merchant_net_amount: financialSnapshot.merchant_net_amount,
        p_gross_collected_amount: financialSnapshot.gross_collected_amount,
        p_platform_net_revenue_amount: financialSnapshot.platform_net_revenue_amount,
        p_currency_code: financialSnapshot.currency_code,
        p_financial_snapshot_version: financialSnapshot.financial_snapshot_version,
        // Status
        p_payment_status: "unpaid",
        p_collection_status: "not_collected",
        p_settlement_status: "not_accrued",
        p_cash_expected_amount: orderTotal,
        // Commercial Rules
        p_commission_rule_id: financialSnapshot.commission_rule_id,
        p_assisted_fee_rule_id: financialSnapshot.assisted_fee_rule_id,
        p_platform_fee_rule_id: financialSnapshot.platform_fee_rule_id,
        p_delivery_billing_rule_id: financialSnapshot.delivery_billing_rule_id,
        p_resolved_plan_id: financialSnapshot.resolved_plan_id,
        p_resolved_plan_code: financialSnapshot.resolved_plan_code,
        p_commercial_snapshot_version: financialSnapshot.commercial_snapshot_version,
        // B2B Source Tracking
        p_source_app: claims.sourceApp,
        p_channel: BARBER_APP_CHECKOUT_CHANNEL,
        p_DilMart_user_id: claims.DilMartUserId,
        p_DilMart_barbershop_id: claims.DilMartBarbershopId ?? null,
        p_segment: claims.segment,
        p_business_type: claims.businessType ?? null,
      } as any);

      if (error) {
        this.logger.error(`[cart-checkout] place_b2b_cart_order_idempotent RPC error: ${error.message}`);
        throw error;
      }

      const result = data as { order_id: string; order_number: string; checkout_attempt_id: string; reused: boolean };

      this.logger.log(
        `[cart-checkout] Order ${result.reused ? "replayed" : "created"}: ${result.order_number} ` +
        `from cart ${cart.id} by profile ${claims.linkedProfileId} (attempt ${attemptId})`,
      );

      return {
        id: result.order_id,
        order_number: result.order_number,
        checkout_attempt_id: result.checkout_attempt_id,
        reused: result.reused,
        totals: {
          subtotal: resolved.merchandise_subtotal,
          discount: 0,
          delivery_cost: deliveryCost,
          total: orderTotal,
        },
      };
    } catch (err) {
      // Map RPC-level errors to HTTP-level responses
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`[cart-checkout] Checkout error: ${message}`);

      if (message.includes("B2B_CHECKOUT_ATTEMPT_OWNERSHIP_MISMATCH")) {
        throw new ForbiddenException("غير مسموح باستعمال محاولة طلب مرتبطة بحساب آخر");
      }
      if (message.includes("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD")) {
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
          message: "تم استخدام مفتاح المحاولة السابق مع بيانات طلب مختلفة.",
        });
      }
      if (message.includes("B2B_CHECKOUT_IN_PROGRESS")) {
        throw new ConflictException({
          code: "CHECKOUT_IN_PROGRESS",
          message: "جاري معالجة طلبك بالفعل، يرجى الانتظار لحين اكتمال العملية.",
        });
      }
      if (message.includes("B2B_CART_CHANGED_DURING_CHECKOUT")) {
        throw new ConflictException({
          code: "CART_CHANGED_DURING_CHECKOUT",
          message: "تغيرت السلة أثناء إتمام الطلب. يرجى مراجعة السلة وإعادة المحاولة.",
        });
      }
      if (message.includes("B2B_CART_NOT_FOUND") || message.includes("B2B_CART_NOT_ACTIVE")) {
        throw new BadRequestException("لا توجد سلة نشطة. أضف منتجات إلى السلة أولًا.");
      }
      if (message.includes("B2B_CART_ALREADY_CONVERTED")) {
        throw new ConflictException("تم تحويل السلة مسبقاً.");
      }
      if (message.includes("B2B_CART_OWNERSHIP_MISMATCH")) {
        throw new ForbiddenException("غير مسموح بالوصول لسلة مرتبطة بحساب آخر");
      }

      // Re-throw known NestJS exceptions as-is
      if (
        err instanceof BadRequestException ||
        err instanceof ConflictException ||
        err instanceof NotFoundException ||
        err instanceof ForbiddenException
      ) {
        throw err;
      }

      // Convert Supabase/Postgres errors to readable messages
      if (message.includes("Insufficient stock")) {
        throw new BadRequestException("الكمية المطلوبة غير متوفرة في المخزون لأحد المنتجات.");
      }
      if (message.includes("not available")) {
        throw new BadRequestException("أحد المنتجات أو التاجر غير متاح حاليًا.");
      }
      if (message.includes("merchandise total does not match")) {
        throw new BadRequestException("تغيرت أسعار بعض المنتجات. يرجى مراجعة السلة وإعادة المحاولة.");
      }

      throw new InternalServerErrorException("تعذر إتمام الطلب. يرجى المحاولة مرة أخرى.");
    }
  }
}
