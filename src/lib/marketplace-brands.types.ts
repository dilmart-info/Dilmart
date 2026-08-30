/**
 * `GET /marketplace/brands` — real product brands (free-text `products.brand` column),
 * grouped with a count and one representative product image. NOT merchants/stores —
 * see `marketplace-stores.types.ts` / `marketplace-home.types.ts` for those.
 * Mirrors backend `MarketplaceService.getBrands()`.
 */
export type MarketplaceBrand = {
  name: string;
  count: number;
  imageUrl: string | null;
};

export type MarketplaceBrandsResponse = {
  brands: MarketplaceBrand[];
};

/**
 * Canonical brand-filtered products target: `/products?brand=<value>`.
 * Single-encodes the brand name, mirroring the backend `brandTarget()` validator
 * (`customer-handoff-target.validator.ts`) and the `brand` query param already
 * consumed by `Products.tsx` (`searchParams.get("brand")`).
 */
export function toBrandProductsHref(brandName: string): string {
  return `/products?brand=${encodeURIComponent(brandName.trim())}`;
}
