import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MarketplaceService } from '../marketplace.service';
import type { ViewerContext } from '../../store-integration/store-integration.types';
import {
  CUSTOMER_ENTRY_CONTRACT_VERSION,
  CUSTOMER_ENTRY_CURRENCY,
  CUSTOMER_ENTRY_LIMITS,
  CustomerEntryBrand,
  CustomerEntryCategory,
  CustomerEntryProduct,
  CustomerEntryResponse,
} from './customer-entry.types';
import { brandTarget, categoryTarget, productTarget } from './customer-entry.validator';

/**
 * DilMart-CUSTOMER-STORE-STORE-PR2 — composes the read-only Customer Gateway entry.
 *
 * Composition-only: every section is fetched through existing eligibility-correct
 * MarketplaceService methods (which apply the customer/public visibility rules for
 * the given ViewerContext). This service adds NO new visibility logic and NO direct
 * Supabase queries — it just maps eligible results into the minimal Gateway DTOs
 * and validates every target path. Optional sections fail independently: one empty
 * section never fails the whole payload.
 */
@Injectable()
export class CustomerEntryService {
  private readonly logger = new Logger(CustomerEntryService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly marketplace: MarketplaceService,
  ) {}

  /** Backend feature flag is authoritative. Disabled unless explicitly 'true'. */
  isEnabled(): boolean {
    return this.config.get<string>('STORE_CUSTOMER_APP_SURFACE_ENABLED') === 'true';
  }

