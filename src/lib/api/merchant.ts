import { authSessionManager } from "@/lib/auth/auth-session-manager";
import { request, API_BASE_URL } from "@/lib/api-core";

export interface CanonicalMerchantDashboardResponse {
  merchant_id: string;
  products: {
    total: number;
    active: number;
    inactive: number;
    low_stock: number;
  };
  orders: {
    today: number;
    completed_7d: number;
    average_order_value_7d: number;
    revenue_7d: number;
  };
  top_products: Array<{
    product_id: string;
    name: string;
    units_sold: number;
    revenue?: number;
  }>;
  low_stock_products: Array<{
    product_id: string;
    name: string;
    stock: number;
    threshold: number;
  }>;
  recent_orders: Array<{
    id: string;
    order_number: string;
    status: string;
    total: number;
    created_at: string;
  }>;
}

export interface CanonicalMerchantOrderSummary {
  id: string;
  order_number: string;
  merchant_id: string;
  status: string;
  channel: string | null;
  created_at: string;
  updated_at: string;
  subtotal: number;
  discount: number;
  delivery_cost: number;
  total: number;
  payment_method: string | null;
  merchant_notes: string | null;
  merchant_decision_status: string | null;
  governorate: string | null;
}

export interface CanonicalMerchantOrdersResponse {
  merchant_id: string;
  orders: CanonicalMerchantOrderSummary[];
  total: number;
  limit: number;
  offset: number;
  items?: CanonicalMerchantOrderSummary[];
  page?: number;
  hasMore?: boolean;
}

