import { request } from "@/lib/api-core";
import type { AdminExecutiveGovernanceResponse } from "@/lib/admin-executive.types";
import type { MerchantStatus } from "@/lib/auth-context-contract";

export interface MerchantRegistrationDetails {
  applicant_user_id: string | null;
  email: string | null;
  owner_full_name: string | null;
  owner_phone: string | null;
  store_name_ar: string | null;
  store_name_en: string | null;
  display_name: string | null;
  slug: string | null;
  business_type: string | null;
  description: string | null;
  city: string | null;
  address: string | null;
  contact_phone: string | null;
  whatsapp_phone: string | null;
  support_email: string | null;
  submitted_at: string | null;
  status: string | null;
}

export interface UpdateMerchantRegistrationDetailsPayload {
  merchant?: {
    name_ar?: string;
    name_en?: string;
    display_name?: string;
    description?: string | null;
    business_type?: string | null;
  };
  settings?: {
    city?: string | null;
    address?: string | null;
    contact_phone?: string | null;
    whatsapp_phone?: string | null;
    support_email?: string | null;
  };
  owner?: {
    full_name?: string | null;
    phone?: string | null;
  };
}

export interface AdminMerchantCommercialAgreementTerm {
  id: string;
  rule_type: "commission" | "assisted_fee" | "platform_fee" | "delivery_billing";
  value_type: "percentage" | "fixed";
  value: number;
  delivery_billing_mode?: "customer_pays" | "merchant_pays" | "mixed" | null;
  effective_from: string;
  effective_to: string | null;
  created_at: string;
  created_by: string | null;
}

export interface AdminMerchantCommercialAgreementBundle {
  commission: AdminMerchantCommercialAgreementTerm | null;
  assisted_fee: AdminMerchantCommercialAgreementTerm | null;
  platform_fee: AdminMerchantCommercialAgreementTerm | null;
  delivery_billing: AdminMerchantCommercialAgreementTerm | null;
}

export interface AdminMerchantCommercialAgreementResponse {
  merchant_id: string;
  merchant_name: string | null;
  has_explicit_agreement: boolean;
  current: AdminMerchantCommercialAgreementBundle;
  upcoming: AdminMerchantCommercialAgreementBundle;
  history: AdminMerchantCommercialAgreementTerm[];
  engine_fallback: { commission_rate: number; source: string } | null;
}

export interface ScheduleMerchantCommercialAgreementPayload {
  commission_rate: number;
  commission_value_type?: "percentage" | "fixed";
  effective_from: string;
  assisted_fee_rate?: number;
  platform_fee_rate?: number;
  delivery_billing_mode?: "customer_pays" | "merchant_pays" | "mixed";
  replace_pending?: boolean;
}

export interface AdminMerchantDetailResponse {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string;
  display_name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: MerchantStatus;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
  business_type?: string | null;
  registration_details?: MerchantRegistrationDetails | null;
}

