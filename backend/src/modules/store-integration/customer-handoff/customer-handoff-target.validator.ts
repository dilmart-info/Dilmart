/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Canonical Store Target-Path validator.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §12.
 *
 * THE single source of truth for internal target paths in the Store backend. The
 * STORE-PR2 customer-entry validator delegates here with a discovery-only subset
 * (see customer-entry.validator.ts) — there is exactly one allowlist.
 *
 * Full initial Handoff allowlist (§12.1):
 *   /  /products  /offers  /stores  /cart  /checkout  /wishlist
 *   /my-account/orders  /my-account/addresses  /track-order
 *   /category/:slug  /product/:slug  /store/:slug
 *
 * Rules (§12.2): one leading slash; no scheme/host; no protocol-relative `//`; decode
 * exactly once then validate; reject control chars, traversal, double-encoding; bounded
 * slug; only explicitly-allowed query params per route (none allowed initially).
 * Reject (§12.3): external/absolute/protocol-relative URLs, javascript:/data:/vbscript:,
 * /admin, /merchant, /agent, encoded/double-encoded traversal.
 */

/** Static (no dynamic segment) allowlisted routes. Route key === the path itself. */
const STATIC_ROUTES = new Set<string>([
  "/",
  "/products",
  "/offers",
  "/stores",
  "/cart",
  "/checkout",
  "/wishlist",
  "/my-account/orders",
  "/my-account/addresses",
  "/track-order",
]);

/** Dynamic routes `/<prefix>/<slug>`. Route key === the prefix. */
const DYNAMIC_PREFIXES = new Set<string>(["category", "product", "store"]);

/**
 * Explicitly-allowed query parameters per route key. Absent (or empty) means NO query
 * parameters are allowed for that route — the strict, data-minimizing default (§12.2).
 * Extend deliberately per route when a parameter becomes necessary.
 *
 * `/products?brand=…` is the ONLY query contract: brand discovery from the Customer App
 * Gateway. Every other route and every other key stays query-free.
 */
const ALLOWED_QUERY: Record<string, Set<string>> = {
  "/products": new Set(["brand"]),
};

/** Max decoded length of an allowlisted query value. */
const MAX_QUERY_VALUE_LEN = 120;

/**
 * Safety rules for an allowlisted query VALUE. Deliberately laxer than `hasUnsafeChar`
 * (which governs paths): a brand is human text, so ordinary spaces and Arabic/Latin
 * letters are legitimate. Control characters, markup and quoting characters are not.
 */
function hasUnsafeQueryValueChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return true; // control chars (space 0x20 IS allowed)
    if (c === 0x5c) return true; // backslash
    if (c === 0x3c || c === 0x3e) return true; // < >
    if (c === 0x22 || c === 0x27 || c === 0x60) return true; // " ' `
  }
  return false;
}

/**
 * Slug allowlist: lowercase latin + digits + Arabic letters (U+0600–U+06FF),
 * hyphen-separated. No slashes, spaces, dots, underscores, or scheme characters.
 * (Identical to the STORE-PR2 slug contract.)
 */
const SLUG_RE = /^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/;

/** True if the string contains any control char, space, backslash, angle bracket, or quote. */
function hasUnsafeChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= 0x20) return true; // control chars (0x00–0x1F) + space (0x20)
    if (c === 0x5c) return true; // backslash
    if (c === 0x3c || c === 0x3e) return true; // < >
    if (c === 0x22 || c === 0x27 || c === 0x60) return true; // " ' `
  }
  return false;
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length > 0 && slug.length <= 120 && SLUG_RE.test(slug);
}

/** Discovery-only subset used by the STORE-PR2 customer-entry endpoint. */
export const DISCOVERY_TARGET_SUBSET = new Set<string>([
  "/",
  "/products",
  "/offers",
  "/stores",
  "category",
  "product",
  "store",
]);

/** Returns the route key a decoded path matches, or null. Validates dynamic slugs. */
function matchRouteKey(decodedPath: string): string | null {
  if (STATIC_ROUTES.has(decodedPath)) return decodedPath;
  const segments = decodedPath.slice(1).split("/");
  if (segments.length === 2 && DYNAMIC_PREFIXES.has(segments[0]) && isValidSlug(segments[1])) {
    return segments[0];
  }
  return null;
}

