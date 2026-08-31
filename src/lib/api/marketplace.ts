import { request } from "@/lib/api-core";
import type { Tables } from "@/integrations/supabase/types";
import type { MarketplaceHomeResponse } from "@/lib/marketplace-home.types";
import type { MarketplacePublicMerchant, MarketplaceStorefrontProductsResult } from "@/lib/marketplace-storefront.types";
import type { MarketplaceListProduct, MarketplacePublicProduct, MarketplaceSuggestedProductsResponse } from "@/lib/marketplace-product-detail.types";
import type { MarketplaceMerchantsListResponse, StoresSort } from "@/lib/marketplace-stores.types";
import type { MarketplaceBrandsResponse } from "@/lib/marketplace-brands.types";

import {
  FIXTURE_HOME_RESPONSE,
  FIXTURE_BRANDS,
  FIXTURE_DISCOVERY_PRODUCTS,
  FIXTURE_CATEGORIES,
} from "@/lib/marketplace-fixtures";

export const marketplaceApi = {
  /**
   * @deprecated Legacy `GET /api/catalog/categories`. No in-repo callers (M1.6). Use `getMarketplaceCategories`.
   * @see docs/canonical-routing.md — `docs/batch-m1.6-getcatalog-audit.md`
   */
  getCatalogCategories() {
    return request<Array<any>>("/catalog/categories", "GET");
  },

  /** Public taxonomy — same data as `/catalog/categories`; preferred entry for new UI. */
  async getMarketplaceCategories() {
    try {
      const res = await request<Tables<"categories">[]>("/marketplace/categories", "GET");
      if (res && res.length > 0) return res;
      return FIXTURE_CATEGORIES;
    } catch {
      return FIXTURE_CATEGORIES;
    }
  },

  /** Public marketplace home — typed contract; see `marketplace-home.types.ts` / backend `marketplace-home.contract.ts`. */
  async getMarketplaceHome() {
    try {
      const res = await request<MarketplaceHomeResponse>("/marketplace/home", "GET");
      if (res && res.categories && res.categories.length > 0) return res;
      return FIXTURE_HOME_RESPONSE;
    } catch {
      return FIXTURE_HOME_RESPONSE;
    }
  },

  /** Real product brands (name/count/representative image) — `GET /marketplace/brands`. Not merchants. */
  async getMarketplaceBrands() {
    try {
      const res = await request<MarketplaceBrandsResponse>("/marketplace/brands", "GET");
      if (res && res.brands && res.brands.length > 0) return res;
      return FIXTURE_BRANDS;
    } catch {
      return FIXTURE_BRANDS;
    }
  },

  /** Paginated merchant discovery for `/stores` — `GET /marketplace/merchants` only (no search in M1.5). */
  getMarketplaceMerchantsList(payload: { offset: number; limit: number; sort: StoresSort }) {
    const params = new URLSearchParams();
    params.set("offset", String(payload.offset));
    params.set("limit", String(payload.limit));
    params.set("sort", payload.sort);
    return request<MarketplaceMerchantsListResponse>(`/marketplace/merchants?${params.toString()}`, "GET");
  },

  /** `search` is passed to `GET /marketplace/products` raw; server normalizes + min length (M2.1) — see `marketplace-list.contract.ts`. */
  async getMarketplaceProducts(payload: {
    offset?: number;
    limit?: number;
    category_slug?: string | null;
    merchant_id?: string | null;
    filter?: string | null;
    search?: string | null;
    sort?: "newest" | "price-asc" | "price-desc";
    min_price?: number | null;
    max_price?: number | null;
    brand?: string | null;
    color?: string | null;
    size?: string | null;
    min_weight?: number | null;
    max_weight?: number | null;
  }) {
    const params = new URLSearchParams();
    params.set("offset", String(payload.offset ?? 0));
    params.set("limit", String(payload.limit ?? 24));
    if (payload.category_slug) params.set("category_slug", payload.category_slug);
    if (payload.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload.filter) params.set("filter", payload.filter);
    if (payload.search) params.set("search", payload.search);
    if (payload.sort) params.set("sort", payload.sort);
    if (payload.min_price != null && payload.min_price !== undefined) params.set("min_price", String(payload.min_price));
    if (payload.max_price != null && payload.max_price !== undefined) params.set("max_price", String(payload.max_price));
    if (payload.brand) params.set("brand", payload.brand);
    if (payload.color) params.set("color", payload.color);
    if (payload.size) params.set("size", payload.size);
    if (payload.min_weight != null && payload.min_weight !== undefined) params.set("min_weight", String(payload.min_weight));
    if (payload.max_weight != null && payload.max_weight !== undefined) params.set("max_weight", String(payload.max_weight));
    try {
      return await request<MarketplaceStorefrontProductsResult>(`/marketplace/products?${params.toString()}`, "GET");
    } catch {
      return FIXTURE_DISCOVERY_PRODUCTS;
    }
  },

  /** Public product detail — `GET /marketplace/products/slug/:slug` only (global resolution; no legacy catalog fallback). */
  getMarketplaceProductBySlug(slug: string) {
    return request<MarketplacePublicProduct>(`/marketplace/products/slug/${encodeURIComponent(slug)}`, "GET");
  },

  /** @deprecated No active storefront callers; prefer `/products?category=` browse flow. */
  getMarketplaceCategoryPage(slug: string) {
    return request<{ category: any; subcategories: Array<any>; products: Array<any> }>(`/marketplace/category/${encodeURIComponent(slug)}`, "GET");
  },

  getMarketplaceSuggested(payload: { category_id: string; exclude_id: string }) {
    const params = new URLSearchParams(payload);
    return request<MarketplaceSuggestedProductsResponse>(`/marketplace/suggested?${params.toString()}`, "GET");
  },

  getMarketplaceOffers() {
    return request<{ items: MarketplaceListProduct[]; total: number; offset: number; limit: number }>("/marketplace/offers", "GET");
  },

  /** Products with minimal `merchants` embed; active merchant + active product only. */
  getMarketplaceProductsByIds(ids: string[]) {
    const params = new URLSearchParams({ ids: ids.join(",") });
    return request<MarketplaceListProduct[]>(`/marketplace/products/by-ids?${params.toString()}`, "GET");
  },

  /** Public storefront merchant — `GET /marketplace/merchants/:slug` only; active merchants only (else 404). */
  getMarketplaceMerchantBySlug(slug: string) {
    return request<MarketplacePublicMerchant>(`/marketplace/merchants/${encodeURIComponent(slug)}`, "GET");
  },

  /**
   * Legacy single-merchant catalog (`GET /api/catalog/*`). **No in-repo call sites** (M1.6 audit).
   * Retained for external/HTTP compatibility only — do not add new usages; use `getMarketplace*`.
   * @see docs/canonical-routing.md — `docs/batch-m1.6-getcatalog-audit.md`
   */
  getCatalogHome(merchantId: string) {
    const params = new URLSearchParams({ merchant_id: merchantId });
    return request<{
      categories: Array<any>;
      featuredProducts: Array<any>;
      newProducts: Array<any>;
      offerProducts: Array<any>;
    }>(`/catalog/home?${params.toString()}`, "GET");
  },

  /** @deprecated Legacy catalog — see `getCatalogHome` and `docs/batch-m1.6-getcatalog-audit.md`. */
  getCatalogProducts(payload: {
    merchant_id: string;
    category_slug?: string | null;
    filter?: string | null;
    search?: string | null;
    sort?: "newest" | "price-asc" | "price-desc";
  }) {
    const params = new URLSearchParams({ merchant_id: payload.merchant_id });
    if (payload.category_slug) params.set("category_slug", payload.category_slug);
    if (payload.filter) params.set("filter", payload.filter);
    if (payload.search) params.set("search", payload.search);
    if (payload.sort) params.set("sort", payload.sort);
    return request<Array<any>>(`/catalog/products?${params.toString()}`, "GET");
  },

  /** @deprecated Legacy catalog — see `getCatalogHome` JSDoc. */
  getCatalogProductsByIds(ids: string[]) {
    const params = new URLSearchParams({ ids: ids.join(",") });
    return request<Array<any>>(`/catalog/products/by-ids?${params.toString()}`, "GET");
  },

  /** @deprecated Legacy catalog — see `getCatalogHome` JSDoc. */
  getCatalogOffers(merchantId: string) {
    const params = new URLSearchParams({ merchant_id: merchantId });
    return request<Array<any>>(`/catalog/offers?${params.toString()}`, "GET");
  },

  /** @deprecated Legacy catalog — see `getCatalogHome` JSDoc. */
  getCatalogProductBySlug(slug: string, merchantId: string) {
    const params = new URLSearchParams({ merchant_id: merchantId });
    return request<any>(`/catalog/products/${slug}?${params.toString()}`, "GET");
  },

  /** @deprecated Legacy catalog — see `getCatalogHome` JSDoc. */
  getCatalogSuggested(payload: { merchant_id: string; category_id: string; exclude_id: string }) {
    const params = new URLSearchParams(payload);
    return request<Array<any>>(`/catalog/suggested?${params.toString()}`, "GET");
  },

  /** @deprecated Legacy catalog — see `getCatalogHome` JSDoc. */
  getCatalogCategoryPage(slug: string, merchantId: string) {
    const params = new URLSearchParams({ merchant_id: merchantId });
    return request<{ category: any; subcategories: Array<any>; products: Array<any> }>(`/catalog/category/${slug}?${params.toString()}`, "GET");
  },

  /**
   * @deprecated `GET /merchants/storefront-default` — no storefront callers (M1.6). Not part of canonical public paths.
   * @see docs/canonical-routing.md
   */
  getStorefrontDefaultMerchant(defaultSlug?: string) {
    const params = new URLSearchParams();
    if (defaultSlug) params.set("default_slug", defaultSlug);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<any>(`/merchants/storefront-default${suffix}`, "GET");
  },

  /** @deprecated Prefer `getMarketplaceMerchantBySlug` for public `/store/:slug`. */
  getActiveMerchantBySlug(slug: string) {
    const params = new URLSearchParams({ slug });
    return request<any>(`/merchants/active-by-slug?${params.toString()}`, "GET");
  },

  listDesktopQuickLinks() {
    return request<Array<{ id: string; label: string; href: string; sort_order: number }>>("/marketplace/desktop-quick-links", "GET");
  },
};
