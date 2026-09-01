/**
 * DILMART Merchant Order Status & Decision Mapping Authority
 *
 * Centralized, safe Arabic translation for order status and merchant decision status.
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

export const UNKNOWN_ORDER_STATUS_FALLBACK = "حالة الطلب قيد التحديث";

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
