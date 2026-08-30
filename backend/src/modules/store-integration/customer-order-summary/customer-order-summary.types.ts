/**
 * STORE-PR6A (DilMart-CUSTOMER-STORE-STORE-PR6A) — Customer Order Summary types & constants.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §33 (v1.3.0), §14.2, §18.
 *
 * A dedicated, read-only, server-to-server (Main→Store) summary. It is NOT a handoff and shares NO
 * business contract with the Customer Handoff assertion — only the asymmetric key-ring crypto material.
 */

/** Verified minimal Order Summary assertion (spec §33.3). Only the identity + bookkeeping the Store trusts. */
export interface OrderSummaryAssertion {
  sub: string; // DilMart CUSTOMER uuid — the ONLY identity authority
  jti: string;
  iat: number;
  nbf: number;
  exp: number;
  /** kid from the verified protected header (bookkeeping only). */
  kid: string;
}

/** The exact public DTO (spec §33.5). A NEW object — never a raw DB row / Supabase response. */
export interface OrderSummaryLatestOrder {
  orderNumber: string;
  status: string;
  deliveryStatus: string | null;
  total: number;
  currency: string; // mapped from orders.currency_code (§33.5) — never hard-coded IQD
  createdAt: string;
}

export interface OrderSummaryResponse {
  linked: boolean;
  activeOrdersCount: number;
  latestOrder: OrderSummaryLatestOrder | null;
  updatedAt: string; // server response-generation timestamp, ISO-8601 UTC (§33 / §14 — no DB write)
}

/** Contract constants. */
export const ORDER_SUMMARY_DEFAULTS = {
  ISSUER: "DilMart-main",
  AUDIENCE: "DilMart-store-customer-order-summary",
  PURPOSE: "order_summary",
  ASSERTION_MAX_TTL_SECONDS: 60,
  CLOCK_TOLERANCE_SECONDS: 5,
} as const;

export const ASSERTION_BOUNDS = {
  JTI_MIN_LEN: 8,
  JTI_MAX_LEN: 128,
} as const;

/**
 * Store-owned active-order classification (spec §11, §33.5). Active-order status is owned by DilMart-Store; this
 * is the Store-local TERMINAL set for `public.orders.status`, grounded strictly in AUTHORITATIVE `orders.status`
 * evidence only (NOT inferred from cancellation-request / return-request / checkout-attempt / merchant-decision
 * / delivery-status domains):
 *
 *   - 'delivered', 'returned', 'cancelled' —
 *       (a) the canonical `public.orders.status` CHECK set
 *           (supabase/migrations/20260214214500_baseline_public_schema.sql:
 *            status IN ('new','contacted','preparing','shipped','delivered','cancelled','returned')), and
 *       (b) explicitly declared "Terminal statuses" in OrdersService.updateOrderStatus()
 *           ("Terminal statuses (delivered, returned, cancelled) must be set through the delivery lifecycle
 *           endpoints."), with the cancellation guard treating delivered/returned as final and merchant
 *           rejection producing orders.status='cancelled' (merchant_decision_status='rejected' is a SEPARATE
 *           column, not an orders.status).
 *
 * `orders.status='rejected'` and `orders.status='completed'` are NOT canonical terminal order states — 'completed'
 * is a `checkout_attempts.status` value, and merchant 'rejected' lives in `merchant_decision_status` — so they are
 * deliberately excluded.
 *
 * `activeOrdersCount` = orders whose (lower-cased) status is NOT in this closed set. This classification is
 * Store-local and is NEVER exposed to Main.
 */
export const TERMINAL_ORDER_STATUSES: readonly string[] = [
  "delivered",
  "returned",
  "cancelled",
];

export function isActiveOrderStatus(status: unknown): boolean {
  if (typeof status !== "string") return false;
  return !TERMINAL_ORDER_STATUSES.includes(status.trim().toLowerCase());
}