/**
 * Validates an internal target path against the canonical allowlist.
 *
 * @param input       the candidate path (may include a query string)
 * @param allowedKeys optional restriction to a subset of route keys (e.g. discovery)
 * @returns the normalized, decoded, allowlisted path (query stripped) or null.
 */
export function validateHandoffTargetPath(
  input: unknown,
  allowedKeys?: Set<string>,
): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 200) return null;

  // No fragment; split a single query string off.
  if (input.includes("#")) return null;
  const qIdx = input.indexOf("?");
  const rawPath = qIdx >= 0 ? input.slice(0, qIdx) : input;
  const queryString = qIdx >= 0 ? input.slice(qIdx + 1) : "";

  // Structural guards on the raw (pre-decode) path.
  if (rawPath.length === 0 || rawPath[0] !== "/" || rawPath.startsWith("//")) return null;
  if (rawPath.includes("://") || /(javascript|data|vbscript):/i.test(rawPath)) return null;

  // Decode EXACTLY once, then validate.
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return null; // malformed percent-encoding
  }

  // A remaining `%` after a single decode ⇒ double-encoded bypass attempt.
  if (decodedPath.includes("%")) return null;
  if (decodedPath[0] !== "/" || decodedPath.startsWith("//")) return null;
  if (hasUnsafeChar(decodedPath)) return null;
  if (decodedPath.includes("..")) return null; // traversal
  if (decodedPath.includes("://") || /(javascript|data|vbscript):/i.test(decodedPath)) return null;

  const routeKey = matchRouteKey(decodedPath);
  if (!routeKey) return null;
  if (allowedKeys && !allowedKeys.has(routeKey)) return null;

  // Query params: only explicitly-allowed keys with safe values (none allowed by default).
  // An allowlisted query is part of the TARGET — it is validated, canonically re-encoded and
  // returned, never silently dropped (a stripped query would navigate to the wrong page).
  if (queryString.length === 0) return decodedPath;

  const allowedParams = ALLOWED_QUERY[routeKey];
  if (!allowedParams || allowedParams.size === 0) return null;

  const canonical: string[] = [];
  const seen = new Set<string>();
  for (const pair of queryString.split("&")) {
    const eq = pair.indexOf("=");
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const val = eq >= 0 ? pair.slice(eq + 1) : "";
    if (!allowedParams.has(key)) return null; // unknown key
    if (seen.has(key)) return null; // duplicate parameter
    seen.add(key);

    let decodedVal: string;
    try {
      decodedVal = decodeURIComponent(val);
    } catch {
      return null; // malformed percent-encoding
    }
    if (decodedVal.length === 0 || decodedVal.length > MAX_QUERY_VALUE_LEN) return null;
    if (decodedVal.includes("%")) return null; // double-encoded bypass attempt
    if (hasUnsafeQueryValueChar(decodedVal)) return null;

    // Deterministic canonical encoding: decode-once, then re-encode the decoded value.
    canonical.push(`${key}=${encodeURIComponent(decodedVal)}`);
  }

  // Sorted by key so the same logical target always serialises identically.
  canonical.sort();
  return `${decodedPath}?${canonical.join("&")}`;
}

/** Builds a validated `/category/:slug` target, or null. */
export function categoryTarget(slug: unknown): string | null {
  return isValidSlug(slug) ? validateHandoffTargetPath(`/category/${slug}`) : null;
}

/** Builds a validated `/product/:slug` target, or null. */
export function productTarget(slug: unknown): string | null {
  return isValidSlug(slug) ? validateHandoffTargetPath(`/product/${slug}`) : null;
}

/**
 * Builds a validated `/products?brand=<encoded>` target, or null when the brand cannot
 * produce a safe target. The brand is NEVER concatenated raw: it is encoded and then run
 * back through the canonical validator, so an unsafe or over-long brand yields null and
 * the caller drops the item rather than shipping an unchecked target.
 */
export function brandTarget(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_QUERY_VALUE_LEN) return null;
  return validateHandoffTargetPath(`/products?brand=${encodeURIComponent(trimmed)}`);
}