  async build(ctx: ViewerContext): Promise<CustomerEntryResponse> {
    const [categories, featuredProducts, offers, brands] = await Promise.all([
      this.safeSection('categories', () => this.buildCategories(ctx)),
      this.safeSection('featuredProducts', () => this.buildFeatured(ctx)),
      this.safeSection('offers', () => this.buildOffers(ctx)),
      this.safeSection('brands', () => this.buildBrands(ctx)),
    ]);

    return {
      version: CUSTOMER_ENTRY_CONTRACT_VERSION,
      // No Store editorial/CMS source exists for hero copy (documented in the PR).
      // Static, non-catalog fallback copy only; imageUrl null; target validated.
      hero: {
        title: 'ديلمارت ستور',
        subtitle: 'منتجات أصلية للعناية والجمال',
        // Presentation-only: reuse an image already present in THIS payload so the Gateway hero is not blank.
        // No new query, no new visibility rule, no new field — every candidate has already passed the same
        // eligibility checks as the section it came from. Null when the payload carries no image at all.
        imageUrl: this.pickHeroImage(featuredProducts, offers, categories),
        // The hero CTA opens the FULL Store home — the Gateway is a discovery surface, so the
        // "shop now" affordance hands the customer over to the complete storefront.
        target: '/',
      },
      categories,
      featuredProducts,
      brands,
      offers,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * First usable image already contained in this payload, preferred in visual-quality order:
   * featured product → offer → category. Returns null when nothing in the payload has an image.
   */
  private pickHeroImage(
    featured: CustomerEntryProduct[],
    offers: CustomerEntryProduct[],
    categories: CustomerEntryCategory[],
  ): string | null {
    for (const list of [featured, offers, categories]) {
      const hit = list.find((i) => typeof i.imageUrl === 'string' && i.imageUrl.trim() !== '');
      if (hit) return hit.imageUrl;
    }
    return null;
  }

  /** Runs an optional section; on any error returns [] so core browsing is unaffected. */
  private async safeSection<T>(
    name: string,
    fn: () => Promise<T[]>,
  ): Promise<T[]> {
    try {
      return await fn();
    } catch (err) {
      // Safe operational log only — never the raw error payload / row data.
      this.logger.warn(
        `[customer-entry] optional section '${name}' failed; returning empty`,
      );
      return [];
    }
  }

  private async buildCategories(
    ctx: ViewerContext,
  ): Promise<CustomerEntryCategory[]> {
    // Context-aware occupancy: has_public_products reflects products visible to
    // THIS viewer, so a category occupied only by (e.g.) barber_app products is
    // not emitted to a customer viewer.
    const rows = (await this.marketplace.getCategories(ctx)) as Array<
      Record<string, unknown>
    >;
    const out: CustomerEntryCategory[] = [];
    for (const c of rows ?? []) {
      // Root categories only, and only those with public/customer-eligible products.
      if (c.parent_id != null || c.has_public_products !== true) continue;
      const slug = c.slug;
      const target = categoryTarget(slug);
      if (!target || !c.id || !c.name) continue; // required fields
      out.push({
        id: String(c.id),
        slug: String(slug),
        name: String(c.name),
        imageUrl: (c.image_url as string) ?? (c.icon_url as string) ?? null,
        target,
      });
      if (out.length >= CUSTOMER_ENTRY_LIMITS.categories) break;
    }
    return out;
  }

  private async buildFeatured(ctx: ViewerContext): Promise<CustomerEntryProduct[]> {
    // Store's existing featured signal: products.is_best_seller = true, then the
    // full customer/public visibility rules for `ctx`, newest-first. An empty
    // featured list is acceptable (no arbitrary-newest fallback).
    const { items } = await this.marketplace.listProducts({
      offset: 0,
      limit: CUSTOMER_ENTRY_LIMITS.featuredProducts,
      filter: 'featured',
      sort: 'newest',
      viewerContext: ctx,
    });
    return this.mapProducts(items);
  }

  private async buildOffers(ctx: ViewerContext): Promise<CustomerEntryProduct[]> {
    const { items } = await this.marketplace.listProducts({
      offset: 0,
      limit: CUSTOMER_ENTRY_LIMITS.offers,
      filter: 'offers',
      sort: 'newest',
      viewerContext: ctx,
    });
    return this.mapProducts(items);
  }

  private async buildBrands(ctx: ViewerContext): Promise<CustomerEntryBrand[]> {
    const { brands } = await this.marketplace.getBrands(ctx);
    return (brands ?? [])
      .slice(0, CUSTOMER_ENTRY_LIMITS.brands)
      .map((b) => {
        const name = String(b.name);
        // Store authors the target through the canonical validator; an unsafe or over-long
        // brand yields null and the brand is dropped rather than shipped with a bad target.
        const target = brandTarget(name);
        return target === null
          ? null
          : {
              name,
              productCount: Number(b.count) || 0,
              // Representative product image of this brand (see CustomerEntryBrand.imageUrl — not a logo).
              imageUrl: typeof b.imageUrl === 'string' && b.imageUrl.trim() !== '' ? b.imageUrl : null,
              target,
            };
      })
      .filter((b): b is CustomerEntryBrand => b !== null && b.name.length > 0);
  }

  /** Maps eligible product rows to the minimal DTO; drops rows missing required fields. */
  private mapProducts(items: Array<Record<string, unknown>>): CustomerEntryProduct[] {
    const out: CustomerEntryProduct[] = [];
    for (const p of items ?? []) {
      const slug = p?.slug;
      const target = productTarget(slug);
      if (!target || !p?.id || !p?.name) continue;

      // Price is a required customer-facing field: must be a positive number.
      const rawPrice = p?.price;
      const price = Number(rawPrice);
      if (rawPrice == null || !Number.isFinite(price) || price <= 0) continue;

      const rawDiscount = p?.discount_price;
      const discount = rawDiscount == null ? null : Number(rawDiscount);
      const discountPrice =
        discount != null && Number.isFinite(discount) && discount < price
          ? discount
          : null;

      const images = Array.isArray(p?.images) ? (p.images as unknown[]) : [];
      const firstImage = typeof images[0] === 'string' ? (images[0] as string) : null;

      out.push({
        id: String(p.id),
        slug: String(slug),
        name: String(p.name),
        imageUrl: firstImage,
        price,
        discountPrice,
        currency: CUSTOMER_ENTRY_CURRENCY,
        target,
      });
    }
    return out;
  }
}
