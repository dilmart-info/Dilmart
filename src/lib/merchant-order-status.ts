/**
 * DILMART Merchant Order Status, Delivery, Payment & Channel Mapping Authority
 *
 * Centralized, safe Arabic translation for order lifecycle, merchant decisions,
 * delivery milestones, payment methods, and sales channels.
 * Never exposes raw implementation strings to the merchant.
 */

export const MERCHANT_ORDER_STATUS_MAP: Record<string, string> = {
  new: "جديد",
  pending: "قيد الانتظار",
  contacted: "تم التواصل",
  preparing: "قيد التجهيز",
  processing: "قيد التجهيز",
  shipped: "قيد التوصيل",
  in_transit: "قيد التوصيل",
  delivered: "تم التسليم",
  completed: "مكتمل",
  cancelled: "ملغي",
  returned: "مُرتجع",
  refunded: "مُسترد",
};

export const MERCHANT_DELIVERY_STATUS_MAP: Record<string, string> = {
  pending_assignment: "بانتظار الإسناد",
  assigned_to_company: "تم الإسناد لشركة التوصيل",
  picked_up: "تم الاستلام من التاجر",
  in_transit: "في الطريق",
  out_for_delivery: "خرج للتوصيل",
  delivered: "تم التوصيل",
  returned: "مُرتجع",
  failed: "تعذر التوصيل",
  cancelled: "ملغي",
};

export const MERCHANT_JENNI_DISPATCH_MAP: Record<string, string> = {
  pending: "قيد المعالجة",
  dispatched: "تم الإرسال لشركة التوصيل",
  synced: "تمت المزامنة",
  failed: "تعذر الربط مع شركة التوصيل",
  cancelled: "ملغي",
};

export const MERCHANT_PAYMENT_METHOD_MAP: Record<string, string> = {
  cod: "الدفع عند الاستلام",
  cash: "الدفع عند الاستلام",
  cash_on_delivery: "الدفع عند الاستلام",
  online: "دفع إلكتروني (بطاقة)",
  card: "دفع إلكتروني (بطاقة)",
  online_card: "دفع إلكتروني (بطاقة)",
  zain_cash: "زين كاش",
  fib: "FIB (المصرف العراقي الأول)",
  wallet: "المحفظة الإلكترونية",
};

export const MERCHANT_CHANNEL_MAP: Record<string, string> = {
  store: "متجر ويب",
  online_store: "متجر ويب",
  web: "متجر ويب",
  website: "متجر ويب",
  mobile_app: "تطبيق جوال",
  app: "تطبيق جوال",
  mobile: "تطبيق جوال",
  whatsapp: "واتساب",
  manual: "طلب يدوي",
  pos: "نقطة بيع",
};

export const UNKNOWN_ORDER_STATUS_FALLBACK = "حالة الطلب قيد التحديث";
export const UNKNOWN_DELIVERY_STATUS_FALLBACK = "حالة التوصيل قيد التحديث";
export const UNKNOWN_JENNI_DISPATCH_FALLBACK = "حالة الربط قيد التحديث";
export const UNKNOWN_PAYMENT_METHOD_FALLBACK = "غير محدد";
export const UNKNOWN_CHANNEL_FALLBACK = "قناة الطلب غير محددة";
export const SAFE_JENNI_ERROR_MESSAGE = "تعذر إكمال الربط مع شركة التوصيل";

/**
 * Returns the merchant-facing localized Arabic label for an order's status.
 */
export function getMerchantOrderStatusLabel(status: string | null | undefined): string {
  if (!status || typeof status !== "string") {
    return UNKNOWN_ORDER_STATUS_FALLBACK;
  }
  const normalized = status.trim().toLowerCase();
  return MERCHANT_ORDER_STATUS_MAP[normalized] ?? UNKNOWN_ORDER_STATUS_FALLBACK;
}

/**
 * Returns the merchant-facing localized Arabic label and variant for a merchant decision status.
 */
export function getMerchantDecisionStatus(
  decisionStatus: string | null | undefined,
  orderStatus?: string | null | undefined,
): { label: string; variant: "pending" | "rejected" | "accepted" | "normal" } {
  if (decisionStatus === "pending") {
    return { label: "بانتظار قرارك", variant: "pending" };
  }
  if (decisionStatus === "rejected") {
    return { label: "مرفوض من المتجر", variant: "rejected" };
  }
  if (decisionStatus === "accepted") {
    return { label: "مقبول", variant: "accepted" };
  }
  return { label: getMerchantOrderStatusLabel(orderStatus), variant: "normal" };
}

/**
 * Returns the merchant-facing localized Arabic label for a delivery milestone status.
 */
export function getMerchantDeliveryStatusLabel(status: string | null | undefined): string {
  if (!status || typeof status !== "string") {
    return UNKNOWN_DELIVERY_STATUS_FALLBACK;
  }
  const normalized = status.trim().toLowerCase();
  return MERCHANT_DELIVERY_STATUS_MAP[normalized] ?? UNKNOWN_DELIVERY_STATUS_FALLBACK;
}

/**
 * Returns the merchant-facing localized Arabic label for a payment method.
 * Never defaults null/undefined to COD without explicit contract proof.
 */
export function getMerchantPaymentMethodLabel(method: string | null | undefined): string {
  if (!method || typeof method !== "string") {
    return UNKNOWN_PAYMENT_METHOD_FALLBACK;
  }
  const normalized = method.trim().toLowerCase();
  return MERCHANT_PAYMENT_METHOD_MAP[normalized] ?? UNKNOWN_PAYMENT_METHOD_FALLBACK;
}

/**
 * Returns the merchant-facing localized Arabic label for a sales channel.
 * Never defaults null/undefined to Web Store without explicit contract proof.
 */
export function getMerchantChannelLabel(channel: string | null | undefined): string {
  if (!channel || typeof channel !== "string") {
    return UNKNOWN_CHANNEL_FALLBACK;
  }
  const normalized = channel.trim().toLowerCase();
  return MERCHANT_CHANNEL_MAP[normalized] ?? UNKNOWN_CHANNEL_FALLBACK;
}

/**
 * Returns the merchant-facing localized Arabic label for Jenni dispatch status.
 */
export function getMerchantJenniDispatchLabel(status: string | null | undefined): string {
  if (!status || typeof status !== "string") {
    return UNKNOWN_JENNI_DISPATCH_FALLBACK;
  }
  const normalized = status.trim().toLowerCase();
  return MERCHANT_JENNI_DISPATCH_MAP[normalized] ?? UNKNOWN_JENNI_DISPATCH_FALLBACK;
}

/**
 * Returns a sanitized merchant-safe error description for courier integration errors.
 */
export function getMerchantJenniErrorLabel(error: unknown): string {
  if (!error) return "";
  return SAFE_JENNI_ERROR_MESSAGE;
}
