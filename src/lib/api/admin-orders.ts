import { request } from "@/lib/api-core";

export const adminOrdersApi = {
  markAdminOrderCollected(orderId: string, payload: { collected_by_type: "courier" | "delivery_company" | "platform"; collected_by_id?: string; amount: number; notes?: string; reference?: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/collection/collected`, "POST", payload);
  },

  assignOrderToDeliveryCompany(orderId: string, payload: { delivery_company_id: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/assign-company`, "POST", payload);
  },

  assignOrderToAgent(orderId: string, payload: { agent_id: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/assign-agent`, "POST", payload);
  },

  markAdminOrderPickedUp(orderId: string) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/picked-up`, "POST");
  },

  markAdminOrderInTransit(orderId: string) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/in-transit`, "POST");
  },

  markAdminOrderDeliveryDelivered(orderId: string) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/delivered`, "POST");
  },

  markAdminOrderDeliveryFailed(orderId: string, payload: { reason_code: string; notes?: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/failed`, "POST", payload);
  },

  markOrderReturned(orderId: string, payload?: { reason_code?: string; notes?: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/returned`, "POST", payload ?? {});
  },

  addAdminOrderDeliveryNote(orderId: string, payload: { notes: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/note`, "POST", payload);
  },

  getOrderJenniIntegration(orderId: string) {
    return request<Record<string, unknown> | null>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/jenni`, "GET");
  },

  dispatchOrderToJenni(orderId: string) {
    return request<{
      ok: boolean;
      provider_shipment_id?: string;
      airway_bill_number?: string | null;
      local_update_failed?: boolean;
      retried_local_dispatch?: boolean;
      message?: string;
    }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/dispatch-jenni`, "POST");
  },

  syncOrderFromJenni(orderId: string) {
    return request<{ ok: boolean; updated?: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/sync-jenni`, "POST");
  },

  syncJenniReferenceData(payload?: {
    dry_run?: boolean;
    sync_cities?: boolean;
    copy_existing_governorate_prices?: boolean;
  }) {
    return request<{
      ok: boolean;
      dry_run?: boolean;
      jenni_governorates_total?: number;
      matched_count?: number;
      unmatched_local_count?: number;
      unmatched_jenni_count?: number;
      prices_upserted_to_jenni_company?: number;
      cities_synced?: number;
      matched?: Array<{ id: string; name: string; jenni_code: string; previous_code: string | null }>;
      unmatched_local?: Array<{ id: string; name: string }>;
      unmatched_jenni?: Array<{ code: string; name_ar?: string | null; name_en?: string | null }>;
      note?: string;
      message?: string;
    }>("/admin/delivery/jenni/sync-reference", "POST", payload ?? {});
  },

  listAdminOrderDeliveryEvents(orderId: string, payload?: { limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ events: Array<any> }>(`/admin/orders/${encodeURIComponent(orderId)}/delivery/events${suffix}`, "GET");
  },

  listAdminDeliveryOps(payload?: {
    delivery_status?: string;
    delivery_company_id?: string;
    agent_id?: string;
    sla_breached?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (payload?.delivery_status) params.set("delivery_status", payload.delivery_status);
    if (payload?.delivery_company_id) params.set("delivery_company_id", payload.delivery_company_id);
    if (payload?.agent_id) params.set("agent_id", payload.agent_id);
    if (payload?.sla_breached) params.set("sla_breached", payload.sla_breached);
    if (payload?.from) params.set("from", payload.from);
    if (payload?.to) params.set("to", payload.to);
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ rows: Array<any> }>(`/admin/delivery-ops${suffix}`, "GET");
  },

  markAdminOrderRemittedToPlatform(orderId: string, payload?: { notes?: string; reference?: string; amount?: number }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/collection/remit-platform`, "POST", payload ?? {});
  },

  markAdminOrderRemittedToMerchant(orderId: string, payload?: { notes?: string; reference?: string; amount?: number }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/collection/remit-merchant`, "POST", payload ?? {});
  },

  settleAdminOrderCourier(orderId: string, payload?: { notes?: string; reference?: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/courier/settle`, "POST", payload ?? {});
  },

  markAdminOrderFinanceDispute(orderId: string, payload: { reason_code: string; notes?: string }) {
    return request<{ ok: boolean }>(`/admin/orders/${encodeURIComponent(orderId)}/finance/dispute`, "POST", payload);
  },

  releaseAdminOrderCourierDispute(orderId: string, payload?: { notes?: string }) {
    return request<{ ok: boolean; next_status: string }>(`/admin/orders/${encodeURIComponent(orderId)}/courier/release-dispute`, "POST", payload ?? {});
  },

  listAdminOrderCollectionEvents(orderId: string, payload?: { limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ events: Array<any> }>(`/admin/orders/${encodeURIComponent(orderId)}/collection/events${suffix}`, "GET");
  },
};
