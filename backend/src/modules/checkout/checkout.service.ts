import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { CheckoutPreviewDto, CheckoutSubmitDto } from "./checkout.dto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { OrderFinanceService } from "../finance/order-finance.service";
import { JenniPricingService } from "../jenni/jenni-pricing.service";
import { ProductPurchaseEligibilityService } from "../store-integration/product-purchase-eligibility.service";
import { StoreSurface } from "../store-integration/store-integration.types";
import { normalizeIraqiPhone } from "../../common/validators/iraqi-phone.validator";

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
  visible_in: string[] | null;
  target_audience: string[] | null;
  purchase_mode: string[] | string | null;
  min_order_qty: number | null;
  max_order_qty: number | null;
  merchant_id: string;
  category_id: string | null;
};

type ResolvedLine = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type ResolvedCheckout = {
  merchant_id: string;
  lines: ResolvedLine[];
  merchandise_subtotal: number;
  rpc_items: Array<{ product_id: string; product_name: string; quantity: number; price: number }>;
  category_ids: string[];
};

import { CheckoutAttemptsService } from "../orders/checkout-attempts.service";
import { CustomerCheckoutEnrichmentService } from "../orders/customer-checkout-enrichment.service";

@Injectable()
export class CheckoutService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly orderFinanceService: OrderFinanceService,
    private readonly jenniPricing: JenniPricingService,
    private readonly checkoutAttempts: CheckoutAttemptsService,
    private readonly enrichmentService: CustomerCheckoutEnrichmentService,
    private readonly eligibilityService: ProductPurchaseEligibilityService,
  ) {}

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

  /**
   * Loads catalog rows and computes totals from DB only (never trusts client unit prices).
   */
  private async resolveCheckoutLines(
    items: { product_id: string; quantity: number }[],
    surface: StoreSurface = "web_store",
  ): Promise<ResolvedCheckout> {
    const qtyByProduct = new Map<string, number>();
    for (const item of items) {
      const q = Math.max(1, Math.floor(Number(item.quantity)));
      qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) ?? 0) + q);
    }
    const aggregated = [...qtyByProduct.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));

    const ids = [...qtyByProduct.keys()];
    if (ids.length === 0) {
      throw new BadRequestException("Cart items are required.");
    }

    const { data: rows, error } = await this.supabaseAdmin.client
      .from("products")
      .select(
        "id,name,price,discount_price,offer_ends_at,stock,is_active,is_published,visibility_status,visible_in,target_audience,purchase_mode,min_order_qty,max_order_qty,merchant_id,category_id",
      )
      .in("id", ids);

    if (error) throw error;

    const byId = new Map((rows as ProductRow[] | null)?.map((r) => [r.id, r]) ?? []);
    const merchantIds = new Set<string>();

    for (const id of ids) {
      const row = byId.get(id);
      if (!row) {
        throw new BadRequestException(`Product not found: ${id}`);
      }
      merchantIds.add(row.merchant_id);
    }

    if (merchantIds.size !== 1) {
      throw new BadRequestException("Cart must contain products from exactly one merchant.");
    }

    const merchantId = [...merchantIds][0];

    const { data: merchantRow, error: merchantErr } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id,status")
      .eq("id", merchantId)
      .maybeSingle();

    if (merchantErr) throw merchantErr;
    if (!merchantRow || merchantRow.status !== "active") {
      throw new BadRequestException("Merchant is not available for checkout.");
    }

    const lines: ResolvedLine[] = [];
    const categoryIds = new Set<string>();
    let merchandise_subtotal = 0;

    for (const item of aggregated) {
      const row = byId.get(item.product_id)!;
      const qty = Math.max(1, Math.floor(Number(item.quantity)));

      // Canonical purchase eligibility evaluation for store surface
      const channel = surface === "customer_app" ? "customer_app" : "web_store";
      const eligibility = this.eligibilityService.evaluate(row as any, {
        channel,
        merchantStatus: merchantRow.status,
        quantity: qty,
      });

      if (!eligibility.eligible) {
        throw new BadRequestException(
          eligibility.message ?? `Product is not available for purchase: ${row.id}`,
        );
      }

      const unit = this.effectiveUnitPrice(row);
      if (unit <= 0 || Number.isNaN(unit)) {
        throw new BadRequestException(`Invalid catalog price for product: ${row.id}`);
      }

      const line_total = unit * qty;
      merchandise_subtotal += line_total;

      const product_name = (row.name ?? "").trim() || "Product";
      lines.push({
        product_id: row.id,
        product_name,
        quantity: qty,
        unit_price: unit,
        line_total,
      });

      if (row.category_id) {
        categoryIds.add(String(row.category_id));
      }
    }


    const rpc_items = lines.map((l) => ({
      product_id: l.product_id,
      product_name: l.product_name,
      quantity: l.quantity,
      price: l.unit_price,
    }));

    return {
      merchant_id: merchantId,
      lines,
      merchandise_subtotal,
      rpc_items,
      category_ids: [...categoryIds],
    };
  }

  private async buildQuote(resolved: ResolvedCheckout, coupon_code?: string | null) {
    let discount = 0;
    let couponId: string | null = null;

    if (coupon_code) {
      const { data, error } = await this.supabaseAdmin.client.rpc("validate_coupon", {
        p_code: coupon_code,
        p_total: resolved.merchandise_subtotal,
        p_merchant_id: resolved.merchant_id ?? null,
      });
      if (error) throw error;
      if ((data as { valid?: boolean })?.valid) {
        couponId = (data as { id?: string }).id ?? null;
        const d = data as { discount_type?: string; value?: number | string };
        discount =
          d.discount_type === "percentage"
            ? (resolved.merchandise_subtotal * Number(d.value ?? 0)) / 100
            : Number(d.value ?? 0);
      }
    }

    return {
      merchant_id: resolved.merchant_id,
      subtotal: resolved.merchandise_subtotal,
      discount,
      total: Math.max(0, resolved.merchandise_subtotal - discount),
      coupon_id: couponId,
    };
  }

  async preview(payload: CheckoutPreviewDto, surface: StoreSurface = "web_store") {
    const resolved = await this.resolveCheckoutLines(payload.items, surface);
    const quote = await this.buildQuote(resolved, payload.coupon_code);
    if (!payload.governorate_id) {
      return { ...quote, delivery_cost: null as number | null };
    }
    const delivery_cost = await this.jenniPricing.resolveJenniDeliveryPrice(payload.governorate_id);
    return {
      ...quote,
      delivery_cost,
      total: Math.max(0, quote.total + delivery_cost),
    };
  }

  private async resolveDeliveryCost(governorateId: string): Promise<number> {
    return this.jenniPricing.resolveJenniDeliveryPrice(governorateId);
  }

  async submit(payload: CheckoutSubmitDto, actorId?: string, surface: StoreSurface = "web_store") {
    if (!actorId) {
      throw new UnauthorizedException("يرجى إنشاء جلسة متابعة مؤقتة قبل إرسال الطلب.");
    }
    const isFederated = false;

    // Attempt Idempotency Lock
    const attemptId = payload.checkout_attempt_id || null;
    let requestHash = "";

    // Strict mode: reject submissions without a checkout_attempt_id
    const idempotencyRequired = process.env["CHECKOUT_IDEMPOTENCY_REQUIRED"] === "true";
    if (idempotencyRequired && !attemptId) {
      throw new BadRequestException({
        code: "CHECKOUT_ATTEMPT_ID_REQUIRED",
        message: "يجب تمرير checkout_attempt_id عند تفعيل وضع الإطلاق الآمن.",
      });
    }

    if (attemptId) {
      // Normalize phone BEFORE hashing to prevent hash drift between normalization stages
      const phoneForHash = normalizeIraqiPhone(payload.customer_phone);
      requestHash = this.checkoutAttempts.computeRequestHash({
        ...payload,
        customer_phone: phoneForHash,
      });
    }

    try {
      // Normalize phone to canonical 07XXXXXXXXX format for Jenni dispatch compatibility.
      const normalizedPhone = normalizeIraqiPhone(payload.customer_phone);

      const resolved = await this.resolveCheckoutLines(payload.items, surface);
      const quote = await this.buildQuote(resolved, payload.coupon_code);

      // Resolve delivery cost from DB — never trust the client-supplied value.
      const deliveryCost = await this.resolveDeliveryCost(payload.governorate_id);

      // Loyalty points: 1 point = 10 IQD discount.
      const pointsSpent = Math.max(0, Math.floor(Number(payload.points_spent ?? 0)));

      // Validate the actor's actual balance server-side — never trust the client figure.
      if (pointsSpent > 0) {
        // Supabase-only assurance gate: a provisional/phone-unverified Supabase account cannot spend
        // points. Federated actors are assured by their session and skip this gate (§Phase D rule).
        if (!isFederated) {
          let isProvisional = false;
          let isPhoneVerified = false;

          // Access user details from Supabase Auth admin API if available (in real environments)
          if (this.supabaseAdmin.client.auth.admin?.getUserById) {
            const { data: userData, error: userErr } = await this.supabaseAdmin.client.auth.admin.getUserById(actorId);
            if (!userErr && userData?.user) {
              isProvisional = userData.user.app_metadata?.account_type === "provisional_customer" ||
                              userData.user.user_metadata?.account_type === "provisional_customer";
              isPhoneVerified = userData.user.user_metadata?.phone_verified === true;
            }
          } else {
            // Fallback for mock/test environments
            const { data: profileRow } = await this.supabaseAdmin.client
              .from("profiles")
              .select("email")
              .eq("id", actorId)
              .maybeSingle();
            const emailLower = String(profileRow?.email ?? "").toLowerCase();
            isProvisional =
              emailLower.includes("@provisional.dilmart.com") ||
              emailLower.includes("@provisional.dilmart.org");
            isPhoneVerified = !isProvisional;
          }

          if (isProvisional || !isPhoneVerified) {
            throw new ForbiddenException("لا يمكن صرف نقاط الولاء باستخدام حساب مؤقت. يرجى توثيق رقم الهاتف أولاً.");
          }
        }

        const { data: pointsRow, error: pointsErr } = await this.supabaseAdmin.client
          .from("profiles")
          .select("points")
          .eq("id", actorId)
          .maybeSingle();
        if (pointsErr) throw pointsErr;
        const balance = Number((pointsRow as { points?: number | null } | null)?.points ?? 0);
        if (balance < pointsSpent) {
          throw new BadRequestException(
            `Insufficient loyalty points. Available: ${balance}, requested: ${pointsSpent}.`,
          );
        }
      }

      const pointsDiscount = pointsSpent > 0 ? pointsSpent * 10 : 0;
      // Earned points: floor(merchandise_subtotal / 100). The RPC inserts a loyalty_transaction row
      // and refreshes profiles.points atomically — no separate redeem call required.
      const pointsEarned = Math.floor(resolved.merchandise_subtotal / 100);

      // Authoritative total: merchandise - coupon_discount - points_discount + delivery.
      const orderTotal = Math.max(0, quote.subtotal - quote.discount - pointsDiscount + deliveryCost);

      const terms = await this.orderFinanceService.resolveCommercialTerms({
        merchant_id: resolved.merchant_id,
        channel: "web_checkout",
        order_value: orderTotal,
        category_ids: resolved.category_ids,
      });

      const financialSnapshot = this.orderFinanceService.computeOrderFinancialSnapshot({
        subtotal: quote.subtotal,
        discount: quote.discount,
        deliveryFeeCharged: deliveryCost,
        channel: "web_checkout",
        categoryIds: resolved.category_ids,
        terms,
      });

      const rpcName = attemptId ? "place_order_idempotent" : "place_order";
      const rpcParams: Record<string, unknown> = {
        ...(attemptId ? { p_checkout_attempt_id: attemptId, p_checkout_request_hash: requestHash } : {}),
        p_customer_name: payload.customer_name,
        p_customer_phone: normalizedPhone,
        p_governorate_id: payload.governorate_id,
        p_area: payload.area,
        p_nearest_landmark: payload.nearest_landmark ?? null,
        p_notes: payload.notes ?? null,
        p_subtotal: resolved.merchandise_subtotal,
        p_delivery_cost: deliveryCost,
        p_discount: quote.discount,
        p_total: orderTotal,
        p_coupon_id: quote.coupon_id,
        p_items: resolved.rpc_items,
        p_user_id: actorId,
        p_latitude: payload.latitude ?? null,
        p_longitude: payload.longitude ?? null,
        p_map_url: payload.map_url ?? null,
        p_points_spent: pointsSpent,
        p_points_discount: pointsDiscount,
        p_points_earned: pointsEarned,
        p_merchant_id: resolved.merchant_id,
        p_payment_method: "cod",
        p_merchant_notes: null,
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
        p_payment_status: "unpaid",
        p_collection_status: "not_collected",
        p_settlement_status: "not_accrued",
        p_cash_expected_amount: orderTotal,
        p_commission_rule_id: financialSnapshot.commission_rule_id,
        p_assisted_fee_rule_id: financialSnapshot.assisted_fee_rule_id,
        p_platform_fee_rule_id: financialSnapshot.platform_fee_rule_id,
        p_delivery_billing_rule_id: financialSnapshot.delivery_billing_rule_id,
        p_resolved_plan_id: financialSnapshot.resolved_plan_id,
        p_resolved_plan_code: financialSnapshot.resolved_plan_code,
        p_commercial_snapshot_version: financialSnapshot.commercial_snapshot_version,
        p_channel: "web_checkout",
      };

      const { data, error } = await this.supabaseAdmin.client.rpc(rpcName as any, rpcParams as any);

      if (error) throw error;

      const orderNumber = typeof data === "object" && data !== null ? String((data as any).order_number || "") : String(data);
      const isReused = typeof data === "object" && data !== null ? Boolean((data as any).reused) : false;

      // Post-checkout Profile & Address Enrichment (isolated — warnings returned, order preserved)
      const postCheckoutWarnings = await this.enrichmentService.enrichPostCheckout({
        userId: actorId,
        customerName: payload.customer_name,
        customerPhone: payload.customer_phone,
        governorateId: payload.governorate_id,
        area: payload.area,
        nearestLandmark: payload.nearest_landmark,
        mapUrl: payload.map_url,
        notes: payload.notes,
        saveAddress: payload.save_address,
      });

      return {
        order_number: orderNumber,
        checkout_attempt_id: attemptId,
        reused: isReused,
        post_checkout_warnings: postCheckoutWarnings,
        totals: {
          ...quote,
          delivery_cost: deliveryCost,
          points_discount: pointsDiscount,
          points_earned: pointsEarned,
          total: orderTotal,
        },
      };
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("CHECKOUT_IN_PROGRESS")) {
        throw new ConflictException({
          code: "CHECKOUT_IN_PROGRESS",
          message: "جاري معالجة طلبك بالفعل، يرجى الانتظار لحين اكتمال العملية.",
        });
      }
      if (msg.includes("IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD")) {
        throw new ConflictException({
          code: "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
          message: "تم استخدام مفتاح المحاولة السابق مع بيانات طلب مختلفة.",
        });
      }
      if (msg.includes("CHECKOUT_ATTEMPT_OWNERSHIP_MISMATCH")) {
        throw new ForbiddenException("غير مسموح باستعمال محاولة طلب مرتبطة بحساب آخر");
      }
      throw err;
    }
  }
}
