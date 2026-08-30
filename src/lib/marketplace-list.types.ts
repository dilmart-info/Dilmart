/**
 * Canonical `/products` listing — aligns with `backend/.../marketplace-list.contract.ts`.
 *
 * **Sort semantics (API `sort` query):**
 * - `newest` — `created_at` descending
 * - `price-asc` — `price` ascending
 * - `price-desc` — `price` descending
 */
export const MARKETPLACE_LIST_SORT_VALUES = ["newest", "price-asc", "price-desc"] as const;
export type MarketplaceListSort = (typeof MARKETPLACE_LIST_SORT_VALUES)[number];

export function parseMarketplaceListSort(raw: string | null): MarketplaceListSort {
  if (raw === "price-asc" || raw === "price-desc" || raw === "newest") return raw;
  return "newest";
}
