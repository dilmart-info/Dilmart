import { request } from "@/lib/api-core";

export const ordersApi = {
  getOrderById(id: string) {
    return request(`/orders/${id}`, "GET");
  },

  getMyOrders() {
    return request<Array<any>>("/orders/me", "GET");
  },

  getOrderDetail(id: string, payload?: { merchant_id?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<any>(`/orders/${id}/detail${suffix}`, "GET");
  },

  cancelOrder(id: string) {
    return request<{ ok: boolean }>(`/orders/${id}/cancel`, "POST");
  },

  updateOrderAgent(id: string, payload: { agent_id?: string | null }) {
    return request<{ ok: boolean }>(`/orders/${id}/agent`, "POST", payload);
  },

  updateOrderStatus(id: string, payload: { status: string; merchant_id?: string }) {
    return request<{ ok: boolean }>(`/orders/${id}/status`, "POST", payload);
  },

  updateOrderNotes(id: string, payload: { admin_notes: string; merchant_id?: string }) {
    return request<{ ok: boolean }>(`/orders/${id}/notes`, "POST", payload);
  },

  merchantAcceptOrder(id: string, merchantId?: string) {
    return request<{ ok: boolean }>(`/orders/${id}/merchant-accept`, "POST", {
      merchant_id: merchantId,
    });
  },

  merchantRejectOrder(id: string, reasonCode: string, merchantId?: string) {
    return request<{ ok: boolean }>(`/orders/${id}/merchant-reject`, "POST", {
      reason_code: reasonCode,
      merchant_id: merchantId,
    });
  },

  getAgentsList() {
    return request<Array<{ id: string; full_name?: string | null; email?: string | null }>>("/orders/agents/list", "GET");
  },

  getAgentOrders(agentId: string, payload: { mode: "current" | "history" }) {
    const params = new URLSearchParams({ mode: payload.mode });
    return request<Array<any>>(`/orders/agents/${agentId}/orders?${params.toString()}`, "GET");
  },

  createManualOrder(payload: {
    customer_name: string;
    customer_phone: string;
    governorate_id: string;
    area: string;
    nearest_landmark?: string | null;
    notes?: string | null;
    delivery_cost: number;
    items: Array<{ product_id: string; product_name: string; price: number; quantity: number }>;
    intent_id?: string;
    channel?: "whatsapp_assisted" | "manual_assisted";
  }) {
    return request<{ order_number: string }>("/orders/manual", "POST", payload);
  },

  listScopedOrders(payload?: { merchant_id?: string; status?: string; search?: string; page?: number; limit?: number; date_from?: string; date_to?: string; merchant_decision_status?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.status) params.set("status", payload.status);
    if (payload?.search) params.set("search", payload.search);
    if (payload?.page) params.set("page", String(payload.page));
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (payload?.date_from) params.set("date_from", payload.date_from);
    if (payload?.date_to) params.set("date_to", payload.date_to);
    if (payload?.merchant_decision_status) params.set("merchant_decision_status", payload.merchant_decision_status);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ items: any[]; page: number; limit: number; total: number; hasMore: boolean }>(`/orders${suffix}`, "GET");
  },

  listScopedCustomers(payload?: { merchant_id?: string; search?: string; page?: number; limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.search) params.set("search", payload.search);
    if (payload?.page) params.set("page", String(payload.page));
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ items: Array<Record<string, unknown>>; page: number; limit: number; total: number; hasMore: boolean }>(`/admin/customers${suffix}`, "GET");
  },

  trackOrder(payload: { order_number: string; phone: string }) {
    return request<any>("/orders/track", "POST", payload);
  },
};
