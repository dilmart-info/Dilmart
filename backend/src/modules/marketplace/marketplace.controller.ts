import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  Query,
  Res,
} from "@nestjs/common";
import { MarketplaceService } from "./marketplace.service";
import { StoreIntegrationService } from "../store-integration/store-integration.service";
import { StoreSurface, ViewerContext } from "../store-integration/store-integration.types";
import { resolveTrustedViewerContext } from "../store-integration/surface-resolver";

type CacheableResponse = { setHeader: (name: string, value: string) => void };

/**
 * Public marketplace API — cache-friendly GET (M1.0+).
 *
 * **Security model (M27 fixes):**
 * - `X-Store-Session` header carries a verified HMAC-signed token from the session exchange.
 * - When present, segment/businessType/sourceApp are derived from the TRUSTED session.
 * - Query params (surface, segment, business_type) remain for testing/public fallback.
 * - For barber_app requests: `X-Store-Session` is the authoritative context.
 *   Query params alone CANNOT be trusted for verified B2B behavior.
 *
 * **Visibility rules (M26):**
 * - surface=web_store (default): public behavior, unchanged.
 * - surface=barber_app + X-Store-Session: applies requires_verified_salon + audience + businessType.
 * - barber_app without businessType: only shows general (business_type_tags = ['all']) products.
 */
@Controller("marketplace")
export class MarketplaceController {
  constructor(
    private readonly marketplaceService: MarketplaceService,
    private readonly storeIntegrationService: StoreIntegrationService,
  ) {}

  private applyPublicCacheHeaders(res: CacheableResponse) {
    res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  }

  /**
   * Resolves a ViewerContext from the request headers + query params.
   * X-Store-Session is the TRUSTED source. Query params are the UNTRUSTED fallback.
   */
  private resolveViewerContext(
    storeSessionHeader: string | undefined,
    surfaceParam: string | undefined,
    segmentParam: string | undefined,
    businessTypeParam: string | undefined,
  ): ViewerContext {
    // Try to resolve from trusted X-Store-Session first.
    // The trusted source→surface mapping is centralized in surface-resolver.ts
    // so marketplace and cart can never diverge (incl. customer_app → customer_app).
    if (storeSessionHeader) {
      const claims = this.storeIntegrationService.verifyStoreSessionHeader(storeSessionHeader);
      if (claims) {
        return resolveTrustedViewerContext(claims);
      }
    }

    // Fallback to query params (untrusted — only for testing/public).
    // SECURITY: a public/untrusted client must NEVER be promoted to a privileged
    // app surface. `barber_app` and `customer_app` are reachable only via a
    // verified X-Store-Session above; here they resolve to the public surface.
    const surface: StoreSurface = surfaceParam === "all" ? "all" : "web_store";

    return {
      surface,
      segment: segmentParam as any,
      businessType: businessTypeParam?.trim() || undefined,
      isTrusted: false,
      requiresVerifiedSalonCheck: false,
    };
  }

  @Get("categories")
  getCategories(@Res({ passthrough: true }) res: CacheableResponse) {
    this.applyPublicCacheHeaders(res);
    return this.marketplaceService.getCategories();
  }

  @Get("brands")
  getBrands(
    @Res({ passthrough: true }) res: CacheableResponse,
    @Headers("x-store-session") storeSession: string | undefined,
    @Query("surface") surface?: string,
    @Query("segment") segment?: string,
    @Query("business_type") businessType?: string,
  ) {
    const ctx = this.resolveViewerContext(storeSession, surface, segment, businessType);
    if (ctx.surface === "web_store" && !ctx.segment) {
      this.applyPublicCacheHeaders(res);
    }
    return this.marketplaceService.getBrands(ctx);
  }

  @Get("home")
  getHome(
    @Res({ passthrough: true }) res: CacheableResponse,
    @Headers("x-store-session") storeSession: string | undefined,
    @Query("surface") surface?: string,
    @Query("segment") segment?: string,
    @Query("business_type") businessType?: string,
  ) {
    const ctx = this.resolveViewerContext(storeSession, surface, segment, businessType);

    if (ctx.surface === "web_store") {
      this.applyPublicCacheHeaders(res);
    }

    return this.marketplaceService.getHome(ctx);
  }

