import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ProductVisibilityService } from "../store-integration/product-visibility.service";
import { ViewerContext } from "../store-integration/store-integration.types";
import { StorePromoBannerSection, StorePromoBannerAction } from "./marketplace-home.contract";

export interface MarketplaceBannerRow {
  id: string;
  banner_type: "hero_banner" | "campaign_banner";
  title?: string | null;
  subtitle?: string | null;
  image_url: string;
  mobile_image_url?: string | null;
  action_type: "none" | "category" | "search" | "external_url";
  action_category_id?: string | null;
  action_search_query?: string | null;
  action_external_url?: string | null;
  visible_in: string[];
  target_audience: string[];
  business_type_tags: string[];
  requires_verified_salon: boolean;
  is_active: boolean;
  sort_order: number;
  starts_at?: string | null;
  ends_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CategorySummary {
  id: string;
  slug?: string;
  name?: string;
}

export const MARKETPLACE_BANNER_SELECT =
  "id, banner_type, title, subtitle, image_url, mobile_image_url, action_type, action_category_id, action_search_query, action_external_url, visible_in, target_audience, business_type_tags, requires_verified_salon, is_active, sort_order, starts_at, ends_at, created_at, updated_at";

@Injectable()
export class MarketplaceBannersService {
  private readonly logger = new Logger(MarketplaceBannersService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly productVisibilityService: ProductVisibilityService,
  ) {}

  /**
   * Evaluates if a given URL is a valid, secure HTTPS DilMart-controlled external URL.
   * Hostname must be DilMart.org or a subdomain of DilMart.org (e.g. store.DilMart.org).
   */
  isValidExternalUrl(urlStr: string | null | undefined): boolean {
    if (!urlStr || typeof urlStr !== "string") return false;
    try {
      const parsed = new URL(urlStr);
      if (parsed.protocol !== "https:") return false;
      const host = parsed.hostname.toLowerCase();
      return host === "DilMart.org" || host.endsWith(".DilMart.org");
    } catch {
      return false;
    }
  }

  /**
   * Evaluates if a given string is a valid HTTPS image URL.
   */
  isValidHttpsUrl(urlStr: string | null | undefined): boolean {
    if (!urlStr || typeof urlStr !== "string") return false;
    try {
      const parsed = new URL(urlStr);
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Fetches and filters promotional banners for a specific viewer context.
   *
   * @param ctx Viewer context (surface, segment, businessType, verification claims)
   * @param eligibleCategories Pre-filtered categories already computed for this viewer
   */
  async listEligibleBanners(
    ctx: ViewerContext,
    eligibleCategories: CategorySummary[] = [],
  ): Promise<StorePromoBannerSection[]> {
    try {
      const { data, error } = await this.supabaseAdmin.client
        .from("marketplace_banners")
        .select(MARKETPLACE_BANNER_SELECT)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });

      if (error) {
        // Fail closed for banners without crashing the home feed
        this.logger.warn(`Failed to fetch marketplace_banners: ${error.message}`);
        return [];
      }

      if (!data || data.length === 0) {
        return [];
      }

      const now = new Date();
      const eligible: StorePromoBannerSection[] = [];

      for (const row of data as MarketplaceBannerRow[]) {
        try {
          // 1. Schedule check
          if (row.starts_at && new Date(row.starts_at) > now) {
            continue;
          }
          if (row.ends_at && new Date(row.ends_at) <= now) {
            continue;
          }

          // 2. Canonical visibility check (reuses ProductVisibilityService)
          const isVisible = this.productVisibilityService.canProductBeShown(
            {
              is_active: row.is_active,
              visible_in: row.visible_in,
              target_audience: row.target_audience,
            },
            ctx,
          );

          if (!isVisible) {
            continue;
          }

          // 3. Image URL validation
          if (!this.isValidHttpsUrl(row.image_url)) {
            this.logger.warn(`Banner ${row.id} has invalid image_url: ${row.image_url}`);
            continue;
          }

          let mobileImageUrl = row.mobile_image_url ?? null;
          if (mobileImageUrl && !this.isValidHttpsUrl(mobileImageUrl)) {
            mobileImageUrl = null;
          }

          // 4. Action mapping and target validation
          let action: StorePromoBannerAction | null = null;

          switch (row.action_type) {
            case "none":
              action = { type: "none" };
              break;

            case "category": {
              if (!row.action_category_id) {
                continue;
              }
              const targetCat = eligibleCategories.find((c) => c.id === row.action_category_id);
              if (!targetCat || !targetCat.slug) {
                // If target category is not in viewer's eligible category set, omit banner
                this.logger.debug(
                  `Banner ${row.id} omitted: target category ${row.action_category_id} not eligible for viewer`,
                );
                continue;
              }
              action = {
                type: "category",
                id: targetCat.id,
                slug: targetCat.slug,
                name: targetCat.name,
              };
              break;
            }

            case "search": {
              const query = row.action_search_query?.trim();
              if (!query || query.length > 200) {
                continue;
              }
              action = {
                type: "search",
                query,
              };
              break;
            }

            case "external_url": {
              const extUrl = row.action_external_url?.trim();
              if (!this.isValidExternalUrl(extUrl)) {
                this.logger.warn(`Banner ${row.id} omitted: invalid external_url: ${extUrl}`);
                continue;
              }
              action = {
                type: "external_url",
                url: extUrl!,
              };
              break;
            }

            default:
              continue;
          }

          if (!action) {
            continue;
          }

          eligible.push({
            type: row.banner_type,
            id: row.id,
            title: row.title ?? null,
            subtitle: row.subtitle ?? null,
            image_url: row.image_url,
            mobile_image_url: mobileImageUrl,
            action,
          });
        } catch (rowErr) {
          this.logger.warn(`Error processing banner row ${row?.id}: ${(rowErr as Error).message}`);
          continue;
        }
      }

      return eligible;
    } catch (err) {
      this.logger.error(`listEligibleBanners uncaught error: ${(err as Error).message}`);
      return [];
    }
  }
}
