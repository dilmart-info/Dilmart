/**
 * Route matching for the backoffice sidebars (admin and merchant).
 *
 * Both layouts used to compare `location.pathname === item.href`, so a nested route such as
 * `/admin/orders/abc` or `/merchant/products/import` rendered the right page while the parent nav
 * item lost its active styling and the header fell back to the generic section title. Admin worked
 * around it with a single hard-coded exception for `/admin/finance`.
 *
 * The rules here replace both:
 *
 *   1. Trailing slashes are normalized, so `/merchant` and `/merchant/` are the same path — the
 *      merchant overview item's href is literally `/merchant/`, and both routes exist.
 *   2. A SECTION ROOT (a single-segment href such as `/admin` or `/merchant`) matches ONLY itself.
 *      Otherwise every `/admin/*` route would light up the dashboard item too.
 *   3. Any other item matches its own path and its descendants, at a path boundary:
 *      `href` or `href + "/"`. The boundary is what stops `/admin/delivery-ops` from activating
 *      `/admin/delivery`, or `/admin/merchant-plans` from activating `/admin/merchants` — a naive
 *      `pathname.startsWith(href)` would get both wrong.
 *
 * Pure and framework-free: the layouts use one helper for the sidebar state AND the header title,
 * so the two can never disagree.
 */

/** Collapses a path to its canonical comparable form: no trailing slash, `/` stays `/`. */
function normalizePath(path: string): string {
  if (!path) return "/";
  const withoutTrailingSlash = path.replace(/\/+$/, "");
  return withoutTrailingSlash === "" ? "/" : withoutTrailingSlash;
}

/** True when `href` is a section root — `/admin`, `/merchant` — which must match exactly. */
function isSectionRoot(normalizedHref: string): boolean {
  if (normalizedHref === "/") return true;
  return normalizedHref.split("/").filter(Boolean).length <= 1;
}

/**
 * Is the navigation item pointing at `href` the active one for `pathname`?
 *
 * Section roots match exactly; every other item also matches its descendants at a path boundary.
 */
export function isBackofficeNavPathActive(pathname: string, href: string): boolean {
  const currentPath = normalizePath(pathname);
  const itemPath = normalizePath(href);

  if (currentPath === itemPath) return true;
  if (isSectionRoot(itemPath)) return false;

  return currentPath.startsWith(`${itemPath}/`);
}

/**
 * The navigation item that owns `pathname`, or undefined for an unmapped route (the caller keeps
 * its existing fallback title). Items are checked in their declared order, which the layouts define
 * without overlaps.
 */
export function findActiveBackofficeNavItem<T extends { href: string }>(
  items: readonly T[],
  pathname: string,
): T | undefined {
  return items.find((item) => isBackofficeNavPathActive(pathname, item.href));
}
