import { SourceApp, StoreSessionClaims, StoreSurface, ViewerContext } from "./store-integration.types";

/**
 * Canonical source-application → marketplace-surface resolver.
 *
 * SECURITY BOUNDARY
 * -----------------
 * The `trustedSourceApp` argument MUST originate from a server-verified
 * integration session — i.e. the `sourceApp` claim of an HMAC-verified
 * `X-Store-Session` (see `StoreIntegrationService.verifyStoreSessionHeader`).
 * It must NEVER be a raw value taken directly from a public client's header,
 * query string, body, cookie, or local storage. Untrusted callers are resolved
 * to the public `web_store` surface by the caller's own untrusted path and never
 * reach this function with a privileged claim.
 *
 * Mapping (governed by DilMart-CUSTOMER-STORE-MASTER-001 §2.6):
 *   barber_app   → barber_app
 *   customer_app → customer_app
 *   store_web    → web_store
 *   admin        → web_store   (admin is not a shopping surface — safe public fallback)
 *   null / undef → web_store   (no trusted source → public)
 *   unknown      → web_store   (fail safe — never silently promote)
 *
 * This is the single source of truth for the mapping; both the marketplace
 * viewer-context resolver and the cart viewer-context helper delegate here so
 * the two surfaces can never diverge.
 */
export function resolveMarketplaceSurface(
  trustedSourceApp: SourceApp | null | undefined,
): StoreSurface {
  switch (trustedSourceApp) {
    case "barber_app":
      return "barber_app";
    case "customer_app":
      return "customer_app";
    case "store_web":
    case "admin":
    case null:
    case undefined:
      return "web_store";
    default:
      // Defensive: claims are decoded from JSON, so an out-of-type value is
      // possible at runtime. Fail safe to the public surface — never promote.
      return "web_store";
  }
}

/**
 * Builds the TRUSTED `ViewerContext` used for product segmentation from verified
 * `X-Store-Session` claims. Shared by the marketplace controller and the cart
 * service so both derive an identical context from the same claims.
 *
 * `isTrusted` is fixed to `true` here precisely because the only callers are the
 * verified-session branches; the untrusted query-param fallback builds its own
 * `web_store` context with `isTrusted: false` and never calls this.
 */
export function resolveTrustedViewerContext(claims: StoreSessionClaims): ViewerContext {
  return {
    surface: resolveMarketplaceSurface(claims.sourceApp),
    segment: claims.segment,
    businessType: claims.businessType,
    salonVerified: claims.salonVerified === true,
    sourceApp: claims.sourceApp,
    isTrusted: true,
    requiresVerifiedSalonCheck: true,
  };
}
