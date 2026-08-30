import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import {
  MARKETPLACE_HOME_CONTRACT_VERSION,
  type StorePromoBannerSection,
} from "./marketplace-home.contract";
import { MARKETPLACE_PUBLIC_MERCHANT_SELECT } from "./marketplace-storefront.contract";
import {
  MARKETPLACE_PRODUCT_MERCHANT_EMBED,
  MARKETPLACE_PUBLIC_PRODUCT_LIST_SELECT,
  MARKETPLACE_PUBLIC_PRODUCT_SELECT,
} from "./marketplace-product-detail.contract";
import { MARKETPLACE_MERCHANT_CARD_SELECT } from "./marketplace-stores.contract";
import {
  marketplaceSearchFilterApplies,
  normalizeMarketplaceSearchQuery,
} from "./marketplace-search.normalize";
import { WhatsAppIntentsService } from "../whatsapp-intents/whatsapp-intents.service";
import { ProductVisibilityService } from "../store-integration/product-visibility.service";
import type { StoreSurface, ViewerContext } from "../store-integration/store-integration.types";
import { applyPublicProductFilters, isPubliclyListableProduct } from "./public-product-visibility";
import { MarketplaceBannersService } from "./marketplace-banners.service";
import { isValidDesktopQuickLinkHref } from "../admin/desktop-quick-link-href.validator";
import {
  enrichCategoriesWithPublicCounts,
  resolveCategoryScopeFromRows,
  type CategoryScope,
  type MarketplaceCategoryRow,
} from "./category-scope";

type ProductSort = "newest" | "price-asc" | "price-desc";

/** Product row + minimal merchant embed for all marketplace `products` queries (see `marketplace-product-detail.contract.ts`). */
const MARKETPLACE_PRODUCT_WITH_MERCHANT_SELECT = `${MARKETPLACE_PUBLIC_PRODUCT_SELECT}, merchants!inner(${MARKETPLACE_PRODUCT_MERCHANT_EMBED})`;
const MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT = `${MARKETPLACE_PUBLIC_PRODUCT_LIST_SELECT}, merchants!inner(${MARKETPLACE_PRODUCT_MERCHANT_EMBED})`;

/**
 * Segmentation context for marketplace surfaces.
 * Used by getHome() and listProducts() to apply visibility rules.
 */
type SegmentedContext = {
  surface: StoreSurface;
  segment?: string;
  businessType?: string;
};

/**
 * M1.0 — Global product slug resolution when multiple rows share the same slug across merchants:
 * pick the lexicographically smallest active merchant_id, then smallest product id (deterministic tie-break).
 */
@Injectable()
export class MarketplaceService {
  private readonly logger = new Logger(MarketplaceService.name);
  private readonly cache = new Map<string, { expiresAt: number; value: unknown }>();
  private readonly visibilityService = new ProductVisibilityService();
  private readonly bannersService: MarketplaceBannersService;
  /**
   * Category-tree cache strategy: short TTL (60s) instead of 10 minutes so newly
   * created/renamed active categories appear without waiting for a long occupancy cache.
   * Product listing cache remains keyed by category_slug + filters (TTL.products).
   * Explicit admin invalidation can be added later; 60s is the selected strategy for this task.
   */
  private static readonly TTL = {
    home: 5 * 60 * 1000,
    categories: 60 * 1000,
    products: 2 * 60 * 1000,
    merchantBySlug: 5 * 60 * 1000,
  } as const;

  /** Test helper — clears in-process marketplace caches. */
  clearCachesForTests() {
    this.cache.clear();
  }

