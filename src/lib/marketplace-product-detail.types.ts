import type { Tables } from "@/integrations/supabase/types";

/**
 * Minimal `merchants` embed on marketplace product JSON — matches backend `MARKETPLACE_PRODUCT_MERCHANT_EMBED`.
 * (Stable: `id`, `slug`, `display_name` only.)
 */
export type MarketplaceProductMerchantEmbed = {
  id: string;
  slug: string;
  display_name: string;
};

/**
 * Public product row from marketplace APIs using `MARKETPLACE_PUBLIC_PRODUCT_SELECT`.
 * Omits internal-only columns that are never returned on the public surface (`purchase_price`, `merchant_sku`,
 * `low_stock_threshold`, `sold_count`).
 *
 * See `backend/.../marketplace-product-detail.contract.ts`.
 */
export type MarketplacePublicProduct = Omit<
  Tables<"products">,
  "purchase_price" | "merchant_sku" | "low_stock_threshold" | "sold_count"
> & {
  merchants?: MarketplaceProductMerchantEmbed | null;
  /** Present on API rows when column exists (may be absent from generated `Tables` type). */
  loyalty_points_enabled?: boolean | null;
};

/** List/grid product row (M2.8): same public fields as detail except long `description` is omitted.
 * `short_description` remains on list rows for product cards (null for legacy). */
export type MarketplaceListProduct = Omit<MarketplacePublicProduct, "description">;

export type MarketplaceSuggestedProductsResponse = {
  items: MarketplaceListProduct[];
  total: number;
  offset: number;
  limit: number;
};

export const MARKETPLACE_EMPTY_SUGGESTED: MarketplaceSuggestedProductsResponse = {
  items: [],
  total: 0,
  offset: 0,
  limit: 0,
};
