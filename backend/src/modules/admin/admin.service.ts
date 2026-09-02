import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";

import { AppActorRole } from "../../common/authz/roles.decorator";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import { sanitizeSearchTerm, buildSafeOrFilter } from "../../common/search-utils";
import { AuditService } from "../audit/audit.service";
import { OrderFinanceService } from "../finance/order-finance.service";
import { CourierFinanceService } from "../finance/courier-finance.service";
import { MerchantsService } from "../merchants/merchants.service";
import { NotificationsService } from "../notifications/notifications.service";
import { DeliveryOperationsService } from "../shipping/delivery-operations.service";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { CreateAgentDto, UpdateLoyaltySettingsDto } from "./admin.dto";
import { DeliveryIntelligenceService } from "./delivery-intelligence.service";
import { JenniAuthService } from "../jenni/jenni-auth.service";
import { JenniClientService } from "../jenni/jenni-client.service";
import { JenniDispatchService } from "../jenni/jenni-dispatch.service";
import { JenniReferenceSyncService } from "../jenni/jenni-reference-sync.service";
import { JenniSyncService } from "../jenni/jenni-sync.service";
import { JenniStoreProvisioningService } from "../jenni/jenni-store-provisioning.service";
import { JenniMerchantProvisioningService } from "../jenni/jenni-merchant-provisioning.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { AdminCustomersService } from "./admin-customers.service";
import { AdminOperationalAlertsService } from "./admin-operational-alerts.service";


type OrderItemRow = {
  order_id: string;
  product_name: string;
  quantity: number;
  price: number;
  created_at?: string | null;
  products?: { purchase_price?: number | null } | null;
};

type CommercialRuleRow = {
  id: string;
  rule_type: string;
  scope_type: string;
  scope_reference_id: string | null;
  value_type: string;
  value: number;
  conditions: Record<string, unknown> | null;
  is_active: boolean;
  start_at: string;
  end_at: string | null;
  created_at: string;
  created_by: string | null;
};

type AdminNotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

type ComputedAlert = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

type GovernanceTaskRow = {
  task_id: string;
  owner?: string | null;
  deadline?: string | null;
  status?: "open" | "in_progress" | "resolved" | "escalated" | null;
  updated_at?: string | null;
  updated_by?: string | null;
  note?: string | null;
};

