/**
 * Generic Native App Link & URL intake handler for DILMART Customer Mobile App.
 *
 * Validates incoming URLs (Universal Links / App Links / Custom Scheme) against
 * approved marketplace origins and converts them to internal customer routes.
 *
 * Rules:
 * - Fail closed on any invalid or unapproved URL.
 * - No auth tokens or session credentials accepted via URL.
 * - Support /product/:slug, /category/:slug, /store/:slug (or /merchants/:slug), /products, /offers, /cart.
 */

const APPROVED_HOSTNAMES = new Set([
  "dilmart.store",
  "www.dilmart.store",
  "staging.dilmart.store",
  "localhost",
  "127.0.0.1",
]);

const APPROVED_SCHEMES = new Set(["http:", "https:", "dilmart:"]);

const SAFE_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export function resolveInternalRouteFromUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    let url: URL;
    if (trimmed.startsWith("dilmart://")) {
      // Custom scheme intake: parse as dilmart://product/my-slug
      url = new URL(trimmed);
      const hostOrPath = (url.hostname + url.pathname).replace(/^\/+/, "");
      return parsePathname("/" + hostOrPath, url.search);
    } else {
      url = new URL(trimmed);
    }

    if (!APPROVED_SCHEMES.has(url.protocol)) {
      return null;
    }

    const hostname = url.hostname.toLowerCase();
    if (!APPROVED_HOSTNAMES.has(hostname) && !hostname.endsWith(".dilmart.store")) {
      return null;
    }

    return parsePathname(url.pathname, url.search);
  } catch {
    return null;
  }
}

function parsePathname(pathname: string, search = ""): string | null {
  const cleanPath = pathname.replace(/\/+/g, "/").replace(/\/$/, "");
  if (!cleanPath || cleanPath === "") return "/";

  const segments = cleanPath.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const first = segments[0].toLowerCase();

  // /product/:slug
  if (first === "product" && segments.length === 2) {
    const slug = segments[1];
    if (SAFE_SLUG_REGEX.test(slug)) {
      return `/product/${encodeURIComponent(slug)}`;
    }
    return null;
  }

  // /category/:slug
  if (first === "category" && segments.length === 2) {
    const slug = segments[1];
    if (SAFE_SLUG_REGEX.test(slug)) {
      return `/category/${encodeURIComponent(slug)}`;
    }
    return null;
  }

  // /store/:slug or /merchants/:slug
  if ((first === "store" || first === "merchants") && segments.length === 2) {
    const slug = segments[1];
    if (SAFE_SLUG_REGEX.test(slug)) {
      return `/merchants/${encodeURIComponent(slug)}`;
    }
    return null;
  }

  // /products
  if (first === "products" && segments.length === 1) {
    return search ? `/products${search}` : "/products";
  }

  // /offers
  if (first === "offers" && segments.length === 1) {
    return search ? `/offers${search}` : "/offers";
  }

  // /cart
  if (first === "cart" && segments.length === 1) {
    return "/cart";
  }

  // /profile
  if (first === "profile" && segments.length === 1) {
    return "/profile";
  }

  return null;
}
