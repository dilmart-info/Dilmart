/**
 * `GET /marketplace/merchants` — merchant **card** rows (M1.5).
 * See `backend/.../marketplace-stores.contract.ts` — not the full storefront merchant DTO.
 */
export type MarketplaceMerchantCard = {
  id: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
  is_featured: boolean;
};

export type MarketplaceMerchantsListResponse = {
  items: MarketplaceMerchantCard[];
  total: number;
  offset: number;
  limit: number;
};

/** Sort semantics match backend `marketplace-stores.contract.ts` (default: `featured`). */
export type StoresSort = "featured" | "newest" | "name";

export function parseStoresSort(raw: string | null): StoresSort {
  if (raw === "newest" || raw === "name") return raw;
  return "featured";
}
