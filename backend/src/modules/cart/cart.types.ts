/**
 * cart.types.ts
 *
 * Internal domain types for Phase 4B B2B Cart.
 * These are NOT DTOs — they represent fully-resolved, backend-computed records.
 *
 * Pricing invariants (enforced by CartService, never trusted from client):
 *   effective_unit_price = discount_price < unit_price ? discount_price : unit_price
 *   line_total           = effective_unit_price * quantity
 *   subtotal             = SUM(line_total)
 *   discountTotal        = SUM((unit_price - effective_unit_price) * quantity)
 *   total                = subtotal (Phase 4B; delivery + coupons deferred to Phase 5)
 */

export interface CartRecord {
  id: string;
  store_linked_profile_id: string;
  source_app: string;
  segment: string | null;
  business_type: string | null;
  merchant_id: string | null;
  status: CartStatus;
  created_at: string;
  updated_at: string;
}

export type CartStatus =
  | "active"
  | "checkout_in_progress"
  | "converted"
  | "abandoned"
  | "cleared";

export interface CartItemRecord {
  id: string;
  cart_id: string;
  product_id: string;
  merchant_id: string;
  quantity: number;
  product_name: string;
  product_slug: string | null;
  product_image_url: string | null;
  unit_price: number;
  effective_unit_price: number;
  line_total: number;
  created_at: string;
  updated_at: string;
}

export interface CartTotals {
  subtotal: number;
  discountTotal: number;
  total: number;
  itemCount: number;
}

export interface CartResponse {
  /**
   * null when no active cart exists (GET /cart with no prior items).
   * The app should treat null as "empty, nothing persisted yet".
   */
  cart: CartRecord | null;
  items: CartItemRecord[];
  totals: CartTotals;
}

/** Product row fetched from DB to validate add/update actions */
export interface ProductForCart {
  id: string;
  name: string;
  slug: string | null;
  images: string[] | null;
  price: number | null;
  discount_price: number | null;
  merchant_id: string;
  is_active: boolean;
  is_published: boolean | null;
  visibility_status: string | null;
  purchase_mode: string[] | string | null;
  visible_in: string[] | null;
  target_audience: string[] | null;
  business_type_tags: string[] | null;
  requires_verified_salon: boolean | null;
  min_order_qty: number | null;
  max_order_qty: number | null;
  stock: number | null;
  merchants?: { status: string | null } | null;
}

