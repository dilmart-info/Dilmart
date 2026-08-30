/**
 * STORE-PR5 - Canonical route-policy registry (spec 9.4/9.5; Blocker 2).
 *
 * This is the single source of truth for classifying every `@Roles("authenticated")` route as either
 * DUAL_CUSTOMER (federated allowed) or SUPABASE_ONLY. It is enforced by an exhaustive introspection test
 * (`tests/federated-actor.test.mjs`) that scans EVERY compiled controller and fails when:
 *   - a `@Roles("authenticated")` route is missing from this registry (a new, unclassified route);
 *   - a DUAL_CUSTOMER route lacks an explicit method-level `@AuthSources("supabase","DilMart_federated")`;
 *   - a SUPABASE_ONLY route permits `DilMart_federated`;
 *   - a role-gated (backoffice) route permits `DilMart_federated`;
 *   - any controller declares class-level `@AuthSources` (silent widening).
 *
 * Routes gated by specific roles (admin, merchant_ roles, agent, super_admin) are inherently SUPABASE_ONLY and
 * are enforced by the same test without needing individual entries here. Public / optional-bearer /
 * X-Store-Session (barber) routes carry no `@Roles` and are out of scope for this registry.
 *
 * Keep in sync with docs/STORE_PR5_DISCOVERY_AND_ROUTE_MATRIX.md sections 2-3.
 */
export type AuthenticatedRoutePolicyClass = "DUAL_CUSTOMER" | "SUPABASE_ONLY";

export interface AuthenticatedRouteEntry {
  /** Controller class name (as compiled). */
  controller: string;
  /** Handler method name. */
  method: string;
  policy: AuthenticatedRoutePolicyClass;
}

export const AUTHENTICATED_ROUTE_POLICY: readonly AuthenticatedRouteEntry[] = [
  // -- DUAL_CUSTOMER (federated allowed; must carry method-level @AuthSources) --
  { controller: "AuthController", method: "getContext", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "getProfile", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "updateProfile", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "listAddresses", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "createAddress", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "updateAddress", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "deleteAddress", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "setDefaultAddress", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "listOrders", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "getOrderDetail", policy: "DUAL_CUSTOMER" },
  { controller: "CustomerController", method: "reorderPreview", policy: "DUAL_CUSTOMER" },
  { controller: "OrdersController", method: "getMyOrders", policy: "DUAL_CUSTOMER" },
  { controller: "OrdersController", method: "customerCancelOrder", policy: "DUAL_CUSTOMER" },
  { controller: "OrdersController", method: "createReturnRequest", policy: "DUAL_CUSTOMER" },
  { controller: "OrdersController", method: "getReturnRequestStatus", policy: "DUAL_CUSTOMER" },
  { controller: "ProfilesController", method: "updateMe", policy: "DUAL_CUSTOMER" },
  { controller: "LoyaltyController", method: "preview", policy: "DUAL_CUSTOMER" },
  { controller: "LoyaltyController", method: "redeem", policy: "DUAL_CUSTOMER" },
  { controller: "CheckoutController", method: "submit", policy: "DUAL_CUSTOMER" },
  { controller: "CheckoutController", method: "getAttemptStatus", policy: "DUAL_CUSTOMER" },

  // -- SUPABASE_ONLY (@Roles("authenticated") but NOT customer-commerce; federated forbidden) --
  { controller: "AuthController", method: "requestAccountClaim", policy: "SUPABASE_ONLY" },
  { controller: "AuthController", method: "checkPhoneAvailability", policy: "SUPABASE_ONLY" },
  { controller: "AuthController", method: "syncPhoneIdentity", policy: "SUPABASE_ONLY" },
  { controller: "AnalyticsController", method: "summary", policy: "SUPABASE_ONLY" },
  { controller: "MerchantApplicationsController", method: "getMyStatus", policy: "SUPABASE_ONLY" },
] as const;

export function findAuthenticatedRoutePolicy(
  controller: string,
  method: string,
): AuthenticatedRouteEntry | undefined {
  return AUTHENTICATED_ROUTE_POLICY.find((e) => e.controller === controller && e.method === method);
}
