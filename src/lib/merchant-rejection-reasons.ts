/**
 * Merchant rejection reasons — predefined list of codes and Arabic labels.
 * Used in both the rejection dialog UI and for displaying rejection reasons.
 * The codes match the backend @IsIn validation in MerchantRejectOrderDto.
 */
export const merchantRejectionReasons = [
  { code: "out_of_stock", label: "المنتج غير متوفر حالياً" },
  { code: "insufficient_quantity", label: "الكمية المطلوبة غير متوفرة" },
  { code: "variant_unavailable", label: "اللون أو النوع أو الموديل المطلوب غير متوفر" },
  { code: "product_discontinued", label: "المنتج متوقف أو لم يعد متوفراً" },
  { code: "product_damaged_or_not_ready", label: "المنتج غير جاهز أو غير صالح للبيع" },
  { code: "wrong_price", label: "السعر غير صحيح ويحتاج مراجعة" },
  { code: "wrong_product_info", label: "معلومات المنتج غير دقيقة وتحتاج مراجعة" },
  { code: "cannot_prepare_in_time", label: "لا يمكن تجهيز الطلب بالوقت المطلوب" },
  { code: "temporary_store_issue", label: "المتجر غير قادر على تجهيز الطلب حالياً" },
  { code: "duplicate_or_suspicious", label: "الطلب مكرر أو غير واضح" },
  { code: "order_needs_admin_review", label: "الطلب يحتاج مراجعة من الإدارة" },
] as const;

export type RejectionReasonCode = typeof merchantRejectionReasons[number]["code"];

export function getRejectionLabel(code: string): string {
  return merchantRejectionReasons.find(r => r.code === code)?.label ?? code;
}
