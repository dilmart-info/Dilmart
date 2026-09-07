/**
 * Single authoritative source of truth for Mobile Bottom Navigation visibility & active states.
 * Defines which routes display BottomNav, which routes strictly isolate it,
 * and how each destination is highlighted.
 */

export const EXCLUDED_BOTTOM_NAV_PREFIXES = [
  "/checkout",
  "/thank-you",
  "/admin",
  "/merchant",
  "/agent",
] as const;

/**
 * Returns true if BottomNav must be hidden on this route.
 * Strict path-segment matching: matches exact prefix or nested path with `/`.
 * Query strings or hash fragments do not affect exclusion.
 */
export function isBottomNavExcluded(pathname: string): boolean {
  const cleanPath = pathname.split("?")[0].split("#")[0];
  return EXCLUDED_BOTTOM_NAV_PREFIXES.some(
    (prefix) => cleanPath === prefix || cleanPath.startsWith(`${prefix}/`),
  );
}

/**
 * Determines whether a BottomNav navigation link should have aria-current="page".
 * Ensures discovery routes (/stores, /brands, /offers, /track-order) and auth routes
 * (/auth, /forgot-password, /claim-account) never receive false positive active highlighting.
 */
export function isBottomNavItemActive(itemPath: string, pathname: string): boolean {
  if (itemPath === "/") {
    return pathname === "/";
  }
  if (itemPath === "/products") {
    return (
      pathname === "/products" ||
      pathname.startsWith("/products/") ||
      pathname === "/category" ||
      pathname.startsWith("/category/") ||
      pathname === "/product" ||
      pathname.startsWith("/product/")
    );
  }
  if (itemPath === "/wishlist") {
    return pathname === "/wishlist" || pathname.startsWith("/wishlist/");
  }
  if (itemPath === "/profile") {
    return (
      pathname === "/profile" ||
      pathname.startsWith("/profile/") ||
      pathname === "/my-account" ||
      pathname.startsWith("/my-account/")
    );
  }
  if (itemPath === "/cart") {
    return pathname === "/cart" || pathname.startsWith("/cart/");
  }
  return pathname === itemPath;
}
