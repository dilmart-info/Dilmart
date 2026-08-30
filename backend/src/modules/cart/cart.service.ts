/**
 * cart.service.ts
 *
 * Phase 4B B2B Cart Service for DilMart Store.
 *
 * Ownership model:
 *   - Cart is always owned by store_linked_profile_id (from X-Store-Session claims).
 *   - Never by web user_id, phone, or anonymous session.
 *
 * Pricing invariant (never trusted from client):
 *   effective_unit_price = (discount_price && discount_price < unit_price)
 *                          ? discount_price : unit_price
 *   line_total           = effective_unit_price * quantity
 *
 * Visibility: uses ProductVisibilityService.canProductBeShown() — same logic as
 *   Home and Product Detail — to prevent visibility divergence between surfaces.
 *
 * Single-merchant rule:
 *   All items in an active cart must belong to the same merchant.
 *   Adding a product from a different merchant returns 409.
 */

import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { StoreSessionClaims, ViewerContext } from "../store-integration/store-integration.types";
import { ProductVisibilityService } from "../store-integration/product-visibility.service";
import { ProductPurchaseEligibilityService } from "../store-integration/product-purchase-eligibility.service";
import { resolveTrustedViewerContext } from "../store-integration/surface-resolver";
import {
  CartItemRecord,
  CartRecord,
  CartResponse,
  CartTotals,
  ProductForCart,
} from "./cart.types";
import { AddCartItemDto, UpdateCartItemDto } from "./cart.dto";

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private readonly visibilityService = new ProductVisibilityService();

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly eligibilityService: ProductPurchaseEligibilityService,
  ) {}


  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Computes totals from a list of cart items.
   * All arithmetic is performed server-side from the stored snapshot values.
   */
  private computeTotals(items: CartItemRecord[]): CartTotals {
    let subtotal = 0;
    let discountTotal = 0;

    for (const item of items) {
      // Explicit Number() cast: Supabase returns NUMERIC columns as strings in JSON.
      // Without this, arithmetic on "6000.00" still works via JS coercion, but
      // explicit casting avoids silent bugs if the runtime behavior ever changes.
      const effectivePrice = Number(item.effective_unit_price);
      const unitPrice = Number(item.unit_price);
      const qty = Number(item.quantity);

      subtotal += effectivePrice * qty;
      discountTotal += (unitPrice - effectivePrice) * qty;
    }

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountTotal: Math.round(discountTotal * 100) / 100,
      total: Math.round(subtotal * 100) / 100, // Phase 4B: no delivery/coupons yet
      itemCount: items.reduce((acc, i) => acc + Number(i.quantity), 0),
    };
  }

  /**
   * Derives a ViewerContext from session claims.
   * Used to pass to ProductVisibilityService.canProductBeShown().
   *
   * Delegates to the shared surface-resolver so cart and marketplace resolve the
   * same trusted source→surface mapping (incl. customer_app → customer_app) and
   * can never diverge.
   */
  private claimsToViewerContext(claims: StoreSessionClaims): ViewerContext {
    return resolveTrustedViewerContext(claims);
  }

  /**
   * Fetches the active cart for a linked profile (or null if none exists).
   */
  private async findActiveCart(linkedProfileId: string): Promise<CartRecord | null> {
    const { data, error } = await this.supabaseAdmin.client
      .from("store_carts")
      .select("*")
      .eq("store_linked_profile_id", linkedProfileId)
      .eq("status", "active")
      .maybeSingle();

    if (error) {
      this.logger.error(`[cart] findActiveCart error: ${error.message}`);
      throw error;
    }

    return data as CartRecord | null;
  }

  /**
   * Fetches all items for a given cart, ordered by creation time.
   */
  private async fetchItems(cartId: string): Promise<CartItemRecord[]> {
    const { data, error } = await this.supabaseAdmin.client
      .from("store_cart_items")
      .select("*")
      .eq("cart_id", cartId)
      .order("created_at", { ascending: true });

    if (error) {
      this.logger.error(`[cart] fetchItems error: ${error.message}`);
      throw error;
    }

    return (data ?? []) as CartItemRecord[];
  }

  /**
   * Fetches a product from DB with all fields needed for cart validation.
   * Throws 404 if not found.
   */
  private async fetchProductOrThrow(productId: string): Promise<ProductForCart> {
    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .select(
        "id, name, slug, images, price, discount_price, merchant_id, is_active, " +
        "is_published, visibility_status, purchase_mode, " +
        "visible_in, target_audience, business_type_tags, requires_verified_salon, " +
        "min_order_qty, max_order_qty, stock, merchants(status)",
      )
      .eq("id", productId)
      .maybeSingle();

    if (error) {
      this.logger.error(`[cart] fetchProduct error: ${error.message}`);
      throw error;
    }

    if (!data) {
      throw new NotFoundException(`Product ${productId} not found.`);
    }

    return data as unknown as ProductForCart;
  }

  /**
   * Computes the effective unit price from DB fields.
   * Client-supplied prices are NEVER used.
   */
  private resolveEffectivePrice(product: ProductForCart): {
    unitPrice: number;
    effectiveUnitPrice: number;
  } {
    const unitPrice = Number(product.price ?? 0);
    const discountPrice = product.discount_price != null ? Number(product.discount_price) : null;
    const effectiveUnitPrice =
      discountPrice !== null && discountPrice >= 0 && discountPrice < unitPrice
        ? discountPrice
        : unitPrice;

    return { unitPrice, effectiveUnitPrice };
  }

  /**
   * Validates quantity against product min/max_order_qty and stock.
   * Throws UnprocessableEntityException if invalid.
   */
  private validateQuantity(product: ProductForCart, quantity: number): void {
    if (product.min_order_qty !== null && quantity < product.min_order_qty) {
      throw new UnprocessableEntityException(
        `Minimum order quantity for this product is ${product.min_order_qty}.`,
      );
    }

    if (product.max_order_qty !== null && quantity > product.max_order_qty) {
      throw new UnprocessableEntityException(
        `Maximum order quantity for this product is ${product.max_order_qty}.`,
      );
    }

    if (
      product.stock !== null &&
      product.stock !== undefined &&
      product.stock >= 0 &&
      quantity > product.stock
    ) {
      throw new UnprocessableEntityException(
        `Only ${product.stock} units are available in stock.`,
      );
    }
  }

  /**
   * Builds a CartResponse (cart + items + totals).
   */
  private async buildResponse(cart: CartRecord): Promise<CartResponse> {
    const items = await this.fetchItems(cart.id);
    return { cart, items, totals: this.computeTotals(items) };
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * GET /cart
   *
   * Returns the active cart for the session owner.
   * If no active cart exists, returns an empty cart representation (no DB row created yet).
   */
  async getCart(claims: StoreSessionClaims): Promise<CartResponse> {
    const cart = await this.findActiveCart(claims.linkedProfileId);

    if (!cart) {
      // No active cart exists yet — no DB row is created until the first item is added.
      // Return cart: null so the client can distinguish "no cart" from "empty cart with id".
      return {
        cart: null,
        items: [],
        totals: { subtotal: 0, discountTotal: 0, total: 0, itemCount: 0 },
      };
    }

    return this.buildResponse(cart);
  }

  /**
   * POST /cart/items
   *
   * Adds a product to the active cart.
   *
   * Validations (in order):
   *   1. Product exists in DB
   *   2. Canonical purchase eligibility (publication, merchant, surface, purchase_mode, quantity, stock)
   *   3. Single-merchant rule: product.merchant_id must match cart.merchant_id (or cart is empty)
   *   4. Price is computed from DB (never from client)
   */
  async addItem(claims: StoreSessionClaims, dto: AddCartItemDto): Promise<CartResponse> {
    const viewerCtx = this.claimsToViewerContext(claims);

    // 1. Fetch product from DB
    const product = await this.fetchProductOrThrow(dto.productId);

    // 2. Canonical purchase eligibility evaluation
    const merchantStatus = (product.merchants as any)?.status ?? null;
    const eligibility = this.eligibilityService.evaluate(product, {
      channel: "barber_app",
      viewerContext: viewerCtx,
      merchantStatus,
      quantity: dto.quantity,
    });

    if (!eligibility.eligible) {
      if (
        eligibility.code === "PRODUCT_NOT_ACTIVE" ||
        eligibility.code === "PRODUCT_NOT_PUBLISHED" ||
        eligibility.code === "PRODUCT_NOT_PUBLIC" ||
        eligibility.code === "VIEWER_NOT_ELIGIBLE"
      ) {
        throw new NotFoundException(`Product ${dto.productId} not found.`);
      }
      if (
        eligibility.code === "QUANTITY_BELOW_MINIMUM" ||
        eligibility.code === "QUANTITY_ABOVE_MAXIMUM" ||
        eligibility.code === "INSUFFICIENT_STOCK" ||
        eligibility.code === "INVALID_QUANTITY"
      ) {
        throw new UnprocessableEntityException(eligibility.message);
      }
      throw new BadRequestException(eligibility.message ?? "المنتج غير متاح للشراء.");
    }

    // 3. Resolve price from DB — client price is ignored
    const { unitPrice, effectiveUnitPrice } = this.resolveEffectivePrice(product);
    const lineTotal = Math.round(effectiveUnitPrice * dto.quantity * 100) / 100;


    // 5. Get or create active cart
    let cart = await this.findActiveCart(claims.linkedProfileId);

    if (!cart) {
      // Create new active cart for this profile
      const { data: newCart, error: cartError } = await this.supabaseAdmin.client
        .from("store_carts")
        .insert({
          store_linked_profile_id: claims.linkedProfileId,
          source_app: claims.sourceApp,
          segment: claims.segment,
          business_type: claims.businessType ?? null,
          merchant_id: product.merchant_id,
          status: "active",
        })
        .select("*")
        .single();

      if (cartError) {
        this.logger.error(`[cart] cart insert error: ${cartError.message}`);
        throw cartError;
      }
      cart = newCart as CartRecord;
    } else {
      // 6. Single-merchant rule
      if (cart.merchant_id && cart.merchant_id !== product.merchant_id) {
        throw new ConflictException(
          "Cart contains products from another merchant. Clear cart first.",
        );
      }

      // If cart has no merchant yet (edge case), update it
      if (!cart.merchant_id) {
        const { error: merchantUpdateErr } = await this.supabaseAdmin.client
          .from("store_carts")
          .update({ merchant_id: product.merchant_id, updated_at: new Date().toISOString() })
          .eq("id", cart.id);
        if (merchantUpdateErr) {
          this.logger.error(`[cart] merchant update error: ${merchantUpdateErr.message}`);
          throw merchantUpdateErr;
        }
        cart.merchant_id = product.merchant_id;
      }
    }

    // 7. Upsert item (update quantity+price if already exists, insert otherwise)
    const existingItems = await this.fetchItems(cart.id);
    const existing = existingItems.find((i) => i.product_id === dto.productId);

    if (existing) {
      // Increase quantity — re-validate combined quantity
      const newQty = existing.quantity + dto.quantity;
      this.validateQuantity(product, newQty);
      const newLineTotal = Math.round(effectiveUnitPrice * newQty * 100) / 100;

      const { error: itemUpdateErr } = await this.supabaseAdmin.client
        .from("store_cart_items")
        .update({
          quantity: newQty,
          unit_price: unitPrice,
          effective_unit_price: effectiveUnitPrice,
          line_total: newLineTotal,
          product_name: product.name,
          product_slug: product.slug ?? null,
          product_image_url: (product.images?.[0]) ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
      if (itemUpdateErr) {
        this.logger.error(`[cart] item update error: ${itemUpdateErr.message}`);
        throw itemUpdateErr;
      }
    } else {
      // Insert new item
      const { error: itemError } = await this.supabaseAdmin.client
        .from("store_cart_items")
        .insert({
          cart_id: cart.id,
          product_id: dto.productId,
          merchant_id: product.merchant_id,
          quantity: dto.quantity,
          product_name: product.name,
          product_slug: product.slug ?? null,
          product_image_url: (product.images?.[0]) ?? null,
          unit_price: unitPrice,
          effective_unit_price: effectiveUnitPrice,
          line_total: lineTotal,
        });

      if (itemError) {
        this.logger.error(`[cart] item insert error: ${itemError.message}`);
        throw itemError;
      }
    }

    // Update cart updated_at
    const { error: cartTsErr } = await this.supabaseAdmin.client
      .from("store_carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cart.id);
    if (cartTsErr) {
      this.logger.error(`[cart] cart timestamp update error: ${cartTsErr.message}`);
      throw cartTsErr;
    }

    this.logger.log(
      `[cart] addItem: linkedProfileId=${claims.linkedProfileId} product=${dto.productId} qty=${dto.quantity}`,
    );

    return this.buildResponse(cart);
  }

  /**
   * PATCH /cart/items/:itemId
   *
   * Updates the quantity of an existing cart item.
   * Price is re-fetched from DB and recomputed.
   */
  async updateItem(
    claims: StoreSessionClaims,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<CartResponse> {
    // Verify cart ownership
    const cart = await this.findActiveCart(claims.linkedProfileId);
    if (!cart) throw new NotFoundException("No active cart found.");

    // Verify item belongs to this cart
    const { data: itemData, error: itemFetchErr } = await this.supabaseAdmin.client
      .from("store_cart_items")
      .select("*")
      .eq("id", itemId)
      .eq("cart_id", cart.id)
      .maybeSingle();

    if (itemFetchErr) throw itemFetchErr;
    if (!itemData) throw new NotFoundException(`Cart item ${itemId} not found.`);

    const item = itemData as CartItemRecord;

    // Re-fetch product to validate eligibility and recompute price
    const product = await this.fetchProductOrThrow(item.product_id);
    const viewerCtx = this.claimsToViewerContext(claims);
    const merchantStatus = (product.merchants as any)?.status ?? null;

    const eligibility = this.eligibilityService.evaluate(product, {
      channel: "barber_app",
      viewerContext: viewerCtx,
      merchantStatus,
      quantity: dto.quantity,
    });

    if (!eligibility.eligible) {
      if (
        eligibility.code === "PRODUCT_NOT_ACTIVE" ||
        eligibility.code === "PRODUCT_NOT_PUBLISHED" ||
        eligibility.code === "PRODUCT_NOT_PUBLIC" ||
        eligibility.code === "VIEWER_NOT_ELIGIBLE"
      ) {
        throw new NotFoundException(`Product ${item.product_id} not found.`);
      }
      if (
        eligibility.code === "QUANTITY_BELOW_MINIMUM" ||
        eligibility.code === "QUANTITY_ABOVE_MAXIMUM" ||
        eligibility.code === "INSUFFICIENT_STOCK" ||
        eligibility.code === "INVALID_QUANTITY"
      ) {
        throw new UnprocessableEntityException(eligibility.message);
      }
      throw new BadRequestException(eligibility.message ?? "المنتج غير متاح للشراء.");
    }

    const { unitPrice, effectiveUnitPrice } = this.resolveEffectivePrice(product);
    const newLineTotal = Math.round(effectiveUnitPrice * dto.quantity * 100) / 100;


    const { error: qtyUpdateErr } = await this.supabaseAdmin.client
      .from("store_cart_items")
      .update({
        quantity: dto.quantity,
        unit_price: unitPrice,
        effective_unit_price: effectiveUnitPrice,
        line_total: newLineTotal,
        updated_at: new Date().toISOString(),
      })
      .eq("id", itemId);
    if (qtyUpdateErr) {
      this.logger.error(`[cart] updateItem qty error: ${qtyUpdateErr.message}`);
      throw qtyUpdateErr;
    }

    const { error: cartTsErr2 } = await this.supabaseAdmin.client
      .from("store_carts")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", cart.id);
    if (cartTsErr2) {
      this.logger.error(`[cart] updateItem cart ts error: ${cartTsErr2.message}`);
      throw cartTsErr2;
    }

    this.logger.log(`[cart] updateItem: itemId=${itemId} qty=${dto.quantity}`);
    return this.buildResponse(cart);
  }

  /**
   * DELETE /cart/items/:itemId
   *
   * Removes a single item from the cart.
   * If it was the last item, the cart remains active (empty) for next use.
   */
  async removeItem(claims: StoreSessionClaims, itemId: string): Promise<CartResponse> {
    const cart = await this.findActiveCart(claims.linkedProfileId);
    if (!cart) throw new NotFoundException("No active cart found.");

    const { data: itemData } = await this.supabaseAdmin.client
      .from("store_cart_items")
      .select("id")
      .eq("id", itemId)
      .eq("cart_id", cart.id)
      .maybeSingle();

    if (!itemData) throw new NotFoundException(`Cart item ${itemId} not found.`);

    const { error: deleteItemErr } = await this.supabaseAdmin.client
      .from("store_cart_items")
      .delete()
      .eq("id", itemId);
    if (deleteItemErr) {
      this.logger.error(`[cart] removeItem delete error: ${deleteItemErr.message}`);
      throw deleteItemErr;
    }

    // If cart is now empty, reset merchant_id
    const remaining = await this.fetchItems(cart.id);
    if (remaining.length === 0) {
      const { error: resetMerchantErr } = await this.supabaseAdmin.client
        .from("store_carts")
        .update({ merchant_id: null, updated_at: new Date().toISOString() })
        .eq("id", cart.id);
      if (resetMerchantErr) {
        this.logger.error(`[cart] removeItem merchant reset error: ${resetMerchantErr.message}`);
        throw resetMerchantErr;
      }
      cart.merchant_id = null;
    } else {
      const { error: cartTsErr3 } = await this.supabaseAdmin.client
        .from("store_carts")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", cart.id);
      if (cartTsErr3) {
        this.logger.error(`[cart] removeItem cart ts error: ${cartTsErr3.message}`);
        throw cartTsErr3;
      }
    }

    this.logger.log(`[cart] removeItem: itemId=${itemId} cartId=${cart.id}`);
    return this.buildResponse(cart);
  }

  /**
   * DELETE /cart/clear
   *
   * Removes all items from the active cart (cart row stays, merchant_id reset to null).
   */
  async clearCart(claims: StoreSessionClaims): Promise<CartResponse> {
    const cart = await this.findActiveCart(claims.linkedProfileId);
    if (!cart) throw new NotFoundException("No active cart found.");

    const { error: clearItemsErr } = await this.supabaseAdmin.client
      .from("store_cart_items")
      .delete()
      .eq("cart_id", cart.id);
    if (clearItemsErr) {
      this.logger.error(`[cart] clearCart items delete error: ${clearItemsErr.message}`);
      throw clearItemsErr;
    }

    const { error: clearCartErr } = await this.supabaseAdmin.client
      .from("store_carts")
      .update({
        status: "cleared",
        merchant_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", cart.id);
    if (clearCartErr) {
      this.logger.error(`[cart] clearCart status update error: ${clearCartErr.message}`);
      throw clearCartErr;
    }

    // Return empty cart (no active cart now — next add will create a new one)
    const clearedCart: CartRecord = {
      ...cart,
      status: "cleared",
      merchant_id: null,
    };

    this.logger.log(`[cart] clearCart: linkedProfileId=${claims.linkedProfileId}`);
    return { cart: clearedCart, items: [], totals: { subtotal: 0, discountTotal: 0, total: 0, itemCount: 0 } };
  }
}