  @Get("products")
  listProducts(
    @Res({ passthrough: true }) res: CacheableResponse,
    @Headers("x-store-session") storeSession: string | undefined,
    @Query("offset") offsetRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("category_slug") categorySlug?: string,
    @Query("merchant_id") merchantId?: string,
    @Query("filter") filter?: string,
    @Query("search") search?: string,
    @Query("sort") sort?: "newest" | "price-asc" | "price-desc",
    @Query("min_price") minPriceRaw?: string,
    @Query("max_price") maxPriceRaw?: string,
    @Query("brand") brand?: string,
    @Query("color") color?: string,
    @Query("size") size?: string,
    @Query("min_weight") minWeightRaw?: string,
    @Query("max_weight") maxWeightRaw?: string,
    @Query("surface") surface?: string,
    @Query("segment") segment?: string,
    @Query("business_type") businessType?: string,
    @Query("use_case") useCase?: string,
    @Query("purchase_mode") purchaseMode?: string,
  ) {
    const ctx = this.resolveViewerContext(storeSession, surface, segment, businessType);

    if (ctx.surface === "web_store" && !ctx.segment) {
      this.applyPublicCacheHeaders(res);
    }

    const offset = Number.parseInt(offsetRaw ?? "0", 10) || 0;
    const limit = Number.parseInt(limitRaw ?? "24", 10) || 24;
    const min_price = minPriceRaw !== undefined && minPriceRaw !== "" ? Number(minPriceRaw) : undefined;
    const max_price = maxPriceRaw !== undefined && maxPriceRaw !== "" ? Number(maxPriceRaw) : undefined;
    const min_weight = minWeightRaw !== undefined && minWeightRaw !== "" ? Number(minWeightRaw) : undefined;
    const max_weight = maxWeightRaw !== undefined && maxWeightRaw !== "" ? Number(maxWeightRaw) : undefined;

    return this.marketplaceService.listProducts({
      offset,
      limit,
      category_slug: categorySlug,
      merchant_id: merchantId,
      filter,
      search,
      sort,
      min_price: typeof min_price === "number" && !Number.isNaN(min_price) ? min_price : undefined,
      max_price: typeof max_price === "number" && !Number.isNaN(max_price) ? max_price : undefined,
      brand: brand?.trim() || undefined,
      color: color?.trim() || undefined,
      size: size?.trim() || undefined,
      min_weight: typeof min_weight === "number" && !Number.isNaN(min_weight) ? min_weight : undefined,
      max_weight: typeof max_weight === "number" && !Number.isNaN(max_weight) ? max_weight : undefined,
      viewerContext: ctx,
      useCase: useCase?.trim() || undefined,
      purchaseMode: purchaseMode?.trim() || undefined,
    });
  }

  /** Must be registered before `products/slug/:slug` so `by-ids` is not parsed as a slug. */
  @Get("products/by-ids")
  getProductsByIds(@Query("ids") ids: string) {
    const parsed = (ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    if (parsed.length > 100) {
      throw new BadRequestException("`ids` supports at most 100 values.");
    }
    return this.marketplaceService.getProductsByIds(parsed);
  }

  /**
   * Product detail — supports segmentation context for Barber App.
   * If X-Store-Session is present and product is not visible in the session context → 404.
   * See `marketplace-product-detail.contract.ts` for allowlist and slug-collision rule.
   */
  @Get("products/slug/:slug")
  async getProductBySlug(
    @Param("slug") slug: string,
    @Headers("x-store-session") storeSession: string | undefined,
    @Query("surface") surface?: string,
    @Query("segment") segment?: string,
    @Query("business_type") businessType?: string,
  ) {
    const ctx = this.resolveViewerContext(storeSession, surface, segment, businessType);
    const product = await this.marketplaceService.getProductBySlug(slug, ctx);
    if (!product) throw new NotFoundException("Product not found.");
    return product;
  }

  @Get("category/:slug")
  getCategoryPage(@Param("slug") slug: string) {
    return this.marketplaceService.getCategoryPage(slug);
  }

  @Get("suggested")
  async getSuggested(
    @Query("category_id") categoryId: string,
    @Query("exclude_id") excludeId: string,
    @Headers("x-store-session") storeSession: string | undefined,
    @Query("surface") surface?: string,
  ) {
    const ctx = this.resolveViewerContext(storeSession, surface, undefined, undefined);
    const items = await this.marketplaceService.getSuggested({ category_id: categoryId, exclude_id: excludeId }, ctx);
    return { items, total: items.length, offset: 0, limit: items.length };
  }

  @Get("offers")
  async getOffers(@Query("offset") offsetRaw?: string, @Query("limit") limitRaw?: string) {
    const offset = Number.parseInt(offsetRaw ?? "0", 10) || 0;
    const limit = Number.parseInt(limitRaw ?? "24", 10) || 24;
    return this.marketplaceService.getOffersList({ offset, limit });
  }

  @Get("merchants")
  async listMerchants(
    @Res({ passthrough: true }) res: CacheableResponse,
    @Query("offset") offsetRaw?: string,
    @Query("limit") limitRaw?: string,
    @Query("sort") sortRaw?: string,
  ) {
    this.applyPublicCacheHeaders(res);
    const offset = Number.parseInt(offsetRaw ?? "0", 10) || 0;
    const limit = Number.parseInt(limitRaw ?? "24", 10) || 24;
    const sort = sortRaw === "newest" || sortRaw === "name" ? sortRaw : "featured";
    return this.marketplaceService.listMerchantsForDiscovery({ offset, limit, sort });
  }

  @Get("merchants/:slug")
  async getMerchant(@Res({ passthrough: true }) res: CacheableResponse, @Param("slug") slug: string) {
    this.applyPublicCacheHeaders(res);
    return this.marketplaceService.getMerchantBySlugOrThrow(slug);
  }

  @Get("desktop-quick-links")
  getDesktopQuickLinks(@Res({ passthrough: true }) res: CacheableResponse) {
    this.applyPublicCacheHeaders(res);
    return this.marketplaceService.listActiveDesktopQuickLinks();
  }
}
