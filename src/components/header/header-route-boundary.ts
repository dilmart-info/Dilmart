/**
 * Route classification for Header ownership boundary.
 * Prevents customer shopping header from leaking into backoffice,
 * auth/account-recovery flows, or order-completion thank-you page.
 */

export const EXCLUDED_HEADER_PREFIXES = [
  "/auth",
  "/forgot-password",
  "/claim-account",
  "/admin",
  "/merchant",
  "/agent",
  "/thank-you",
] as const;

export type HeaderRouteType = "home" | "checkout" | "customer_inner" | "excluded";

export function classifyHeaderRoute(pathname: string): HeaderRouteType {
  // 1. Excluded / non-customer shopping routes
  for (const prefix of EXCLUDED_HEADER_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return "excluded";
    }
  }

  // 2. Homepage
  if (pathname === "/") {
    return "home";
  }

  // 3. Checkout
  if (pathname === "/checkout" || pathname.startsWith("/checkout/")) {
    return "checkout";
  }

  // 4. Default customer inner route (Products, PDP, Cart, Wishlist, Stores, Profile, Info pages)
  return "customer_inner";
}
