/**
 * DilMart-CUSTOMER-STORE-STORE-PR2 — GET /marketplace/customer-entry response contract.
 *
 * Read-only, curated Store discovery content for the DilMart Customer App Gateway
 * (master spec §7.4). Explicit DTOs only — database rows are mapped field-by-field
 * into these shapes; raw rows are never spread into the response (data minimization,
 * spec §15).
 */

export const CUSTOMER_ENTRY_CONTRACT_VERSION = 1;

/** Bounded, deterministic result caps for each optional section. */
export const CUSTOMER_ENTRY_LIMITS = {
  categories: 12,
  featuredProducts: 8,
  offers: 8,
  brands: 20,
} as const;

/**
 * Monetary format: prices are DECIMAL MAJOR UNITS (IQD), matching the Store
 * `products.price`/`discount_price` NUMERIC(10,2) columns. There is no `currency`
 * column in the Store schema — IQD is implicit — so the endpoint stamps it here.
 */
export const CUSTOMER_ENTRY_CURRENCY = 'IQD';

/** Returned when STORE_CUSTOMER_APP_SURFACE_ENABLED is not enabled (spec §14.5). */
export const CUSTOMER_ENTRY_DISABLED_CODE = 'STORE_INTEGRATION_DISABLED';

export interface CustomerEntryHero {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  target: string;
}

export interface CustomerEntryCategory {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  target: string;
}

export interface CustomerEntryProduct {
  id: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  /** Current customer-visible list price (IQD, major units). Store is the source of truth. */
  price: number;
  /** Active discounted price when strictly below `price`; otherwise null. */
  discountPrice: number | null;
  currency: string;
  target: string;
}

export interface CustomerEntryBrand {
  name: string;
  productCount: number;
  /**
   * Representative image for the brand. The Store has NO brand logo/asset source — a brand is only the
   * free-text `products.brand` column — so this is a photo of one of the brand's own ELIGIBLE products
   * (same visibility rules as productCount). Null when no eligible product of that brand has an image;
   * clients fall back to a non-image treatment. This is NOT an official brand logo.
   */
  imageUrl: string | null;
  /**
   * Store-authored discovery target for this brand: `/products?brand=<encoded>`. Built and
   * validated by the canonical target validator — clients use it VERBATIM and never construct
   * a brand query themselves. A brand that cannot produce a safe target is dropped upstream,
   * so this is always a valid allowlisted target.
   */
  target: string;
}

export interface CustomerEntryResponse {
  version: number;
  hero: CustomerEntryHero;
  categories: CustomerEntryCategory[];
  featuredProducts: CustomerEntryProduct[];
  brands: CustomerEntryBrand[];
  offers: CustomerEntryProduct[];
  /**
   * Server generation time of this response (ISO-8601 UTC). Semantics: the moment
   * the Gateway payload was composed — a freshness/cache-coordination hint, NOT a
   * content-version or last-catalog-change timestamp.
   */
  updatedAt: string;
}
