import type { Tables } from "@/integrations/supabase/types";
import type { MarketplaceListProduct, MarketplaceProductMerchantEmbed } from "@/lib/marketplace-product-detail.types";

/** Merchant embed on home product rows — matches `MARKETPLACE_PRODUCT_MERCHANT_EMBED` (`id`, `slug`, `display_name` only). */
export type MarketplaceHomeMerchantEmbed = MarketplaceProductMerchantEmbed;

export type MarketplaceHomeProduct = MarketplaceListProduct & {
  merchants?: MarketplaceHomeMerchantEmbed | null;
  is_mobile_promo?: boolean | null;
  mobile_promo_image_url?: string | null;
};

export type MarketplaceHomeFeaturedMerchant = {
  id: string;
  slug: string;
  display_name: string;
  logo_url?: string | null;
  description?: string | null;
  is_featured?: boolean;
  status?: string;
};

/** Exact `GET /marketplace/home` JSON shape — `contractVersion` must remain `1` until a breaking release. */
export type MarketplaceHomeResponse = {
  contractVersion: 1;
  categories: Tables<"categories">[];
  featuredMerchants: MarketplaceHomeFeaturedMerchant[];
  /** Populated from `is_best_seller` (API key name is historical). See `backend/.../marketplace-ranking.contract.ts`. */
  featuredProducts: MarketplaceHomeProduct[];
  newProducts: MarketplaceHomeProduct[];
  offerProducts: MarketplaceHomeProduct[];
};
