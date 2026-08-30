import { Injectable } from "@nestjs/common";
import { ProductVisibilityService } from "./product-visibility.service";
import { ViewerContext } from "./store-integration.types";

export type PurchaseChannel = "web_store" | "barber_app" | "customer_app";

export type PurchaseEligibilityErrorCode =
  | "PRODUCT_NOT_ACTIVE"
  | "PRODUCT_NOT_PUBLISHED"
  | "PRODUCT_NOT_PUBLIC"
  | "MERCHANT_UNAVAILABLE"
  | "VIEWER_NOT_ELIGIBLE"
  | "PURCHASE_MODE_NOT_ALLOWED"
  | "INSUFFICIENT_STOCK"
  | "QUANTITY_BELOW_MINIMUM"
  | "QUANTITY_ABOVE_MAXIMUM"
  | "INVALID_QUANTITY";

export interface PurchaseEligibilityResult {
  eligible: boolean;
  code?: PurchaseEligibilityErrorCode;
  message?: string;
}

export interface ProductPurchaseCandidate {
  id?: string;
  name?: string | null;
  is_active: boolean | null;
  is_published?: boolean | null;
  visibility_status?: string | null;
  visible_in?: string[] | null;
  target_audience?: string[] | null;
  business_type_tags?: string[] | null;
  requires_verified_salon?: boolean | null;
  purchase_mode?: string[] | string | null;
  stock?: number | null;
  min_order_qty?: number | null;
  max_order_qty?: number | null;
}

export interface PurchaseEvaluationContext {
  channel: PurchaseChannel;
  viewerContext?: ViewerContext;
  merchantStatus?: string | null;
  quantity: number;
}

@Injectable()
export class ProductPurchaseEligibilityService {
  constructor(private readonly visibilityService: ProductVisibilityService) {}

