import { request } from "@/lib/api-core";

export interface DeliveryEvent {
  id: string;
  order_id: string;
  event_type: string;
  from_status: string;
  to_status: string;
  delivery_company_id: string | null;
  agent_id: string | null;
  actor_id: string | null;
  actor_type: string;
  notes: string | null;
  reason_code: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DeliveryCompany {
  id: string;
  name: string;
  phone: string | null;
  provider_code: string | null;
  is_active: boolean;
  default_sla_minutes: number | null;
  cod_remittance_mode: "gross_remittance" | "net_remittance" | null;
  allow_courier_fee_offset: boolean;
  default_remittance_cycle: "daily" | "weekly" | "custom" | null;
  remittance_notes: string | null;
  created_at: string;
}

export interface ShippingGovernorate {
  id: string;
  name: string;
  delivery_price: number | null;
  delivery_provider: string;
}

export interface DeliveryPrice {
  id: string;
  company_id: string;
  governorate_id: string;
  price: number;
  created_at: string;
}

export interface ShippingRegion {
  id: string;
  governorate_id: string;
  name: string;
  sort_order: number;
}

export const shippingApi = {
  markOrderPickedUp(orderId: string) {
    return request<{ ok: boolean }>(`/orders/${encodeURIComponent(orderId)}/delivery/picked-up`, "POST");
  },

  markOrderInTransit(orderId: string) {
    return request<{ ok: boolean }>(`/orders/${encodeURIComponent(orderId)}/delivery/in-transit`, "POST");
  },

  markOrderDeliveryDelivered(orderId: string) {
    return request<{ ok: boolean }>(`/orders/${encodeURIComponent(orderId)}/delivery/delivered`, "POST");
  },

  markOrderDeliveryFailed(orderId: string, payload: { reason_code: string; notes?: string }) {
    return request<{ ok: boolean }>(`/orders/${encodeURIComponent(orderId)}/delivery/failed`, "POST", payload);
  },

  addOrderDeliveryNote(orderId: string, payload: { notes: string }) {
    return request<{ ok: boolean }>(`/orders/${encodeURIComponent(orderId)}/delivery/note`, "POST", payload);
  },

  getOrderDeliveryEvents(orderId: string, payload?: { limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ events: DeliveryEvent[] }>(`/orders/${encodeURIComponent(orderId)}/delivery/events${suffix}`, "GET");
  },

  getDeliveryCompanies() {
    return request<DeliveryCompany[]>("/shipping/companies", "GET");
  },

  createDeliveryCompany(payload: { name: string; phone?: string }) {
    return request<DeliveryCompany>("/shipping/companies", "POST", payload);
  },

  updateDeliveryCompanyPolicy(
    companyId: string,
    payload: {
      cod_remittance_mode?: "gross_remittance" | "net_remittance";
      allow_courier_fee_offset?: boolean;
      default_remittance_cycle?: "daily" | "weekly" | "custom";
      remittance_notes?: string | null;
    },
  ) {
    return request<{ ok: boolean }>(`/shipping/companies/${encodeURIComponent(companyId)}/policy`, "POST", payload);
  },

  getShippingGovernorates() {
    return request<ShippingGovernorate[]>("/shipping/governorates", "GET");
  },

  getCompanyDeliveryPrices(companyId: string) {
    return request<DeliveryPrice[]>(`/shipping/companies/${companyId}/prices`, "GET");
  },

  upsertCompanyDeliveryPrice(companyId: string, payload: { governorate_id: string; price: number }) {
    return request<{ ok: boolean }>(`/shipping/companies/${companyId}/prices`, "POST", payload);
  },

  getRegions(governorateId?: string) {
    const params = new URLSearchParams();
    if (governorateId) params.set("governorate_id", governorateId);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<ShippingRegion[]>(`/shipping/regions${suffix}`, "GET");
  },
};
