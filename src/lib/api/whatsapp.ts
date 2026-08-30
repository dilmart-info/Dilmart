import { request } from "@/lib/api-core";

export const whatsappApi = {
  createWhatsAppIntent(payload: {
    merchant_id: string;
    product_id?: string;
    cart?: Array<{ product_id: string; product_name: string; quantity: number; price: number }>;
    source_surface: "product" | "store" | "cart";
    session_id?: string;
  }) {
    return request<{
      intent_id: string;
      intent_token: string;
      expires_at: string;
      merchant_name: string;
    }>("/whatsapp-intents", "POST", payload);
  },

  markWhatsAppIntentOpened(intentId: string) {
    return request<{ ok: boolean; status: string }>(`/whatsapp-intents/${encodeURIComponent(intentId)}/opened`, "POST");
  },

  getMerchantIntentMetrics(payload?: { merchant_id?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      merchant_id: string;
      total_intents: number;
      opened_intents: number;
      converted_intents: number;
      tracked_order_ratio: number;
      checkout_completion_ratio: number;
      missing_intents: number;
      leakage_risk: "low" | "medium" | "high";
    }>(`/whatsapp-intents/merchant-metrics${suffix}`, "GET");
  },

  resolveWhatsAppIntent(intentToken: string) {
    const params = new URLSearchParams({ intent_token: intentToken });
    return request<{
      id: string;
      intent_token: string;
      merchant_id: string;
      merchant_name: string;
      source_surface: "product" | "store" | "cart";
      status: "CREATED" | "OPENED" | "EXPIRED" | "CONVERTED";
      created_at: string;
      expires_at: string;
      cart_snapshot: Array<{ product_id: string; product_name: string; quantity: number; price: number }>;
      fallback_item: { product_id: string; product_name: string; quantity: number; price: number } | null;
    }>(`/whatsapp-intents/resolve?${params.toString()}`, "GET");
  },
};
