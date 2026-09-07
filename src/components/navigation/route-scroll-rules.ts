/**
 * Authoritative rules and storage for route-aware scroll restoration.
 */

// In-memory registry of scroll positions keyed by path+search
const scrollPositions = new Map<string, number>();

/**
 * Routes eligible for scroll restoration upon back/forward navigation (POP).
 * Only listings, feeds, search results, categories, and customer browsing lists.
 */
export function isScrollRestorationEligible(pathname: string): boolean {
  const cleanPath = pathname.split("?")[0].split("#")[0];

  // Explicitly prohibited routes:
  // - /product/* (ProductDetail owns resetting to top=0)
  // - /auth, /forgot-password, /claim-account
  // - /checkout, /thank-you
  // - /admin, /merchant, /agent (operational portals)
  if (
    cleanPath.startsWith("/product/") ||
    cleanPath === "/product" ||
    cleanPath === "/auth" ||
    cleanPath.startsWith("/auth/") ||
    cleanPath === "/forgot-password" ||
    cleanPath.startsWith("/forgot-password/") ||
    cleanPath === "/claim-account" ||
    cleanPath.startsWith("/claim-account/") ||
    cleanPath === "/checkout" ||
    cleanPath.startsWith("/checkout/") ||
    cleanPath === "/thank-you" ||
    cleanPath.startsWith("/thank-you/") ||
    cleanPath === "/admin" ||
    cleanPath.startsWith("/admin/") ||
    cleanPath === "/merchant" ||
    cleanPath.startsWith("/merchant/") ||
    cleanPath === "/agent" ||
    cleanPath.startsWith("/agent/")
  ) {
    return false;
  }

  // Strictly allowed customer browsing & listing routes
  if (cleanPath === "/") return true;
  if (cleanPath === "/products" || cleanPath.startsWith("/products/")) return true;
  if (cleanPath.startsWith("/category/")) return true;
  if (cleanPath === "/wishlist" || cleanPath.startsWith("/wishlist/")) return true;
  if (cleanPath === "/stores" || cleanPath.startsWith("/stores/")) return true;
  if (cleanPath === "/store" || cleanPath.startsWith("/store/")) return true;
  if (cleanPath === "/brands" || cleanPath.startsWith("/brands/")) return true;
  if (cleanPath === "/offers" || cleanPath.startsWith("/offers/")) return true;

  return false;
}

export function getScrollPosition(routeKey: string): number | undefined {
  return scrollPositions.get(routeKey);
}

export function setScrollPosition(routeKey: string, y: number): void {
  scrollPositions.set(routeKey, y);
}

export function clearScrollPositionsRegistry(): void {
  scrollPositions.clear();
}
