/**
 * M2.1 — Canonical public listing search normalization (single source of truth on the server).
 * Mirror logic in `src/lib/marketplace-search.ts` must stay aligned.
 */

export const MARKETPLACE_SEARCH_MIN_LENGTH = 2;

/**
 * Trim, then collapse runs of internal whitespace to a single ASCII space.
 * Does not alter non-space characters (no case folding, no transliteration).
 */
export function normalizeMarketplaceSearchQuery(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, " ");
}

/** When true, `listProducts` applies `ILIKE` on `products.name` for the normalized string. */
export function marketplaceSearchFilterApplies(normalized: string): boolean {
  return normalized.length >= MARKETPLACE_SEARCH_MIN_LENGTH;
}
