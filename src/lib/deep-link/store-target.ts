/**
 * STORE-PR6 §5 — defence-in-depth client-side target validator, SEMANTICALLY MATCHING the backend
 * canonical allowlist (customer-handoff-target.validator.ts): static routes + `/category|/product|/store`
 * with a slug of lowercase-latin + digits + Arabic letters (U+0600–U+06FF), hyphen-separated, max 120,
 * plus the single allowlisted query contract `/products?brand=<value>`.
 * Anything else resolves to "/" — never an external redirect, scheme, host, traversal or fragment.
 */

const STATIC_TARGETS: ReadonlySet<string> = new Set([
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

// Identical slug contract to the backend (STORE-PR2/PR3): lowercase latin + digits + Arabic block, groups
// joined by single hyphens (no leading/trailing/double hyphen).
const SLUG_RE = /^[a-z0-9؀-ۿ]+(?:-[a-z0-9؀-ۿ]+)*$/;
const SLUG_ROUTE = /^\/(category|product|store)\/(.+)$/;
const DYNAMIC_PREFIXES: ReadonlySet<string> = new Set(["category", "product", "store"]);

// Control chars via unicode escapes (no literal control bytes in source).
const CONTROL_CHARS = new RegExp("[\\u0000-\\u001f\\u007f]");

/**
 * The ONLY allowlisted query contract, mirroring the backend `ALLOWED_QUERY`: route → allowed keys.
 * A brand value is human text, so ordinary spaces and Arabic/Latin letters are legitimate; markup,
 * quoting and control characters are not.
 */
const ALLOWED_QUERY: Readonly<Record<string, ReadonlySet<string>>> = {
  "/products": new Set(["brand"]),
};
const MAX_QUERY_VALUE_LEN = 120;
const UNSAFE_QUERY_VALUE = new RegExp("[\\u0000-\\u001f\\u007f<>\"'`\\\\]");

/**
 * Validates and canonically re-encodes an allowlisted query string, or returns null.
 * Mirrors the backend: unknown keys, duplicates, empty/over-long values, double-encoding and
 * malformed percent-encoding are all rejected.
 */
function validateQuery(path: string, queryString: string): string | null {
  const allowed = ALLOWED_QUERY[path];
  if (!allowed || allowed.size === 0) return null;

  const canonical: string[] = [];
  const seen = new Set<string>();
  for (const pair of queryString.split("&")) {
    const eq = pair.indexOf("=");
    const key = eq >= 0 ? pair.slice(0, eq) : pair;
    const val = eq >= 0 ? pair.slice(eq + 1) : "";
    if (!allowed.has(key) || seen.has(key)) return null;
    seen.add(key);

    let decoded: string;
    try {
      decoded = decodeURIComponent(val);
    } catch {
      return null; // malformed percent-encoding
    }
    if (decoded.length === 0 || decoded.length > MAX_QUERY_VALUE_LEN) return null;
    if (decoded.includes("%")) return null; // double-encoded
    if (UNSAFE_QUERY_VALUE.test(decoded)) return null;
    canonical.push(`${key}=${encodeURIComponent(decoded)}`);
  }
  canonical.sort();
  return canonical.join("&");
}

/** Returns the validated internal path (with an allowlisted canonical query), or "/". */
export function validateTarget(target: unknown): string {
  if (typeof target !== "string" || target.length === 0) return "/";
  if (target.length > 200) return "/";
  if (!target.startsWith("/")) return "/"; // no scheme, no host, no relative
  if (target.startsWith("//")) return "/"; // protocol-relative
  if (target.includes("..")) return "/"; // traversal
  if (target.includes("#")) return "/"; // no fragment
  if (target.includes("\\")) return "/";
  if (CONTROL_CHARS.test(target)) return "/";

  const qIdx = target.indexOf("?");
  const path = qIdx >= 0 ? target.slice(0, qIdx) : target;
  const queryString = qIdx >= 0 ? target.slice(qIdx + 1) : "";

  // Whitespace is never allowed in the PATH; a query value may carry encoded spaces (%20) only.
  if (/\s/.test(path)) return "/";
  if (/\s/.test(queryString)) return "/";

  let validPath: string | null = null;
  if (STATIC_TARGETS.has(path)) {
    validPath = path;
  } else {
    const m = SLUG_ROUTE.exec(path);
    if (m && DYNAMIC_PREFIXES.has(m[1])) {
      const slug = m[2];
      if (slug.length <= 120 && SLUG_RE.test(slug)) validPath = path;
    }
  }
  if (validPath === null) return "/";

  if (queryString.length === 0) return validPath;
  const canonicalQuery = validateQuery(validPath, queryString);
  return canonicalQuery === null ? "/" : `${validPath}?${canonicalQuery}`;
}
