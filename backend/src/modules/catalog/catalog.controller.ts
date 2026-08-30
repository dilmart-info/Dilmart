import { Controller, Get, Param, Query } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CatalogService } from "./catalog.service";

// Public catalog — higher rate limit than default (200/min) but NOT unlimited.
// Prevents automated scraping while allowing normal user browsing.
@Controller("catalog")
@Throttle({ default: { limit: 200, ttl: 60000 } })
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get("categories")
  getCategories() {
    return this.catalogService.getCategories();
  }

  @Get("products")
  getProducts(
    @Query("merchant_id") merchantId: string,
    @Query("category_slug") categorySlug?: string,
    @Query("filter") filter?: string,
    @Query("search") search?: string,
    @Query("sort") sort?: "newest" | "price-asc" | "price-desc",
  ) {
    return this.catalogService.getProducts({ merchant_id: merchantId, category_slug: categorySlug, filter, search, sort });
  }

  @Get("products/by-ids")
  getProductsByIds(@Query("ids") ids: string) {
    const parsed = (ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return this.catalogService.getProductsByIds(parsed);
  }

  @Get("offers")
  getOffers(@Query("merchant_id") merchantId: string) {
    return this.catalogService.getOffers(merchantId);
  }

  @Get("home")
  getHome(@Query("merchant_id") merchantId: string) {
    return this.catalogService.getHomeCollections(merchantId);
  }

  @Get("products/:slug")
  getProductBySlug(@Param("slug") slug: string, @Query("merchant_id") merchantId: string) {
    return this.catalogService.getProductBySlug(slug, merchantId);
  }

  @Get("suggested")
  getSuggested(@Query("merchant_id") merchantId: string, @Query("category_id") categoryId: string, @Query("exclude_id") excludeId: string) {
    return this.catalogService.getSuggestedProducts({ merchant_id: merchantId, category_id: categoryId, exclude_id: excludeId });
  }

  @Get("category/:slug")
  getCategoryPage(@Param("slug") slug: string, @Query("merchant_id") merchantId: string) {
    return this.catalogService.getCategoryPage(slug, merchantId);
  }
}
