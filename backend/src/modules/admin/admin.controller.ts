import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { AdminService } from "./admin.service";
import { Roles } from "../../common/authz/roles.decorator";
import { ActorContext, CurrentActor } from "../../common/authz/actor-context.decorator";
import { CreateAgentDto, UpdateLoyaltySettingsDto } from "./admin.dto";

@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("analytics/overview")
  @Roles("super_admin", "admin")
  getAnalyticsOverview() {
    return this.adminService.getAnalyticsOverview();
  }

  @Get("analytics/executive")
  @Roles("super_admin", "admin")
  getExecutiveGovernance() {
    return this.adminService.getExecutiveGovernance();
  }

  @Get("customers")
  @Roles("super_admin", "admin")
  getScopedCustomers(
    @Query("merchant_id") merchantId?: string,
    @Query("search") search?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.adminService.getScopedCustomers({
      merchant_id: merchantId,
      search,
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("agents")
  @Roles("super_admin", "admin")
  listAgents() {
    return this.adminService.listAgentsWithStats();
  }

  @Post("agents")
  @Roles("super_admin", "admin")
  createAgent(@Body() payload: CreateAgentDto, @CurrentActor() actor: ActorContext) {
    return this.adminService.createAgent(payload, actor);
  }

  @Post("agents/:id/revoke")
  @Roles("super_admin", "admin")
  revokeAgent(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.revokeAgent(id, actor);
  }

  @Get("loyalty/settings")
  @Roles("super_admin", "admin")
  getLoyaltySettings() {
    return this.adminService.getLoyaltySettings();
  }

  @Patch("loyalty/settings")
  @Roles("super_admin", "admin")
  updateLoyaltySettings(@Body() payload: UpdateLoyaltySettingsDto, @CurrentActor() actor: ActorContext) {
    return this.adminService.updateLoyaltySettings(payload, actor);
  }

  @Get("notifications")
  @Roles("super_admin", "admin")
  listNotifications() {
    return this.adminService.listAdminNotifications();
  }

  @Post("notifications/:id/read")
  @Roles("super_admin", "admin")
  markNotificationRead(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.markAdminNotificationRead(id, actor);
  }

  @Post("notifications/read-all")
  @Roles("super_admin", "admin")
  markAllNotificationsRead(@CurrentActor() actor: ActorContext) {
    return this.adminService.markAllAdminNotificationsRead(actor);
  }

  @Get("governance/tasks")
  @Roles("super_admin", "admin")
  listGovernanceTasks(@Query("task_ids") taskIdsCsv?: string) {
    const taskIds = String(taskIdsCsv ?? "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    return this.adminService.listGovernanceTasks(taskIds.length > 0 ? taskIds : undefined);
  }

  @Post("governance/tasks/:id")
  @Roles("super_admin", "admin")
  upsertGovernanceTask(
    @Param("id") id: string,
    @Body() payload: { owner?: string; deadline?: string; status: "open" | "in_progress" | "resolved" | "escalated"; note?: string },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.upsertGovernanceTask(id, payload, actor);
  }

  @Get("commercial-policy/profiles")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  listCommercialPolicyProfiles() {
    return this.adminService.listCommercialPolicyProfiles();
  }

  @Get("commercial-policy/assignment")
  @Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")
  getCommercialPolicyAssignment(
    @Query("merchant_id") merchantId?: string,
    @CurrentActor() actor?: { actorRole?: string; actorId?: string },
  ) {
    return this.adminService.getCommercialPolicyAssignment({
      merchant_id: merchantId,
      actor_role: actor?.actorRole,
      actor_id: actor?.actorId,
    });
  }

  @Post("commercial-policy/assignment/:merchantId")
  @Roles("super_admin", "admin")
  upsertCommercialPolicyAssignment(
    @Param("merchantId") merchantId: string,
    @Body() payload: { profile_id: "balanced" | "strict" },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.upsertCommercialPolicyAssignment(merchantId, payload.profile_id, actor);
  }

  @Get("reconciliation/outbound-attempts")
  @Roles("super_admin", "admin")
  listOutboundDispatchAttempts(
    @Query("limit") limit?: string,
    @Query("only_failed") onlyFailed?: string,
  ) {
    return this.adminService.listOutboundDispatchAttempts({
      limit: limit ? Number(limit) : undefined,
      only_failed: onlyFailed == null ? true : onlyFailed !== "false",
    });
  }

  @Get("reconciliation/diagnostics")
  @Roles("super_admin", "admin")
  getOutboundDiagnostics(
    @Query("window_hours") windowHours?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.getOutboundDiagnostics({
      window_hours: windowHours ? Number(windowHours) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("reconciliation/outbound-attempts/replay")
  @Roles("super_admin", "admin")
  replayOutboundDispatch(
    @Body()
    payload: {
      dispatch_key: string;
      alert_id: string;
      alert_type: string;
      alert_title: string;
      alert_message: string;
      alert_link?: string | null;
    },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.replayOutboundDispatch(payload, actor);
  }

  @Get("reconciliation/dead-letters")
  @Roles("super_admin", "admin")
  listDeadLetters(
    @Query("limit") limit?: string,
    @Query("state") state?: "new" | "retrying" | "dead_lettered" | "resolved",
  ) {
    return this.adminService.listDeadLetters({
      limit: limit ? Number(limit) : undefined,
      state,
    });
  }

  @Post("reconciliation/dead-letters/transition")
  @Roles("super_admin", "admin")
  transitionDeadLetter(
    @Body() payload: { dispatch_key: string; state: "new" | "retrying" | "dead_lettered" | "resolved"; reason?: string | null },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.transitionDeadLetter(payload, actor);
  }

  @Get("finance/orders/:id")
  @Roles("super_admin", "admin")
  getOrderFinancialDetail(@Param("id") id: string) {
    return this.adminService.getOrderFinancialDetail(id);
  }

  @Get("finance/merchant-ledger")
  @Roles("super_admin", "admin")
  listMerchantLedgerEntries(
    @Query("merchant_id") merchantId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.listMerchantLedgerEntries({
      merchant_id: merchantId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("finance/payout-batches")
  @Roles("super_admin", "admin")
  createPayoutBatch(
    @Body() payload: { merchant_id: string; period_start?: string; period_end?: string; notes?: string | null },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.createPayoutBatch(payload, actor);
  }

  @Post("finance/payout-batches/:id/approve")
  @Roles("super_admin", "admin")
  approvePayoutBatch(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.approvePayoutBatch(id, actor);
  }

  @Post("finance/payout-batches/:id/settle")
  @Roles("super_admin", "admin")
  settlePayoutBatch(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.settlePayoutBatch(id, actor);
  }

  @Get("finance/payout-batches")
  @Roles("super_admin", "admin")
  listPayoutBatches(
    @Query("merchant_id") merchantId?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.listMerchantPayoutBatches({
      merchant_id: merchantId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post("finance/courier-payout-batches")
  @Roles("super_admin", "admin")
  createCourierPayoutBatch(
    @Body() payload: { delivery_company_id: string; period_start?: string; period_end?: string; notes?: string | null },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.createCourierPayoutBatch(payload, actor);
  }

  @Get("finance/courier-payout-batches")
  @Roles("super_admin", "admin")
  listCourierPayoutBatches(
    @Query("delivery_company_id") deliveryCompanyId?: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.listCourierPayoutBatches({
      delivery_company_id: deliveryCompanyId,
      status,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("finance/courier-payout-batches/:id")
  @Roles("super_admin", "admin")
  getCourierPayoutBatchDetail(@Param("id") id: string) {
    return this.adminService.getCourierPayoutBatchDetail(id);
  }

  @Post("finance/courier-payout-batches/:id/approve")
  @Roles("super_admin", "admin")
  approveCourierPayoutBatch(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.approveCourierPayoutBatch(id, actor);
  }

  @Post("finance/courier-payout-batches/:id/settle")
  @Roles("super_admin", "admin")
  settleCourierPayoutBatch(
    @Param("id") id: string,
    @Body() payload: { reference?: string | null; notes?: string | null },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.settleCourierPayoutBatch(id, payload, actor);
  }

  @Post("finance/courier-payout-batches/:id/cancel")
  @Roles("super_admin", "admin")
  cancelCourierPayoutBatch(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.cancelCourierPayoutBatch(id, actor);
  }

  @Get("finance/courier-ledger")
  @Roles("super_admin", "admin")
  listCourierLedgerEntries(
    @Query("delivery_company_id") deliveryCompanyId: string,
    @Query("status") status?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.adminService.listCourierLedgerEntries({
      delivery_company_id: deliveryCompanyId,
      status,
      from,
      to,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Post("finance/courier-manual-adjustments")
  @Roles("super_admin", "admin")
  createCourierManualAdjustment(
    @Body()
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
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.createCourierManualAdjustment(payload, actor);
  }

  @Post("finance/courier-ledger/:id/reverse")
  @Roles("super_admin", "admin")
  reverseCourierLedgerEntry(
    @Param("id") id: string,
    @Body() payload: { reason_code: string; description?: string | null },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.reverseCourierLedgerEntry(id, payload, actor);
  }

  @Get("finance/reconciliation/orders")
  @Roles("super_admin", "admin")
  getFinancialReconciliationOrders(
    @Query("limit") limit?: string,
    @Query("merchant_id") merchantId?: string,
    @Query("status") status?: string,
  ) {
    return this.adminService.getFinancialReconciliationOrders({
      limit: limit ? Number(limit) : undefined,
      merchant_id: merchantId,
      status,
    });
  }

  @Get("finance/reconciliation/merchant-balances")
  @Roles("super_admin", "admin")
  getFinancialMerchantBalances() {
    return this.adminService.getFinancialMerchantBalances();
  }

  @Get("finance/reconciliation/courier-payables")
  @Roles("super_admin", "admin")
  getFinancialCourierPayables() {
    return this.adminService.getFinancialCourierPayables();
  }

  @Get("finance/reconciliation/courier-orders")
  @Roles("super_admin", "admin")
  getFinancialCourierOrders(
    @Query("limit") limit?: string,
    @Query("delivery_company_id") deliveryCompanyId?: string,
    @Query("status") status?: string,
  ) {
    return this.adminService.getFinancialCourierReconciliationOrders({
      limit: limit ? Number(limit) : undefined,
      delivery_company_id: deliveryCompanyId,
      status,
    });
  }

  @Get("finance/reconciliation/courier-cod-summary")
  @Roles("super_admin", "admin")
  getFinancialCourierCodSummary(@Query("delivery_company_id") deliveryCompanyId?: string) {
    return this.adminService.getFinancialCourierCodSummary(deliveryCompanyId);
  }

  @Post("finance/manual-adjustments")
  @Roles("super_admin", "admin")
  createManualAdjustment(
    @Body()
    payload: {
      merchant_id: string;
      direction: "credit" | "debit";
      amount: number;
      reason_code: string;
      description?: string | null;
      reference_id?: string | null;
      currency_code?: string;
    },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.createManualAdjustment(payload, actor);
  }

  @Post("finance/ledger/:id/reverse")
  @Roles("super_admin", "admin")
  reverseFinanceEntry(
    @Param("id") id: string,
    @Body() payload: { reason_code: string; description?: string | null },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.reverseFinanceEntry(id, payload, actor);
  }

  @Get("finance/events")
  @Roles("super_admin", "admin")
  listFinanceEvents(
    @Query("order_id") orderId?: string,
    @Query("merchant_id") merchantId?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.listOrderFinanceEvents({
      order_id: orderId,
      merchant_id: merchantId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get("merchant-plans")
  @Roles("super_admin", "admin")
  listMerchantPlans(@Query("active") active?: string) {
    return this.adminService.listMerchantPlans({ active: active == null ? undefined : active === "true" });
  }

  @Post("merchant-plans")
  @Roles("super_admin", "admin")
  createMerchantPlan(@Body() payload: any) {
    return this.adminService.createMerchantPlan(payload);
  }

  @Patch("merchant-plans/:id")
  @Roles("super_admin", "admin")
  updateMerchantPlan(@Param("id") id: string, @Body() payload: any) {
    return this.adminService.updateMerchantPlan(id, payload);
  }

  @Post("merchant-plan-assignments")
  @Roles("super_admin", "admin")
  createMerchantPlanAssignment(@Body() payload: any) {
    return this.adminService.createMerchantPlanAssignment(payload);
  }

  @Get("merchant-plan-assignments")
  @Roles("super_admin", "admin")
  listMerchantPlanAssignments(
    @Query("merchant_id") merchantId?: string,
    @Query("active") active?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.listMerchantPlanAssignments({
      merchant_id: merchantId,
      active: active == null ? undefined : active === "true",
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Patch("merchant-plan-assignments/:id")
  @Roles("super_admin", "admin")
  updateMerchantPlanAssignment(@Param("id") id: string, @Body() payload: any) {
    return this.adminService.updateMerchantPlanAssignment(id, payload);
  }

  @Get("commercial-rules")
  @Roles("super_admin", "admin")
  listCommercialRules(
    @Query("rule_type") ruleType?: string,
    @Query("scope_type") scopeType?: string,
    @Query("is_active") isActive?: string,
  ) {
    return this.adminService.listCommercialRules({
      rule_type: ruleType,
      scope_type: scopeType,
      is_active: isActive == null ? undefined : isActive === "true",
    });
  }

  @Post("commercial-rules")
  @Roles("super_admin", "admin")
  createCommercialRule(@Body() payload: any, @CurrentActor() actor: ActorContext) {
    return this.adminService.createCommercialRule({ ...payload, created_by: actor.actorId ?? null });
  }

  @Patch("commercial-rules/:id")
  @Roles("super_admin", "admin")
  updateCommercialRule(@Param("id") id: string, @Body() payload: any) {
    return this.adminService.updateCommercialRule(id, payload);
  }

  @Post("commercial-rules/:id/disable")
  @Roles("super_admin", "admin")
  disableCommercialRule(@Param("id") id: string) {
    return this.adminService.setCommercialRuleActive(id, false);
  }

  @Post("commercial-rules/:id/enable")
  @Roles("super_admin", "admin")
  enableCommercialRule(@Param("id") id: string) {
    return this.adminService.setCommercialRuleActive(id, true);
  }

  @Get("merchants/:merchantId/commercial-agreement")
  @Roles("super_admin", "admin")
  getMerchantCommercialAgreement(@Param("merchantId") merchantId: string) {
    return this.adminService.getMerchantCommercialAgreement(merchantId);
  }

  @Post("merchants/:merchantId/commercial-agreement")
  @Roles("super_admin", "admin")
  scheduleMerchantCommercialAgreement(
    @Param("merchantId") merchantId: string,
    @Body()
    payload: {
      // Intentionally not narrowed to `number` — a raw HTTP body can send "", null, or omit the
      // key entirely, and scheduleMerchantCommercialAgreement's own validation is what must reject
      // those (never silently coerce a blank/missing value to 0).
      commission_rate: number | string | null;
      commission_value_type?: "percentage" | "fixed";
      effective_from: string;
      assisted_fee_rate?: number | string | null;
      platform_fee_rate?: number | string | null;
      delivery_billing_mode?: "customer_pays" | "merchant_pays" | "mixed";
      replace_pending?: boolean;
    },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.scheduleMerchantCommercialAgreement(merchantId, payload, actor);
  }

  @Post("orders/:id/collection/collected")
  @Roles("super_admin", "admin")
  markOrderCollected(
    @Param("id") id: string,
    @Body()
    payload: {
      collected_by_type: "courier" | "delivery_company" | "platform";
      collected_by_id?: string;
      amount: number;
      notes?: string;
      reference?: string;
    },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.markOrderCashCollected(id, payload, actor);
  }

  @Post("orders/:id/collection/remit-platform")
  @Roles("super_admin", "admin")
  markOrderRemitPlatform(
    @Param("id") id: string,
    @Body() payload: { notes?: string; reference?: string; amount?: number },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.markOrderRemittedToPlatform(id, payload, actor);
  }

  @Post("orders/:id/collection/remit-merchant")
  @Roles("super_admin", "admin")
  markOrderRemitMerchant(
    @Param("id") id: string,
    @Body() payload: { notes?: string; reference?: string; amount?: number },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.markOrderRemittedToMerchant(id, payload, actor);
  }

  @Post("orders/:id/courier/settle")
  @Roles("super_admin", "admin")
  settleOrderCourier(
    @Param("id") id: string,
    @Body() payload: { notes?: string; reference?: string },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.settleOrderCourier(id, payload, actor);
  }

  @Post("orders/:id/finance/dispute")
  @Roles("super_admin", "admin")
  markOrderFinanceDispute(
    @Param("id") id: string,
    @Body() payload: { reason_code: string; notes?: string },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.markOrderFinanceDisputed(id, payload, actor);
  }

  @Post("orders/:id/courier/release-dispute")
  @Roles("super_admin", "admin")
  releaseOrderCourierDispute(@Param("id") id: string, @Body() payload: { notes?: string }, @CurrentActor() actor: ActorContext) {
    return this.adminService.releaseOrderCourierDispute(id, payload, actor);
  }

  @Get("orders/:id/collection/events")
  @Roles("super_admin", "admin")
  listOrderCollectionEvents(@Param("id") id: string, @Query("limit") limit?: string) {
    return this.adminService.listOrderCollectionEvents(id, limit ? Number(limit) : 100);
  }

  @Post("orders/:id/delivery/assign-company")
  @Roles("super_admin", "admin")
  assignOrderDeliveryCompany(@Param("id") id: string, @Body() payload: { delivery_company_id: string }, @CurrentActor() actor: ActorContext) {
    return this.adminService.assignOrderToDeliveryCompany(id, payload.delivery_company_id, actor);
  }

  @Post("orders/:id/delivery/assign-agent")
  @Roles("super_admin", "admin")
  assignOrderAgent(@Param("id") id: string, @Body() payload: { agent_id: string }, @CurrentActor() actor: ActorContext) {
    return this.adminService.assignOrderToAgent(id, payload.agent_id, actor);
  }

  @Post("orders/:id/delivery/picked-up")
  @Roles("super_admin", "admin")
  markOrderPickedUp(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.markOrderDeliveryPickedUp(id, actor);
  }

  @Post("orders/:id/delivery/in-transit")
  @Roles("super_admin", "admin")
  markOrderInTransit(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.markOrderDeliveryInTransit(id, actor);
  }

  @Post("orders/:id/delivery/delivered")
  @Roles("super_admin", "admin")
  markOrderDeliveryDelivered(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.markOrderDeliveryDelivered(id, actor);
  }

  @Post("orders/:id/delivery/failed")
  @Roles("super_admin", "admin")
  markOrderDeliveryFailed(
    @Param("id") id: string,
    @Body() payload: { reason_code: string; notes?: string },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.markOrderDeliveryFailed(id, payload, actor);
  }

  @Post("orders/:id/delivery/returned")
  @Roles("super_admin", "admin")
  markOrderReturned(@Param("id") id: string, @Body() payload: { reason_code?: string; notes?: string }, @CurrentActor() actor: ActorContext) {
    return this.adminService.markOrderReturned(id, payload, actor);
  }

  @Post("orders/:id/delivery/cancelled")
  @Roles("super_admin", "admin")
  markOrderDeliveryCancelled(@Param("id") id: string, @Body() payload: { notes?: string }, @CurrentActor() actor: ActorContext) {
    return this.adminService.markOrderDeliveryCancelled(id, payload, actor);
  }

  @Post("orders/:id/delivery/note")
  @Roles("super_admin", "admin")
  addOrderDeliveryNote(@Param("id") id: string, @Body() payload: { notes: string }, @CurrentActor() actor: ActorContext) {
    return this.adminService.addOrderDeliveryNote(id, payload.notes, actor);
  }

  @Get("orders/:id/delivery/jenni")
  @Roles("super_admin", "admin")
  getOrderJenniIntegration(@Param("id") id: string) {
    return this.adminService.getOrderJenniIntegration(id);
  }

  @Post("orders/:id/delivery/dispatch-jenni")
  @Roles("super_admin", "admin")
  dispatchOrderToJenni(@Param("id") id: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.dispatchOrderToJenni(id, actor);
  }

  @Post("orders/:id/delivery/sync-jenni")
  @Roles("super_admin", "admin")
  syncOrderFromJenni(@Param("id") id: string) {
    return this.adminService.syncOrderFromJenni(id);
  }

  @Post("delivery/jenni/sync-reference")
  @Roles("super_admin", "admin")
  syncJenniReferenceData(
    @Body()
    payload: {
      dry_run?: boolean;
      sync_cities?: boolean;
      copy_existing_governorate_prices?: boolean;
    },
  ) {
    return this.adminService.syncJenniReferenceData(payload);
  }

  @Get("orders/:id/delivery/events")
  @Roles("super_admin", "admin")
  listOrderDeliveryEvents(@Param("id") id: string, @Query("limit") limit?: string) {
    return this.adminService.listOrderDeliveryEvents(id, limit ? Number(limit) : 100);
  }

  @Get("delivery-ops")
  @Roles("super_admin", "admin")
  listDeliveryOperations(
    @Query("delivery_status") deliveryStatus?: string,
    @Query("delivery_company_id") deliveryCompanyId?: string,
    @Query("agent_id") agentId?: string,
    @Query("sla_breached") slaBreached?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.listDeliveryOperations({
      delivery_status: deliveryStatus,
      delivery_company_id: deliveryCompanyId,
      agent_id: agentId,
      sla_breached: slaBreached,
      from,
      to,
      limit: limit ? Number(limit) : 200,
    });
  }

  @Get("delivery-intelligence/queue")
  @Roles("super_admin", "admin")
  listDeliveryIntelligenceQueue(@Query("limit") limit?: string) {
    return this.adminService.listDeliveryIntelligenceQueue({
      limit: limit ? Number(limit) : 100,
    });
  }

  @Get("delivery-intelligence/orders/:id")
  @Roles("super_admin", "admin")
  getOrderDeliveryIntelligence(@Param("id") id: string) {
    return this.adminService.getOrderDeliveryIntelligence(id);
  }

  @Get("desktop-quick-links")
  @Roles("super_admin", "admin")
  listDesktopQuickLinks() {
    return this.adminService.listDesktopQuickLinks();
  }

  @Post("desktop-quick-links")
  @Roles("super_admin", "admin")
  createDesktopQuickLink(
    @Body() payload: { label: string; href: string; sort_order?: number; is_active?: boolean },
  ) {
    return this.adminService.createDesktopQuickLink({
      label: payload.label,
      href: payload.href,
      sort_order: payload.sort_order ?? 0,
      is_active: payload.is_active ?? true,
    });
  }

  @Patch("desktop-quick-links/:id")
  @Roles("super_admin", "admin")
  updateDesktopQuickLink(
    @Param("id") id: string,
    @Body() payload: Partial<{ label: string; href: string; sort_order: number; is_active: boolean }>,
  ) {
    return this.adminService.updateDesktopQuickLink(id, payload);
  }

  @Delete("desktop-quick-links/:id")
  @Roles("super_admin", "admin")
  deleteDesktopQuickLink(@Param("id") id: string) {
    return this.adminService.deleteDesktopQuickLink(id);
  }

  // ── Jenni Store Provisioning (Phase 2B) ──────────────────────────────────

  @Get("jenni/merchants/:id/provisioning-status")
  @Roles("super_admin", "admin")
  getJenniProvisioningStatus(@Param("id") merchantId: string) {
    return this.adminService.getJenniProvisioningStatus(merchantId);
  }

  @Post("jenni/merchants/:id/create-merchant")
  @Roles("super_admin", "admin")
  createJenniMerchant(@Param("id") merchantId: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.createJenniMerchant(merchantId, actor);
  }

  @Post("jenni/merchants/:id/create-store")
  @Roles("super_admin", "admin")
  createJenniStore(@Param("id") merchantId: string, @CurrentActor() actor: ActorContext) {
    return this.adminService.createJenniStore(merchantId, actor);
  }

  @Post("jenni/merchants/:id/link-store")
  @Roles("super_admin", "admin")
  linkJenniStore(
    @Param("id") merchantId: string,
    @Body() payload: { jenni_store_id: number },
    @CurrentActor() actor: ActorContext,
  ) {
    return this.adminService.linkJenniStore(merchantId, payload.jenni_store_id, actor);
  }

  @Get("jenni/diagnostics")
  @Roles("super_admin", "admin")
  diagnoseJenniConnection() {
    return this.adminService.diagnoseJenniConnection();
  }
}