  /**
   * Normalizes purchase_mode field to a clean string array.
   */
  private normalizePurchaseModes(mode: string[] | string | null | undefined): string[] {
    if (!mode) return [];
    if (Array.isArray(mode)) {
      return mode.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
    }
    if (typeof mode === "string") {
      const trimmed = mode.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        // Postgres array literal format e.g. {retail,b2b}
        return trimmed
          .slice(1, -1)
          .split(",")
          .map((m) => m.replace(/^"|"$/g, "").trim().toLowerCase())
          .filter(Boolean);
      }
      return [trimmed.toLowerCase()];
    }
    return [];
  }

  /**
   * Evaluates canonical purchase eligibility for a product candidate.
   *
   * Enforces 4 fundamental layers:
   *   1. Publication / Commerce state: is_active === true && is_published === true && visibility_status === 'public'
   *   2. Viewer / Surface authorization:
   *      - barber_app / B2B: ProductVisibilityService.canProductBeShown(product, viewerContext)
   *      - web_store / customer: public surface checks + requires_verified_salon === false
   *   3. Purchase mode / Channel compatibility:
   *      - web_store: purchase_mode must include 'retail'
   *      - barber_app: purchase_mode must include at least one of 'retail', 'b2b', 'wholesale'
   *      - quote-only ('quote_request' without direct mode): DENY direct purchase
   *      - unknown / empty: DENY (fail-closed)
   *   4. Merchant + Quantity + Stock integrity:
   *      - merchantStatus === 'active'
   *      - 1 <= min_order_qty <= quantity <= max_order_qty <= stock
   */
  evaluate(
    product: ProductPurchaseCandidate,
    context: PurchaseEvaluationContext,
  ): PurchaseEligibilityResult {
    const { channel, viewerContext, merchantStatus, quantity } = context;

    // ── Layer 1: Publication / Commerce state ────────────────────────────────
    if (product.is_active !== true) {
      return {
        eligible: false,
        code: "PRODUCT_NOT_ACTIVE",
        message: "المنتج غير مفعل حاليًا.",
      };
    }

    if (product.is_published !== true) {
      return {
        eligible: false,
        code: "PRODUCT_NOT_PUBLISHED",
        message: "المنتج غير منشور حاليًا.",
      };
    }

    if (product.visibility_status !== "public") {
      return {
        eligible: false,
        code: "PRODUCT_NOT_PUBLIC",
        message: "المنتج غير متاح للعامة.",
      };
    }

    // ── Layer 2: Merchant availability ───────────────────────────────────────
    if (merchantStatus !== "active") {
      return {
        eligible: false,
        code: "MERCHANT_UNAVAILABLE",
        message: "التاجر غير متاح حاليًا.",
      };
    }

    // ── Layer 3: Viewer / Surface authorization ──────────────────────────────
    if (channel === "barber_app" || viewerContext) {
      const ctx: ViewerContext = viewerContext ?? {
        surface: "barber_app",
        isTrusted: false,
        salonVerified: false,
      };

      if (!this.visibilityService.canProductBeShown(product as any, ctx)) {
        return {
          eligible: false,
          code: "VIEWER_NOT_ELIGIBLE",
          message: "المنتج غير متاح لهذا الحساب أو هذه المنصة.",
        };
      }
    } else {
      // web_store or public customer channel
      // Strict rule: requires_verified_salon products can NEVER be bought via public web checkout
      if (product.requires_verified_salon === true) {
        return {
          eligible: false,
          code: "VIEWER_NOT_ELIGIBLE",
          message: "هذا المنتج مخصص للصالونات المعتمدة فقط.",
        };
      }

      const visibleIn = product.visible_in ?? ["web_store"];
      if (!visibleIn.includes("web_store") && !visibleIn.includes("all")) {
        return {
          eligible: false,
          code: "VIEWER_NOT_ELIGIBLE",
          message: "المنتج غير متاح عبر متجر الويب.",
        };
      }

      const targetAudience = product.target_audience ?? ["all"];
      if (!targetAudience.includes("customer") && !targetAudience.includes("all")) {
        return {
          eligible: false,
          code: "VIEWER_NOT_ELIGIBLE",
          message: "المنتج غير مخصص للجمهور العام.",
        };
      }
    }

    // ── Layer 4: Purchase Mode / Channel compatibility ───────────────────────
    const modes = this.normalizePurchaseModes(product.purchase_mode);
    if (modes.length === 0) {
      return {
        eligible: false,
        code: "PURCHASE_MODE_NOT_ALLOWED",
        message: "نمط الشراء لهذا المنتج غير محدد.",
      };
    }

    // Fail closed if any purchase mode entry is unrecognized
    const ALLOWED_PURCHASE_MODES = new Set(["retail", "b2b", "wholesale", "quote_request"]);
    const hasUnknownMode = modes.some((m) => !ALLOWED_PURCHASE_MODES.has(m));
    if (hasUnknownMode) {
      return {
        eligible: false,
        code: "PURCHASE_MODE_NOT_ALLOWED",
        message: "نمط الشراء يحتوي على قيمة غير صالحة.",
      };
    }


    if (channel === "web_store") {
      if (!modes.includes("retail")) {
        return {
          eligible: false,
          code: "PURCHASE_MODE_NOT_ALLOWED",
          message: "هذا المنتج غير متاح للشراء المباشر عبر متجر الويب.",
        };
      }
    } else if (channel === "barber_app") {
      const isDirectB2BAllowed =
        modes.includes("retail") || modes.includes("b2b") || modes.includes("wholesale");
      if (!isDirectB2BAllowed) {
        return {
          eligible: false,
          code: "PURCHASE_MODE_NOT_ALLOWED",
          message: "هذا المنتج غير متاح للشراء المباشر لتطبيق الحلاق.",
        };
      }
    } else {
      // customer_app or other channel
      if (!modes.includes("retail")) {
        return {
          eligible: false,
          code: "PURCHASE_MODE_NOT_ALLOWED",
          message: "نمط الشراء غير متوافق مع هذه القناة.",
        };
      }
    }

    // ── Layer 5: Quantity & Inventory limits ─────────────────────────────────
    if (!Number.isFinite(quantity) || quantity < 1 || Math.floor(quantity) !== quantity) {
      return {
        eligible: false,
        code: "INVALID_QUANTITY",
        message: "الكمية المطلوبة غير صالحة.",
      };
    }

    if (product.min_order_qty !== null && product.min_order_qty !== undefined) {
      const min = Number(product.min_order_qty);
      if (min > 0 && quantity < min) {
        return {
          eligible: false,
          code: "QUANTITY_BELOW_MINIMUM",
          message: `الحد الأدنى للطلب لهذا المنتج هو ${min}.`,
        };
      }
    }

    if (product.max_order_qty !== null && product.max_order_qty !== undefined) {
      const max = Number(product.max_order_qty);
      if (max > 0 && quantity > max) {
        return {
          eligible: false,
          code: "QUANTITY_ABOVE_MAXIMUM",
          message: `الحد الأقصى للطلب لهذا المنتج هو ${max}.`,
        };
      }
    }

    if (
      product.stock !== null &&
      product.stock !== undefined &&
      product.stock >= 0 &&
      quantity > product.stock
    ) {
      return {
        eligible: false,
        code: "INSUFFICIENT_STOCK",
        message: `الكمية المتوفرة في المخزون (${product.stock}) أقل من الكمية المطلوبة.`,
      };
    }

    return { eligible: true };
  }
}
