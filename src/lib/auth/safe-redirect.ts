/**
 * Authoritative Customer Route Sanitizer.
 *
 * Enforces an allowlist of valid customer marketplace routes, rejecting open redirects,
 * external URLs, protocol-relative URLs, backslashes, control characters, URL-encoded
 * separators, backoffice portals (/admin, /merchant, /agent), API paths, and auth loops.
 *
 * Preserves safe search params and hash fragments on allowed customer routes.
 * Defaults securely to /profile.
 */

const INTERNAL_BASE = "https://dilmart.invalid";

const ALLOWED_EXACT_ROUTES = new Set([
  "/",
  "/products",
  "/stores",
  "/brands",
  "/cart",
  "/offers",
  "/checkout",
  "/thank-you",
  "/claim-account",
  "/about",
  "/contact",
  "/terms",
  "/returns",
  "/privacy",
  "/account-deletion",
  "/support",
  "/profile",
  "/profile/security/phone",
  "/my-account/addresses",
  "/my-account/orders",
  "/wishlist",
  "/track-order",
]);

const ALLOWED_PREFIX_ROUTES = [
  "/store/",
  "/product/",
  "/category/",
];

function isAllowedCustomerDestination(comparisonPath: string): boolean {
  if (ALLOWED_EXACT_ROUTES.has(comparisonPath)) return true;

  for (const prefix of ALLOWED_PREFIX_ROUTES) {
    if (comparisonPath.startsWith(prefix)) {
      const remainder = comparisonPath.slice(prefix.length);
      // Must contain a non-empty slug, no consecutive slashes, and not end up as another nested forbidden root
      if (remainder.length > 0 && !remainder.startsWith("/") && !remainder.includes("//")) {
        return true;
      }
    }
  }

  return false;
}

export function sanitizeCustomerDestination(value?: string | null): string {
  if (!value || typeof value !== "string") return "/profile";

  const trimmed = value.trim();

  // 1. Structural security guards:
  // - Must start with single slash, not protocol-relative (//)
  // - Must not contain backslashes (\)
  // - Must not contain ASCII control characters
  // - Must not contain ambiguous encoded path separators (%2f, %5c, %00)
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.includes("\\") ||
    /[\x00-\x1F\x7F]/.test(trimmed) ||
    /%(?:2f|5c|00)/i.test(trimmed)
  ) {
    return "/profile";
  }

  // 2. Parse using fixed internal base
  let parsed: URL;
  try {
    parsed = new URL(trimmed, INTERNAL_BASE);
  } catch {
    return "/profile";
  }

  // Origin must strictly match the internal base (no domain spoofing)
  if (parsed.origin !== INTERNAL_BASE) return "/profile";

  // Reject credentials in URL
  if (parsed.username || parsed.password) return "/profile";

  const comparisonPath = parsed.pathname.toLowerCase();

  // 3. Reject backoffice, API, and auth loop routes
  if (
    comparisonPath === "/admin" ||
    comparisonPath.startsWith("/admin/") ||
    comparisonPath === "/merchant" ||
    comparisonPath.startsWith("/merchant/") ||
    comparisonPath === "/agent" ||
    comparisonPath.startsWith("/agent/") ||
    comparisonPath === "/api" ||
    comparisonPath.startsWith("/api/") ||
    comparisonPath === "/auth" ||
    comparisonPath.startsWith("/auth/") ||
    comparisonPath === "/forgot-password" ||
    comparisonPath.startsWith("/forgot-password/")
  ) {
    return "/profile";
  }

  // 4. Validate against customer route allowlist
  if (!isAllowedCustomerDestination(comparisonPath)) {
    return "/profile";
  }

  // 5. Return original parsed pathname casing with search and hash preserved
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
