import {
  DilMartRole,
  StoreSegment,
  ViewerContext,
  ResolvedAudience,
  StoreSurface,
} from "./store-integration.types";

/**
 * Product Visibility Service
 *
 * Encapsulates all product segmentation logic for the DilMart Store.
 *
 * Key design decisions:
 *  1. target_audience values ('salon_owner', 'barber_staff') are NOT the same as
 *     DilMart role values ('OWNER', 'BARBER'). A mapper is required (see resolveAudienceFromViewerContext).
 *  2. 'all' in any array field means "no restriction".
 *  3. Public web_store visitors see products with visible_in ⊇ ['web_store'].
 *  4. barber_app requests without businessType only see products with business_type_tags = ['all'].
 *  5. requires_verified_salon=true → only DilMart_APP_BARBER_OWNER and VERIFIED_SALON_OWNER can see/buy.
 *  6. Trusted context (X-Store-Session) is the source of truth for segment/businessType.
 *     Query params are only a fallback for public/testing.
 */
export class ProductVisibilityService {
  /**
   * Maps a DilMart viewer context (role/segment) to resolved target_audience values.
   *
   * IMPORTANT: DilMart roles ('OWNER','BARBER','STAFF') ≠ Store target_audience values.
   * This mapper bridges the gap between the two domain models.
   *
   * DilMart segment/role → Store target_audience mapping:
   *   OWNER / DilMart_APP_BARBER_OWNER / VERIFIED_SALON_OWNER  → salon_owner, professional_buyer
   *   BARBER/STAFF / DilMart_APP_BARBER_STAFF                  → barber_staff, professional_buyer
   *   CUSTOMER / DilMart_APP_CUSTOMER                          → customer
   *   RETAIL_CUSTOMER                                         → customer
   *   PROFESSIONAL_BARBER_UNVERIFIED                          → professional_buyer
   *   SALON_OWNER_LEAD                                        → salon_owner
   *   fallback (anonymous/public)                             → customer
   */
  resolveAudienceFromViewerContext(ctx: ViewerContext): ResolvedAudience[] {
    const { segment, role } = ctx;

    // Segment-based resolution (preferred — more specific, comes from verified session)
    if (segment === "DilMart_APP_BARBER_OWNER" || segment === "VERIFIED_SALON_OWNER") {
      return ["salon_owner", "professional_buyer"];
    }
    if (segment === "DilMart_APP_BARBER_STAFF") {
      return ["barber_staff", "professional_buyer"];
    }
    if (segment === "DilMart_APP_CUSTOMER") {
      return ["customer"];
    }
    if (segment === "RETAIL_CUSTOMER") {
      return ["customer"];
    }
    if (segment === "PROFESSIONAL_BARBER_UNVERIFIED") {
      return ["professional_buyer"];
    }
    if (segment === "SALON_OWNER_LEAD") {
      return ["salon_owner"];
    }

    // Role-based fallback (when segment is unavailable)
    if (role === "OWNER") return ["salon_owner", "professional_buyer"];
    if (role === "BARBER" || role === "STAFF") return ["barber_staff", "professional_buyer"];
    if (role === "CUSTOMER") return ["customer"];

    // Default for unknown/public viewers
    return ["customer"];
  }

  /**
   * Returns true if this viewer context represents a VERIFIED salon owner.
   * Used to enforce requires_verified_salon product restriction.
   *
   * SECURITY RULE (CLOSURE-A):
   *   - A viewer can ONLY be verified if `ctx.salonVerified === true` (explicit cryptographic claim).
   *   - Role 'OWNER' or segment 'DilMart_APP_BARBER_OWNER' alone NEVER implies verification.
   *   - A missing or undefined `salonVerified` fails closed (false).
   *   - Role 'BARBER' / 'STAFF' / 'CUSTOMER' can NEVER be verified salon owners.
   */
  isVerifiedSalonOwner(ctx: ViewerContext): boolean {
    if (ctx.isTrusted !== true || ctx.salonVerified !== true) {
      return false;
    }

    return (
      ctx.segment === "DilMart_APP_BARBER_OWNER" ||
      ctx.segment === "VERIFIED_SALON_OWNER" ||
      ctx.role === "OWNER"
    );
  }

