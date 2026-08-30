import type { MarketplaceListSort } from "@/lib/marketplace-list.types";

/**
 * Every URL-driven filter that `Products.tsx` reads and can send to
 * `apiClient.getMarketplaceProducts()`. Kept as one shape so the react-query
 * cache key and the actual request payload can never drift apart — a filter
 * that's read here but forgotten in `buildProductsQueryParams` would silently
 * reuse a stale cached result for a different filter combination.
 */
export type ProductsListFilters = {
  categorySlug: string | null;
  merchantId: string | null;
  filter: string | null;
  search: string | null;
  sort: MarketplaceListSort;
  minPrice: string | null;
  maxPrice: string | null;
  brand: string | null;
  color: string | null;
  size: string | null;
  minWeight: string | null;
  maxWeight: string | null;
  offset: number;
  limit: number;
};

/** The exact payload shape `apiClient.getMarketplaceProducts()` accepts. */
export function buildProductsQueryParams(f: ProductsListFilters) {
  return {
    offset: f.offset,
    limit: f.limit,
    category_slug: f.categorySlug,
    merchant_id: f.merchantId,
    filter: f.filter,
    search: f.search,
    sort: f.sort,
    min_price: f.minPrice ? Number(f.minPrice) : undefined,
    max_price: f.maxPrice ? Number(f.maxPrice) : undefined,
    brand: f.brand ?? undefined,
    color: f.color ?? undefined,
    size: f.size ?? undefined,
    min_weight: f.minWeight ? Number(f.minWeight) : undefined,
    max_weight: f.maxWeight ? Number(f.maxWeight) : undefined,
  };
}

/**
 * react-query cache identity for the products list. Wraps the exact request
 * payload (not a hand-picked subset of it) so every filter that affects the
 * server result also affects which cache entry is read/written.
 */
export function buildProductsQueryKey(f: ProductsListFilters) {
  return ["marketplace-products", buildProductsQueryParams(f)] as const;
}