import {
  CommercialPolicyProfileId,
  CommercialPolicyProfile,
  COMMERCIAL_POLICY_PROFILES,
  getCommercialPolicyProfile,
} from "../../common/commercial-policy";

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);


  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly auditService: AuditService,
    private readonly orderFinanceService: OrderFinanceService,
    private readonly courierFinanceService: CourierFinanceService,
    private readonly merchantsService: MerchantsService,
    private readonly notificationsService: NotificationsService,
    private readonly deliveryOperationsService: DeliveryOperationsService,
    private readonly deliveryIntelligenceService: DeliveryIntelligenceService,
    private readonly jenniDispatchService: JenniDispatchService,
    private readonly jenniSyncService: JenniSyncService,
    private readonly jenniReferenceSyncService: JenniReferenceSyncService,
    private readonly jenniStoreProvisioningService: JenniStoreProvisioningService,
    private readonly jenniMerchantProvisioningService: JenniMerchantProvisioningService,
    private readonly jenniAuthService: JenniAuthService,
    private readonly jenniClientService: JenniClientService,
    private readonly configService: ConfigService,
    private readonly scopeResolver: ScopeResolverService,
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly adminCustomersService: AdminCustomersService,
    private readonly adminOperationalAlertsService: AdminOperationalAlertsService,
  ) {}

  private normalizeDeliveryStatus(rawStatus?: string | null, orderStatus?: string | null) {
    const explicit = String(rawStatus ?? "").trim();
    if (explicit) return explicit;
    if (String(orderStatus ?? "") === "delivered") return "delivered";
    if (String(orderStatus ?? "") === "cancelled") return "cancelled";
    return "pending_assignment";
  }



  async getAnalyticsOverview() {
    return this.adminAnalyticsService.getAnalyticsOverview();
  }

  /**
   * M4.8 — Executive governance: merchant health distribution, delayed-order risk by governorate,
   * weekly order throughput (proxy for commercial/conversion momentum).
   */
  async getExecutiveGovernance() {
    return this.adminAnalyticsService.getExecutiveGovernance();
  }

  async getScopedCustomers(params: {
    merchant_id?: string;
    search?: string;
    actor_role?: string;
    actor_id?: string;
    page?: number;
    limit?: number;
  }) {
    return this.adminCustomersService.getScopedCustomers(params);
  }

  async listAgentsWithStats() {
    const { data, error } = await this.supabaseAdmin.client
      .from("profiles")
      .select(
        `
        *,
        assigned_orders:orders!agent_id(id, status, total)
      `,
      )
      .eq("role", "agent")
      .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as Array<Record<string, unknown> & { assigned_orders?: Array<{ status?: string; total?: number }> }>;
    return rows.map((agent) => {
      const orders = agent.assigned_orders ?? [];
      const deliveredOrders = orders.filter((o) => o.status === "delivered");
      return {
        ...agent,
        total_orders: orders.length,
        delivered_orders: deliveredOrders.length,
        total_collected: deliveredOrders.reduce((sum, o) => sum + Number(o.total ?? 0), 0),
      };
    });
  }

  async createAgent(payload: CreateAgentDto, actor: ActorContext) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    const { data: createdData, error: createError } = await this.supabaseAdmin.client.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: { full_name: payload.full_name, phone: payload.phone },
    });

    let targetUserId: string;

    if (createError) {
      const msg = createError.message ?? "";
      if (msg.includes("already") || (createError as { status?: number }).status === 400) {
        const { data: listData, error: listError } = await this.supabaseAdmin.client.auth.admin.listUsers();
        if (listError) throw listError;
        const existing = listData.users.find((u) => u.email === payload.email);
        if (!existing) {
          throw createError;
        }
        targetUserId = existing.id;
        await this.supabaseAdmin.client.auth.admin.updateUserById(targetUserId, {
          user_metadata: { full_name: payload.full_name, phone: payload.phone },
        });
      } else {
        throw createError;
      }
    } else {
      if (!createdData?.user?.id) {
        throw new Error("Auth user creation returned no user id.");
      }
      targetUserId = createdData.user.id;
    }

    const profileUpdate = {
      id: targetUserId,
      role: "agent",
      full_name: payload.full_name || "",
      phone: payload.phone || "",
      email: payload.email,
      updated_at: new Date().toISOString(),
    };

    const { error: profileError } = await this.supabaseAdmin.client.from("profiles").upsert(profileUpdate);
    if (profileError) throw profileError;

    await this.auditService.log({
      eventType: "AGENT_CREATED",
      actor: { actorId, actorRole },
      resource: { type: "profile", id: targetUserId },
      payload: { email: payload.email },
    });

    return { userId: targetUserId, message: "ok" };
  }

  async revokeAgent(agentProfileId: string, actor: ActorContext) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    const { data: row, error: fetchError } = await this.supabaseAdmin.client
      .from("profiles")
      .select("id, role")
      .eq("id", agentProfileId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!row) {
      throw new NotFoundException("Agent profile not found.");
    }

    const currentRole = (row as { role?: string }).role;
    if (currentRole !== "agent") {
      return { ok: true as const, alreadyRevoked: true as const };
    }

    const { error: updateError } = await this.supabaseAdmin.client
      .from("profiles")
      .update({ role: "customer" })
      .eq("id", agentProfileId)
      .eq("role", "agent");

    if (updateError) throw updateError;

    await this.auditService.log({
      eventType: "AGENT_REVOKED",
      actor: { actorId, actorRole },
      resource: { type: "profile", id: agentProfileId },
      payload: { previous_role: "agent" },
    });

    return { ok: true as const, alreadyRevoked: false as const };
  }

  async getLoyaltySettings() {
    const { data, error } = await this.supabaseAdmin.client.from("loyalty_settings").select("*").limit(1).maybeSingle();
    if (error) throw error;
    return data;
  }

  async updateLoyaltySettings(payload: UpdateLoyaltySettingsDto, actor: ActorContext) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    const { data: current, error: fetchError } = await this.supabaseAdmin.client
      .from("loyalty_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!current) throw new NotFoundException("Loyalty settings not found.");

    const patch: Record<string, unknown> = {};
    const changedFields: string[] = [];
    (["points_per_dinar", "dinar_per_point", "min_spend_to_redeem", "points_expiry_days", "is_active"] as const).forEach((key) => {
      const nextValue = payload[key];
      if (typeof nextValue === "undefined") return;
      if ((current as Record<string, unknown>)[key] === nextValue) return;
      patch[key] = nextValue;
      changedFields.push(key);
    });

    if (changedFields.length === 0) {
      return { ...(current as Record<string, unknown>), changed: false };
    }

    patch.updated_at = new Date().toISOString();
    const { data: updated, error: updateError } = await this.supabaseAdmin.client
      .from("loyalty_settings")
      .update(patch)
      .eq("id", (current as { id: string }).id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    await this.auditService.log({
      eventType: "LOYALTY_SETTINGS_UPDATED",
      actor: { actorId, actorRole },
      resource: { type: "loyalty_settings", id: (current as { id: string }).id },
      payload: { changed_fields: changedFields },
    });

    return { ...(updated as Record<string, unknown>), changed: true };
  }

  async listAdminNotifications() {
    return this.adminOperationalAlertsService.listAdminNotifications();
  }

  async markAdminNotificationRead(notificationId: string, actor: ActorContext) {
    return this.adminOperationalAlertsService.markAdminNotificationRead(notificationId, actor);
  }

  async markAllAdminNotificationsRead(actor: ActorContext) {
    return this.adminOperationalAlertsService.markAllAdminNotificationsRead(actor);
  }

  /** M5.2 — durable governance workflow tasks (server source of record). */
  async listGovernanceTasks(taskIds?: string[]) {
    return this.adminOperationalAlertsService.listGovernanceTasks(taskIds);
  }

  async upsertGovernanceTask(
    taskId: string,
    payload: { owner?: string; deadline?: string; status: "open" | "in_progress" | "resolved" | "escalated"; note?: string },
    actor: ActorContext,
  ) {
    return this.adminOperationalAlertsService.upsertGovernanceTask(taskId, payload, actor);
  }

  listCommercialPolicyProfiles() {
    return { profiles: Object.values(COMMERCIAL_POLICY_PROFILES) };
  }

  private getCommercialPolicyProfile(profileId?: string | null): CommercialPolicyProfile {
    if (profileId === "strict") return COMMERCIAL_POLICY_PROFILES.strict;
    return COMMERCIAL_POLICY_PROFILES.balanced;
  }

  async getCommercialPolicyAssignment(params: { merchant_id?: string; actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(params.merchant_id, params.actor_role, params.actor_id);
    if (!resolvedMerchantId) {
      const profile = this.getCommercialPolicyProfile("balanced");
      return { merchant_id: null, profile_id: profile.id, profile, source: "default" as const };
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_policy_assignments")
      .select("merchant_id, profile_id, updated_at, updated_by")
      .eq("merchant_id", resolvedMerchantId)
      .maybeSingle();
    if (error) {
      const profile = this.getCommercialPolicyProfile("balanced");
      return {
        merchant_id: resolvedMerchantId,
        profile_id: profile.id,
        profile,
        source: "fallback_default" as const,
        message: "Policy assignment table unavailable.",
        error: error.message,
      };
    }
    const assignedProfile = this.getCommercialPolicyProfile((data as { profile_id?: string | null } | null)?.profile_id ?? "balanced");
    return {
      merchant_id: resolvedMerchantId,
      profile_id: assignedProfile.id,
      profile: assignedProfile,
      source: data ? ("assignment" as const) : ("default" as const),
      updated_at: (data as { updated_at?: string | null } | null)?.updated_at ?? null,
      updated_by: (data as { updated_by?: string | null } | null)?.updated_by ?? null,
    };
  }

  async upsertCommercialPolicyAssignment(merchantId: string, profileId: CommercialPolicyProfileId, actor: ActorContext) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;
    const profile = this.getCommercialPolicyProfile(profileId);
    const row = {
      merchant_id: merchantId,
      profile_id: profile.id,
      updated_at: new Date().toISOString(),
      updated_by: actorId || null,
    };
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_policy_assignments")
      .upsert(row as any, { onConflict: "merchant_id" })
      .select("merchant_id, profile_id, updated_at, updated_by")
      .maybeSingle();
    if (error) {
      return { ok: false as const, message: "Policy assignment write failed.", error: error.message };
    }

    await this.auditService.log({
      eventType: "POLICY_ASSIGNMENT_UPDATED",
      actor: { actorId, actorRole },
      resource: { type: "merchant_policy_assignment", id: merchantId },
      payload: { profile_id: profile.id },
    });

    return { ok: true as const, assignment: data, profile };
  }

  async getOrderFinancialDetail(orderId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,order_number,merchant_id,delivery_company_id,payment_method,payment_status,collection_status,settlement_status,courier_settlement_status,cash_expected_amount,cash_received_amount,courier_cod_remittance_mode,cash_gross_expected_amount,courier_fee_retained_amount,cash_net_expected_from_courier,cash_actual_remitted_amount,cash_remittance_difference,courier_fee_offset_applied,courier_fee_offset_settled_at,merchandise_subtotal,discount_total,delivery_fee_charged,merchant_gross_amount,gross_collected_amount,merchant_net_amount,platform_commission_amount,courier_fee_payable,currency_code,financial_snapshot_version,commission_rule_id,assisted_fee_rule_id,platform_fee_rule_id,delivery_billing_rule_id,resolved_plan_id,resolved_plan_code,commercial_snapshot_version,created_at,updated_at",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Order not found.");
    return data;
  }

  async listMerchantLedgerEntries(params: { merchant_id: string; status?: string; limit?: number }) {
    let req = this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .select("*")
      .eq("merchant_id", params.merchant_id)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params.limit ?? 100, 1), 500));
    if (params.status) req = req.eq("status", params.status);
    const { data, error } = await req;
    if (error) throw error;
    return { entries: data ?? [] };
  }

  async createPayoutBatch(
    payload: { merchant_id: string; period_start?: string; period_end?: string; notes?: string | null },
    actor: ActorContext,
  ) {
    // Delegates to the create_payout_batch_atomic RPC which wraps all four DB
    // operations (lock candidates, insert batch, insert items, update ledger) in a
    // single PostgreSQL transaction.  The old three-write flow is replaced entirely.
    const { data, error } = await this.supabaseAdmin.client.rpc("create_payout_batch_atomic" as any, {
      p_merchant_id:  payload.merchant_id,
      p_actor_id:     actor.actorId ?? null,
      p_period_start: payload.period_start ?? null,
      p_period_end:   payload.period_end ?? null,
      p_notes:        payload.notes ?? null,
    } as any);
    if (error) throw error;
    const result = data as any;
    if (result?.empty) {
      return { ok: true as const, empty: true as const, message: result.message as string };
    }
    return { ok: true as const, batch: result.batch, entries_count: result.entries_count as number };
  }

  async approvePayoutBatch(batchId: string, actor: ActorContext) {
    const actorId = actor.actorId ?? null;
    const { data: batch, error: fetchError } = await this.supabaseAdmin.client
      .from("merchant_payout_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!batch) throw new NotFoundException("Payout batch not found.");
    if ((batch as any).status !== "draft") {
      throw new ForbiddenException("Only draft payout batches can be approved.");
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_payout_batches")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: actorId,
        locked_at: new Date().toISOString(),
      } as any)
      .eq("id", batchId)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, batch: data };
  }

  async settlePayoutBatch(batchId: string, actor: ActorContext) {
    const actorId = actor.actorId ?? null;
    const nowIso = new Date().toISOString();
    const { data: batch, error: fetchError } = await this.supabaseAdmin.client
      .from("merchant_payout_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!batch) throw new NotFoundException("Payout batch not found.");
    if (!["approved", "processing"].includes(String((batch as any).status))) {
      throw new ForbiddenException("Only approved or processing payout batches can be settled.");
    }

    const { error: batchUpdateError } = await this.supabaseAdmin.client
      .from("merchant_payout_batches")
      .update({
        status: "settled",
        settled_at: nowIso,
        locked_at: (batch as any).locked_at ?? nowIso,
        approved_by: (batch as any).approved_by ?? actorId,
      } as any)
      .eq("id", batchId);
    if (batchUpdateError) throw batchUpdateError;

    const { data: items, error: itemsError } = await this.supabaseAdmin.client
      .from("merchant_payout_batch_items")
      .select("merchant_ledger_entry_id")
      .eq("payout_batch_id", batchId);
    if (itemsError) throw itemsError;
    const ledgerIds = (items ?? []).map((i: any) => i.merchant_ledger_entry_id).filter(Boolean);
    if (ledgerIds.length) {
      const { error: ledgerError } = await this.supabaseAdmin.client
        .from("merchant_ledger_entries")
        .update({
          status: "settled",
          settled_at: nowIso,
        } as any)
        .in("id", ledgerIds);
      if (ledgerError) throw ledgerError;
    }

    // Phase R2 fix: update orders.settlement_status to 'settled' for impacted orders.
    // This mirrors the pattern in settleCourierPayoutBatch which updates
    // orders.courier_settlement_status = 'settled'.
    if (ledgerIds.length) {
      const { data: impactedEntries, error: impactedError } = await this.supabaseAdmin.client
        .from("merchant_ledger_entries")
        .select("order_id")
        .in("id", ledgerIds);
      if (impactedError) throw impactedError;
      const orderIds = Array.from(new Set((impactedEntries ?? []).map((r: any) => r.order_id).filter(Boolean)));
      if (orderIds.length) {
        const { error: ordersUpdateError } = await this.supabaseAdmin.client
          .from("orders")
          .update({ settlement_status: "settled", merchant_settled_at: nowIso } as any)
          .in("id", orderIds)
          .in("settlement_status", ["payable", "in_payout"]);
        if (ordersUpdateError) throw ordersUpdateError;
      }
    }

    return { ok: true, batch_id: batchId, settled_entries: ledgerIds.length };
  }

  async listMerchantPayoutBatches(params: { merchant_id?: string; status?: string; limit?: number }) {
    let req = this.supabaseAdmin.client
      .from("merchant_payout_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params.limit ?? 100, 1), 500));
    if (params.merchant_id) req = req.eq("merchant_id", params.merchant_id);
    if (params.status) req = req.eq("status", params.status);
    const { data, error } = await req;
    if (error) throw error;
    return { batches: data ?? [] };
  }

  async createCourierPayoutBatch(
    payload: { delivery_company_id: string; period_start?: string; period_end?: string; notes?: string | null },
    actor: ActorContext,
  ) {
    return this.courierFinanceService.createCourierPayoutBatch(payload, actor.actorId ?? null);
  }

  async listCourierPayoutBatches(params: { delivery_company_id?: string; status?: string; limit?: number }) {
    return this.courierFinanceService.listCourierPayoutBatches(params);
  }

  async getCourierPayoutBatchDetail(batchId: string) {
    return this.courierFinanceService.getCourierPayoutBatchDetail(batchId);
  }

  async approveCourierPayoutBatch(batchId: string, actor: ActorContext) {
    return this.courierFinanceService.approveCourierPayoutBatch(batchId, actor.actorId ?? null);
  }

  async settleCourierPayoutBatch(
    batchId: string,
    payload: { reference?: string | null; notes?: string | null },
    actor: ActorContext,
  ) {
    return this.courierFinanceService.settleCourierPayoutBatch(batchId, payload, actor.actorId ?? null);
  }

  async cancelCourierPayoutBatch(batchId: string, actor: ActorContext) {
    return this.courierFinanceService.cancelCourierPayoutBatch(batchId, actor.actorId ?? null);
  }

  async listCourierLedgerEntries(params: {
    delivery_company_id: string;
    status?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    return this.courierFinanceService.listCourierLedgerEntries(params);
  }

  async createCourierManualAdjustment(
    payload: {
      delivery_company_id: string;
      agent_id?: string | null;
      order_id?: string | null;
      direction: "credit" | "debit";
      amount: number;
      reason_code: string;
      description?: string | null;
      reference_id?: string | null;
      currency_code?: string;
    },
    actor: ActorContext,
  ) {
    return this.courierFinanceService.createCourierManualAdjustment(payload, actor.actorId ?? null);
  }

  async reverseCourierLedgerEntry(
    entryId: string,
    payload: { reason_code: string; description?: string | null },
    actor: ActorContext,
  ) {
    return this.courierFinanceService.reverseCourierLedgerEntry(entryId, payload, actor.actorId ?? null);
  }

  async releaseOrderCourierDispute(orderId: string, payload: { notes?: string }, actor: ActorContext) {
    return this.courierFinanceService.releaseOrderCourierDispute(orderId, actor.actorId ?? undefined, payload.notes);
  }

  async getFinancialReconciliationOrders(params?: { limit?: number; merchant_id?: string; status?: string }) {
    let req = this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,order_number,merchant_id,delivery_company_id,payment_method,payment_status,collection_status,settlement_status,gross_collected_amount,merchant_net_amount,platform_commission_amount,courier_fee_payable,currency_code,financial_snapshot_version,created_at,merchants(display_name),delivery_companies(name)",
      )
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params?.limit ?? 100, 1), 500));
    if (params?.merchant_id) req = req.eq("merchant_id", params.merchant_id);
    if (params?.status) req = req.eq("settlement_status", params.status);
    const { data, error } = await req;
    if (error) throw error;
    return { orders: data ?? [] };
  }

  async getFinancialMerchantBalances() {
    const { data: merchants, error: merchantsError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id,display_name")
      .order("display_name", { ascending: true });
    if (merchantsError) throw merchantsError;

    const { data: ledgerRows, error: ledgerError } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .select("merchant_id,status,direction,amount");
    if (ledgerError) throw ledgerError;

    const rows = ledgerRows ?? [];
    const balances = (merchants ?? []).map((m: any) => {
      const mRows = rows.filter((r: any) => r.merchant_id === m.id);
      const signed = (status: string) =>
        mRows
          .filter((r: any) => r.status === status)
          .reduce((sum: number, r: any) => sum + (r.direction === "credit" ? 1 : -1) * Number(r.amount ?? 0), 0);
      return {
        merchant_id: m.id,
        merchant_name: m.display_name ?? "—",
        accrued_total: signed("accrued"),
        payable_total: signed("payable"),
        in_payout_total: signed("in_payout"),
        settled_total: signed("settled"),
        pending_reversals: signed("reversed"),
        outstanding_total: signed("accrued") + signed("payable") + signed("in_payout"),
      };
    });

    return { balances };
  }

  async getFinancialCourierPayables() {
    const { balances } = await this.courierFinanceService.getCourierBalances();
    return {
      courier_payables: balances.map((row: any) => ({
        delivery_company_id: row.delivery_company_id,
        delivery_company_name: row.delivery_company_name,
        accrued_amount: Number(row.accrued_total ?? 0),
        payable_amount: Number(row.payable_total ?? 0),
        in_payout_amount: Number(row.in_payout_total ?? 0),
        settled_amount: Number(row.settled_total ?? 0),
        reversed_amount: Number(row.reversed_total ?? 0),
        disputed_amount: Number(row.disputed_total ?? 0),
        outstanding_amount: Number(row.outstanding_total ?? 0),
      })),
    };
  }

  async getFinancialCourierReconciliationOrders(params?: { limit?: number; delivery_company_id?: string; status?: string }) {
    return this.courierFinanceService.getCourierReconciliationOrders(params);
  }

  async getFinancialCourierCodSummary(deliveryCompanyId?: string) {
    return this.courierFinanceService.getCourierCodReconciliationSummary(deliveryCompanyId);
  }

  private collectionStatusRank(status: string) {
    const ranks: Record<string, number> = {
      not_collected: 0,
      collected_from_customer: 1,
      remitted_to_platform: 2,
      remitted_to_merchant: 3,
    };
    return ranks[status] ?? -1;
  }

  private async appendCollectionEvent(payload: {
    order_id: string;
    event_type: "collected_from_customer" | "remitted_to_platform" | "remitted_to_merchant";
    amount?: number;
    actor_type: "courier" | "delivery_company" | "platform" | "merchant" | "admin" | "system";
    actor_id?: string | null;
    notes?: string | null;
    reference?: string | null;
    cash_collected_from_customer_amount?: number | null;
    cash_remitted_to_platform_amount?: number | null;
    courier_retained_amount?: number | null;
    remittance_mode?: "gross_remittance" | "net_remittance" | null;
    extra?: Record<string, unknown>;
  }) {
    // Append-only insert — never upsert/overwrite historical audit rows.
    // Each operation produces a new immutable row in the audit trail.
    const { error } = await this.supabaseAdmin.client.from("collection_event_log").insert({
      order_id: payload.order_id,
      event_type: payload.event_type,
      amount: payload.amount ?? null,
      actor_type: payload.actor_type,
      actor_id: payload.actor_id ?? null,
      notes: payload.notes ?? null,
      reference: payload.reference ?? null,
      cash_collected_from_customer_amount: payload.cash_collected_from_customer_amount ?? null,
      cash_remitted_to_platform_amount: payload.cash_remitted_to_platform_amount ?? null,
      courier_retained_amount: payload.courier_retained_amount ?? null,
      remittance_mode: payload.remittance_mode ?? null,
      payload: payload.extra ?? {},
    } as any);
    if (error) throw error;
  }

  async markOrderCashCollected(
    orderId: string,
    payload: {
      collected_by_type: "courier" | "delivery_company" | "platform";
      collected_by_id?: string;
      amount: number;
      notes?: string;
      reference?: string;
    },
    actor: ActorContext,
  ) {
    const snap = await this.courierFinanceService.ensureOrderRemittanceSnapshot(orderId);
    const { data: order, error: orderError } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,status,delivery_status,collection_status,merchant_id,courier_cod_remittance_mode,courier_fee_retained_amount,cash_gross_expected_amount")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new NotFoundException("Order not found.");
    if (this.normalizeDeliveryStatus((order as any).delivery_status, (order as any).status) !== "delivered") {
      throw new ForbiddenException("Cash collection can only be recorded for delivery_status=delivered.");
    }
    if (this.collectionStatusRank(String((order as any).collection_status ?? "not_collected")) > this.collectionStatusRank("collected_from_customer")) {
      throw new ForbiddenException("Collection status regression is not allowed.");
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        collection_status: "collected_from_customer",
        cash_collected_by_type: payload.collected_by_type,
        cash_collected_by_id: payload.collected_by_id ?? null,
        cash_collected_at: nowIso,
        cash_received_amount: Number(payload.amount ?? 0),
        cash_expected_amount: Number((order as any).cash_gross_expected_amount ?? (snap as any).cash_gross_expected_amount ?? 0),
        collection_notes: payload.notes ?? null,
        collection_reference: payload.reference ?? null,
      } as any)
      .eq("id", orderId);
    if (updateError) throw updateError;

    await this.appendCollectionEvent({
      order_id: orderId,
      event_type: "collected_from_customer",
      amount: Number(payload.amount ?? 0),
      actor_type: payload.collected_by_type,
      actor_id: payload.collected_by_id ?? actor.actorId ?? null,
      notes: payload.notes ?? null,
      reference: payload.reference ?? null,
      cash_collected_from_customer_amount: Number(payload.amount ?? 0),
      courier_retained_amount: Number((order as any).courier_fee_retained_amount ?? (snap as any).courier_fee_retained_amount ?? 0),
      remittance_mode: ((order as any).courier_cod_remittance_mode ??
        (snap as any).courier_cod_remittance_mode ??
        "gross_remittance") as "gross_remittance" | "net_remittance",
      extra: {
        source: "admin_endpoint",
        event: "courier_cash_collected",
      },
    });

    await this.supabaseAdmin.client.from("order_finance_events").insert({
      order_id: orderId,
      merchant_id: (order as any).merchant_id ?? null,
      event_type: "courier_cash_collected",
      created_by: actor.actorId ?? null,
      payload: {
        amount: Number(payload.amount ?? 0),
        collected_by_type: payload.collected_by_type,
      },
    } as any);

    await this.orderFinanceService.evaluatePayableTransition(orderId, actor.actorId ?? undefined);
    return { ok: true };
  }

  async markOrderRemittedToPlatform(
    orderId: string,
    payload: { notes?: string; reference?: string; amount?: number },
    actor: ActorContext,
  ) {
    const snap = await this.courierFinanceService.ensureOrderRemittanceSnapshot(orderId);
    const { data: order, error: orderError } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,status,delivery_status,collection_status,merchant_id,delivery_company_id,courier_cod_remittance_mode,cash_gross_expected_amount,cash_net_expected_from_courier,courier_fee_retained_amount,courier_fee_offset_applied,courier_fee_payable,courier_settlement_status",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new NotFoundException("Order not found.");
    if (this.normalizeDeliveryStatus((order as any).delivery_status, (order as any).status) !== "delivered") {
      throw new ForbiddenException("Platform remittance can only be recorded for delivery_status=delivered.");
    }
    if (this.collectionStatusRank(String((order as any).collection_status ?? "not_collected")) > this.collectionStatusRank("remitted_to_platform")) {
      throw new ForbiddenException("Collection status regression is not allowed.");
    }

    const mode = ((order as any).courier_cod_remittance_mode ??
      (snap as any).courier_cod_remittance_mode ??
      "gross_remittance") as "gross_remittance" | "net_remittance";
    const expectedForMode = Number(
      mode === "net_remittance"
        ? (order as any).cash_net_expected_from_courier ?? (snap as any).cash_net_expected_from_courier ?? 0
        : (order as any).cash_gross_expected_amount ?? (snap as any).cash_gross_expected_amount ?? 0,
    );
    const remittedAmount = Number(payload.amount ?? expectedForMode);
    const difference = remittedAmount - expectedForMode;
    if (difference !== 0 && !String(payload.notes ?? "").trim()) {
      throw new BadRequestException("notes are required when remitted amount differs from expected.");
    }

    const offsetApplied = mode === "net_remittance" && Number((order as any).courier_fee_retained_amount ?? 0) > 0;
    const courierRetained = Number((order as any).courier_fee_retained_amount ?? (snap as any).courier_fee_retained_amount ?? 0);

    // Phase 5: use the atomic RPC — order fields + collection_event_log + ledger updates in one PG transaction.
    const idempotencyKey = `remit-platform-${orderId}`;
    const { error: rpcError } = await this.supabaseAdmin.client.rpc("process_cod_remittance_to_platform" as any, {
      p_order_id: orderId,
      p_actor_id: actor.actorId ?? null,
      p_remitted_amount: remittedAmount,
      p_expected_amount: expectedForMode,
      p_difference: difference,
      p_mode: mode,
      p_offset_applied: offsetApplied,
      p_notes: payload.notes ?? null,
      p_reference: payload.reference ?? null,
      p_courier_retained: courierRetained,
      p_idempotency_key: idempotencyKey,
    } as any);
    if (rpcError) throw rpcError;

    // Finance evaluation runs after the atomic commit (idempotent, has own state guards).
    await this.orderFinanceService.evaluatePayableTransition(orderId, actor.actorId ?? undefined);
    return { ok: true };
  }

  async markOrderRemittedToMerchant(
    orderId: string,
    payload: { notes?: string; reference?: string; amount?: number },
    actor: ActorContext,
  ) {
    const { data: order, error: orderError } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,status,delivery_status,collection_status,payment_method")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new NotFoundException("Order not found.");

    // Phase 6: strict pre-conditions before marking payable to merchant.
    const deliveryStatus = this.normalizeDeliveryStatus((order as any).delivery_status, (order as any).status);
    if (deliveryStatus !== "delivered") {
      throw new ForbiddenException("Merchant can only be paid after order is delivered (delivery_status=delivered).");
    }
    const collectionStatus = String((order as any).collection_status ?? "not_collected");
    const paymentMethod = String((order as any).payment_method ?? "");
    // For COD orders, platform must have received the cash before paying the merchant.
    if (paymentMethod === "cod" && collectionStatus !== "remitted_to_platform") {
      throw new ForbiddenException("Merchant cannot be paid until courier remittance to platform is confirmed (collection_status=remitted_to_platform).");
    }
    if (this.collectionStatusRank(collectionStatus) > this.collectionStatusRank("remitted_to_merchant")) {
      throw new ForbiddenException("Collection status regression is not allowed.");
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        collection_status: "remitted_to_merchant",
        remitted_to_merchant_at: nowIso,
        collection_notes: payload.notes ?? null,
        collection_reference: payload.reference ?? null,
      } as any)
      .eq("id", orderId);
    if (updateError) throw updateError;

    await this.appendCollectionEvent({
      order_id: orderId,
      event_type: "remitted_to_merchant",
      amount: payload.amount,
      actor_type: "admin",
      actor_id: actor.actorId ?? null,
      notes: payload.notes ?? null,
      reference: payload.reference ?? null,
      extra: { source: "admin_endpoint" },
    });

    await this.orderFinanceService.evaluatePayableTransition(orderId, actor.actorId ?? undefined);
    return { ok: true };
  }

  async settleOrderCourier(orderId: string, payload: { notes?: string; reference?: string }, actor: ActorContext) {
    return this.courierFinanceService.settleOrderCourier(orderId, payload, actor.actorId ?? undefined);
  }

  async markOrderFinanceDisputed(orderId: string, payload: { reason_code: string; notes?: string }, actor: ActorContext) {
    if (!payload.reason_code?.trim()) throw new ForbiddenException("reason_code is required.");
    const { error } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        settlement_status: "disputed",
      } as any)
      .eq("id", orderId);
    if (error) throw error;

    const { error: ledgerError } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .update({ status: "disputed" } as any)
      .eq("order_id", orderId)
      .neq("status", "settled");
    if (ledgerError) throw ledgerError;

    const { error: eventError } = await this.supabaseAdmin.client.from("order_finance_events").insert({
      order_id: orderId,
      event_type: "order_disputed",
      created_by: actor.actorId ?? null,
      payload: {
        reason_code: payload.reason_code,
        notes: payload.notes ?? null,
      },
    } as any);
    if (eventError) throw eventError;

    await this.courierFinanceService.markOrderCourierDisputed(orderId, actor.actorId ?? undefined, payload.reason_code);

    return { ok: true };
  }

  async listOrderCollectionEvents(orderId: string, limit = 100) {
    const { data, error } = await this.supabaseAdmin.client
      .from("collection_event_log")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 300));
    if (error) throw error;
    return { events: data ?? [] };
  }

  async getOrderJenniIntegration(orderId: string) {
    return this.jenniSyncService.getIntegrationByOrderId(orderId);
  }

  async dispatchOrderToJenni(orderId: string, actor: ActorContext) {
    return this.jenniDispatchService.dispatchOrderToJenni(orderId, actor.actorId);
  }

  async syncOrderFromJenni(orderId: string) {
    return this.jenniSyncService.syncOrderFromJenni(orderId);
  }

  async syncJenniReferenceData(payload?: {
    dry_run?: boolean;
    sync_cities?: boolean;
    copy_existing_governorate_prices?: boolean;
  }) {
    return this.jenniReferenceSyncService.syncReferenceData(payload ?? {});
  }

  async assignOrderToDeliveryCompany(orderId: string, deliveryCompanyId: string, actor: ActorContext) {
    return this.deliveryOperationsService.assignOrderToDeliveryCompany(orderId, deliveryCompanyId, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async assignOrderToAgent(orderId: string, agentId: string, actor: ActorContext) {
    return this.deliveryOperationsService.assignOrderToAgent(orderId, agentId, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async markOrderDeliveryPickedUp(orderId: string, actor: ActorContext) {
    return this.deliveryOperationsService.markPickedUp(orderId, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async markOrderDeliveryInTransit(orderId: string, actor: ActorContext) {
    return this.deliveryOperationsService.markInTransit(orderId, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async markOrderDeliveryDelivered(orderId: string, actor: ActorContext) {
    return this.deliveryOperationsService.markDelivered(orderId, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async markOrderDeliveryFailed(orderId: string, payload: { reason_code: string; notes?: string }, actor: ActorContext) {
    return this.deliveryOperationsService.markFailed(orderId, payload.reason_code, payload.notes, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async markOrderReturned(orderId: string, payload: { reason_code?: string; notes?: string }, actor: ActorContext) {
    return this.deliveryOperationsService.markReturned(orderId, payload.reason_code, payload.notes, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async markOrderDeliveryCancelled(orderId: string, payload: { notes?: string }, actor: ActorContext) {
    return this.deliveryOperationsService.markCancelled(orderId, payload.notes, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async addOrderDeliveryNote(orderId: string, notes: string, actor: ActorContext) {
    return this.deliveryOperationsService.addDeliveryNote(orderId, notes, {
      actorId: actor.actorId,
      actorType: "admin",
    });
  }

  async listOrderDeliveryEvents(orderId: string, limit = 100) {
    return this.deliveryOperationsService.listDeliveryEvents(orderId, limit);
  }

  async listDeliveryOperations(payload?: {
    delivery_status?: string;
    delivery_company_id?: string;
    agent_id?: string;
    sla_breached?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) {
    return this.deliveryOperationsService.listDeliveryOperations(payload);
  }

  async listDeliveryIntelligenceQueue(payload?: { limit?: number }) {
    return this.deliveryIntelligenceService.listQueue(payload);
  }

  async getOrderDeliveryIntelligence(orderId: string) {
    return this.deliveryIntelligenceService.getOrderIntelligence(orderId);
  }

  async createManualAdjustment(
    payload: {
      merchant_id: string;
      direction: "credit" | "debit";
      amount: number;
      reason_code: string;
      description?: string | null;
      reference_id?: string | null;
      currency_code?: string;
    },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId ?? null;
    const safeAmount = Math.max(0, Number(payload.amount ?? 0));
    if (!safeAmount) throw new ForbiddenException("Adjustment amount must be greater than zero.");
    if (!payload.reason_code?.trim()) throw new ForbiddenException("reason_code is required.");

    const idempotencyKey = `manual_adjustment:${payload.merchant_id}:${payload.direction}:${safeAmount}:${payload.reason_code}:${payload.reference_id ?? ""}`;
    const row = {
      merchant_id: payload.merchant_id,
      order_id: null,
      entry_type: "manual_adjustment",
      direction: payload.direction,
      amount: safeAmount,
      currency_code: payload.currency_code ?? "IQD",
      status: "payable",
      description: payload.description ?? "Manual finance adjustment",
      reference_type: "manual_adjustment",
      reference_id: payload.reference_id ?? null,
      idempotency_key: idempotencyKey,
      reversal_reason_code: payload.reason_code,
      metadata: {
        reason_code: payload.reason_code,
        created_from: "admin_manual_adjustment",
      },
      created_by: actorId,
    };

    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .upsert(row as any, { onConflict: "idempotency_key" })
      .select("*")
      .single();
    if (error) throw error;

    const { error: eventError } = await this.supabaseAdmin.client.from("order_finance_events").insert({
      order_id: null,
      merchant_id: payload.merchant_id,
      event_type: "manual_adjustment_created",
      created_by: actorId,
      payload: {
        ledger_entry_id: (data as any).id,
        direction: payload.direction,
        amount: safeAmount,
        reason_code: payload.reason_code,
      },
    } as any);
    if (eventError) throw eventError;

    return { ok: true, entry: data };
  }

  async reverseFinanceEntry(
    ledgerEntryId: string,
    payload: { reason_code: string; description?: string | null },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId ?? null;
    const reasonCode = String(payload.reason_code ?? "").trim();
    if (!reasonCode) throw new ForbiddenException("reason_code is required.");

    const { data: source, error: sourceError } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .select("*")
      .eq("id", ledgerEntryId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new NotFoundException("Ledger entry not found.");
    if ((source as any).status === "reversed") throw new ForbiddenException("Entry is already reversed.");
    if ((source as any).entry_type === "payout") throw new ForbiddenException("Payout entries require payout reversal flow.");

    const reversalDirection = (source as any).direction === "credit" ? "debit" : "credit";
    const idempotencyKey = `reverse_ledger:${ledgerEntryId}:${reasonCode}`;
    const reversalRow = {
      merchant_id: (source as any).merchant_id,
      order_id: (source as any).order_id ?? null,
      entry_type: "refund_reversal",
      direction: reversalDirection,
      amount: Number((source as any).amount ?? 0),
      currency_code: (source as any).currency_code ?? "IQD",
      status: "reversed",
      description: payload.description ?? `Reversal for ledger ${ledgerEntryId}`,
      reference_type: "ledger_reversal",
      reference_id: ledgerEntryId,
      idempotency_key: idempotencyKey,
      reversal_reason_code: reasonCode,
      metadata: { reversed_ledger_entry_id: ledgerEntryId, reason_code: reasonCode },
      created_by: actorId,
    };

    const { data: inserted, error: insertError } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .upsert(reversalRow as any, { onConflict: "idempotency_key" })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const { error: updateError } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .update({ status: "reversed", settled_at: new Date().toISOString() } as any)
      .eq("id", ledgerEntryId);
    if (updateError) throw updateError;

    const { error: eventError } = await this.supabaseAdmin.client.from("order_finance_events").insert({
      order_id: (source as any).order_id ?? null,
      merchant_id: (source as any).merchant_id,
      event_type: "ledger_entry_reversed",
      created_by: actorId,
      payload: {
        source_entry_id: ledgerEntryId,
        reversal_entry_id: (inserted as any).id,
        reason_code: reasonCode,
      },
    } as any);
    if (eventError) throw eventError;

    return { ok: true, source_entry_id: ledgerEntryId, reversal_entry: inserted };
  }

  async listOrderFinanceEvents(params: { order_id?: string; merchant_id?: string; limit?: number }) {
    let req = this.supabaseAdmin.client
      .from("order_finance_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params.limit ?? 100, 1), 500));
    if (params.order_id) req = req.eq("order_id", params.order_id);
    if (params.merchant_id) req = req.eq("merchant_id", params.merchant_id);
    const { data, error } = await req;
    if (error) throw error;
    return { events: data ?? [] };
  }

  async listOutboundDispatchAttempts(params?: { limit?: number; only_failed?: boolean }) {
    return this.notificationsService.listOutboundDispatchAttempts(params);
  }

  async getOutboundDiagnostics(params?: { window_hours?: number; limit?: number }) {
    return this.notificationsService.getOutboundDiagnostics(params);
  }

  async replayOutboundDispatch(
    payload: {
      dispatch_key: string;
      alert_id: string;
      alert_type: string;
      alert_title: string;
      alert_message: string;
      alert_link?: string | null;
    },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;
    const replayResult = await this.notificationsService.replayOutboundDispatch({ ...payload, actor_id: actorId || null });
    await this.auditService.log({
      eventType: "ADMIN_ACTION",
      actor: { actorId, actorRole },
      resource: { type: "outbound_dispatch", id: payload.dispatch_key },
      payload: {
        action: "manual_replay",
        ok: replayResult.ok,
        blocked_by_policy: Boolean((replayResult as { blocked_by_policy?: boolean }).blocked_by_policy),
        reason: (replayResult as { reason?: string }).reason ?? null,
      },
    });
    return replayResult;
  }

  async listDeadLetters(params?: { limit?: number; state?: "new" | "retrying" | "dead_lettered" | "resolved" }) {
    return this.notificationsService.listDeadLetters(params);
  }

  async transitionDeadLetter(
    payload: { dispatch_key: string; state: "new" | "retrying" | "dead_lettered" | "resolved"; reason?: string | null },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;
    const result = await this.notificationsService.transitionDeadLetter({
      dispatch_key: payload.dispatch_key,
      state: payload.state,
      reason: payload.reason ?? null,
      actor_id: actorId || null,
    });
    await this.auditService.log({
      eventType: "ADMIN_ACTION",
      actor: { actorId, actorRole },
      resource: { type: "outbound_dead_letter", id: payload.dispatch_key },
      payload: { action: "lifecycle_transition", state: payload.state, ok: result.ok, reason: payload.reason ?? null },
    });
    return result;
  }

  async listMerchantPlans(params?: { active?: boolean }) {
    let req = this.supabaseAdmin.client.from("merchant_plans").select("*").order("created_at", { ascending: false });
    if (typeof params?.active === "boolean") req = req.eq("is_active", params.active);
    const { data, error } = await req;
    if (error) throw error;
    return { plans: data ?? [] };
  }

  async createMerchantPlan(payload: {
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
    const row = {
      ...payload,
      default_assisted_fee_rate: Number(payload.default_assisted_fee_rate ?? 0),
      default_platform_fee_rate: Number(payload.default_platform_fee_rate ?? 0),
      default_delivery_billing_mode: payload.default_delivery_billing_mode ?? "customer_pays",
      features: payload.features ?? {},
      is_active: payload.is_active ?? true,
    };
    const { data, error } = await this.supabaseAdmin.client.from("merchant_plans").insert(row as any).select("*").single();
    if (error) throw error;
    return { ok: true, plan: data };
  }

  async updateMerchantPlan(
    planId: string,
    payload: Partial<{
      name: string;
      code: string;
      default_commission_type: "percentage" | "fixed" | "hybrid";
      default_commission_rate: number;
      default_assisted_fee_rate: number;
      default_platform_fee_rate: number;
      default_delivery_billing_mode: "customer_pays" | "merchant_pays" | "mixed";
      features: Record<string, unknown>;
      is_active: boolean;
    }>,
  ) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_plans")
      .update({ ...payload, updated_at: new Date().toISOString() } as any)
      .eq("id", planId)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, plan: data };
  }

  async createMerchantPlanAssignment(payload: {
    merchant_id: string;
    plan_id: string;
    start_at?: string;
    end_at?: string | null;
    is_active?: boolean;
  }) {
    if (payload.is_active ?? true) {
      const { error: deactivateError } = await this.supabaseAdmin.client
        .from("merchant_plan_assignments")
        .update({ is_active: false, updated_at: new Date().toISOString() } as any)
        .eq("merchant_id", payload.merchant_id)
        .eq("is_active", true);
      if (deactivateError) throw deactivateError;
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_plan_assignments")
      .insert({
        merchant_id: payload.merchant_id,
        plan_id: payload.plan_id,
        start_at: payload.start_at ?? new Date().toISOString(),
        end_at: payload.end_at ?? null,
        is_active: payload.is_active ?? true,
      } as any)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, assignment: data };
  }

  async listMerchantPlanAssignments(params?: { merchant_id?: string; active?: boolean; limit?: number }) {
    let req = this.supabaseAdmin.client
      .from("merchant_plan_assignments")
      .select("*,merchants(display_name),merchant_plans(name,code)")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params?.limit ?? 200, 1), 500));
    if (params?.merchant_id) req = req.eq("merchant_id", params.merchant_id);
    if (typeof params?.active === "boolean") req = req.eq("is_active", params.active);
    const { data, error } = await req;
    if (error) throw error;
    return { assignments: data ?? [] };
  }

  async updateMerchantPlanAssignment(
    assignmentId: string,
    payload: Partial<{ plan_id: string; start_at: string; end_at: string | null; is_active: boolean }>,
  ) {
    const { data: existing, error: existingError } = await this.supabaseAdmin.client
      .from("merchant_plan_assignments")
      .select("id,merchant_id")
      .eq("id", assignmentId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) throw new NotFoundException("Plan assignment not found.");

    if (payload.is_active === true) {
      const { error: deactivateError } = await this.supabaseAdmin.client
        .from("merchant_plan_assignments")
        .update({ is_active: false, updated_at: new Date().toISOString() } as any)
        .eq("merchant_id", (existing as any).merchant_id)
        .eq("is_active", true)
        .neq("id", assignmentId);
      if (deactivateError) throw deactivateError;
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_plan_assignments")
      .update({ ...payload, updated_at: new Date().toISOString() } as any)
      .eq("id", assignmentId)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, assignment: data };
  }

  private readonly allowedCommercialConditionChannels = new Set(["web_checkout", "whatsapp_assisted", "manual_assisted", "customer_app_checkout"]);

  /** M13-R: reject hybrid, invalid values, inconsistent scope, bad condition enums, unknown categories. */
  private async validateCommercialRuleRow(row: Record<string, any>) {
    const valueType = String(row.value_type ?? "percentage").toLowerCase();
    if (valueType === "hybrid") {
      throw new BadRequestException("value_type 'hybrid' is not supported. Use percentage or fixed only.");
    }
    if (valueType !== "percentage" && valueType !== "fixed") {
      throw new BadRequestException("value_type must be percentage or fixed.");
    }
    const value = Number(row.value ?? 0);
    if (!Number.isFinite(value)) throw new BadRequestException("value must be a finite number.");
    if (valueType === "percentage" && (value < 0 || value > 100)) {
      throw new BadRequestException("percentage value must be between 0 and 100.");
    }
    if (valueType === "fixed" && value < 0) {
      throw new BadRequestException("fixed value must be >= 0.");
    }

    const scope = String(row.scope_type ?? "");
    const scopeRef = row.scope_reference_id ? String(row.scope_reference_id).trim() : "";
    const conditions = (row.conditions ?? {}) as Record<string, unknown>;

    if (scope === "merchant" && !scopeRef) {
      throw new BadRequestException("scope_type merchant requires scope_reference_id (merchant UUID).");
    }
    if ((scope === "merchant_category" || scope === "merchant_channel") && !scopeRef) {
      throw new BadRequestException(`${scope} requires scope_reference_id (merchant UUID).`);
    }
    if (scope === "merchant_category") {
      const cid = conditions.category_id != null ? String(conditions.category_id).trim() : "";
      if (!cid) throw new BadRequestException("merchant_category requires conditions.category_id.");
    }
    if (scope === "merchant_channel") {
      const chCond = conditions.channel != null ? String(conditions.channel).trim() : "";
      if (!chCond) throw new BadRequestException("merchant_channel requires conditions.channel.");
    }
    if (scope === "channel") {
      const chCond = conditions.channel != null ? String(conditions.channel).trim() : "";
      if (!chCond) throw new BadRequestException("channel scope requires conditions.channel.");
    }
    if (scope === "category") {
      const catInCond = conditions.category_id != null ? String(conditions.category_id).trim() : "";
      if (!scopeRef && !catInCond) {
        throw new BadRequestException("scope_type category requires scope_reference_id or conditions.category_id.");
      }
    }

    const ch = conditions.channel;
    if (ch !== undefined && ch !== null && String(ch).trim() !== "") {
      const cs = String(ch).trim().toLowerCase();
      if (!this.allowedCommercialConditionChannels.has(cs)) {
        throw new BadRequestException(`conditions.channel must be one of: ${[...this.allowedCommercialConditionChannels].join(", ")}`);
      }
    }

    const categoryIdsToCheck = new Set<string>();
    const condCat = conditions.category_id != null ? String(conditions.category_id).trim() : "";
    if (condCat) categoryIdsToCheck.add(condCat);
    if (scope === "category" && scopeRef) categoryIdsToCheck.add(scopeRef);
    if (scope === "merchant_category" && condCat) categoryIdsToCheck.add(condCat);
    for (const catId of categoryIdsToCheck) {
      const { data: cat, error: catErr } = await this.supabaseAdmin.client.from("categories").select("id").eq("id", catId).maybeSingle();
      if (catErr) throw catErr;
      if (!cat) throw new BadRequestException(`Unknown category id: ${catId}`);
    }

    const startMs = new Date(String(row.start_at)).getTime();
    const endMs = row.end_at != null && String(row.end_at).trim() !== "" ? new Date(String(row.end_at)).getTime() : null;
    if (Number.isNaN(startMs)) throw new BadRequestException("Invalid start_at.");
    if (endMs !== null) {
      if (Number.isNaN(endMs)) throw new BadRequestException("Invalid end_at.");
      if (endMs < startMs) throw new BadRequestException("end_at cannot be before start_at.");
    }
    if (row.is_active !== false && endMs !== null && endMs < Date.now()) {
      throw new BadRequestException("An active rule cannot have end_at in the past.");
    }
  }

  async listCommercialRules(params?: { rule_type?: string; scope_type?: string; is_active?: boolean }) {
    let req = this.supabaseAdmin.client.from("commercial_rules").select("*").order("priority", { ascending: false }).limit(500);
    if (params?.rule_type) req = req.eq("rule_type", params.rule_type);
    if (params?.scope_type) req = req.eq("scope_type", params.scope_type);
    if (typeof params?.is_active === "boolean") req = req.eq("is_active", params.is_active);
    const { data, error } = await req;
    if (error) throw error;
    return { rules: data ?? [] };
  }

  async createCommercialRule(payload: {
    name: string;
    rule_type: "commission" | "assisted_fee" | "platform_fee" | "delivery_billing";
    scope_type: "global" | "merchant" | "category" | "channel" | "merchant_category" | "merchant_channel";
    scope_reference_id?: string | null;
    priority?: number;
    value_type?: "percentage" | "fixed";
    value: number;
    conditions?: Record<string, unknown>;
    is_active?: boolean;
    start_at?: string;
    end_at?: string | null;
    created_by?: string | null;
  }) {
    const row = {
      ...payload,
      priority: Number(payload.priority ?? 0),
      value_type: payload.value_type ?? "percentage",
      is_active: payload.is_active ?? true,
      start_at: payload.start_at ?? new Date().toISOString(),
      end_at: payload.end_at ?? null,
      conditions: payload.conditions ?? {},
    };
    await this.validateCommercialRuleRow(row as any);

    let dupQuery = this.supabaseAdmin.client
      .from("commercial_rules")
      .select("id", { count: "exact", head: true })
      .eq("rule_type", row.rule_type)
      .eq("scope_type", row.scope_type)
      .eq("is_active", true);
    dupQuery = row.scope_reference_id != null && String(row.scope_reference_id).trim() !== ""
      ? dupQuery.eq("scope_reference_id", row.scope_reference_id)
      : dupQuery.is("scope_reference_id", null);
    const { count: dupCount, error: dupErr } = await dupQuery;
    if (!dupErr && dupCount && dupCount > 0) {
      this.logger.warn(
        `M13-R: possible duplicate commercial rule (rule_type=${row.rule_type}, scope_type=${row.scope_type}, scope_reference_id set=${!!row.scope_reference_id}).`,
      );
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("commercial_rules")
      .insert({
        ...payload,
        priority: row.priority,
        value_type: row.value_type,
        is_active: row.is_active,
        start_at: row.start_at,
        end_at: row.end_at,
        conditions: row.conditions,
      } as any)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, rule: data };
  }

  async updateCommercialRule(
    ruleId: string,
    payload: Partial<{
      name: string;
      scope_reference_id: string | null;
      priority: number;
      value_type: "percentage" | "fixed";
      value: number;
      conditions: Record<string, unknown>;
      is_active: boolean;
      start_at: string;
      end_at: string | null;
    }>,
  ) {
    const { data: existing, error: loadError } = await this.supabaseAdmin.client.from("commercial_rules").select("*").eq("id", ruleId).maybeSingle();
    if (loadError) throw loadError;
    if (!existing) throw new NotFoundException("Commercial rule not found.");
    const merged = { ...(existing as any), ...payload };
    await this.validateCommercialRuleRow(merged);

    const { data, error } = await this.supabaseAdmin.client
      .from("commercial_rules")
      .update({ ...payload, updated_at: new Date().toISOString() } as any)
      .eq("id", ruleId)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, rule: data };
  }

  async setCommercialRuleActive(ruleId: string, isActive: boolean) {
    if (isActive) {
      const { data: existing, error: loadError } = await this.supabaseAdmin.client.from("commercial_rules").select("*").eq("id", ruleId).maybeSingle();
      if (loadError) throw loadError;
      if (!existing) throw new NotFoundException("Commercial rule not found.");
      await this.validateCommercialRuleRow({ ...(existing as any), is_active: true });
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("commercial_rules")
      .update({ is_active: isActive, updated_at: new Date().toISOString() } as any)
      .eq("id", ruleId)
      .select("*")
      .single();
    if (error) throw error;
    return { ok: true, rule: data };
  }

  // ── Merchant Commercial Agreement (plain-language admin layer over commercial_rules) ──────
  //
  // Normal admins manage a merchant's negotiated agreement by merchant identity only — no rule
  // UUIDs, no scope/priority/JSON mechanics. Under the hood this still writes merchant-scoped
  // (scope_type='merchant') commercial_rules rows — the same rows already used for e.g. Al Arsh's
  // 15% — so there is exactly one source of truth for commission resolution. Versioning (current /
  // upcoming / history) and overlap-prevention, ACROSS every term submitted in one save, are
  // handled inside a single call to the `admin_schedule_merchant_commercial_agreement` Postgres
  // function — one database transaction, so a save can never leave a merchant with only some of
  // its terms applied.

  private readonly merchantAgreementRuleTypes = ["commission", "assisted_fee", "platform_fee", "delivery_billing"] as const;

  private commercialRuleValueTypeError = "value_type must be percentage or fixed.";

  private toAgreementTermView(row: CommercialRuleRow | null) {
    if (!row) return null;
    return {
      id: row.id,
      rule_type: row.rule_type,
      value_type: row.value_type,
      value: Number(row.value ?? 0),
      delivery_billing_mode: row.rule_type === "delivery_billing" ? ((row.conditions ?? {}).delivery_billing_mode ?? null) : undefined,
      effective_from: row.start_at,
      effective_to: row.end_at,
      created_at: row.created_at,
      created_by: row.created_by,
    };
  }

  /** Parses a DB timestamp to epoch ms. `timestamptz` round-trips through PostgREST with an
   *  offset suffix (e.g. `+00:00`), not necessarily `Z`, so comparing raw strings lexicographically
   *  is unreliable — always compare parsed epoch milliseconds instead. Unparseable input is treated
   *  as "never" (NaN sorts last / fails every comparison) rather than throwing, so one bad row can't
   *  crash the whole agreement view. */
  private toEpochMs(value: string | null | undefined): number {
    if (!value) return NaN;
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? NaN : ms;
  }

  async getMerchantCommercialAgreement(merchantId: string) {
    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id,display_name")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) throw new NotFoundException("Merchant not found.");

    const nowMs = Date.now();
    const { data, error } = await this.supabaseAdmin.client
      .from("commercial_rules")
      .select("*")
      .eq("scope_type", "merchant")
      .eq("scope_reference_id", merchantId)
      .in("rule_type", this.merchantAgreementRuleTypes as unknown as string[])
      .order("start_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    const rows = (data ?? []) as CommercialRuleRow[];

    const isCurrent = (r: CommercialRuleRow) => {
      const startMs = this.toEpochMs(r.start_at);
      const endMs = this.toEpochMs(r.end_at);
      return r.is_active && startMs <= nowMs && (r.end_at == null || endMs > nowMs);
    };
    const isUpcoming = (r: CommercialRuleRow) => r.is_active && this.toEpochMs(r.start_at) > nowMs;

    const bucket = (ruleType: string) => {
      const list = rows.filter((r) => r.rule_type === ruleType);
      const current = list.find(isCurrent) ?? null;
      const upcoming = list.filter(isUpcoming).sort((a, b) => this.toEpochMs(a.start_at) - this.toEpochMs(b.start_at))[0] ?? null;
      const history = list
        .filter((r) => r.id !== current?.id && r.id !== upcoming?.id)
        .sort((a, b) => this.toEpochMs(b.start_at) - this.toEpochMs(a.start_at));
      return { current, upcoming, history };
    };

    const commission = bucket("commission");
    const assistedFee = bucket("assisted_fee");
    const platformFee = bucket("platform_fee");
    const deliveryBilling = bucket("delivery_billing");
    const hasExplicitAgreement = commission.current != null;

    let engineFallback: { commission_rate: number; source: string } | null = null;
    if (!hasExplicitAgreement) {
      const resolved = await this.orderFinanceService.resolveCommercialTerms({ merchant_id: merchantId, channel: "web_checkout" });
      engineFallback = {
        commission_rate: resolved.commission_rate,
        source: resolved.plan_code ? `plan:${resolved.plan_code}` : "global_default",
      };
    }

    return {
      merchant_id: merchantId,
      merchant_name: (merchant as { display_name?: string | null }).display_name ?? null,
      has_explicit_agreement: hasExplicitAgreement,
      current: {
        commission: this.toAgreementTermView(commission.current),
        assisted_fee: this.toAgreementTermView(assistedFee.current),
        platform_fee: this.toAgreementTermView(platformFee.current),
        delivery_billing: this.toAgreementTermView(deliveryBilling.current),
      },
      upcoming: {
        commission: this.toAgreementTermView(commission.upcoming),
        assisted_fee: this.toAgreementTermView(assistedFee.upcoming),
        platform_fee: this.toAgreementTermView(platformFee.upcoming),
        delivery_billing: this.toAgreementTermView(deliveryBilling.upcoming),
      },
      history: [...commission.history, ...assistedFee.history, ...platformFee.history, ...deliveryBilling.history]
        .sort((a, b) => this.toEpochMs(b.start_at) - this.toEpochMs(a.start_at))
        .map((r) => this.toAgreementTermView(r)),
      // Diagnostic only — never the merchant's negotiated agreement. Shown by the UI as a clearly
      // separate "engine fallback" line only when has_explicit_agreement is false.
      engine_fallback: engineFallback,
    };
  }

  /** Distinguishes "no value supplied" from an intentional numeric 0 — `Number("")`/`Number(null)`
   *  are both `0`, so a blank/omitted commission must be rejected BEFORE that coercion, never
   *  silently treated as a 0% agreement. */
  private requireExplicitRate(value: unknown, label: string): number {
    if (value === undefined || value === null) {
      throw new BadRequestException(`${label} is required.`);
    }
    if (typeof value === "string" && value.trim() === "") {
      throw new BadRequestException(`${label} is required.`);
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      throw new BadRequestException(`${label} must be a finite number.`);
    }
    return n;
  }

  async scheduleMerchantCommercialAgreement(
    merchantId: string,
    payload: {
      commission_rate: number | string | null;
      commission_value_type?: "percentage" | "fixed";
      effective_from: string;
      assisted_fee_rate?: number | string | null;
      platform_fee_rate?: number | string | null;
      delivery_billing_mode?: "customer_pays" | "merchant_pays" | "mixed";
      replace_pending?: boolean;
    },
    actor: ActorContext,
  ) {
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;
    // The DB function requires actor identity to guarantee the audit row and the commercial-rules
    // mutation are the same transaction (see the migration) — fail closed with a clean 400 here
    // rather than letting an empty actor reach the RPC and surface as a raw Postgres error.
    if (!actorId || !actorRole) {
      throw new BadRequestException("An authenticated admin actor is required to schedule a commercial agreement.");
    }

    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) throw new NotFoundException("Merchant not found.");

    // A bare "YYYY-MM-DD" here would parse as UTC midnight, not the Iraqi commercial calendar day
    // it's meant to represent (Baghdad is UTC+3) — every caller must send a full instant, already
    // converted once, correctly, at the point of user input (see src/lib/baghdad-time.ts on the
    // frontend). Reject the ambiguous bare-date form outright instead of silently accepting it.
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(payload.effective_from ?? "").trim())) {
      throw new BadRequestException(
        "effective_from must be a full timestamp (already converted to Asia/Baghdad semantics), not a bare date.",
      );
    }
    const effectiveFrom = new Date(payload.effective_from);
    if (Number.isNaN(effectiveFrom.getTime())) {
      throw new BadRequestException("effective_from must be a valid date.");
    }

    const commissionValueType = payload.commission_value_type ?? "percentage";
    if (commissionValueType !== "percentage" && commissionValueType !== "fixed") {
      throw new BadRequestException(this.commercialRuleValueTypeError);
    }
    const commissionRate = this.requireExplicitRate(payload.commission_rate, "commission_rate");
    if (commissionValueType === "percentage" && (commissionRate < 0 || commissionRate > 100)) {
      throw new BadRequestException("commission_rate must be between 0 and 100.");
    }
    if (commissionValueType === "fixed" && commissionRate < 0) {
      throw new BadRequestException("commission_rate must be >= 0 for a fixed agreement.");
    }

    type AgreementTerm = { rule_type: string; value_type: "percentage" | "fixed"; value: number; conditions?: Record<string, unknown> };
    const terms: AgreementTerm[] = [{ rule_type: "commission", value_type: commissionValueType, value: commissionRate }];

    if (payload.assisted_fee_rate !== undefined) {
      const v = this.requireExplicitRate(payload.assisted_fee_rate, "assisted_fee_rate");
      if (v < 0 || v > 100) throw new BadRequestException("assisted_fee_rate must be between 0 and 100.");
      terms.push({ rule_type: "assisted_fee", value_type: "percentage", value: v });
    }
    if (payload.platform_fee_rate !== undefined) {
      const v = this.requireExplicitRate(payload.platform_fee_rate, "platform_fee_rate");
      if (v < 0 || v > 100) throw new BadRequestException("platform_fee_rate must be between 0 and 100.");
      terms.push({ rule_type: "platform_fee", value_type: "percentage", value: v });
    }
    if (payload.delivery_billing_mode !== undefined) {
      if (!["customer_pays", "merchant_pays", "mixed"].includes(payload.delivery_billing_mode)) {
        throw new BadRequestException("delivery_billing_mode must be customer_pays, merchant_pays, or mixed.");
      }
      terms.push({
        rule_type: "delivery_billing",
        value_type: "fixed",
        value: 0,
        conditions: { delivery_billing_mode: payload.delivery_billing_mode },
      });
    }

    const replacePending = payload.replace_pending ?? false;
    // The RPC captures the previous/replaced-pending state itself (from the same locked rows it
    // mutates) and writes the audit_logs row in the SAME transaction as the commercial_rules
    // writes — see the migration. No separate application-level audit call for this event: that
    // would risk a second, duplicate record, or a committed mutation with a failed/unlogged audit
    // write if the two calls diverged.
    const { error } = await this.supabaseAdmin.client.rpc("admin_schedule_merchant_commercial_agreement", {
      p_merchant_id: merchantId,
      p_effective_from: effectiveFrom.toISOString(),
      p_terms: terms,
      p_actor_id: actorId,
      p_actor_role: actorRole,
      p_replace_pending: replacePending,
    });
    if (error) {
      const pgError = error as { code?: string; message?: string };
      const message = String(pgError.message ?? "");
      if (pgError.code === "23P01" || message.includes("already exists") || message.includes("different end date")) {
        throw new ConflictException(message || "The new agreement overlaps an existing one for this merchant.");
      }
      throw error;
    }

    return this.getMerchantCommercialAgreement(merchantId);
  }

  async listDesktopQuickLinks() {
    return this.adminOperationalAlertsService.listDesktopQuickLinks();
  }

  async createDesktopQuickLink(payload: { label: string; href: string; sort_order: number; is_active: boolean }) {
    return this.adminOperationalAlertsService.createDesktopQuickLink(payload);
  }

  async updateDesktopQuickLink(id: string, payload: Partial<{ label: string; href: string; sort_order: number; is_active: boolean }>) {
    return this.adminOperationalAlertsService.updateDesktopQuickLink(id, payload);
  }

  async deleteDesktopQuickLink(id: string) {
    return this.adminOperationalAlertsService.deleteDesktopQuickLink(id);
  }

  // ── Jenni Store Provisioning (Phase 2B) ──────────────────────────────────

  async getJenniProvisioningStatus(merchantId: string) {
    const storeStatus = await this.jenniStoreProvisioningService.getProvisioningStatus(merchantId);
    const merchantStatus = await this.jenniMerchantProvisioningService.getProvisioningStatus(merchantId);
    return {
      merchant_slug: storeStatus.merchant_slug,
      
      // Store Status
      jenni_store_id: storeStatus.jenni_store_id,
      jenni_synced_at: storeStatus.jenni_synced_at,
      jenni_sync_error: storeStatus.jenni_sync_error,
      is_linked: storeStatus.is_linked,

      // Merchant Status
      jenni_merchant_id: merchantStatus.jenni_merchant_id,
      jenni_merchant_synced_at: merchantStatus.jenni_merchant_synced_at,
      jenni_merchant_sync_error: merchantStatus.jenni_merchant_sync_error,
      is_merchant_linked: merchantStatus.is_linked,
    };
  }

  private assertProvisioningEnabled(): void {
    const allowed = String(this.configService.get("JENNI_ALLOW_STORE_PROVISIONING") ?? "").trim().toLowerCase();
    if (allowed !== "true") {
      throw new ForbiddenException(
        "Store provisioning is disabled. Set JENNI_ALLOW_STORE_PROVISIONING=true to enable.",
      );
    }
  }

  private assertMerchantProvisioningEnabled(): void {
    const allowed = String(this.configService.get("JENNI_ALLOW_MERCHANT_PROVISIONING") ?? "").trim().toLowerCase();
    if (allowed !== "true") {
      throw new ForbiddenException(
        "Merchant provisioning is disabled. Set JENNI_ALLOW_MERCHANT_PROVISIONING=true to enable.",
      );
    }
  }

  async createJenniMerchant(merchantId: string, actor: ActorContext) {
    const attemptId = `jenni-merchant-${merchantId}-${Date.now()}`;
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    this.logger.log(
      `createJenniMerchant: entry | merchantId=${merchantId} | attemptId=${attemptId} | actorId=${actorId} | actorRole=${actorRole}`
    );

    this.assertMerchantProvisioningEnabled();

    try {
      this.logger.log(
        `createJenniMerchant: calling ensureMerchantForMerchant | merchantId=${merchantId} | attemptId=${attemptId}`
      );
      const result = await this.jenniMerchantProvisioningService.ensureMerchantForMerchant(merchantId, attemptId);

      this.logger.log(
        `createJenniMerchant: success | merchantId=${merchantId} | attemptId=${attemptId} | jenni_merchant_id=${result.jenni_merchant_id} | was_created=${result.was_created}`
      );

      await this.auditService.log({
        eventType: "JENNI_MERCHANT_PROVISIONED",
        actor: { actorId, actorRole },
        resource: { type: "merchant", id: merchantId },
        payload: {
          jenni_merchant_id: result.jenni_merchant_id,
          was_created: result.was_created,
        },
      });

      return {
        ok: true,
        jenni_merchant_id: result.jenni_merchant_id,
        was_created: result.was_created,
      };
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode ?? 500;
      this.logger.error(
        `createJenniMerchant: error caught | merchantId=${merchantId} | attemptId=${attemptId} | errorClass=${err?.constructor?.name} | status=${status} | message="${err?.message}"`
      );
      throw err;
    }
  }

  async createJenniStore(merchantId: string, actor: ActorContext) {
    const attemptId = `jenni-store-${merchantId}-${Date.now()}`;
    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    this.logger.log(
      `createJenniStore: entry | merchantId=${merchantId} | attemptId=${attemptId} | actorId=${actorId} | actorRole=${actorRole}`
    );

    this.assertProvisioningEnabled();

    try {
      this.logger.log(
        `createJenniStore: calling ensureStoreForMerchant | merchantId=${merchantId} | attemptId=${attemptId}`
      );
      const result = await this.jenniStoreProvisioningService.ensureStoreForMerchant(merchantId, attemptId);

      this.logger.log(
        `createJenniStore: success | merchantId=${merchantId} | attemptId=${attemptId} | jenni_store_id=${result.jenni_store_id} | was_created=${result.was_created}`
      );

      await this.auditService.log({
        eventType: "JENNI_STORE_PROVISIONED",
        actor: { actorId, actorRole },
        resource: { type: "merchant", id: merchantId },
        payload: {
          jenni_store_id: result.jenni_store_id,
          was_created: result.was_created,
        },
      });

      return {
        ok: true,
        jenni_store_id: result.jenni_store_id,
        was_created: result.was_created,
      };
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode ?? 500;
      this.logger.error(
        `createJenniStore: error caught | merchantId=${merchantId} | attemptId=${attemptId} | errorClass=${err?.constructor?.name} | status=${status} | message="${err?.message}"`
      );
      throw err;
    }
  }

  async linkJenniStore(merchantId: string, jenniStoreId: number, actor: ActorContext) {
    this.assertProvisioningEnabled();

    const actorId = actor.actorId ?? "";
    const actorRole = actor.actorRole as AppActorRole;

    await this.jenniStoreProvisioningService.linkExistingStore(merchantId, jenniStoreId);

    await this.auditService.log({
      eventType: "JENNI_STORE_LINKED_MANUALLY",
      actor: { actorId, actorRole },
      resource: { type: "merchant", id: merchantId },
      payload: { jenni_store_id: jenniStoreId },
    });

    return { ok: true, jenni_store_id: jenniStoreId };
  }

  // ── Jenni Diagnostics (read-only, no credentials/tokens printed) ──────────

  async diagnoseJenniConnection() {
    const enabled = String(this.configService.get("JENNI_DIAGNOSTICS_ENABLED") ?? "").trim().toLowerCase();
    if (enabled !== "true") {
      throw new NotFoundException("Diagnostic endpoint is disabled.");
    }

    const authResult = await this.jenniAuthService.diagnoseAuth();

    let listStoresResult: {
      result: "OK" | "FAILED" | "SKIPPED";
      storeCount?: number;
      httpStatus?: number;
      error?: string;
    } = { result: "SKIPPED" };

    if (authResult.result === "AUTH_OK") {
      try {
        const stores = await this.jenniClientService.listStores(1, 50);
        listStoresResult = {
          result: "OK",
          storeCount: stores.data?.length ?? 0,
        };
      } catch (err: unknown) {
        listStoresResult = {
          result: "FAILED",
          error: err instanceof Error ? err.message.slice(0, 200) : "unknown error",
        };
      }
    }

    return {
      timestamp: new Date().toISOString(),
      auth: authResult,
      listStores: listStoresResult,
    };
  }
}

