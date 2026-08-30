import { request } from "@/lib/api-core";

export const adminFinanceApi = {
  getFinanceReconciliationOrders(payload?: { limit?: number; merchant_id?: string; status?: string }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.status) params.set("status", payload.status);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      orders: Array<{
        id: string;
        order_number: string;
        merchant_id: string;
        delivery_company_id: string | null;
        payment_method: string | null;
        payment_status: string;
        collection_status: string;
        settlement_status: string;
        gross_collected_amount: number;
        merchant_net_amount: number;
        platform_commission_amount: number;
        courier_fee_payable: number;
        currency_code: string;
        financial_snapshot_version: number;
        created_at: string;
        merchants?: { display_name?: string } | null;
        delivery_companies?: { name?: string } | null;
      }>;
    }>(`/admin/finance/reconciliation/orders${suffix}`, "GET");
  },

  getOrderFinancialDetail(orderId: string) {
    return request<any>(`/admin/finance/orders/${encodeURIComponent(orderId)}`, "GET");
  },

  getFinanceMerchantBalances() {
    return request<{
      balances: Array<{
        merchant_id: string;
        merchant_name: string;
        accrued_total: number;
        payable_total: number;
        in_payout_total: number;
        settled_total: number;
        pending_reversals: number;
        outstanding_total: number;
      }>;
    }>("/admin/finance/reconciliation/merchant-balances", "GET");
  },

  getFinanceCourierPayables() {
    return request<{
      courier_payables: Array<{
        delivery_company_id: string;
        delivery_company_name: string;
        accrued_amount: number;
        payable_amount: number;
        in_payout_amount: number;
        settled_amount: number;
        reversed_amount: number;
        disputed_amount: number;
        outstanding_amount: number;
      }>;
    }>("/admin/finance/reconciliation/courier-payables", "GET");
  },

  getFinanceCourierReconciliationOrders(payload?: { limit?: number; delivery_company_id?: string; status?: string }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (payload?.delivery_company_id) params.set("delivery_company_id", payload.delivery_company_id);
    if (payload?.status) params.set("status", payload.status);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      orders: Array<{
        id: string;
        order_number: string;
        delivery_company_id: string;
        courier_fee_payable: number;
        courier_settlement_status: string;
        courier_settled_at?: string | null;
        financial_snapshot_version: number;
        settlement_status: string;
        courier_cod_remittance_mode?: "gross_remittance" | "net_remittance" | null;
        cash_gross_expected_amount?: number | null;
        courier_fee_retained_amount?: number | null;
        cash_net_expected_from_courier?: number | null;
        cash_actual_remitted_amount?: number | null;
        cash_remittance_difference?: number | null;
        courier_fee_offset_applied?: boolean;
        delivery_companies?: { name?: string } | null;
      }>;
    }>(`/admin/finance/reconciliation/courier-orders${suffix}`, "GET");
  },

  getFinanceCourierCodSummary(payload?: { delivery_company_id?: string }) {
    const params = new URLSearchParams();
    if (payload?.delivery_company_id) params.set("delivery_company_id", payload.delivery_company_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      rows: Array<{
        delivery_company_id: string;
        delivery_company_name: string;
        gross_collected_total: number;
        courier_retained_total: number;
        net_expected_total: number;
        actual_remitted_total: number;
        difference_total: number;
        offset_settled_courier_fees: number;
        payout_payable_courier_fees: number;
      }>;
    }>(`/admin/finance/reconciliation/courier-cod-summary${suffix}`, "GET");
  },

  listAdminMerchantLedgerEntries(payload: { merchant_id: string; status?: string; limit?: number }) {
    const params = new URLSearchParams({ merchant_id: payload.merchant_id });
    if (payload.status) params.set("status", payload.status);
    if (payload.limit) params.set("limit", String(payload.limit));
    return request<{ entries: Array<any> }>(`/admin/finance/merchant-ledger?${params.toString()}`, "GET");
  },

  createAdminManualAdjustment(payload: {
    merchant_id: string;
    direction: "credit" | "debit";
    amount: number;
    reason_code: string;
    description?: string | null;
    reference_id?: string | null;
    currency_code?: string;
  }) {
    return request<{ ok: boolean; entry: any }>("/admin/finance/manual-adjustments", "POST", payload);
  },

  reverseAdminFinanceEntry(entryId: string, payload: { reason_code: string; description?: string | null }) {
    return request<{ ok: boolean; source_entry_id: string; reversal_entry: any }>(
      `/admin/finance/ledger/${encodeURIComponent(entryId)}/reverse`,
      "POST",
      payload,
    );
  },

  listAdminFinanceEvents(payload?: { order_id?: string; merchant_id?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.order_id) params.set("order_id", payload.order_id);
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ events: Array<any> }>(`/admin/finance/events${suffix}`, "GET");
  },

  listAdminPayoutBatches(payload?: { merchant_id?: string; status?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (payload?.status) params.set("status", payload.status);
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ batches: Array<any> }>(`/admin/finance/payout-batches${suffix}`, "GET");
  },

  createAdminPayoutBatch(payload: { merchant_id: string; period_start?: string; period_end?: string; notes?: string | null }) {
    return request<{ ok: boolean; empty?: boolean; message?: string; batch?: any; entries_count?: number }>("/admin/finance/payout-batches", "POST", payload);
  },

  approveAdminPayoutBatch(batchId: string) {
    return request<{ ok: boolean; batch: any }>(`/admin/finance/payout-batches/${encodeURIComponent(batchId)}/approve`, "POST");
  },

  settleAdminPayoutBatch(batchId: string) {
    return request<{ ok: boolean; batch_id: string; settled_entries: number }>(`/admin/finance/payout-batches/${encodeURIComponent(batchId)}/settle`, "POST");
  },

  listAdminCourierPayoutBatches(payload?: { delivery_company_id?: string; status?: string; limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.delivery_company_id) params.set("delivery_company_id", payload.delivery_company_id);
    if (payload?.status) params.set("status", payload.status);
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ batches: Array<any> }>(`/admin/finance/courier-payout-batches${suffix}`, "GET");
  },

  createAdminCourierPayoutBatch(payload: { delivery_company_id: string; period_start?: string; period_end?: string; notes?: string | null }) {
    return request<{ ok: boolean; empty?: boolean; message?: string; batch?: any; entries_count?: number }>(
      "/admin/finance/courier-payout-batches",
      "POST",
      payload,
    );
  },

  getAdminCourierPayoutBatchDetail(batchId: string) {
    return request<{ batch: any; items: Array<any> }>(`/admin/finance/courier-payout-batches/${encodeURIComponent(batchId)}`, "GET");
  },

  approveAdminCourierPayoutBatch(batchId: string) {
    return request<{ ok: boolean; batch: any }>(`/admin/finance/courier-payout-batches/${encodeURIComponent(batchId)}/approve`, "POST");
  },

  settleAdminCourierPayoutBatch(batchId: string, payload?: { reference?: string | null; notes?: string | null }) {
    return request<{ ok: boolean; batch_id: string; settled_entries: number }>(
      `/admin/finance/courier-payout-batches/${encodeURIComponent(batchId)}/settle`,
      "POST",
      payload ?? {},
    );
  },

  cancelAdminCourierPayoutBatch(batchId: string) {
    return request<{ ok: boolean; batch_id: string }>(`/admin/finance/courier-payout-batches/${encodeURIComponent(batchId)}/cancel`, "POST");
  },

  listAdminCourierLedgerEntries(payload: {
    delivery_company_id: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const params = new URLSearchParams({ delivery_company_id: payload.delivery_company_id });
    if (payload.status) params.set("status", payload.status);
    if (payload.from) params.set("from", payload.from);
    if (payload.to) params.set("to", payload.to);
    if (payload.limit) params.set("limit", String(payload.limit));
    if (payload.offset != null) params.set("offset", String(payload.offset));
    return request<{ entries: Array<any> }>(`/admin/finance/courier-ledger?${params.toString()}`, "GET");
  },

  createAdminCourierManualAdjustment(payload: {
    delivery_company_id: string;
    agent_id?: string | null;
    order_id?: string | null;
    direction: "credit" | "debit";
    amount: number;
    reason_code: string;
    description?: string | null;
    reference_id?: string | null;
    currency_code?: string;
  }) {
    return request<{ ok: boolean; entry: any }>("/admin/finance/courier-manual-adjustments", "POST", payload);
  },

  reverseAdminCourierLedgerEntry(entryId: string, payload: { reason_code: string; description?: string | null }) {
    return request<{ ok: boolean; source_entry_id: string; reversal_entry: any }>(
      `/admin/finance/courier-ledger/${encodeURIComponent(entryId)}/reverse`,
      "POST",
      payload,
    );
  },
};
