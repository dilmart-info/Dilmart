/**
 * cart.controller.ts
 *
 * Phase 4B — B2B Cart API for DilMart Barber App.
 *
 * Authentication:
 *   All endpoints require X-Store-Session header (verified HMAC JWT).
 *   Missing or invalid header → 401 Unauthorized.
 *
 * Ownership:
 *   Cart is owned by store_linked_profile_id embedded in the session claims.
 *   Never by web user_id, phone, or anonymous session.
 *
 * Routes:
 *   GET    /cart                      → get active cart (empty if none)
 *   POST   /cart/items                → add product to cart
 *   PATCH  /cart/items/:itemId        → update item quantity
 *   DELETE /cart/items/:itemId        → remove single item
 *   DELETE /cart/clear                → clear all items
 *
 *   Phase 5A:
 *   POST   /cart/checkout/preview     → totals preview (delivery cost) without order creation
 *   POST   /cart/checkout             → convert cart to order (COD, barber_app only)
 */

import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UnauthorizedException,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { CartService } from "./cart.service";
import { CartCheckoutService } from "./cart-checkout.service";
import { StoreIntegrationService } from "../store-integration/store-integration.service";
import { CheckoutAttemptsService } from "../orders/checkout-attempts.service";
import { AddCartItemDto, UpdateCartItemDto, CartCheckoutPreviewDto, CartCheckoutSubmitDto } from "./cart.dto";
import { StoreSessionClaims } from "../store-integration/store-integration.types";

@Controller("cart")
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly cartCheckoutService: CartCheckoutService,
    private readonly storeIntegrationService: StoreIntegrationService,
    private readonly checkoutAttempts: CheckoutAttemptsService,
  ) {}

  /**
   * Verifies X-Store-Session and returns trusted claims.
   * Throws 401 if missing or invalid.
   */
  private requireSessionClaims(rawHeader: string | undefined): StoreSessionClaims {
    if (!rawHeader) {
      throw new UnauthorizedException("X-Store-Session header is required.");
    }
    const claims = this.storeIntegrationService.verifyStoreSessionHeader(rawHeader);
    if (!claims) {
      throw new UnauthorizedException("X-Store-Session is invalid or expired.");
    }
    return claims;
  }

  /**
   * Verifies X-Store-Session and enforces barber_app-only access.
   * Phase 4B cart is exclusively for Barber App B2B sessions.
   * Throws 403 if sourceApp is not barber_app.
   */
  private requireBarberAppSession(rawHeader: string | undefined): StoreSessionClaims {
    const claims = this.requireSessionClaims(rawHeader);
    if (claims.sourceApp !== "barber_app") {
      throw new ForbiddenException("Cart is currently available only for Barber App.");
    }
    return claims;
  }

  /**
   * GET /cart
   * Returns the active cart for the session owner.
   * Returns an empty cart object if no active cart exists (not 404).
   */
  @Get()
  async getCart(
    @Headers("x-store-session") storeSession: string | undefined,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.cartService.getCart(claims);
  }

  /**
   * POST /cart/items
   * Adds a product to the cart.
   *
   * Body: { productId: UUID, quantity: int ≥ 1 }
   *
   * Validations:
   *   - Product must exist and be visible to the session's viewer context
   *   - Quantity must satisfy product min/max_order_qty and stock
   *   - Product must be from the same merchant as existing cart items (single-merchant rule)
   *   - Price is fetched from DB — client must NOT send price
   */
  @Post("items")
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async addItem(
    @Headers("x-store-session") storeSession: string | undefined,
    @Body() dto: AddCartItemDto,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.cartService.addItem(claims, dto);
  }

  /**
   * PATCH /cart/items/:itemId
   * Updates the quantity of an existing cart item.
   *
   * Body: { quantity: int ≥ 1 }
   *
   * Price is re-fetched from DB and recomputed.
   * itemId must belong to the session owner's active cart.
   */
  @Patch("items/:itemId")
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async updateItem(
    @Headers("x-store-session") storeSession: string | undefined,
    @Param("itemId", ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.cartService.updateItem(claims, itemId, dto);
  }

  /**
   * DELETE /cart/items/:itemId
   * Removes a single item from the active cart.
   *
   * If it was the last item, the cart remains active (empty).
   * To remove all items, use DELETE /cart/clear instead.
   */
  @Delete("items/:itemId")
  async removeItem(
    @Headers("x-store-session") storeSession: string | undefined,
    @Param("itemId", ParseUUIDPipe) itemId: string,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.cartService.removeItem(claims, itemId);
  }

  /**
   * DELETE /cart/clear
   * Removes all items from the active cart.
   *
   * Use this before adding a product from a different merchant.
   * The cart row is marked 'cleared'; a fresh cart is created on the next add.
   */
  @Delete("clear")
  async clearCart(
    @Headers("x-store-session") storeSession: string | undefined,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.cartService.clearCart(claims);
  }

  // ─── Phase 5A: Checkout ──────────────────────────────────────────────────

  /**
   * POST /cart/checkout/preview
   *
   * Returns order totals preview (subtotal, delivery_cost, total) for the
   * active cart and a given governorate_id. Does NOT create an order or
   * modify cart state. Use before showing the checkout confirmation screen.
   *
   * Body: { governorate_id: UUID, coupon_code?: string }
   */
  @Post("checkout/preview")
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async checkoutPreview(
    @Headers("x-store-session") storeSession: string | undefined,
    @Body() dto: CartCheckoutPreviewDto,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.cartCheckoutService.previewCartCheckout(claims, dto);
  }

  /**
   * POST /cart/checkout
   *
   * Converts the active cart into a real Store order (COD only).
   *
   * Flow:
   *   1. Locks cart (checkout_in_progress)
   *   2. Re-validates all items from DB (prices, stock, visibility)
   *   3. Calculates Jenni delivery cost from governorate_id
   *   4. Calls place_order RPC with B2B tracking params
   *   5. Marks cart as 'converted'
   *   Reverts to 'active' on any failure.
   *
   * Body: CartCheckoutSubmitDto
   * Returns: { order_number, totals }
   */
  @Post("checkout")
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))
  async checkoutSubmit(
    @Headers("x-store-session") storeSession: string | undefined,
    @Body() dto: CartCheckoutSubmitDto,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.cartCheckoutService.submitCartCheckout(claims, dto);
  }

  /**
   * GET /cart/checkout/attempts/:attemptId
   *
   * Lost-response recovery endpoint for B2B cart checkout.
   * Returns checkout attempt status, including order_id and order_number
   * if the attempt is completed.
   *
   * Scoped to store_linked_profile_id from verified session.
   * 403 if attempt belongs to a different profile.
   * 404 if attempt does not exist.
   */
  @Get("checkout/attempts/:attemptId")
  async getCheckoutAttemptStatus(
    @Headers("x-store-session") storeSession: string | undefined,
    @Param("attemptId", ParseUUIDPipe) attemptId: string,
  ) {
    const claims = this.requireBarberAppSession(storeSession);
    return this.checkoutAttempts.getB2BAttemptStatus(claims.linkedProfileId, attemptId);
  }
}
