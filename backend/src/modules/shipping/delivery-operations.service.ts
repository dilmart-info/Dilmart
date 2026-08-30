import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderFinanceService } from "../finance/order-finance.service";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

export type DeliveryStatus =
  | "pending_assignment"
  | "assigned_to_company"
  | "assigned_to_agent"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled";

type DeliveryEventType =
  | "assigned_to_company"
  | "assigned_to_agent"
  | "agent_unassigned"
  | "picked_up"
  | "in_transit"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled"
  | "note_added";

type DeliveryActorType = "admin" | "delivery_company" | "agent" | "system";

type DeliveryActor = {
  actorId?: string;
  actorType: DeliveryActorType;
};

const ALLOWED_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  pending_assignment: ["assigned_to_company", "cancelled"],
  assigned_to_company: ["assigned_to_agent", "failed", "cancelled"],
  assigned_to_agent: ["picked_up", "failed", "cancelled"],
  picked_up: ["in_transit", "failed"],
  in_transit: ["delivered", "failed", "returned"],
  delivered: ["returned"],
  failed: ["returned"],
  returned: [],
  cancelled: [],
};

const TERMINAL_STATUSES = new Set<DeliveryStatus>(["delivered", "failed", "returned", "cancelled"]);

@Injectable()
export class DeliveryOperationsService {
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly orderFinanceService: OrderFinanceService,
  ) {}

  private normalizeDeliveryStatus(rawStatus: string | null | undefined, orderStatus?: string | null): DeliveryStatus {
    const status = String(rawStatus ?? "").trim();
    if (status) return status as DeliveryStatus;
    const order = String(orderStatus ?? "").trim();
    if (order === "delivered") return "delivered";
    if (order === "cancelled") return "cancelled";
    return "pending_assignment";
  }

  private assertTransition(from: DeliveryStatus, to: DeliveryStatus) {
    if (from === to) return;
    const allowed = ALLOWED_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new ForbiddenException(`Invalid delivery status transition from ${from} to ${to}.`);
    }
  }

  private async getOrder(orderId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,status,merchant_id,delivery_company_id,agent_id,delivery_status,delivery_sla_due_at,delivery_sla_breached,delivery_company_assigned_at,delivery_agent_assigned_at,picked_up_at,in_transit_at,delivered_at,delivery_failed_at,returned_at,delivery_failure_reason,delivery_failure_notes",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Order not found.");
    return data as any;
  }

  private async resolveSlaDueAt(companyId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("default_sla_minutes")
      .eq("id", companyId)
      .maybeSingle();
    if (error) throw error;
    const minutes = Math.max(1, Number((data as any)?.default_sla_minutes ?? 1440));
    return new Date(Date.now() + minutes * 60 * 1000).toISOString();
  }

  /**
   * Atomically updates delivery_status and inserts a delivery_event via the
   * `transition_delivery_status` PostgreSQL RPC. If the RPC fails for any
   * reason (including "function does not exist"), an error is thrown — no
   * fallback sequential writes exist to prevent partial state.
   */
  private async updateDeliveryStatus(order: any, nextStatus: DeliveryStatus, actor: DeliveryActor, patch?: Record<string, unknown>) {
    const from = this.normalizeDeliveryStatus(order.delivery_status, order.status);
    this.assertTransition(from, nextStatus);

    const nowIso = new Date().toISOString();
    const slaBreach =
      nextStatus !== "delivered" &&
      nextStatus !== "failed" &&
      nextStatus !== "returned" &&
      nextStatus !== "cancelled" &&
      !!order.delivery_sla_due_at &&
      new Date(order.delivery_sla_due_at).getTime() < Date.now();

    const eventType = nextStatus !== "pending_assignment" ? (nextStatus as DeliveryEventType) : null;
    const patchForRpc: Record<string, unknown> = {
      delivery_assigned_at: order.delivery_assigned_at ?? nowIso,
      delivery_sla_breached: slaBreach,
      ...(patch ?? {}),
    };

    // Sync legacy order.status for terminal delivery states.
    let legacyStatus: string | undefined;
    if (nextStatus === "delivered") legacyStatus = "delivered";
    else if (nextStatus === "cancelled") legacyStatus = "cancelled";
    else if (nextStatus === "returned") legacyStatus = "returned";
    const previousOrderStatus = String(order.status ?? "");

    // Atomic RPC — order update + event insert in one PostgreSQL transaction.
    // No fallback: if the RPC is unavailable, push the residual migration first.
    const rpcResult = await this.supabaseAdmin.client.rpc("transition_delivery_status" as any, {
      p_order_id: order.id,
      p_next_status: nextStatus,
      p_from_status: from,
      p_actor_id: actor.actorId ?? null,
      p_actor_type: actor.actorType,
      p_patch: patchForRpc,
      p_event_type: eventType,
      p_reason_code: (patchForRpc.delivery_failure_reason as string | null) ?? null,
      p_notes: (patchForRpc.delivery_failure_notes as string | null) ?? null,
      p_delivery_company_id: (patchForRpc.delivery_company_id as string | null) ?? order.delivery_company_id ?? null,
      p_agent_id: (patchForRpc.agent_id !== undefined ? patchForRpc.agent_id : order.agent_id) ?? null,
      p_legacy_status: legacyStatus ?? null,
    } as any);

    if (rpcResult.error) {
      throw rpcResult.error;
    }

    // Finance transition (idempotent, runs after commit — safe outside DB tx).
    const nextOrderStatus = legacyStatus ?? previousOrderStatus;
    if (nextOrderStatus && nextOrderStatus !== previousOrderStatus) {
      await this.orderFinanceService.handleOrderStatusTransition({
        orderId: order.id,
        previousStatus: previousOrderStatus,
        nextStatus: nextOrderStatus,
        actorId: actor.actorId,
      });
    }
  }

  async assignOrderToDeliveryCompany(orderId: string, deliveryCompanyId: string, actor: DeliveryActor) {
    const order = await this.getOrder(orderId);

    // Verify the delivery company exists.
    const { data: company, error: companyErr } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("id")
      .eq("id", deliveryCompanyId)
      .maybeSingle();
    if (companyErr) throw companyErr;
    if (!company) throw new NotFoundException("Delivery company not found.");

    const current = this.normalizeDeliveryStatus(order.delivery_status, order.status);
    if (current !== "pending_assignment" && !TERMINAL_STATUSES.has(current)) {
      this.assertTransition(current, "assigned_to_company");
    } else if (current !== "pending_assignment") {
      throw new ForbiddenException("Cannot assign company for terminal delivery status.");
    }
    const nowIso = new Date().toISOString();
    const slaDueAt = await this.resolveSlaDueAt(deliveryCompanyId);
    await this.updateDeliveryStatus(order, "assigned_to_company", actor, {
      delivery_company_id: deliveryCompanyId,
      delivery_assigned_at: order.delivery_assigned_at ?? nowIso,
      delivery_company_assigned_at: nowIso,
      delivery_sla_due_at: slaDueAt,
      delivery_sla_breached: false,
      agent_id: null,
      delivery_agent_assigned_at: null,
    });
    return { ok: true };
  }

  async assignOrderToAgent(orderId: string, agentId: string, actor: DeliveryActor) {
    const order = await this.getOrder(orderId);

    // Validate: order must have a delivery company assigned first.
    if (!order.delivery_company_id) {
      throw new BadRequestException("Assign delivery company before assigning an agent.");
    }

    // Validate: target user must exist, have role = agent, and be active.
    const { data: agentProfile, error: profileErr } = await this.supabaseAdmin.client
      .from("profiles")
      .select("id, role, is_active, delivery_company_id")
      .eq("id", agentId)
      .maybeSingle();
    if (profileErr) throw profileErr;
    if (!agentProfile) throw new NotFoundException("Agent user not found.");
    if ((agentProfile as any).role !== "agent") {
      throw new ForbiddenException("Target user is not an agent. Cannot assign non-agent to an order.");
    }
    if ((agentProfile as any).is_active === false) {
      throw new ForbiddenException("Agent account is inactive and cannot accept order assignments.");
    }

    // Validate: agent must belong to the same delivery company as the order.
    // If the agent has no delivery_company_id set, reject to enforce strict association.
    const agentCompanyId = (agentProfile as any).delivery_company_id as string | null;
    if (!agentCompanyId) {
      throw new ForbiddenException("Agent has no delivery company association. Update agent profile before assigning.");
    }
    if (agentCompanyId !== order.delivery_company_id) {
      throw new ForbiddenException(
        `Agent belongs to a different delivery company (${agentCompanyId}) than the order (${order.delivery_company_id}).`,
      );
    }

    // Validate: order must be in an assignable state.
    const current = this.normalizeDeliveryStatus(order.delivery_status, order.status);
    if (TERMINAL_STATUSES.has(current)) {
      throw new ForbiddenException(`Cannot assign agent to an order in terminal state: ${current}.`);
    }

    await this.updateDeliveryStatus(order, "assigned_to_agent", actor, {
      agent_id: agentId,
      delivery_agent_assigned_at: new Date().toISOString(),
    });
    return { ok: true };
  }

  /**
   * Phase 8 (atomic): clears the assigned agent and emits an agent_unassigned
   * delivery_event in a single PostgreSQL transaction via the
   * clear_order_agent_atomic RPC.  Sequential update + insert no longer exists.
   */
  async clearOrderAgent(orderId: string, actor: DeliveryActor) {
    const { error } = await this.supabaseAdmin.client.rpc("clear_order_agent_atomic" as any, {
      p_order_id:   orderId,
      p_actor_id:   actor.actorId ?? null,
      p_actor_type: actor.actorType,
      p_reason:     "Agent removed from order.",
    } as any);
    if (error) throw error;
    return { ok: true };
  }

  async markPickedUp(orderId: string, actor: DeliveryActor) {
    const order = await this.getOrder(orderId);
    await this.updateDeliveryStatus(order, "picked_up", actor);
    return { ok: true };
  }

  async markInTransit(orderId: string, actor: DeliveryActor) {
    const order = await this.getOrder(orderId);
    await this.updateDeliveryStatus(order, "in_transit", actor);
    return { ok: true };
  }

  async markDelivered(orderId: string, actor: DeliveryActor) {
    const order = await this.getOrder(orderId);
    // Idempotency: already delivered is a no-op (prevents duplicate finance transitions).
    const current = this.normalizeDeliveryStatus(order.delivery_status, order.status);
    if (current === "delivered") {
      return { ok: true };
    }
    await this.updateDeliveryStatus(order, "delivered", actor);
    return { ok: true };
  }

  async markFailed(orderId: string, reasonCode: string, notes: string | undefined, actor: DeliveryActor) {
    if (!reasonCode?.trim()) {
      throw new BadRequestException("reason_code is required.");
    }
    const order = await this.getOrder(orderId);
    await this.updateDeliveryStatus(order, "failed", actor, {
      delivery_failure_reason: reasonCode,
      delivery_failure_notes: notes?.trim() ? notes.trim() : null,
    });
    return { ok: true };
  }

  async markReturned(orderId: string, reasonCode: string | undefined, notes: string | undefined, actor: DeliveryActor) {
    const order = await this.getOrder(orderId);
    await this.updateDeliveryStatus(order, "returned", actor, {
      delivery_failure_reason: reasonCode?.trim() ? reasonCode.trim() : order.delivery_failure_reason ?? null,
      delivery_failure_notes: notes?.trim() ? notes.trim() : null,
    });
    return { ok: true };
  }

  async markCancelled(orderId: string, notes: string | undefined, actor: DeliveryActor) {
    const order = await this.getOrder(orderId);
    await this.updateDeliveryStatus(order, "cancelled", actor, {
      delivery_failure_notes: notes?.trim() ? notes.trim() : null,
    });
    return { ok: true };
  }

  async addDeliveryNote(orderId: string, notes: string, actor: DeliveryActor) {
    if (!notes?.trim()) {
      throw new BadRequestException("notes are required.");
    }
    const order = await this.getOrder(orderId);
    const status = this.normalizeDeliveryStatus(order.delivery_status, order.status);
    const { error } = await this.supabaseAdmin.client.from("delivery_events").insert({
      order_id: orderId,
      event_type: "note_added",
      from_status: status,
      to_status: status,
      delivery_company_id: order.delivery_company_id ?? null,
      agent_id: order.agent_id ?? null,
      actor_id: actor.actorId ?? null,
      actor_type: actor.actorType,
      notes: notes.trim(),
      metadata: {},
    } as any);
    if (error) throw error;
    return { ok: true };
  }

  async listDeliveryEvents(orderId: string, limit = 200) {
    const { data, error } = await this.supabaseAdmin.client
      .from("delivery_events")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(limit, 500)));
    if (error) throw error;
    return { events: data ?? [] };
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
    let req = this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,order_number,status,delivery_status,delivery_company_id,agent_id,customer_name,total,payment_method,cash_expected_amount,created_at,delivery_sla_due_at,delivery_sla_breached,delivery_companies(name),profiles!orders_agent_id_fkey(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(Number(payload?.limit ?? 200), 500)));

    if (payload?.delivery_status && payload.delivery_status !== "all") req = req.eq("delivery_status", payload.delivery_status);
    if (payload?.delivery_company_id) req = req.eq("delivery_company_id", payload.delivery_company_id);
    if (payload?.agent_id) req = req.eq("agent_id", payload.agent_id);
    if (payload?.from) req = req.gte("created_at", payload.from);
    if (payload?.to) req = req.lte("created_at", payload.to);
    if (payload?.sla_breached === "true") req = req.eq("delivery_sla_breached", true);

    const { data, error } = await req;
    if (error) throw error;
    return { rows: data ?? [] };
  }

  async assertAgentCanOperate(orderId: string, actorId: string | undefined) {
    if (!actorId) throw new ForbiddenException("Missing actor identity.");
    const { data, error } = await this.supabaseAdmin.client.from("orders").select("id,agent_id").eq("id", orderId).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundException("Order not found.");
    if (String((data as any).agent_id ?? "") !== actorId) {
      throw new ForbiddenException("Agent can only update orders assigned to him.");
    }
  }
}