  static get categoriesCacheTtlMs() {
    return MarketplaceService.TTL.categories;
  }

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly whatsAppIntentsService: WhatsAppIntentsService,
    bannersService?: MarketplaceBannersService,
  ) {
    this.bannersService =
      bannersService ?? new MarketplaceBannersService(this.supabaseAdmin, this.visibilityService);
  }

  private now() {
    return Date.now();
  }

  private readCache<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  private writeCache<T>(key: string, value: T, ttlMs: number) {
    this.cache.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  private async withCacheAndTiming<T>(cacheKey: string, ttlMs: number, opName: string, work: () => Promise<T>): Promise<T> {
    const start = this.now();
    const cached = this.readCache<T>(cacheKey);
    if (cached !== null) {
      const elapsed = this.now() - start;
      this.logger.debug(`[marketplace] ${opName} cache=hit duration=${elapsed}ms key=${cacheKey}`);
      return cached;
    }
    const fresh = await work();
    this.writeCache(cacheKey, fresh, ttlMs);
    const elapsed = this.now() - start;
    this.logger.log(`[marketplace] ${opName} cache=miss duration=${elapsed}ms key=${cacheKey}`);
    return fresh;
  }

  /**
   * Shared ViewerContext visibility filter — the SINGLE source of truth for the
   * marketplace segmentation rules. Used by listProducts(), getBrands(), the segmented
   * home, and context-aware category occupancy so product, brand and category
   * filtering can never diverge.
   *
   * - web_store (or no ctx): public behavior — query returned unchanged.
   * - non-web surface: visible_in ⊇ {surface|all}.
   */
  /**
   * Canonical cache identity for ViewerContext-dependent visibility. Keyed on the
   * RESOLVED visibility SEMANTICS — surface. Since web_store visibility is
   * role-independent (applyViewerVisibility no-ops), it collapses to a single
   * identity so the classic global "categories" cache entry is preserved.
   * Contains no PII/tokens.
   */
  private getViewerVisibilityCacheIdentity(ctx?: ViewerContext): Record<string, unknown> {
    const surface = ctx?.surface ?? "web_store";
    return { surface };
  }

  private applyViewerVisibility(query: any, ctx?: ViewerContext): any {
    const surface = ctx?.surface ?? "web_store";
    if (surface === "web_store") return query;
    return query.or(`visible_in.cs.{${surface}},visible_in.cs.{all}`);
  }

  /**
   * Active category tree with occupancy metadata.
   *
   * Backward compatible: with no ctx (or a web_store ctx) it preserves the classic
   * public behavior and the global "categories" cache entry. With a customer_app
   * ViewerContext, occupancy is computed with the SAME visibility rules as products
   * (applyViewerVisibility). Occupancy is cached PER-CONTEXT.
   */
  async getCategories(ctx?: ViewerContext) {
    const identity = this.getViewerVisibilityCacheIdentity(ctx);
    const cacheKey =
      identity.surface === "web_store"
        ? "categories"
        : `categories:${JSON.stringify(identity)}`;
    return this.withCacheAndTiming(cacheKey, MarketplaceService.TTL.categories, "GET /marketplace/categories", async () => {
      const { data, error } = await this.supabaseAdmin.client
        .from("categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as MarketplaceCategoryRow[];

      // Occupancy metadata — same visibility rules as products for this ViewerContext.
      let occQuery = applyPublicProductFilters(
        this.supabaseAdmin.client
          .from("products")
          .select("category_id, merchants!inner(status)")
          .eq("merchants.status", "active"),
      );
      occQuery = this.applyViewerVisibility(occQuery, ctx);
      const { data: occupied, error: occError } = await occQuery;
      if (occError) throw occError;

      const directCounts = new Map<string, number>();
      for (const p of occupied ?? []) {
        const id = (p as { category_id?: string | null }).category_id;
        if (!id) continue;
        directCounts.set(id, (directCounts.get(id) ?? 0) + 1);
      }

      return enrichCategoriesWithPublicCounts(rows, directCounts);
    });
  }

  /**
   * Resolve selected category + active descendant ids for product filtering.
   * Shared by listProducts / getCategoryPage so root vs leaf scope stays consistent.
   */
  async resolveCategoryScopeBySlug(slug: string): Promise<CategoryScope | null> {
    const rows = (await this.getCategories()) as MarketplaceCategoryRow[];
    return resolveCategoryScopeFromRows(slug, rows);
  }

  private async getCategoryIdBySlug(slug: string) {
    const scope = await this.resolveCategoryScopeBySlug(slug);
    return scope?.selectedCategory.id ?? null;
  }

  async getBrands(ctx?: ViewerContext) {
    const cacheKey = `brands:${JSON.stringify(ctx)}`;
    return this.withCacheAndTiming(cacheKey, MarketplaceService.TTL.categories, "GET /marketplace/brands", async () => {
      let query = applyPublicProductFilters(
        this.supabaseAdmin.client
          .from("products")
          // `images` is selected so each brand can carry a representative image. The Store has no brand
          // logo/asset table — a brand is just the free-text `products.brand` column — so the only REAL
          // imagery available for a brand is a photo of one of its own eligible products.
          .select("brand, images, merchants!inner(status)")
          .eq("merchants.status", "active")
          .not("brand", "is", null)
          .neq("brand", ""),
      );

      // Apply the same visibility rules as products (shared helper).
      query = this.applyViewerVisibility(query, ctx);

      const { data, error } = await query;
      if (error) throw error;

      const counts: Record<string, number> = {};
      const images: Record<string, string> = {};
      for (const row of data ?? []) {
        const name = String(row.brand || "").trim();
        if (!name) continue;
        counts[name] = (counts[name] || 0) + 1;
        if (!images[name]) {
          const first = Array.isArray(row.images) ? row.images.find((i: unknown) => typeof i === "string" && i.trim() !== "") : null;
          if (first) images[name] = String(first);
        }
      }

      const brands = Object.entries(counts).map(([name, count]) => ({
        name,
        count,
        // Representative image of an ELIGIBLE product of this brand (same visibility rules as the count
        // above); null when no eligible product of that brand has a photo. Additive field.
        imageUrl: images[name] ?? null,
      }));

      brands.sort((a, b) => a.name.localeCompare(b.name));
      return { brands };
    });
  }

  /**
   * Marketplace home payload.
   *
   * Surface=web_store (default): returns classic home shape for backward compatibility.
   * Surface=customer_app: returns dynamic segmented layout.
   */
  async getHome(ctx: ViewerContext = { surface: "web_store" }) {
    const { surface, segment, businessType } = ctx;

    // web_store: classic behavior, cached, backward-compatible
    if (surface === "web_store" || !surface) {
      return this.withCacheAndTiming("home", MarketplaceService.TTL.home, "GET /marketplace/home", async () => {
        return this._buildWebStoreHome();
      });
    }

    // customer_app or other surfaces: dynamic, cached by canonical viewer visibility + segment
    const cacheKey = `home:${JSON.stringify({
      segment: segment ?? null,
      visibility: this.getViewerVisibilityCacheIdentity(ctx),
    })}`;
    return this.withCacheAndTiming(cacheKey, 60 * 1000, `GET /marketplace/home?surface=${surface}`, async () => {
      return this._buildSegmentedHome(ctx);
    });
  }

  /** Classic web_store home — unchanged from original behavior. */
  private async _buildWebStoreHome() {
    const categories = await this.getCategories();

    /** Featured merchants: `status = active`, order `is_featured` desc then `created_at` desc, limit 8. */
    const { data: featuredMerchants, error: fmErr } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, slug, display_name, logo_url, description, is_featured, status")
      .eq("status", "active")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(8);
    if (fmErr) throw fmErr;

    const [featuredRes, newRes, offersRes] = await Promise.all([
      /** `featuredProducts`: selection signal is `is_best_seller = true` (active merchant, active product). */
      this.applyViewerVisibility(
        applyPublicProductFilters(
          this.supabaseAdmin.client
            .from("products")
            .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
            .eq("is_best_seller", true)
            .eq("merchants.status", "active"),
        ),
        { surface: "web_store", isTrusted: false },
      )
        .order("created_at", { ascending: false })
        .limit(8),
      /** `newProducts`: flag-driven `is_new = true` (not derived from dates alone). */
      this.applyViewerVisibility(
        applyPublicProductFilters(
          this.supabaseAdmin.client
            .from("products")
            .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
            .eq("is_new", true)
            .eq("merchants.status", "active"),
        ),
        { surface: "web_store", isTrusted: false },
      )
        .order("created_at", { ascending: false })
        .limit(8),
      /** Raw candidates for offers; filtered to true discounts below. */
      this.applyViewerVisibility(
        applyPublicProductFilters(
          this.supabaseAdmin.client
            .from("products")
            .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
            .not("discount_price", "is", null)
            .eq("merchants.status", "active"),
        ),
        { surface: "web_store", isTrusted: false },
      )
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    if (featuredRes.error) throw featuredRes.error;
    if (newRes.error) throw newRes.error;
    if (offersRes.error) throw offersRes.error;

    /** `offerProducts`: `discount_price` set and strictly less than `price`. */
    const offerProducts = (offersRes.data ?? []).filter((p: any) => p.discount_price != null && Number(p.discount_price) < Number(p.price));

    return {
      contractVersion: MARKETPLACE_HOME_CONTRACT_VERSION,
      categories,
      featuredMerchants: featuredMerchants ?? [],
      featuredProducts: featuredRes.data ?? [],
      newProducts: newRes.data ?? [],
      offerProducts,
    };
  }

  /**
   * Segmented home for Customer App.
   * Returns a stable dynamic layout shape even if sections are initially empty.
   * Products in sections are automatically filtered by surface + audience.
   */
  private async _buildSegmentedHome(ctx: ViewerContext) {
    const { surface, segment, businessType } = ctx;
    // ViewerContext-aware categories: response.categories and the category_grid
    // section share the same occupancy result, consistent with the product sections.
    const categories = (await this.getCategories(ctx)) as MarketplaceCategoryRow[];

    // M30 / H5-A: Fetch eligible promotional banners for this ViewerContext
    const banners = await this.bannersService.listEligibleBanners(ctx, categories);
    const heroBanners = banners.filter((b) => b.type === "hero_banner");
    const campaignBanners = banners.filter((b) => b.type === "campaign_banner");

    // Shared visibility rules (identical to listProducts/getBrands/category occupancy).
    const applyVisibility = <T>(query: T) => this.applyViewerVisibility(query, ctx);

    // Section 1: Featured products for this segment (b2b offers + best sellers)
    const [b2bFeaturedRes, newSegmentRes, b2bOffersRes] = await Promise.all([
      applyVisibility(
        applyPublicProductFilters(
          this.supabaseAdmin.client
            .from("products")
            .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
            .eq("is_best_seller", true)
            .eq("merchants.status", "active"),
        )
          .order("created_at", { ascending: false })
          .limit(10)
      ),
      applyVisibility(
        applyPublicProductFilters(
          this.supabaseAdmin.client
            .from("products")
            .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
            .eq("is_new", true)
            .eq("merchants.status", "active"),
        )
          .order("created_at", { ascending: false })
          .limit(10)
      ),
      applyVisibility(
        applyPublicProductFilters(
          this.supabaseAdmin.client
            .from("products")
            .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
            .not("discount_price", "is", null)
            .eq("is_b2b_offer", true)
            .eq("merchants.status", "active"),
        )
          .order("created_at", { ascending: false })
          .limit(10)
      ),
    ]);

    if (b2bFeaturedRes.error) throw b2bFeaturedRes.error;
    if (newSegmentRes.error) throw newSegmentRes.error;
    if (b2bOffersRes.error) throw b2bOffersRes.error;

    const b2bOfferProducts = ((b2bOffersRes.data ?? []) as Array<Record<string, unknown>>).filter(
      (p) => p.discount_price != null && Number(p.discount_price) < Number(p.price)
    );

    // Build dynamic sections array: hero banners placed before product sections
    const sections: Array<StorePromoBannerSection | Record<string, unknown>> = [...heroBanners];
    let firstCarouselInserted = false;

    if ((b2bFeaturedRes.data ?? []).length > 0) {
      sections.push({
        type: "product_carousel",
        title: "الأكثر مبيعاً",
        key: "best_sellers",
        products: b2bFeaturedRes.data,
      });
      firstCarouselInserted = true;
      if (campaignBanners.length > 0) {
        sections.push(...campaignBanners);
      }
    }

    if (b2bOfferProducts.length > 0) {
      sections.push({
        type: "product_carousel",
        title: "عروض B2B",
        key: "b2b_offers",
        products: b2bOfferProducts,
      });
      if (!firstCarouselInserted && campaignBanners.length > 0) {
        sections.push(...campaignBanners);
        firstCarouselInserted = true;
      }
    }

    if ((newSegmentRes.data ?? []).length > 0) {
      sections.push({
        type: "product_carousel",
        title: "جديد",
        key: "new_arrivals",
        products: newSegmentRes.data,
      });
      if (!firstCarouselInserted && campaignBanners.length > 0) {
        sections.push(...campaignBanners);
        firstCarouselInserted = true;
      }
    }

    // Fallback: If no product sections were added but visible products exist,
    // show a "recommended for you" section so the home screen isn't empty.
    const hasProductSections = sections.some((s) => s.type === "product_carousel");
    if (!hasProductSections) {
      const fallbackRes = await applyVisibility(
        applyPublicProductFilters(
          this.supabaseAdmin.client
            .from("products")
            .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
            .eq("merchants.status", "active"),
        )
          .order("created_at", { ascending: false })
          .limit(10)
      );
      if (!fallbackRes.error && (fallbackRes.data ?? []).length > 0) {
        sections.push({
          type: "product_carousel",
          title: "منتجات مختارة لك",
          key: "recommended_for_you",
          products: fallbackRes.data,
        });
        if (!firstCarouselInserted && campaignBanners.length > 0) {
          sections.push(...campaignBanners);
          firstCarouselInserted = true;
        }
      }
    }

    // If there were no product carousels, place campaign banners before category grid
    if (!firstCarouselInserted && campaignBanners.length > 0) {
      sections.push(...campaignBanners);
    }

    sections.push({
      type: "category_grid",
      title: "تسوق حسب الفئة",
      key: "categories",
      categories,
    });

    return {
      layoutVersion: 1,
      surface,
      segment: segment ?? null,
      businessType: businessType ?? null,
      banners: [], // legacy / backward-compatibility field
      categories,
      sections,
    };
  }

  /**
   * Paginated cross-merchant listing — sort/search semantics: `marketplace-list.contract.ts`.
   * When surface=web_store (default), behaves exactly as before.
   */
  async listProducts(params: {
    offset: number;
    limit: number;
    category_slug?: string;
    merchant_id?: string;
    filter?: string;
    search?: string;
    sort?: ProductSort;
    min_price?: number;
    max_price?: number;
    brand?: string;
    color?: string;
    size?: string;
    min_weight?: number;
    max_weight?: number;
    viewerContext?: ViewerContext;
    useCase?: string;
    purchaseMode?: string;
  }) {
    const cacheKey = `products:${JSON.stringify(params)}`;
    return this.withCacheAndTiming(cacheKey, MarketplaceService.TTL.products, "GET /marketplace/products", async () => {
    const offset = Math.max(0, params.offset);
    const limit = Math.min(Math.max(1, params.limit), 100);

    let query = applyPublicProductFilters(
      this.supabaseAdmin.client
        .from("products")
        .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT, { count: "exact" })
        .eq("merchants.status", "active"),
    );

    if (params.merchant_id) {
      query = query.eq("merchant_id", params.merchant_id);
    }

    if (params.category_slug) {
      const scope = await this.resolveCategoryScopeBySlug(params.category_slug);
      if (!scope) {
        return { items: [], total: 0, offset, limit };
      }
      // Root: selected + all active descendants. Leaf: selected only (no descendants).
      query = query.in("category_id", scope.categoryIds);
    }

    if (params.filter === "new") query = query.eq("is_new", true);
    if (params.filter === "featured") query = query.eq("is_best_seller", true);
    if (params.filter === "offers") {
      query = query.not("discount_price", "is", null).filter("discount_price", "lt", "price");
    }
    /** M2.1 search: `products.name` only, after normalization; min length — see `marketplace-list.contract.ts`. */
    const normalizedSearch = normalizeMarketplaceSearchQuery(params.search);
    if (marketplaceSearchFilterApplies(normalizedSearch)) {
      query = query.or(`name.ilike.%${normalizedSearch}%,brand.ilike.%${normalizedSearch}%`);
    }

    if (typeof params.min_price === "number" && !Number.isNaN(params.min_price)) {
      query = query.gte("price", params.min_price);
    }
    if (typeof params.max_price === "number" && !Number.isNaN(params.max_price)) {
      query = query.lte("price", params.max_price);
    }
    if (params.brand) {
      query = query.ilike("brand", params.brand);
    }
    if (params.color) {
      query = query.contains("colors", [params.color]);
    }
    if (params.size) {
      query = query.contains("sizes", [params.size]);
    }
    if (typeof params.min_weight === "number" && !Number.isNaN(params.min_weight)) {
      query = query.gte("weight_grams", params.min_weight);
    }
    if (typeof params.max_weight === "number" && !Number.isNaN(params.max_weight)) {
      query = query.lte("weight_grams", params.max_weight);
    }

    // M26/M27: Apply visibility segmentation filters from ViewerContext (shared helper).
    const ctx: ViewerContext = params.viewerContext ?? { surface: "web_store" };
    query = this.applyViewerVisibility(query, ctx);

    // use_case filter
    if (params.useCase) {
      query = query.contains("product_use_cases", [params.useCase]);
    }

    // purchase_mode filter
    if (params.purchaseMode) {
      query = query.contains("purchase_mode", [params.purchaseMode]);
    }

    const sort = params.sort ?? "newest";
    if (sort === "price-asc") query = query.order("price", { ascending: true });
    else if (sort === "price-desc") query = query.order("price", { ascending: false });
    else query = query.order("created_at", { ascending: false });

    const to = offset + limit - 1;
    const { data, error, count } = await query.range(offset, to);
    if (error) throw error;

    const rows = data ?? [];

    return {
      items: rows,
      total: count ?? rows.length,
      offset,
      limit,
    };
    });
  }

  /**
   * Public product by global slug — see `marketplace-product-detail.contract.ts`.
   * Supports ViewerContext for surface visibility.
   * Returns null (→ 404) if product exists but is not visible in the viewer's context.
   */
  async getProductBySlug(slug: string, ctx?: ViewerContext) {
    const { data: rows, error } = await applyPublicProductFilters(
      this.supabaseAdmin.client
        .from("products")
        .select(MARKETPLACE_PRODUCT_WITH_MERCHANT_SELECT)
        .eq("slug", slug)
        .eq("merchants.status", "active"),
    );
    if (error) throw error;
    if (!rows?.length) return null;

    if (rows.length > 1) {
      this.logger.warn(
        `Marketplace slug ambiguity: ${rows.length} active rows for slug "${slug}"; ` +
          `returning deterministic first (merchant_id asc, then product id asc). Consider global unique slugs (M1.6).`,
      );
    }

    const sorted = [...rows].sort((a: any, b: any) => {
      const ma = String(a.merchant_id ?? "");
      const mb = String(b.merchant_id ?? "");
      if (ma !== mb) return ma.localeCompare(mb);
      return String(a.id ?? "").localeCompare(String(b.id ?? ""));
    });

    const product: any = sorted[0] ?? null;
    if (!product) return null;

    // Defense in depth: the query above already filters is_active/is_published/visibility_status,
    // but re-check the triple-state in-process in case a future edit narrows the select/columns.
    if (!isPubliclyListableProduct(product)) return null;

    // Apply visibility check across all surfaces
    const activeCtx = ctx ?? { surface: "web_store" };
    const isVisible = this.visibilityService.canProductBeShown(
      {
        is_active: product.is_active,
        visible_in: product.visible_in,
        target_audience: product.target_audience,
      },
      activeCtx,
    );
    if (!isVisible) return null; // → 404 to caller

    return product;
  }

  /** Resolve many product ids for wishlist/cart previews — active product + active merchant; includes `merchants` embed. */
  async getProductsByIds(ids: string[]) {
    const trimmed = ids.slice(0, 100);
    if (trimmed.length === 0) return [];
    let query = applyPublicProductFilters(
      this.supabaseAdmin.client
        .from("products")
        .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
        .in("id", trimmed)
        .eq("merchants.status", "active"),
    );
    query = this.applyViewerVisibility(query, { surface: "web_store", isTrusted: false });
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async getCategoryPage(slug: string) {
    const scope = await this.resolveCategoryScopeBySlug(slug);
    if (!scope) return { category: null, subcategories: [], products: [] };

    let query = applyPublicProductFilters(
      this.supabaseAdmin.client
        .from("products")
        .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
        .in("category_id", scope.categoryIds)
        .eq("merchants.status", "active"),
    );
    query = this.applyViewerVisibility(query, { surface: "web_store", isTrusted: false });
    const { data: products, error: productsError } = await query.order("sort_order", { ascending: true });
    if (productsError) throw productsError;

    return {
      category: scope.selectedCategory,
      // Active children always returned — empty children stay visible.
      subcategories: scope.children.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
      products: products ?? [],
    };
  }

  /**
   * Same-category suggestions — filtered by ViewerContext for segmented surfaces.
   */
  async getSuggested(params: { category_id: string; exclude_id: string }, ctx?: ViewerContext) {
    const { data, error } = await applyPublicProductFilters(
      this.supabaseAdmin.client
        .from("products")
        .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT)
        .eq("category_id", params.category_id)
        .neq("id", params.exclude_id)
        .eq("merchants.status", "active"),
    )
      .order("created_at", { ascending: false })
      .limit(12); // fetch extra to allow in-memory filtering
    if (error) throw error;

    let rows = data ?? [];

    // Apply in-memory visibility filtering for non-web_store surfaces
    if (ctx && ctx.surface !== "web_store") {
      rows = rows.filter((p: any) =>
        this.visibilityService.canProductBeShown(
          {
            is_active: p.is_active,
            visible_in: p.visible_in,
            target_audience: p.target_audience,
          },
          ctx,
        ),
      );
    }

    return rows.slice(0, 8);
  }

  async getOffersList(params: { offset: number; limit: number }) {
    const offset = Math.max(0, params.offset);
    const limit = Math.min(Math.max(1, params.limit), 100);
    const to = offset + limit - 1;

    const { data, error, count } = await applyPublicProductFilters(
      this.supabaseAdmin.client
        .from("products")
        .select(MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT, { count: "exact" })
        .not("discount_price", "is", null)
        .filter("discount_price", "lt", "price")
        .eq("merchants.status", "active"),
    )
      .order("created_at", { ascending: false })
      .range(offset, to);
    if (error) throw error;
    return { items: data ?? [], total: count ?? 0, offset, limit };
  }

  /**
   * Paginated merchant discovery — `marketplace-stores.contract.ts` (card DTO, sort semantics).
   */
  async listMerchantsForDiscovery(params: { offset: number; limit: number; sort: "featured" | "newest" | "name" }) {
    const offset = Math.max(0, params.offset);
    const limit = Math.min(Math.max(1, params.limit), 100);

    let query = this.supabaseAdmin.client
      .from("merchants")
      .select(MARKETPLACE_MERCHANT_CARD_SELECT, { count: "exact" })
      .eq("status", "active");

    if (params.sort === "newest") {
      query = query.order("created_at", { ascending: false });
    } else if (params.sort === "name") {
      query = query.order("display_name", { ascending: true });
    } else {
      query = query.order("is_featured", { ascending: false }).order("created_at", { ascending: false });
    }

    const to = offset + limit - 1;
    const { data, error, count } = await query.range(offset, to);
    if (error) throw error;
    let rows = data ?? [];
    if (params.sort === "featured" && rows.length > 0) {
      const merchantIds = rows.map((row: any) => row.id);
      const multiplierMap = await this.whatsAppIntentsService.getComplianceMultiplierMap(merchantIds);
      rows = [...rows]
        .map((row: any, index: number) => {
          const baseScore = (row.is_featured ? 1000 : 0) + (rows.length - index);
          const multiplier = multiplierMap.get(row.id) ?? 1;
          return { row, finalScore: baseScore * multiplier };
        })
        .sort((a, b) => b.finalScore - a.finalScore)
        .map((x) => x.row);
    }
    return {
      items: rows,
      total: count ?? rows.length,
      offset,
      limit,
    };
  }

  /**
   * Public storefront by slug (`/store/:slug`). **Only** `status = 'active'`; draft/suspended/archived → 404.
   */
  async getMerchantBySlugOrThrow(slug: string) {
    const cacheKey = `merchant:${slug}`;
    return this.withCacheAndTiming(cacheKey, MarketplaceService.TTL.merchantBySlug, "GET /marketplace/merchants/:slug", async () => {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select(MARKETPLACE_PUBLIC_MERCHANT_SELECT)
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Merchant not found.");
    return data;
    });
  }

  /**
   * Public-facing quick links. Filters out any row whose `href` fails the canonical validator
   * before it ever reaches the storefront — a legacy/bad row (e.g. an unsafe scheme written
   * before this validator existed) is silently excluded, never served, and never blocks the
   * other valid rows from rendering. See DilMart-STORE-DESKTOP-QUICK-LINKS-SECURITY-047.
   */
  async listActiveDesktopQuickLinks() {
    const { data, error } = await this.supabaseAdmin.client
      .from("desktop_quick_links")
      .select("id,label,href,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return (data ?? []).filter((row) => isValidDesktopQuickLinkHref(row.href));
  }
}
