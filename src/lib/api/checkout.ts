import { request } from "@/lib/api-core";

export const checkoutApi = {
  validateCoupon(payload: { code: string; total: number; merchant_id?: string }) {
    return request<{ valid: boolean; id?: string; code?: string; discount_type?: "fixed" | "percentage"; value?: number; message?: string }>(
      "/coupons/validate",
      "POST",
      payload,
    );
  },

  checkoutPreview(payload: {
    items: Array<{ product_id: string; quantity: number }>;
    merchant_id?: string;
    coupon_code?: string;
    governorate_id?: string;
  }) {
    return request<{
      subtotal: number;
      discount: number;
      total: number;
      delivery_cost?: number;
      coupon_id?: string;
      merchant_id?: string;
    }>("/checkout/preview", "POST", payload);
  },

  checkoutSubmit(payload: Record<string, unknown>) {
    return request<{ order_number: string; checkout_attempt_id?: string; reused?: boolean; post_checkout_warnings?: string[] }>("/checkout/submit", "POST", payload);
  },

  getCheckoutAttempt(attemptId: string) {
    return request<{ id: string; status: "processing" | "completed" | "failed"; order_id?: string; order_number?: string; error_code?: string }>(
      `/checkout/attempts/${attemptId}`,
      "GET"
    );
  },

  loyaltyPreview(payload: { subtotal: number }) {
    return request<{ available_points: number; redeemable_amount: number }>("/loyalty/preview", "POST", payload);
  },

  loyaltyRedeem(payload: { points: number }) {
    return request<{ ok: boolean }>("/loyalty/redeem", "POST", payload);
  },

  listScopedCoupons(payload?: { merchant_id?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<Array<any>>(`/coupons${suffix}`, "GET");
  },

  upsertCoupon(payload: Record<string, unknown>) {
    return request<{ ok: boolean }>("/coupons", "POST", payload);
  },

  deleteCoupon(id: string, payload?: { merchant_id?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ ok: boolean }>(`/coupons/${id}${suffix}`, "DELETE");
  },
};