export const merchantApi = {

  registerMerchantApplication(payload: {
    email: string;
    password: string;
    owner_full_name: string;
    owner_phone: string;
    store_name_ar: string;
    store_name_en: string;
    display_name: string;
    slug: string;
    city: string;
    address: string;
    contact_phone: string;
    support_email?: string;
    business_type?: string;
    description?: string;
  }) {
    return request<{ ok: boolean; user_id: string; merchant_id: string; status: string }>("/merchant-applications/register", "POST", payload);
  },

  getMyMerchantApplicationStatus() {
    return request<{
      has_application: boolean;
      merchant?: {
        id: string;
        role: "owner" | "manager" | "staff";
        status: "draft" | "pending_review" | "active" | "suspended" | "rejected" | "archived";
        display_name: string | null;
        slug: string | null;
        submitted_at: string | null;
        approved_at: string | null;
        rejected_at: string | null;
        rejection_reason: string | null;
      };
    }>("/merchant-applications/me/status", "GET");
  },

  getMerchantSettings(merchantId: string) {
    return request<{
      merchant_id: string;
      settings_exists: boolean;
      settings: {
        contact_phone: string | null;
        whatsapp_phone: string | null;
        support_email: string | null;
        city: string | null;
        address: string | null;
        delivery_notes: string | null;
        logo_url: string | null;
        push_enabled: boolean;
        sound_enabled: boolean;
        sound_repeat_interval_seconds: number;
        sound_max_duration_seconds: number;
      } | null;
    }>(`/merchants/${encodeURIComponent(merchantId)}/settings`, "GET");
  },

  patchMerchantSettings(
    merchantId: string,
    payload: {
      contact_phone?: string;
      whatsapp_phone?: string;
      support_email?: string;
      city?: string;
      address?: string;
      delivery_notes?: string;
      logo_url?: string;
      push_enabled?: boolean;
      sound_enabled?: boolean;
      sound_repeat_interval_seconds?: number;
      sound_max_duration_seconds?: number;
    },
  ) {
    return request<{
      merchant_id: string;
      settings_exists: boolean;
      settings: {
        contact_phone: string | null;
        whatsapp_phone: string | null;
        support_email: string | null;
        city: string | null;
        address: string | null;
        delivery_notes: string | null;
        logo_url: string | null;
        push_enabled: boolean;
        sound_enabled: boolean;
        sound_repeat_interval_seconds: number;
        sound_max_duration_seconds: number;
      } | null;
    }>(`/merchants/${encodeURIComponent(merchantId)}/settings`, "PATCH", payload);
  },

  upsertMerchantSettings(payload: {
    merchant_id: string;
    contact_phone?: string;
    whatsapp_phone?: string;
    support_email?: string;
    city?: string;
    address?: string;
    delivery_notes?: string;
    logo_url?: string;
    push_enabled?: boolean;
    sound_enabled?: boolean;
    sound_repeat_interval_seconds?: number;
    sound_max_duration_seconds?: number;
  }) {
    const { merchant_id, ...rest } = payload;
    return merchantApi.patchMerchantSettings(merchant_id, rest);
  },

  downloadMerchantImportTemplate() {
    return request<string>("/merchant/products/import-template", "GET");
  },

  async previewMerchantProductImport(file: File, merchantId: string) {
    const formData = new FormData();
    formData.append("file", file);
    if (merchantId) {
      formData.append("merchant_id", merchantId);
    }
    const accessToken = (await authSessionManager.getValidAccessToken()) ?? "";
    return fetch(`${API_BASE_URL}/merchant/products/import/preview`, {
      method: "POST",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.message ?? "Failed to preview import");
      }
      return res.json();
    });
  },

  confirmMerchantProductImport(importId: string, merchantId: string) {
    return request<{
      total: number;
      created: number;
      updated: number;
      skipped: number;
      failed: number;
      errors: Array<{ row_number: number; sku?: string; message: string }>;
      rows?: Array<{
        row_number: number;
        sku: string;
        action: "created" | "updated" | "skipped" | "failed";
        product_id?: string | null;
        message?: string;
      }>;
    }>("/merchant/products/import/confirm", "POST", { import_id: importId, merchant_id: merchantId });
  },

  merchantBulkProductAction(payload: {
    merchant_id: string;
    product_ids: string[];
    action: "activate" | "deactivate" | "update_stock" | "change_category" | "adjust_price_percent" | "archive";
    payload?: Record<string, unknown>;
  }) {
    return request<{ ok: boolean; affected: number }>("/merchant/products/bulk-action", "POST", payload);
  },

  quickAddMerchantProduct(payload: {
    merchant_id: string;
    name: string;
    category_id: string;
    price: number;
    stock?: number;
    image_url?: string;
    description?: string;
    is_active?: boolean;
  }) {
    // The response carries the resolved publication state: an incomplete quick payload is
    // created as a draft (inactive/unpublished/private) instead of being published.
    return request<{
      id: string;
      name: string;
      slug: string;
      is_active: boolean;
      is_published: boolean;
      visibility_status: "public" | "private" | "archived";
    }>("/merchant/products/quick-add", "POST", payload);
  },

  duplicateMerchantProduct(productId: string, merchantId: string) {
    return request<{ id: string; name: string; slug: string; is_active: boolean }>(
      `/merchant/products/${encodeURIComponent(productId)}/duplicate`,
      "POST",
      { merchant_id: merchantId },
    );
  },

  getMerchantProducts(merchantId: string) {
    return request<Array<Record<string, unknown>>>(`/products?merchant_id=${encodeURIComponent(merchantId)}`, "GET");
  },

  getMerchantOrders(merchantId: string) {
    return request<Array<Record<string, unknown>>>(`/orders?merchant_id=${encodeURIComponent(merchantId)}`, "GET");
  },

  getMerchantDashboardStats(merchantId: string) {
    return request<{ productsCount: number; ordersCount: number; deliveredRevenue: number }>(`/merchants/${merchantId}/dashboard-stats`, "GET");
  },

  getMerchantDashboard(merchantId: string) {
    return request<CanonicalMerchantDashboardResponse>(
      `/merchants/${encodeURIComponent(merchantId)}/dashboard`,
      "GET",
    );
  },


  getMerchantReadiness(merchantId: string) {
    return request<{
      merchant_id: string;
      score: number;
      passed_checks: number;
      total_checks: number;
      is_ready: boolean;
      checklist: Array<{ key: string; label: string; passed: boolean }>;
      stats: {
        products_count: number;
        active_products_count: number;
        categorized_products_count: number;
      };
      /** Informational only — whether an explicit merchant Commercial Agreement exists. Not part of score/checklist. */
      commercial_agreement_configured?: boolean;
    }>(`/merchants/${merchantId}/readiness`, "GET");
  },

  getMerchantPerformanceScorecard(merchantId: string) {
    return request<{
      merchant_id: string;
      score: number;
      trend: "improving" | "stable" | "declining" | string;
      kpis: {
        store_readiness_score: number;
        product_readiness_coverage: number;
        active_catalog_ratio: number;
        low_stock_ratio: number;
        delayed_order_ratio: number;
        delivered_revenue: number;
        avg_order_value: number;
      };
      totals: {
        total_products: number;
        total_orders: number;
        delayed_pending_orders: number;
      };
    }>(`/merchants/${merchantId}/performance-scorecard`, "GET");
  },

  getMerchantFinanceSummary(merchantId: string) {
    return request<{
      merchant_id: string;
      total_accrued: number;
      total_payable: number;
      total_in_payout: number;
      total_settled: number;
      outstanding_balance: number;
      last_payout_amount: number;
      last_payout_date: string | null;
      currency_code: string;
    }>(`/merchants/${merchantId}/finance/summary`, "GET");
  },

  getMerchantFinanceStatement(
    merchantId: string,
    payload?: { limit?: number; offset?: number; status?: string; from?: string; to?: string },
  ) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (payload?.offset != null) params.set("offset", String(payload.offset));
    if (payload?.status) params.set("status", payload.status);
    if (payload?.from) params.set("from", payload.from);
    if (payload?.to) params.set("to", payload.to);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      merchant_id: string;
      total: number;
      limit: number;
      offset: number;
      entries: Array<{
        id: string;
        order_id?: string | null;
        entry_type: string;
        direction: "credit" | "debit";
        amount: number;
        status: string;
        created_at: string;
        effective_at: string;
        settled_at?: string | null;
        description?: string | null;
        payout_batch_id?: string | null;
      }>;
    }>(`/merchants/${merchantId}/finance/statement${suffix}`, "GET");
  },

  getMerchantPayoutHistory(merchantId: string, payload?: { limit?: number; offset?: number; from?: string; to?: string }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (payload?.offset != null) params.set("offset", String(payload.offset));
    if (payload?.from) params.set("from", payload.from);
    if (payload?.to) params.set("to", payload.to);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      merchant_id: string;
      total: number;
      limit: number;
      offset: number;
      payouts: Array<{
        id: string;
        status: string;
        period_start?: string | null;
        period_end?: string | null;
        total_credits: number;
        total_debits: number;
        net_amount: number;
        currency_code: string;
        created_at: string;
        approved_at?: string | null;
        settled_at?: string | null;
        locked_at?: string | null;
      }>;
    }>(`/merchants/${merchantId}/finance/payout-history${suffix}`, "GET");
  },

  listMerchantNotifications(merchantId: string, limit?: number) {
    const params = new URLSearchParams({ merchant_id: merchantId });
    if (limit) params.set("limit", String(limit));
    return request<Array<{
      id: string;
      merchant_id: string;
      order_id: string | null;
      type: "new_order" | "order_status" | "stock" | "system";
      title: string;
      message: string;
      link: string | null;
      is_read: boolean;
      acknowledged_at?: string | null;
      opened_at?: string | null;
      created_at: string;
    }>>(`/merchant/notifications?${params.toString()}`, "GET");
  },

  markMerchantNotificationRead(id: string) {
    return request<{ success: boolean }>(`/merchant/notifications/${encodeURIComponent(id)}/read`, "POST");
  },

  markAllMerchantNotificationsRead(merchantId: string) {
    const params = new URLSearchParams({ merchant_id: merchantId });
    return request<{ success: boolean }>(`/merchant/notifications/mark-all-read?${params.toString()}`, "POST");
  },

  acknowledgeMerchantNotification(
    id: string,
    payload?: { device_id?: string; opened?: boolean },
  ) {
    return request<Record<string, unknown>>(
      `/merchant/notifications/${encodeURIComponent(id)}/acknowledge`,
      "POST",
      payload ?? {},
    );
  },

  getPushVapidPublicKey() {
    return request<{ publicKey: string }>("/merchant/push/vapid-public-key", "GET");
  },

  listPushSubscriptions(merchantId: string) {
    return request<{
      merchant_id: string;
      scope: "store" | "own";
      devices: Array<{
        id: string;
        device_label: string | null;
        user_agent: string | null;
        status: string;
        created_at: string;
        updated_at: string;
        is_own: boolean;
      }>;
    }>(`/merchants/${encodeURIComponent(merchantId)}/push-subscriptions`, "GET");
  },

  registerPushSubscription(payload: {
    merchant_id: string;
    endpoint: string;
    keys: { p256dh: string; auth: string };
    device_label?: string;
    user_agent?: string;
  }) {
    const { merchant_id, ...body } = payload;
    return request<{
      merchant_id: string;
      subscription: {
        id: string;
        device_label: string | null;
        user_agent: string | null;
        status: string;
        created_at: string;
        updated_at: string;
        is_own: boolean;
      };
    }>(`/merchants/${encodeURIComponent(merchant_id)}/push-subscriptions`, "POST", body);
  },

  deletePushSubscription(merchantId: string, subscriptionId: string) {
    return request<{ merchant_id: string; deleted_id: string; success: boolean }>(
      `/merchants/${encodeURIComponent(merchantId)}/push-subscriptions/${encodeURIComponent(subscriptionId)}`,
      "DELETE",
    );
  },

  testPushSubscription(merchantId: string, subscriptionId?: string) {
    return request<{
      merchant_id: string;
      scope: "store" | "own";
      results: Array<{ id: string; ok: boolean; error?: string }>;
    }>(
      `/merchants/${encodeURIComponent(merchantId)}/push-subscriptions/test`,
      "POST",
      subscriptionId ? { subscription_id: subscriptionId } : {},
    );
  },

  listMerchantCustomers(
    merchantId: string,
    payload?: { search?: string; page?: number; limit?: number },
  ) {
    const params = new URLSearchParams();
    if (payload?.search) params.set("search", payload.search);
    if (payload?.page) params.set("page", String(payload.page));
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      merchant_id: string;
      items: Array<{
        customer_ref: string;
        phone_masked: string;
        orders: number;
        spent: number;
        last_order_at: string;
      }>;
      page: number;
      limit: number;
      total: number;
      hasMore: boolean;
    }>(`/merchants/${encodeURIComponent(merchantId)}/customers${suffix}`, "GET");
  },

  listMerchantOrders(
    merchantId: string,
    payload?: {
      search?: string;
      status?: string;
      merchant_decision_status?: string;
      page?: number;
      limit?: number;
      offset?: number;
      date_from?: string;
      date_to?: string;
    },
  ) {
    const params = new URLSearchParams();
    if (payload?.search) params.set("search", payload.search);
    if (payload?.status && payload.status !== "all") params.set("status", payload.status);
    if (payload?.merchant_decision_status && payload.merchant_decision_status !== "all") {
      params.set("merchant_decision_status", payload.merchant_decision_status);
    }
    if (payload?.page) params.set("page", String(payload.page));
    if (payload?.limit) params.set("limit", String(payload.limit));
    if (payload?.offset !== undefined) params.set("offset", String(payload.offset));
    if (payload?.date_from) params.set("date_from", payload.date_from);
    if (payload?.date_to) params.set("date_to", payload.date_to);

    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<CanonicalMerchantOrdersResponse>(
      `/merchants/${encodeURIComponent(merchantId)}/orders${suffix}`,
      "GET",
    );
  },
};