export const adminCoreApi = {
  getActiveMerchants() {
    return request<Array<any>>("/merchants/active", "GET");
  },

  getAdminMerchants() {
    return request<Array<any>>("/merchants", "GET");
  },

  getMerchantById(id: string) {
    return request<AdminMerchantDetailResponse>(`/merchants/${id}`, "GET");
  },

  createMerchant(payload: { slug: string; name_ar: string; name_en: string; display_name: string }) {
    return request<any>("/merchants", "POST", payload);
  },

  /** Profile-only update. Status changes go exclusively through updateMerchantStatus — the
   *  backend never applies a `status` field here, so it isn't part of this payload either. */
  updateMerchant(id: string, payload: { display_name: string }) {
    return request<{ ok: boolean }>(`/merchants/${id}`, "POST", payload);
  },

  updateMerchantStatus(id: string, payload: { status: MerchantStatus }) {
    return request<{ ok: boolean }>(`/merchants/${id}/status`, "POST", payload);
  },

  approveMerchant(id: string) {
    return request<{ ok: boolean }>(`/admin/merchants/${encodeURIComponent(id)}/approve`, "POST");
  },

  rejectMerchant(id: string, reason: string) {
    return request<{ ok: boolean }>(`/admin/merchants/${encodeURIComponent(id)}/reject`, "POST", { reason });
  },

  assignMerchantOwner(id: string, payload: { user_id: string }) {
    return request<{ ok: boolean }>(`/merchants/${id}/assign-owner`, "POST", payload);
  },

  createCategory(payload: {
    name: string;
    slug: string;
    sort_order: number;
    parent_id: string | null;
    image_url?: string | null;
    icon_url?: string | null;
    is_active?: boolean;
    is_featured?: boolean;
    layout_variant?: "normal" | "wide" | "promo";
    background_color?: string | null;
    text_color?: string | null;
  }) {
    return request<any>("/categories", "POST", payload);
  },

  updateCategory(
    id: string,
    payload: {
      name: string;
      slug: string;
      sort_order: number;
      parent_id: string | null;
      image_url?: string | null;
      icon_url?: string | null;
      is_active?: boolean;
      is_featured?: boolean;
      layout_variant?: "normal" | "wide" | "promo";
      background_color?: string | null;
      text_color?: string | null;
    },
  ) {
    return request<{ ok: boolean }>(`/categories/${id}`, "POST", payload);
  },

  deleteCategory(id: string) {
    return request<{ ok: boolean }>(`/categories/${id}`, "DELETE");
  },

  getAdminAnalyticsOverview() {
    return request<any>("/admin/analytics/overview", "GET");
  },

  listAdminGovernanceTasks(payload?: { task_ids?: string[] }) {
    const params = new URLSearchParams();
    if (payload?.task_ids && payload.task_ids.length > 0) params.set("task_ids", payload.task_ids.join(","));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      tasks: Array<{
        task_id: string;
        owner?: string | null;
        deadline?: string | null;
        status?: "open" | "in_progress" | "resolved" | "escalated" | null;
        updated_at?: string | null;
        updated_by?: string | null;
        note?: string | null;
      }>;
      message?: string;
      error?: string;
    }>(`/admin/governance/tasks${suffix}`, "GET");
  },

  upsertAdminGovernanceTask(
    taskId: string,
    payload: { owner?: string; deadline?: string; status: "open" | "in_progress" | "resolved" | "escalated"; note?: string },
  ) {
    return request<{ ok: boolean; message?: string; error?: string; task?: any }>(`/admin/governance/tasks/${encodeURIComponent(taskId)}`, "POST", payload);
  },

  listCommercialPolicyProfiles() {
    return request<{
      profiles: Array<{
        id: "balanced" | "strict";
        label: string;
        description: string;
        maxDiscountPercent: number;
        minCouponOrderAmount: number;
        maxCouponUsage: number;
      }>;
    }>("/admin/commercial-policy/profiles", "GET");
  },

  getCommercialPolicyAssignment(payload?: { merchant_id?: string }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      merchant_id: string | null;
      profile_id: "balanced" | "strict";
      profile: {
        id: "balanced" | "strict";
        label: string;
        description: string;
        maxDiscountPercent: number;
        minCouponOrderAmount: number;
        maxCouponUsage: number;
      };
      source: "assignment" | "default" | "fallback_default";
      message?: string;
      error?: string;
    }>(`/admin/commercial-policy/assignment${suffix}`, "GET");
  },

  upsertCommercialPolicyAssignment(merchantId: string, payload: { profile_id: "balanced" | "strict" }) {
    return request<{ ok: boolean; message?: string; error?: string; profile?: any }>(
      `/admin/commercial-policy/assignment/${encodeURIComponent(merchantId)}`,
      "POST",
      payload,
    );
  },

  /** M4.8 — executive governance snapshot (merchant health, delayed risk map, weekly throughput) */
  getAdminExecutiveGovernance() {
    return request<AdminExecutiveGovernanceResponse>("/admin/analytics/executive", "GET");
  },

  listAdminAgents() {
    return request<Array<Record<string, unknown>>>(`/admin/agents`, "GET");
  },

  createAdminAgent(payload: { email: string; password: string; full_name: string; phone: string }) {
    return request<{ userId: string; message: string }>(`/admin/agents`, "POST", payload);
  },

  revokeAdminAgent(id: string) {
    return request<{ ok: boolean; alreadyRevoked?: boolean }>(`/admin/agents/${encodeURIComponent(id)}/revoke`, "POST");
  },

  getAdminLoyaltySettings() {
    return request<Record<string, unknown> | null>("/admin/loyalty/settings", "GET");
  },

  updateAdminLoyaltySettings(payload: {
    points_per_dinar?: number;
    dinar_per_point?: number;
    min_spend_to_redeem?: number;
    points_expiry_days?: number;
    is_active?: boolean;
  }) {
    return request<Record<string, unknown>>("/admin/loyalty/settings", "PATCH", payload);
  },

  listAdminNotifications() {
    return request<Array<Record<string, unknown>>>("/admin/notifications", "GET");
  },

  markAdminNotificationRead(id: string) {
    return request<{ ok: boolean; alreadyRead?: boolean }>(`/admin/notifications/${encodeURIComponent(id)}/read`, "POST");
  },

  markAllAdminNotificationsRead() {
    return request<{ ok: boolean; updatedCount: number }>("/admin/notifications/read-all", "POST");
  },

  listAdminMerchantPlans(payload?: { active?: boolean }) {
    const params = new URLSearchParams();
    if (typeof payload?.active === "boolean") params.set("active", String(payload.active));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ plans: Array<any> }>(`/admin/merchant-plans${suffix}`, "GET");
  },

  createAdminMerchantPlan(payload: {
    name: string;
    code: string;
    default_commission_type: "percentage" | "fixed" | "hybrid";
    default_commission_rate: number;
    default_assisted_fee_rate?: number;
    default_platform_fee_rate?: number;
    default_delivery_billing_mode?: "customer_pays" | "merchant_pays" | "mixed";
    features?: Record<string, unknown>;
    is_active?: boolean;
  }) {
    return request<{ ok: boolean; plan: any }>("/admin/merchant-plans", "POST", payload);
  },

  updateAdminMerchantPlan(planId: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean; plan: any }>(`/admin/merchant-plans/${encodeURIComponent(planId)}`, "PATCH", payload);
  },

  createAdminMerchantPlanAssignment(payload: {
    merchant_id: string;
    plan_id: string;
    start_at?: string;
    end_at?: string | null;
    is_active?: boolean;
  }) {
    return request<{ ok: boolean; assignment: any }>("/admin/merchant-plan-assignments", "POST", payload);
  },

  listAdminMerchantPlanAssignments(payload?: { merchant_id?: string; active?: boolean; limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.merchant_id) params.set("merchant_id", payload.merchant_id);
    if (typeof payload?.active === "boolean") params.set("active", String(payload.active));
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ assignments: Array<any> }>(`/admin/merchant-plan-assignments${suffix}`, "GET");
  },

  updateAdminMerchantPlanAssignment(assignmentId: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean; assignment: any }>(`/admin/merchant-plan-assignments/${encodeURIComponent(assignmentId)}`, "PATCH", payload);
  },

  listAdminCommercialRules(payload?: { rule_type?: string; scope_type?: string; is_active?: boolean }) {
    const params = new URLSearchParams();
    if (payload?.rule_type) params.set("rule_type", payload.rule_type);
    if (payload?.scope_type) params.set("scope_type", payload.scope_type);
    if (typeof payload?.is_active === "boolean") params.set("is_active", String(payload.is_active));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{ rules: Array<any> }>(`/admin/commercial-rules${suffix}`, "GET");
  },

  createAdminCommercialRule(payload: Record<string, unknown>) {
    return request<{ ok: boolean; rule: any }>("/admin/commercial-rules", "POST", payload);
  },

  updateAdminCommercialRule(ruleId: string, payload: Record<string, unknown>) {
    return request<{ ok: boolean; rule: any }>(`/admin/commercial-rules/${encodeURIComponent(ruleId)}`, "PATCH", payload);
  },

  disableAdminCommercialRule(ruleId: string) {
    return request<{ ok: boolean; rule: any }>(`/admin/commercial-rules/${encodeURIComponent(ruleId)}/disable`, "POST");
  },

  enableAdminCommercialRule(ruleId: string) {
    return request<{ ok: boolean; rule: any }>(`/admin/commercial-rules/${encodeURIComponent(ruleId)}/enable`, "POST");
  },

  getAdminMerchantCommercialAgreement(merchantId: string) {
    return request<AdminMerchantCommercialAgreementResponse>(
      `/admin/merchants/${encodeURIComponent(merchantId)}/commercial-agreement`,
      "GET",
    );
  },

  scheduleAdminMerchantCommercialAgreement(merchantId: string, payload: ScheduleMerchantCommercialAgreementPayload) {
    return request<AdminMerchantCommercialAgreementResponse>(
      `/admin/merchants/${encodeURIComponent(merchantId)}/commercial-agreement`,
      "POST",
      payload,
    );
  },

  listDeliveryIntelligenceQueue(payload?: { limit?: number }) {
    const params = new URLSearchParams();
    if (payload?.limit) params.set("limit", String(payload.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";
    return request<{
      rows: Array<{
        order_id: string;
        delivery_status: string;
        created_at: string;
        assigned_company_id: string | null;
        assigned_agent_id: string | null;
        last_event_time: string | null;
        time_in_current_status: number;
        sla_threshold: number;
        risk_score: number;
        risk_level: "low" | "medium" | "high";
        reasons: string[];
      }>;
    }>(`/admin/delivery-intelligence/queue${suffix}`, "GET");
  },

  getOrderDeliveryIntelligence(orderId: string) {
    return request<{
      order: {
        order_id: string;
        delivery_status: string;
        created_at: string;
        assigned_company_id: string | null;
        assigned_agent_id: string | null;
        last_event_time: string | null;
        time_in_current_status: number;
        sla_threshold: number;
        risk_score: number;
        risk_level: "low" | "medium" | "high";
        reasons: string[];
      };
      risk: { score: number; level: "low" | "medium" | "high"; reasons: string[] };
      recommendations: Array<{
        type: "reassign_agent" | "escalate_company" | "mark_urgent";
        reason: string;
        confidence: number;
      }>;
    }>(`/admin/delivery-intelligence/orders/${encodeURIComponent(orderId)}`, "GET");
  },

  listAdminDesktopQuickLinks() {
    return request<Array<{ id: string; label: string; href: string; sort_order: number; is_active: boolean }>>("/admin/desktop-quick-links", "GET");
  },

  createAdminDesktopQuickLink(payload: { label: string; href: string; sort_order?: number; is_active?: boolean }) {
    return request<{ id: string; label: string; href: string; sort_order: number; is_active: boolean }>("/admin/desktop-quick-links", "POST", payload);
  },

  updateAdminDesktopQuickLink(id: string, payload: Partial<{ label: string; href: string; sort_order: number; is_active: boolean }>) {
    return request<{ id: string; label: string; href: string; sort_order: number; is_active: boolean }>(`/admin/desktop-quick-links/${encodeURIComponent(id)}`, "PATCH", payload);
  },

  deleteAdminDesktopQuickLink(id: string) {
    return request<{ ok: boolean }>(`/admin/desktop-quick-links/${encodeURIComponent(id)}`, "DELETE");
  },

  listUsers(params?: { search?: string; limit?: number; offset?: number }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return request<{ users: Array<{ id: string; full_name: string | null; phone: string | null; email: string | null; role: string | null; created_at: string }>; total: number; limit: number; offset: number }>(
      `/users${query ? `?${query}` : ""}`,
      "GET",
    );
  },

  // ── Jenni Store Provisioning (Phase 2B) ──────────────────────────────────

  getJenniProvisioningStatus(merchantId: string) {
    return request<{
      merchant_slug: string;
      jenni_store_id: number | null;
      jenni_synced_at: string | null;
      jenni_sync_error: string | null;
      is_linked: boolean;
      jenni_merchant_id: string | null;
      jenni_merchant_synced_at: string | null;
      jenni_merchant_sync_error: string | null;
      is_merchant_linked: boolean;
    }>(`/admin/jenni/merchants/${encodeURIComponent(merchantId)}/provisioning-status`, "GET");
  },

  createJenniMerchant(merchantId: string) {
    return request<{ ok: boolean; jenni_merchant_id: string; was_created: boolean }>(
      `/admin/jenni/merchants/${encodeURIComponent(merchantId)}/create-merchant`,
      "POST",
    );
  },

  createJenniStore(merchantId: string) {
    return request<{ ok: boolean; jenni_store_id: number; was_created: boolean }>(
      `/admin/jenni/merchants/${encodeURIComponent(merchantId)}/create-store`,
      "POST",
    );
  },

  linkJenniStore(merchantId: string, jenniStoreId: number) {
    return request<{ ok: boolean; jenni_store_id: number }>(
      `/admin/jenni/merchants/${encodeURIComponent(merchantId)}/link-store`,
      "POST",
      { jenni_store_id: jenniStoreId },
    );
  },

  updateMerchantRegistrationDetails(id: string, payload: UpdateMerchantRegistrationDetailsPayload) {
    return request<AdminMerchantDetailResponse>(`/merchants/${id}/registration-details`, "PATCH", payload);
  },
};
