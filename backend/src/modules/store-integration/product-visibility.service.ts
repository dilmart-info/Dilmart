import {
  ViewerContext,
  ResolvedAudience,
  StoreSurface,
} from "./store-integration.types";

/**
 * Product Visibility Service
 *
 * Encapsulates marketplace catalog visibility rules for DILMART.
 */
export class ProductVisibilityService {
  resolveAudienceFromViewerContext(_ctx?: ViewerContext): ResolvedAudience[] {
    return ["customer", "all"];
  }

  buildVisibilityFilters(ctx: ViewerContext): {
    surface: StoreSurface;
    resolvedAudiences: ResolvedAudience[];
  } {
    const surface = ctx.surface ?? "web_store";
    return {
      surface,
      resolvedAudiences: this.resolveAudienceFromViewerContext(ctx),
    };
  }

  canProductBeShown(
    product: {
      is_active: boolean;
      visible_in?: string[] | null;
      target_audience?: string[] | null;
    },
    ctx?: ViewerContext,
  ): boolean {
    if (!product.is_active) return false;

    const surface = ctx?.surface ?? "web_store";
    const visibleIn: string[] = product.visible_in ?? ["web_store"];
    const targetAudience: string[] = product.target_audience ?? ["all"];

    if (!visibleIn.includes(surface) && !visibleIn.includes("all")) {
      return false;
    }

    if (!targetAudience.includes("all")) {
      const resolvedAudiences = this.resolveAudienceFromViewerContext(ctx);
      const hasMatch = resolvedAudiences.some((a) => targetAudience.includes(a));
      if (!hasMatch) return false;
    }

    return true;
  }
}

