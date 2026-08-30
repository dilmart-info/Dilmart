/**
 * M2.1 — Public listing search helpers. Must match `backend/.../marketplace-search.normalize.ts`.
 * Backend remains authoritative for filtering; this drives listing title/empty-state UX only.
 */

export const MARKETPLACE_SEARCH_MIN_LENGTH = 2;

export function normalizeMarketplaceSearchQuery(raw: string | null | undefined): string {
  if (raw == null) return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+/g, " ");
}

/** When true, the API applies a name filter; otherwise listing behaves as browse (for that dimension). */
export function marketplaceSearchFilterApplies(normalized: string): boolean {
  return normalized.length >= MARKETPLACE_SEARCH_MIN_LENGTH;
}

/** Normalized term for headings / “no results for …” when search is active; `null` if URL search is empty-like or too short. */
export function getEffectiveMarketplaceSearchTerm(rawFromUrl: string | null): string | null {
  const n = normalizeMarketplaceSearchQuery(rawFromUrl);
  return marketplaceSearchFilterApplies(n) ? n : null;
}
