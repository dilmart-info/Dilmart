import type { MarketplaceListProduct } from "@/lib/marketplace-product-detail.types";

/**
 * Public merchant JSON from `GET /marketplace/merchants/:slug`.
 * Matches backend `MARKETPLACE_PUBLIC_MERCHANT_SELECT` (see `marketplace-storefront.contract.ts`).
 */
export type MarketplacePublicMerchant = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
};

/** Product row from `GET /marketplace/products` — public column allowlist + minimal merchant embed. */
export type MarketplaceStorefrontProduct = MarketplaceListProduct;

export type MarketplaceStorefrontProductsResult = {
  items: MarketplaceStorefrontProduct[];
  total: number;
  offset: number;
  limit: number;
};
