import { Injectable } from "@nestjs/common";
import { ProductVisibilityService } from "./product-visibility.service";
import { ViewerContext } from "./store-integration.types";

export type PurchaseChannel = "web_store" | "customer_app";

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

  private normalizePurchaseModes(mode: string[] | string | null | undefined): string[] {
    if (!mode) return [];
    if (Array.isArray(mode)) {
      return mode.map((m) => String(m).trim().toLowerCase()).filter(Boolean);
    }
    if (typeof mode === "string") {
      const trimmed = mode.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
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

  evaluate(
    product: ProductPurchaseCandidate,
    context: PurchaseEvaluationContext,
  ): PurchaseEligibilityResult {
    const { viewerContext, merchantStatus, quantity } = context;

    // Layer 1: Publication / Commerce state
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

    // Layer 2: Merchant availability
    if (merchantStatus !== "active") {
      return {
        eligible: false,
        code: "MERCHANT_UNAVAILABLE",
        message: "التاجر غير متاح حاليًا.",
      };
    }

    // Layer 3: Visibility check
    if (!this.visibilityService.canProductBeShown(product as any, viewerContext)) {
      return {
        eligible: false,
        code: "VIEWER_NOT_ELIGIBLE",
        message: "المنتج غير متاح لهذا الحساب أو هذه المنصة.",
      };
    }

    // Layer 4: Purchase Mode compatibility
    const modes = this.normalizePurchaseModes(product.purchase_mode);
    if (modes.length === 0) {
      return {
        eligible: false,
        code: "PURCHASE_MODE_NOT_ALLOWED",
        message: "نمط الشراء لهذا المنتج غير محدد.",
      };
    }

    const ALLOWED_PURCHASE_MODES = new Set(["retail", "b2b", "wholesale", "quote_request"]);
    const hasUnknownMode = modes.some((m) => !ALLOWED_PURCHASE_MODES.has(m));
    if (hasUnknownMode) {
      return {
        eligible: false,
        code: "PURCHASE_MODE_NOT_ALLOWED",
        message: "نمط الشراء يحتوي على قيمة غير صالحة.",
      };
    }

    const isDirectPurchaseAllowed =
      modes.includes("retail") || modes.includes("b2b") || modes.includes("wholesale");
    if (!isDirectPurchaseAllowed) {
      return {
        eligible: false,
        code: "PURCHASE_MODE_NOT_ALLOWED",
        message: "هذا المنتج غير متاح للشراء المباشر.",
      };
    }

    // Layer 5: Quantity & Inventory limits
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

