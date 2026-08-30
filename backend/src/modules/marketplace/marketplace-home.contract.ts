/**
 * # `GET /api/marketplace/home` — stable contract (M1.1+)
 *
 * Top-level keys (exact, always present):
 * - `contractVersion` — **must be `1`** until a breaking change is introduced deliberately.
 * - `categories` — global taxonomy from `public.categories`, ordered by `sort_order`.
 *   **M1.1:** hardcoded “curated category tiles” on the homepage were **fully replaced** by these API-driven categories (no parallel catalog path).
 * - `featuredMerchants` — active merchants only; see {@link MarketplaceService.getHome} for ordering/limit.
 * - `featuredProducts` — **selection signal: `products.is_best_seller = true`** (not generic “featured” ranking).
 *   Response key name remains `featuredProducts` for stability. **User-facing copy must reflect “best seller”, not editorial “featured”.** See `marketplace-ranking.contract.ts`.
 * - `newProducts` — **flag-driven: `products.is_new = true`** (not time-window / “created_at only”).
 * - `offerProducts` — **true discounts only:** `discount_price` is set **and** `discount_price < price`
 *   (post-filtered after query where `discount_price` IS NOT NULL).
 *
 * Empty arrays are valid for any bucket; clients should hide empty sections without treating the response as an error.
 *
 * @see marketplace-ranking.contract.ts — surface matrix and glossary (merchant vs product featured, best seller, new, offer).
 */

export const MARKETPLACE_HOME_CONTRACT_VERSION = 1 as const;

/**
 * # M30 / H5-A: Promotional Banner Actions (Discriminated Union)
 *
 * Supported action targets for promotional banners.
 * Product CTA is explicitly deferred to H8 to prevent global slug collision issues.
 */
export type StorePromoBannerAction =
  | { type: "none" }
  | {
      type: "category";
      id: string;
      slug: string;
      name?: string;
    }
  | {
      type: "search";
      query: string;
    }
  | {
      type: "external_url";
      url: string;
    };

/**
 * # M30 / H5-A: Promotional Banner Home Section
 *
 * Represented as typed sections inside `sections[]` on segmented home responses.
 */
export interface StorePromoBannerSection {
  type: "hero_banner" | "campaign_banner";
  id: string;
  title?: string | null;
  subtitle?: string | null;
  image_url: string;
  mobile_image_url?: string | null;
  action: StorePromoBannerAction;
}
