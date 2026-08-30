import { ForbiddenException, Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import {
  AgentOrdersQueryDto,
  CreateOrderDto,
  DeliveryFailureDto,
  GetOrderDetailQueryDto,
  MerchantAcceptOrderDto,
  MerchantRejectOrderDto,
  TrackOrderDto,
  UpdateOrderAgentDto,
  UpdateOrderNotesDto,
  UpdateOrderStatusDto,
} from "./orders.dto";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { WhatsAppIntentsService } from "../whatsapp-intents/whatsapp-intents.service";
import { OrderFinanceService } from "../finance/order-finance.service";
import { DeliveryOperationsService } from "../shipping/delivery-operations.service";
import { JenniClientService } from "../jenni/jenni-client.service";
import { OrderCancellationService } from "./order-cancellation.service";
import { sanitizeSearchTerm, buildSafeOrFilter } from "../../common/search-utils";

type ListOrdersParams = {
  merchant_id?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
  actor_role?: string;
  actor_id?: string;
  merchant_decision_status?: string;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
    private readonly whatsAppIntentsService: WhatsAppIntentsService,
    private readonly orderFinanceService: OrderFinanceService,
    private readonly deliveryOperationsService: DeliveryOperationsService,
    private readonly jenniClient: JenniClientService,
    private readonly orderCancellationService: OrderCancellationService,
  ) {}

  private isMerchantRole(role?: string) {
    return role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
  }

  /** Merchant-scoped list — strips all customer contact fields. Paginated + DB search. */
  private async listOrdersForMerchant(params: ListOrdersParams) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(params.merchant_id, params.actor_role, params.actor_id);

    const page = Math.max(1, Math.floor(Number(params.page ?? 1)));
    const limit = Math.min(Math.max(1, Math.floor(Number(params.limit ?? 50))), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let req = this.supabaseAdmin.client
      .from("orders")
      .select("id, order_number, merchant_id, status, channel, created_at, updated_at, subtotal, discount, delivery_cost, total, payment_method, merchant_notes, merchant_decision_status, governorates(name)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    if (params.status && params.status !== "all") req = req.eq("status", params.status);
    if (params.merchant_decision_status) req = req.eq("merchant_decision_status", params.merchant_decision_status);
    if (params.date_from) req = req.gte("created_at", params.date_from);
    if (params.date_to) req = req.lte("created_at", params.date_to);

    // DB-level search — merchant can only search by order_number (no customer fields)
    const escaped = sanitizeSearchTerm(params.search);
    if (escaped) {
      req = req.or(buildSafeOrFilter(escaped, ["order_number"]));
    }

    req = req.range(from, to);
    const { data, error, count } = await req;
    if (error) throw error;
    const total = count ?? 0;
    return { items: data ?? [], page, limit, total, hasMore: from + limit < total };
  }

  async listOrders(params: ListOrdersParams) {
    if (this.isMerchantRole(params.actor_role)) {
      return this.listOrdersForMerchant(params);
    }
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(params.merchant_id, params.actor_role, params.actor_id);

    const page = Math.max(1, Math.floor(Number(params.page ?? 1)));
    const limit = Math.min(Math.max(1, Math.floor(Number(params.limit ?? 50))), 200);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let req = this.supabaseAdmin.client
      .from("orders")
      .select("*, governorates(name), merchants(display_name)", { count: "exact" })
      .order("created_at", { ascending: false });

    if (resolvedMerchantId) req = req.eq("merchant_id", resolvedMerchantId);
    if (params.status && params.status !== "all") req = req.eq("status", params.status);
    if (params.merchant_decision_status) req = req.eq("merchant_decision_status", params.merchant_decision_status);
    if (params.date_from) req = req.gte("created_at", params.date_from);
    if (params.date_to) req = req.lte("created_at", params.date_to);

    // DB-level search — admin can search by customer_name, customer_phone, order_number
    const escaped = sanitizeSearchTerm(params.search);
    if (escaped) {
      req = req.or(buildSafeOrFilter(escaped, ["customer_name", "customer_phone", "order_number"]));
    }

    req = req.range(from, to);
    const { data, error, count } = await req;
    if (error) throw error;
    const total = count ?? 0;
    return { items: data ?? [], page, limit, total, hasMore: from + limit < total };
  }

  async createOrder(payload: CreateOrderDto) {
    const { data, error } = await this.supabaseAdmin.client.from("orders").insert(payload as any).select("id, order_number").single();
    if (error) throw error;
    return data;
  }

  async createManualOrder(payload: {
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
    actor_role?: string;
    actor_id?: string;
  }) {
    if (this.isMerchantRole(payload.actor_role)) {
      throw new ForbiddenException("Merchants are not permitted to create manual orders with customer data. This action is restricted to platform staff.");
    }
    if (!payload.items?.length) {
      throw new Error("Manual order requires at least one item.");
    }

    const productIds = payload.items.map((item) => item.product_id);
    const { data: products, error: productsError } = await this.supabaseAdmin.client
      .from("products")
      .select("id, merchant_id, category_id")
      .in("id", productIds);
    if (productsError) throw productsError;

    const merchantIds = Array.from(new Set((products ?? []).map((p: any) => p.merchant_id).filter(Boolean)));
    if (merchantIds.length !== 1) {
      throw new Error("All manual-order items must belong to the same merchant.");
    }
    const merchantId = merchantIds[0] as string;
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, payload.actor_role, payload.actor_id);
    if (resolvedMerchantId && resolvedMerchantId !== merchantId) {
      throw new ForbiddenException("Manual order items are outside actor merchant scope.");
    }
    if (payload.intent_id) {
      await this.whatsAppIntentsService.resolveIntentForManualOrder(payload.intent_id, merchantId);
    }

    const subtotal = payload.items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);
    const total = subtotal + Number(payload.delivery_cost ?? 0);
    const channel = payload.intent_id ? "whatsapp_assisted" : payload.channel ?? "manual_assisted";
    const categoryIds = Array.from(
      new Set(
        (products ?? [])
          .map((p: any) => String(p.category_id ?? ""))
          .filter(Boolean),
      ),
    );
    const terms = await this.orderFinanceService.resolveCommercialTerms({
      merchant_id: merchantId,
      channel,
      order_value: total,
      category_ids: categoryIds,
    });
    const financialSnapshot = this.orderFinanceService.computeOrderFinancialSnapshot({
      subtotal,
      discount: 0,
      deliveryFeeCharged: Number(payload.delivery_cost ?? 0),
      channel,
      categoryIds,
      terms,
    });

    const rpcItems = payload.items.map((item) => ({
      ...item,
      merchant_id: merchantId,
    }));

    const { data, error } = await this.supabaseAdmin.client.rpc("place_order", {
      p_customer_name: payload.customer_name,
      p_customer_phone: payload.customer_phone,
      p_governorate_id: payload.governorate_id,
      p_area: payload.area,
      p_nearest_landmark: payload.nearest_landmark ?? null,
      p_notes: payload.notes ?? null,
      p_subtotal: subtotal,
      p_delivery_cost: Number(payload.delivery_cost ?? 0),
      p_discount: 0,
      p_total: total,
      p_coupon_id: null,
      p_items: rpcItems,
      p_merchant_id: merchantId,
      p_payment_method: "cod",
      p_merchant_notes: payload.notes ?? null,
      p_merchandise_subtotal: financialSnapshot.merchandise_subtotal,
      p_discount_total: financialSnapshot.discount_total,
      p_delivery_fee_charged: financialSnapshot.delivery_fee_charged,
      p_platform_commission_type: financialSnapshot.platform_commission_type,
      p_platform_commission_rate: financialSnapshot.platform_commission_rate,
      p_platform_commission_amount: financialSnapshot.platform_commission_amount,
      p_platform_assisted_fee_amount: financialSnapshot.platform_assisted_fee_amount,
      p_platform_extra_fee_amount: financialSnapshot.platform_extra_fee_amount,
      p_courier_fee_payable: financialSnapshot.courier_fee_payable,
      p_merchant_gross_amount: financialSnapshot.merchant_gross_amount,
      p_merchant_net_amount: financialSnapshot.merchant_net_amount,
      p_gross_collected_amount: financialSnapshot.gross_collected_amount,
      p_platform_net_revenue_amount: financialSnapshot.platform_net_revenue_amount,
      p_currency_code: financialSnapshot.currency_code,
      p_financial_snapshot_version: financialSnapshot.financial_snapshot_version,
      p_payment_status: "unpaid",
      p_collection_status: "not_collected",
      p_settlement_status: "not_accrued",
      p_cash_expected_amount: financialSnapshot.gross_collected_amount,
      p_commission_rule_id: financialSnapshot.commission_rule_id,
      p_assisted_fee_rule_id: financialSnapshot.assisted_fee_rule_id,
      p_platform_fee_rule_id: financialSnapshot.platform_fee_rule_id,
      p_delivery_billing_rule_id: financialSnapshot.delivery_billing_rule_id,
      p_resolved_plan_id: financialSnapshot.resolved_plan_id,
      p_resolved_plan_code: financialSnapshot.resolved_plan_code,
      p_commercial_snapshot_version: financialSnapshot.commercial_snapshot_version,
      p_channel: channel,
    });

    if (error) throw error;
    const orderNumber = data as string;
    const { data: orderRow, error: orderLookupError } = await this.supabaseAdmin.client
      .from("orders")
      .select("id")
      .eq("order_number", orderNumber)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (orderLookupError) throw orderLookupError;
    if (!orderRow?.id) return { order_number: orderNumber };

    const { error: channelError } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        channel,
        whatsapp_intent_id: payload.intent_id ?? null,
      } as any)
      .eq("id", orderRow.id);
    if (channelError) throw channelError;

    if (payload.intent_id) {
      await this.whatsAppIntentsService.markIntentConverted(payload.intent_id, orderRow.id);
    }

    return { order_number: orderNumber, channel, whatsapp_intent_id: payload.intent_id ?? null };
  }

  async getOrder(id: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data;
  }

  /** Merchant-scoped detail — strips all customer contact fields. */
  async getOrderDetailForMerchant(id: string, merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        `id, order_number, merchant_id, status, channel, created_at, updated_at,
         subtotal, discount, delivery_cost, total, payment_method, merchant_notes,
         merchant_decision_status, merchant_rejection_reason_code, merchant_decision_at,
         delivery_company_id, delivery_status,
         delivery_companies(name, provider_code),
         governorates(name),
         order_items(id, product_id, product_name, price, quantity),
         order_delivery_integrations(
           provider_code,
           dispatch_status,
           dispatch_error,
           provider_shipment_id,
           external_shipment_number,
           provider_current_step_ar,
           last_synced_at
         )`,
      )
      .eq("id", id)
      .eq("merchant_id", merchantId)
      .single();
    if (error) throw error;
    return data;
  }

  async getOrderDetail(id: string, query: GetOrderDetailQueryDto & { actor_role?: string; actor_id?: string }) {
    if (this.isMerchantRole(query.actor_role)) {
      const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(query.merchant_id, query.actor_role, query.actor_id);
      if (!resolvedMerchantId) throw new ForbiddenException("Merchant scope required.");
      return this.getOrderDetailForMerchant(id, resolvedMerchantId);
    }
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(query.merchant_id, query.actor_role, query.actor_id);
    let req = this.supabaseAdmin.client
      .from("orders")
      .select(
        `
        *,
        governorates(name),
        delivery_companies(name),
        profiles!orders_agent_id_fkey(full_name),
        order_items(
          *,
          products(slug)
        )
      `,
      )
      .eq("id", id);

    if (resolvedMerchantId) {
      req = req.eq("merchant_id", resolvedMerchantId);
    }

    const { data, error } = await req.single();
    if (error) throw error;
    return data;
  }

  async getAgentOrders(agentId: string, query: AgentOrdersQueryDto, actor?: ActorContext) {
    if (actor?.actorRole === "agent" && agentId !== actor.actorId) {
      throw new ForbiddenException("Agent can only view own orders.");
    }
    const isHistory = query.mode === "history";
    const statuses = isHistory ? ["delivered", "returned", "failed", "cancelled"] : ["assigned_to_agent", "picked_up", "in_transit"];

    let req = this.supabaseAdmin.client
      .from("orders")
      .select("id, order_number, customer_name, customer_phone, area, nearest_landmark, total, status, delivery_status, payment_method, cash_expected_amount, created_at, map_url, governorates(name)")
      .eq("agent_id", agentId)
      .in("delivery_status", statuses)
      .order("created_at", { ascending: false });

    if (isHistory) {
      req = req.limit(50);
    }

    const { data, error } = await req;
    if (error) throw error;
    return data ?? [];
  }

  async getAgents() {
    const { data, error } = await this.supabaseAdmin.client.from("profiles").select("id, full_name, email").eq("role", "agent");
    if (error) throw error;
    return data ?? [];
  }

  async cancelOrder(id: string, reason: string, actor?: { actorRole?: string; actorId?: string }) {
    if (!reason?.trim()) {
      throw new ForbiddenException("A cancellation reason is required.");
    }
    if (reason.trim().length > 500) {
      throw new ForbiddenException("Cancellation reason must not exceed 500 characters.");
    }

    // Resolve merchant scope so a merchant can only cancel their own orders.
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(undefined, actor?.actorRole, actor?.actorId);
    let query = this.supabaseAdmin.client.from("orders").select("id,status,delivery_status,merchant_id").eq("id", id);
    if (resolvedMerchantId) query = query.eq("merchant_id", resolvedMerchantId);
    const { data: order, error: fetchErr } = await query.maybeSingle();
    if (fetchErr) throw fetchErr;
    if (!order) throw new ForbiddenException("Order not found or not accessible.");

    // Block cancellation of delivered/settled orders.
    const deliveryStatus = String((order as any).delivery_status ?? "");
    const orderStatus = String((order as any).status ?? "");
    if (["delivered", "returned"].includes(orderStatus) || ["delivered", "returned"].includes(deliveryStatus)) {
      throw new ForbiddenException("Delivered or returned orders cannot be cancelled.");
    }

    // Persist reason on the order record for visibility.
    await this.supabaseAdmin.client
      .from("orders")
      .update({ admin_notes: `Cancellation reason: ${reason.trim()}` } as any)
      .eq("id", id);

    // Route through delivery lifecycle service so a delivery_event is always written.
    const deliveryActor = {
      actorId: actor?.actorId,
      actorType: (actor?.actorRole === "agent" ? "agent" : "admin") as "admin" | "agent",
    };
    return this.deliveryOperationsService.markCancelled(id, reason.trim(), deliveryActor);
  }

  async updateOrderStatus(id: string, payload: UpdateOrderStatusDto & { actor_role?: string; actor_id?: string }) {
    // Merchants cannot use generic status update — must use merchant-accept/merchant-reject
    if (this.isMerchantRole(payload.actor_role)) {
      throw new ForbiddenException("Merchants must use merchant-accept or merchant-reject endpoints.");
    }
    // All roles (including admins) must use the delivery lifecycle endpoints for terminal states.
    // Admins wanting to override must use adminOverrideDeliveryStatus.
    const blockedForAll = ["delivered", "returned", "cancelled"];
    if (blockedForAll.includes(String(payload.status ?? ""))) {
      throw new ForbiddenException("Terminal statuses (delivered, returned, cancelled) must be set through the delivery lifecycle endpoints.");
    }
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, payload.actor_role, payload.actor_id);
    let beforeQuery = this.supabaseAdmin.client.from("orders").select("id, status, merchant_id").eq("id", id);
    if (resolvedMerchantId) beforeQuery = beforeQuery.eq("merchant_id", resolvedMerchantId);
    const { data: beforeRow, error: beforeError } = await beforeQuery.maybeSingle();
    if (beforeError) throw beforeError;
    if (!beforeRow?.id) throw new ForbiddenException("Order scope is not allowed for this actor.");

    let updateQuery = this.supabaseAdmin.client.from("orders").update({ status: payload.status } as any).eq("id", id);
    if (resolvedMerchantId) {
      updateQuery = updateQuery.eq("merchant_id", resolvedMerchantId);
    }
    const { error } = await updateQuery;
    if (error) throw error;

    await this.orderFinanceService.handleOrderStatusTransition({
      orderId: id,
      previousStatus: String((beforeRow as any).status ?? ""),
      nextStatus: payload.status,
      actorId: payload.actor_id,
    });

    return { ok: true };
  }

  async updateOrderNotes(id: string, payload: UpdateOrderNotesDto & { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, payload.actor_role, payload.actor_id);

    // Merchants write merchant_notes only; admins write admin_notes only.
    const isMerchant = this.isMerchantRole(payload.actor_role);
    const updatePayload: Record<string, unknown> = isMerchant
      ? { merchant_notes: payload.admin_notes }
      : { admin_notes: payload.admin_notes };

    let query = this.supabaseAdmin.client.from("orders").update(updatePayload as any).eq("id", id);
    if (resolvedMerchantId) {
      query = query.eq("merchant_id", resolvedMerchantId);
    }
    const { error } = await query;
    if (error) throw error;
    return { ok: true };
  }

  // ─── Merchant Accept / Reject ─────────────────────────────────────────────────

  private static readonly REJECTION_REASON_LABELS: Record<string, string> = {
    out_of_stock: "المنتج غير متوفر حالياً",
    insufficient_quantity: "الكمية المطلوبة غير متوفرة",
    variant_unavailable: "اللون أو النوع أو الموديل المطلوب غير متوفر",
    product_discontinued: "المنتج متوقف أو لم يعد متوفراً",
    product_damaged_or_not_ready: "المنتج غير جاهز أو غير صالح للبيع",
    wrong_price: "السعر غير صحيح ويحتاج مراجعة",
    wrong_product_info: "معلومات المنتج غير دقيقة وتحتاج مراجعة",
    cannot_prepare_in_time: "لا يمكن تجهيز الطلب بالوقت المطلوب",
    temporary_store_issue: "المتجر غير قادر على تجهيز الطلب حالياً",
    duplicate_or_suspicious: "الطلب مكرر أو غير واضح",
    order_needs_admin_review: "الطلب يحتاج مراجعة من الإدارة",
  };

  async merchantAcceptOrder(id: string, payload: MerchantAcceptOrderDto, actor: ActorContext) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, actor.actorRole, actor.actorId);
    if (!resolvedMerchantId) throw new ForbiddenException("Merchant scope is required.");

    // Atomic CAS: update only if order is still pending+new — prevents race conditions
    const { data: updated, error } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        merchant_decision_status: "accepted",
        merchant_decision_at: new Date().toISOString(),
        merchant_decision_by: actor.actorId ?? null,
        status: "preparing",
      } as any)
      .eq("id", id)
      .eq("merchant_id", resolvedMerchantId)
      .eq("merchant_decision_status", "pending")
      .eq("status", "new")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      throw new ForbiddenException("Order is no longer pending or cannot be decided.");
    }

    await this.orderFinanceService.handleOrderStatusTransition({
      orderId: id,
      previousStatus: "new",
      nextStatus: "preparing",
      actorId: actor.actorId,
    });

    return { ok: true };
  }

  async merchantRejectOrder(id: string, payload: MerchantRejectOrderDto, actor: ActorContext) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, actor.actorRole, actor.actorId);
    if (!resolvedMerchantId) throw new ForbiddenException("Merchant scope is required.");

    // Validate reason code server-side (belt-and-suspenders with DTO @IsIn)
    if (!OrdersService.REJECTION_REASON_LABELS[payload.reason_code]) {
      throw new BadRequestException("Invalid rejection reason code.");
    }

    const cancelResult = await this.orderCancellationService.cancelOrder({
      orderId: id,
      actorType: "merchant",
      actorId: actor.actorId,
      reasonCode: payload.reason_code,
      expectedMerchantId: resolvedMerchantId,
      markMerchantRejected: true,
    });

    return { ok: true, ...cancelResult };
  }

  async updateOrderAgent(id: string, payload: UpdateOrderAgentDto, actor?: ActorContext) {
    const deliveryActor = { actorId: actor?.actorId, actorType: "admin" as const };
    if (payload.agent_id) {
      return this.deliveryOperationsService.assignOrderToAgent(id, payload.agent_id, deliveryActor);
    }
    // Phase 8: clearing agent must emit an audited agent_unassigned delivery_event.
    return this.deliveryOperationsService.clearOrderAgent(id, deliveryActor);
  }

  /** Phase 7: Admin override that bypasses normal state machine but requires a reason and is audited. */
  async adminOverrideDeliveryStatus(id: string, nextStatus: string, reason: string, actor?: ActorContext) {
    if (!reason?.trim()) {
      throw new ForbiddenException("A reason is required for admin delivery override.");
    }
    const { error } = await this.supabaseAdmin.client.rpc("admin_override_delivery_status" as any, {
      p_order_id: id,
      p_next_status: nextStatus,
      p_actor_id: actor?.actorId ?? null,
      p_reason: reason.trim(),
    } as any);
    if (error) throw error;
    // Mirror the normal delivery path: post finance accrual when overriding to delivered.
    // previousStatus is intentionally "pending" — admin override bypasses state machine;
    // the `settlement_status === "accrued"` guard in handleOrderStatusTransition makes this idempotent.
    if (nextStatus === "delivered") {
      await this.orderFinanceService.handleOrderStatusTransition({
        orderId: id,
        previousStatus: "pending",
        nextStatus: "delivered",
        actorId: actor?.actorId,
      });
    }
    return { ok: true };
  }

  async trackOrder(payload: TrackOrderDto) {
    const normalizedOrderNumber = payload.order_number.replace("#", "").trim();
    const { data, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,order_number,status,delivery_status,total,created_at,delivery_companies(name)")
      .eq("order_number", normalizedOrderNumber)
      .eq("customer_phone", payload.phone.trim())
      .maybeSingle();
    if (error) throw error;
    if (!data) return { found: false, message: "الطلب غير موجود" };
    return {
      found: true,
      order_id: (data as any).id,
      order_number: (data as any).order_number,
      status: (data as any).status,
      delivery_status: (data as any).delivery_status,
      total: Number((data as any).total ?? 0),
      created_at: (data as any).created_at,
      delivery_company: (data as any).delivery_companies?.name ?? null,
    };
  }

  private resolveDeliveryActor(actor: ActorContext) {
    const role = String(actor.actorRole ?? "");
    if (role === "agent") {
      return { actorType: "agent" as const, actorId: actor.actorId };
    }
    if (role === "super_admin" || role === "admin") {
      return { actorType: "admin" as const, actorId: actor.actorId };
    }
    throw new ForbiddenException("Not allowed to update delivery lifecycle.");
  }

  async markDeliveryPickedUp(orderId: string, actor: ActorContext) {
    const deliveryActor = this.resolveDeliveryActor(actor);
    if (deliveryActor.actorType === "agent") {
      await this.deliveryOperationsService.assertAgentCanOperate(orderId, actor.actorId);
    }
    return this.deliveryOperationsService.markPickedUp(orderId, deliveryActor);
  }

  async markDeliveryInTransit(orderId: string, actor: ActorContext) {
    const deliveryActor = this.resolveDeliveryActor(actor);
    if (deliveryActor.actorType === "agent") {
      await this.deliveryOperationsService.assertAgentCanOperate(orderId, actor.actorId);
    }
    return this.deliveryOperationsService.markInTransit(orderId, deliveryActor);
  }

  async markDeliveryDelivered(orderId: string, actor: ActorContext) {
    const deliveryActor = this.resolveDeliveryActor(actor);
    if (deliveryActor.actorType === "agent") {
      await this.deliveryOperationsService.assertAgentCanOperate(orderId, actor.actorId);
    }
    return this.deliveryOperationsService.markDelivered(orderId, deliveryActor);
  }

  async markDeliveryFailed(orderId: string, payload: DeliveryFailureDto, actor: ActorContext) {
    const deliveryActor = this.resolveDeliveryActor(actor);
    if (deliveryActor.actorType === "agent") {
      await this.deliveryOperationsService.assertAgentCanOperate(orderId, actor.actorId);
    }
    return this.deliveryOperationsService.markFailed(orderId, payload.reason_code, payload.notes, deliveryActor);
  }

  async addDeliveryNote(orderId: string, notes: string, actor: ActorContext) {
    const deliveryActor = this.resolveDeliveryActor(actor);
    if (deliveryActor.actorType === "agent") {
      await this.deliveryOperationsService.assertAgentCanOperate(orderId, actor.actorId);
    }
    return this.deliveryOperationsService.addDeliveryNote(orderId, notes, deliveryActor);
  }

  async listDeliveryEvents(orderId: string, limit = 100, actor?: ActorContext) {
    if (actor?.actorRole === "agent") {
      await this.deliveryOperationsService.assertAgentCanOperate(orderId, actor.actorId);
    }
    return this.deliveryOperationsService.listDeliveryEvents(orderId, limit);
  }

  async getMyOrders(actor: ActorContext) {
    const actorId = actor.actorId ?? "";
    this.scopeResolver.assertSelfAccess(actor, actorId);

    const { data, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("*")
      .eq("user_id", actorId)
      .order("created_at", { ascending: false });

    if (error) throw error;
  }

  // ── Jenni Shipment Operations ────────────────────────────────────────────

  /** Statuses where cancel/modify are still allowed (before physical pickup). */
  private static readonly MODIFIABLE_DELIVERY_STATUSES = new Set([
    "pending_assignment",
    "assigned_to_company",
  ]);

  private async getJenniIntegrationOrThrow(orderId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .select("*")
      .eq("order_id", orderId)
      .eq("provider_code", "jenni")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("No Jenni integration found for this order.");
    return data as Record<string, unknown>;
  }

  /**
   * Assert that the order's delivery_status allows cancel/modify operations.
   * Only allowed before physical pickup.
   */
  private async assertShipmentModifiable(orderId: string): Promise<void> {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("delivery_status")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new NotFoundException("Order not found.");

    const status = String((order as any).delivery_status ?? "");
    if (status && !OrdersService.MODIFIABLE_DELIVERY_STATUSES.has(status)) {
      throw new BadRequestException(
        `Cannot modify shipment: delivery status is "${status}". Cancel/modify is only allowed before pickup.`,
      );
    }
  }

  async cancelJenniShipment(orderId: string) {
    const integration = await this.getJenniIntegrationOrThrow(orderId);
    const shipmentId = integration.provider_shipment_id;
    if (!shipmentId) throw new BadRequestException("Jenni shipment ID is missing.");

    const dispatchStatus = String(integration.dispatch_status ?? "");
    if (dispatchStatus === "cancelled") {
      return { ok: true, message: "Shipment was already cancelled." };
    }

    // Guard: only allow cancel before pickup
    await this.assertShipmentModifiable(orderId);

    await this.jenniClient.cancelShipment(shipmentId as string);

    await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .update({ dispatch_status: "cancelled", updated_at: new Date().toISOString() })
      .eq("order_id", orderId)
      .eq("provider_code", "jenni");

    // Audit event
    await this.supabaseAdmin.client.from("delivery_events").insert({
      order_id: orderId,
      event_type: "jenni_shipment_cancelled",
      notes: `Jenni shipment ${shipmentId} cancelled by admin.`,
      actor_type: "admin",
      metadata: { provider: "jenni", shipment_id: shipmentId },
    });

    return { ok: true, message: "Jenni shipment cancelled." };
  }

  async modifyJenniCod(orderId: string, amountIqd: number) {
    if (!Number.isFinite(amountIqd) || amountIqd <= 0) {
      throw new BadRequestException("amount_iqd must be a positive number.");
    }

    // Guard: only allow modify before pickup
    await this.assertShipmentModifiable(orderId);

    const integration = await this.getJenniIntegrationOrThrow(orderId);
    const shipmentId = integration.provider_shipment_id;
    if (!shipmentId) throw new BadRequestException("Jenni shipment ID is missing.");

    const roundedAmount = Math.round(amountIqd);
    await this.jenniClient.modifyShipmentCod(shipmentId as string, roundedAmount);

    // Audit event — do NOT change finance; just record the modification
    await this.supabaseAdmin.client.from("delivery_events").insert({
      order_id: orderId,
      event_type: "jenni_cod_modified",
      notes: `COD modified to ${roundedAmount} IQD via Jenni.`,
      actor_type: "admin",
      metadata: { provider: "jenni", shipment_id: shipmentId, new_amount_iqd: roundedAmount },
    });

  }
}