  /**
   * Builds filter descriptors for DB query construction.
   * Returns an object describing visibility constraints to apply.
   *
   * For barber_app without businessType:
   *   - Only products with business_type_tags containing 'all' are returned.
   *   - This prevents salon equipment for nail studios appearing for men's barbershops.
   */
  buildVisibilityFilters(ctx: ViewerContext): {
    surface: StoreSurface;
    resolvedAudiences: ResolvedAudience[];
    businessType?: string;
    businessTypeMissing: boolean;
    enforceVerifiedSalon: boolean;
  } {
    const surface = ctx.surface ?? "web_store";
    const businessTypeMissing = surface !== "web_store" && !ctx.businessType;
    const enforceVerifiedSalon = ctx.isTrusted === true; // only enforce for verified sessions

    return {
      surface,
      resolvedAudiences: this.resolveAudienceFromViewerContext(ctx),
      businessType: ctx.businessType,
      businessTypeMissing,
      enforceVerifiedSalon,
    };
  }

  /**
   * Checks if a product is visible to a given viewer context (in-memory check).
   * For DB queries, use buildVisibilityFilters() instead.
   *
   * Visibility rules (applied in order):
   *  1. is_active = true
   *  2. visible_in contains surface OR 'all'
   *  3. requires_verified_salon enforcement (must be trusted & verified salon owner)
   *  4. target_audience overlaps resolved_audiences OR contains 'all'
   *  5. business_type_tags matches businessType OR contains 'all'
   *     (if barber_app and no businessType → only 'all' passes)
   */
  canProductBeShown(
    product: {
      is_active: boolean;
      visible_in?: string[] | null;
      target_audience?: string[] | null;
      business_type_tags?: string[] | null;
      requires_verified_salon?: boolean | null;
    },
    ctx: ViewerContext,
  ): boolean {
    // Rule 1: Must be active
    if (!product.is_active) return false;

    const surface = ctx.surface ?? "web_store";
    const visibleIn: string[] = product.visible_in ?? ["web_store"];
    const targetAudience: string[] = product.target_audience ?? ["all"];
    const businessTypeTags: string[] = product.business_type_tags ?? ["all"];

    // Rule 2: Surface check
    if (!visibleIn.includes(surface) && !visibleIn.includes("all")) {
      return false;
    }

    // Rule 3: requires_verified_salon enforcement
    if (product.requires_verified_salon) {
      if (!this.isVerifiedSalonOwner(ctx)) {
        return false;
      }
    }

    // Rule 4: Audience check
    if (!targetAudience.includes("all")) {
      const resolvedAudiences = this.resolveAudienceFromViewerContext(ctx);
      const hasMatch = resolvedAudiences.some((a) => targetAudience.includes(a));
      if (!hasMatch) return false;
    }

    // Rule 5: Business type check
    // For barber_app without businessType → only show 'all' products (prevent mixing)
    if (surface !== "web_store") {
      if (!ctx.businessType) {
        // No businessType → only show products tagged 'all'
        if (!businessTypeTags.includes("all")) return false;
      } else {
        // Has businessType → must match or be 'all'
        if (!businessTypeTags.includes("all") && !businessTypeTags.includes(ctx.businessType)) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Computes segment from DilMart role and app context.
   * Used during session exchange to assign the correct segment to a linked profile.
   */
  computeSegmentFromToken(payload: {
    role: DilMartRole;
    sourceApp: string;
    barbershopId?: string;
  }): StoreSegment {
    const { role, sourceApp, barbershopId } = payload;

    if (sourceApp === "barber_app") {
      if (role === "OWNER") return "DilMart_APP_BARBER_OWNER";
      if (role === "BARBER" || role === "STAFF") return "DilMart_APP_BARBER_STAFF";
    }
    if (sourceApp === "customer_app") return "DilMart_APP_CUSTOMER";

    // Fallback
    if (role === "OWNER" && barbershopId) return "VERIFIED_SALON_OWNER";
    if (role === "BARBER" || role === "STAFF") return "DilMart_APP_BARBER_STAFF";
    if (role === "CUSTOMER") return "RETAIL_CUSTOMER";

    return "RETAIL_CUSTOMER";
  }
}
