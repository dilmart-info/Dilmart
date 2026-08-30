import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

@Injectable()
export class CourierFinanceService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private async getDeliveryCompanyRemittancePolicy(deliveryCompanyId: string | null | undefined) {
    if (!deliveryCompanyId) {
      return {
        cod_remittance_mode: "gross_remittance" as const,
        allow_courier_fee_offset: false,
      };
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("cod_remittance_mode,allow_courier_fee_offset")
      .eq("id", deliveryCompanyId)
      .maybeSingle();
    if (error) throw error;
    return {
      cod_remittance_mode: (data?.cod_remittance_mode === "net_remittance" ? "net_remittance" : "gross_remittance") as
        | "gross_remittance"
        | "net_remittance",
      allow_courier_fee_offset: Boolean(data?.allow_courier_fee_offset),
    };
  }

  computeCourierRemittanceSnapshot(
    order: { gross_collected_amount?: number | null; courier_fee_payable?: number | null },
    policy: { cod_remittance_mode?: "gross_remittance" | "net_remittance"; allow_courier_fee_offset?: boolean },
  ) {
    const gross = Math.max(0, Number(order.gross_collected_amount ?? 0));
    const courierFee = Math.max(0, Number(order.courier_fee_payable ?? 0));
    const mode = policy.cod_remittance_mode === "net_remittance" ? "net_remittance" : "gross_remittance";
    if (mode === "net_remittance") {
      const retained = policy.allow_courier_fee_offset === false ? 0 : Math.min(gross, courierFee);
      return {
        courier_cod_remittance_mode: mode,
        cash_gross_expected_amount: gross,
        courier_fee_retained_amount: retained,
        cash_net_expected_from_courier: Math.max(0, gross - retained),
        courier_fee_offset_applied: retained > 0,
      };
    }
    return {
      courier_cod_remittance_mode: "gross_remittance" as const,
      cash_gross_expected_amount: gross,
      courier_fee_retained_amount: 0,
      cash_net_expected_from_courier: gross,
      courier_fee_offset_applied: false,
    };
  }

  async ensureOrderRemittanceSnapshot(orderId: string) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,delivery_company_id,gross_collected_amount,courier_fee_payable,courier_cod_remittance_mode,cash_gross_expected_amount,cash_net_expected_from_courier,courier_fee_retained_amount,courier_fee_offset_applied",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.id) throw new NotFoundException("Order not found.");

    if (
      order.courier_cod_remittance_mode &&
      order.cash_gross_expected_amount != null &&
      order.cash_net_expected_from_courier != null &&
      order.courier_fee_retained_amount != null
    ) {
      return order;
    }

    const policy = await this.getDeliveryCompanyRemittancePolicy(order.delivery_company_id);
    const snapshot = this.computeCourierRemittanceSnapshot(order as any, policy);
    const { error: updateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        courier_cod_remittance_mode: snapshot.courier_cod_remittance_mode,
        cash_gross_expected_amount: snapshot.cash_gross_expected_amount,
        courier_fee_retained_amount: snapshot.courier_fee_retained_amount,
        cash_net_expected_from_courier: snapshot.cash_net_expected_from_courier,
        courier_fee_offset_applied: snapshot.courier_fee_offset_applied,
        cash_expected_amount: snapshot.cash_gross_expected_amount,
      } as any)
      .eq("id", orderId);
    if (updateError) throw updateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      event_type: "courier_cod_policy_snapshotted",
      data: snapshot as any,
    });

    return {
      ...order,
      ...snapshot,
    };
  }

  private buildIdempotencyKey(orderId: string, eventType: string, referenceId?: string) {
    const suffix = referenceId ? `:${referenceId}` : "";
    return `courier:order:${orderId}:event:${eventType}${suffix}`;
  }

  private async appendFinanceEvent(payload: {
    order_id?: string | null;
    merchant_id?: string | null;
    event_type: string;
    created_by?: string | null;
    data?: Record<string, unknown>;
  }) {
    const { error } = await this.supabaseAdmin.client.from("order_finance_events").insert({
      order_id: payload.order_id ?? null,
      merchant_id: payload.merchant_id ?? null,
      event_type: payload.event_type,
      payload: payload.data ?? {},
      created_by: payload.created_by ?? null,
    } as any);
    if (error) throw error;
  }

  async postCourierAccrualForOrder(orderId: string, actorId?: string) {
    const snap = await this.ensureOrderRemittanceSnapshot(orderId);
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,merchant_id,delivery_company_id,agent_id,courier_fee_payable,currency_code,financial_snapshot_version,courier_settlement_status,status,courier_cod_remittance_mode,courier_fee_offset_applied")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.id) return;
    if (Number((order as any).financial_snapshot_version ?? 0) === 0) return;
    if (!(order as any).delivery_company_id) return;
    if (Number((order as any).courier_fee_payable ?? 0) <= 0) return;
    if (String((order as any).status ?? "") !== "delivered") return;

    const row = {
      delivery_company_id: (order as any).delivery_company_id,
      agent_id: (order as any).agent_id ?? null,
      order_id: orderId,
      entry_type: "delivery_fee_accrual",
      direction: "credit",
      amount: Number((order as any).courier_fee_payable ?? 0),
      currency_code: String((order as any).currency_code ?? "IQD"),
      status: "accrued",
      description: "Courier delivery fee accrual at delivery",
      reference_type: "order_status_transition",
      reference_id: "delivered",
      idempotency_key: this.buildIdempotencyKey(orderId, "delivery_fee_accrual"),
      settlement_method: "standard",
      created_by: actorId ?? null,
    };

    const { error: insertError } = await this.supabaseAdmin.client.from("courier_ledger_entries").upsert(row as any, {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    });
    if (insertError) throw insertError;

    const { error: updateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({ courier_settlement_status: "accrued" } as any)
      .eq("id", orderId)
      .neq("courier_settlement_status", "settled");
    if (updateError) throw updateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id ?? null,
      event_type: "courier_accrual_created",
      created_by: actorId ?? null,
      data: {
        amount: row.amount,
        delivery_company_id: row.delivery_company_id,
        remittance_mode: (order as any).courier_cod_remittance_mode ?? (snap as any).courier_cod_remittance_mode ?? "gross_remittance",
      },
    });
  }

  async evaluateCourierPayableTransition(orderId: string, actorId?: string) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,merchant_id,status,courier_fee_payable,courier_settlement_status,settlement_status,financial_snapshot_version")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.id) return { transitioned: false, reason: "order_not_found" as const };
    if (Number((order as any).financial_snapshot_version ?? 0) === 0) return { transitioned: false, reason: "legacy_order" as const };
    if (Number((order as any).courier_fee_payable ?? 0) <= 0) return { transitioned: false, reason: "no_courier_fee" as const };
    if (String((order as any).status ?? "") !== "delivered") return { transitioned: false, reason: "not_delivered" as const };
    if (String((order as any).settlement_status ?? "") === "disputed") return { transitioned: false, reason: "order_disputed" as const };
    if (["payable", "in_payout", "settled"].includes(String((order as any).courier_settlement_status ?? ""))) {
      return { transitioned: false, reason: "already_payable_or_beyond" as const };
    }

    const { error: orderUpdateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({ courier_settlement_status: "payable" } as any)
      .eq("id", orderId)
      .neq("courier_settlement_status", "payable");
    if (orderUpdateError) throw orderUpdateError;

    const { error: ledgerUpdateError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .update({ status: "payable" } as any)
      .eq("order_id", orderId)
      .eq("status", "accrued");
    if (ledgerUpdateError) throw ledgerUpdateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id ?? null,
      event_type: "courier_marked_payable",
      created_by: actorId ?? null,
      data: { courier_fee_payable: Number((order as any).courier_fee_payable ?? 0) },
    });
    return { transitioned: true };
  }

  async postCourierReversalForOrder(orderId: string, reason: "cancelled" | "returned", actorId?: string) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,merchant_id,delivery_company_id,agent_id,courier_fee_payable,currency_code,financial_snapshot_version")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.id) return;
    if (Number((order as any).financial_snapshot_version ?? 0) === 0) return;
    if (!(order as any).delivery_company_id) return;
    if (Number((order as any).courier_fee_payable ?? 0) <= 0) return;

    const row = {
      delivery_company_id: (order as any).delivery_company_id,
      agent_id: (order as any).agent_id ?? null,
      order_id: orderId,
      entry_type: "reversal",
      direction: "debit",
      amount: Number((order as any).courier_fee_payable ?? 0),
      currency_code: String((order as any).currency_code ?? "IQD"),
      status: "reversed",
      description: `Courier reversal after ${reason}`,
      reference_type: "order_status_transition",
      reference_id: reason,
      idempotency_key: this.buildIdempotencyKey(orderId, "reversal", reason),
      metadata: { reason },
      created_by: actorId ?? null,
    };

    const { error: reversalError } = await this.supabaseAdmin.client.from("courier_ledger_entries").upsert(row as any, {
      onConflict: "idempotency_key",
      ignoreDuplicates: true,
    });
    if (reversalError) throw reversalError;

    const { error: updateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({ courier_settlement_status: "reversed" } as any)
      .eq("id", orderId);
    if (updateError) throw updateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id ?? null,
      event_type: "courier_reversal_created",
      created_by: actorId ?? null,
      data: { reason, amount: row.amount },
    });
  }

  async markOrderCourierDisputed(orderId: string, actorId?: string, reasonCode?: string) {
    const nowIso = new Date().toISOString();
    const { data: order, error: orderError } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,merchant_id,delivery_company_id")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.id) throw new NotFoundException("Order not found.");

    const { error: orderUpdateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({ courier_settlement_status: "disputed" } as any)
      .eq("id", orderId);
    if (orderUpdateError) throw orderUpdateError;

    const { error: ledgerUpdateError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .update({ status: "disputed", settled_at: nowIso } as any)
      .eq("order_id", orderId)
      .neq("status", "settled");
    if (ledgerUpdateError) throw ledgerUpdateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id ?? null,
      event_type: "courier_dispute_hold",
      created_by: actorId ?? null,
      data: { reason_code: reasonCode ?? null },
    });
  }

  async releaseOrderCourierDispute(orderId: string, actorId?: string, notes?: string) {
    const { data: order, error: orderError } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,merchant_id,courier_settlement_status,courier_fee_payable,financial_snapshot_version,status")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.id) throw new NotFoundException("Order not found.");
    if (Number((order as any).financial_snapshot_version ?? 0) === 0) throw new ForbiddenException("Legacy order is not eligible for courier dispute release.");
    if (String((order as any).courier_settlement_status ?? "") !== "disputed") {
      throw new ForbiddenException("Order is not in courier disputed state.");
    }

    const { error: ledgerError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .update({ status: "payable", settled_at: null } as any)
      .eq("order_id", orderId)
      .eq("status", "disputed");
    if (ledgerError) throw ledgerError;

    const nextStatus = Number((order as any).courier_fee_payable ?? 0) > 0 && String((order as any).status ?? "") === "delivered" ? "payable" : "pending";
    const { error: orderUpdateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({ courier_settlement_status: nextStatus } as any)
      .eq("id", orderId);
    if (orderUpdateError) throw orderUpdateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id ?? null,
      event_type: "courier_dispute_release",
      created_by: actorId ?? null,
      data: { notes: notes ?? null, next_status: nextStatus },
    });
    return { ok: true, next_status: nextStatus };
  }

  async settleOrderCourier(orderId: string, payload: { notes?: string; reference?: string }, actorId?: string) {
    const { data: order, error: orderError } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,merchant_id,courier_settlement_status,financial_snapshot_version,delivery_company_id,courier_fee_payable,courier_fee_offset_applied")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order?.id) throw new NotFoundException("Order not found.");
    if (Number((order as any).financial_snapshot_version ?? 0) === 0) throw new ForbiddenException("Legacy order cannot be settled in courier ledger.");
    if (!(order as any).delivery_company_id || Number((order as any).courier_fee_payable ?? 0) <= 0) {
      throw new ForbiddenException("Order has no courier payable.");
    }
    if ((order as any).courier_fee_offset_applied) {
      throw new ForbiddenException("Courier settlement already handled via offset.");
    }
    const status = String((order as any).courier_settlement_status ?? "pending");
    if (status === "settled") throw new ForbiddenException("Courier is already settled.");
    if (!["payable", "in_payout"].includes(status)) {
      throw new ForbiddenException("Courier settlement requires payable or in_payout status.");
    }

    const nowIso = new Date().toISOString();
    const { error: ledgerError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .update({ status: "settled", settled_at: nowIso } as any)
      .eq("order_id", orderId)
      .in("status", ["payable", "in_payout", "accrued"]);
    if (ledgerError) throw ledgerError;

    const { error: orderUpdateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        courier_settlement_status: "settled",
        courier_settled_at: nowIso,
        courier_settlement_reference: payload.reference ?? null,
      } as any)
      .eq("id", orderId);
    if (orderUpdateError) throw orderUpdateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id ?? null,
      event_type: "courier_settled",
      created_by: actorId ?? null,
      data: { notes: payload.notes ?? null, reference: payload.reference ?? null },
    });
    return { ok: true };
  }

  async createCourierPayoutBatch(
    payload: { delivery_company_id: string; period_start?: string; period_end?: string; notes?: string | null },
    actorId?: string | null,
  ) {
    const { data: candidateRows, error: candidateError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .select("id,direction,amount,status,order_id,settlement_method,orders(financial_snapshot_version,courier_fee_offset_applied)")
      .eq("delivery_company_id", payload.delivery_company_id)
      .eq("status", "payable")
      .neq("settlement_method", "offset")
      .is("payout_batch_id", null);
    if (candidateError) throw candidateError;

    const entries = (candidateRows ?? []).filter((e: any) => {
      if (String(e.settlement_method ?? "") === "offset") return false;
      if (!e.order_id) return true;
      if (Boolean(e.orders?.courier_fee_offset_applied)) return false;
      return Number(e.orders?.financial_snapshot_version ?? 0) > 0;
    });
    if (!entries.length) return { ok: true, empty: true, message: "No payable courier entries available." };

    const totalCredits = entries
      .filter((e: any) => e.direction === "credit")
      .reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
    const totalDebits = entries
      .filter((e: any) => e.direction === "debit")
      .reduce((sum: number, e: any) => sum + Number(e.amount ?? 0), 0);
    const netAmount = totalCredits - totalDebits;

    const { data: batch, error: batchError } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .insert({
        delivery_company_id: payload.delivery_company_id,
        status: "draft",
        period_start: payload.period_start ?? null,
        period_end: payload.period_end ?? null,
        total_credits: totalCredits,
        total_debits: totalDebits,
        net_amount: netAmount,
        currency_code: "IQD",
        notes: payload.notes ?? null,
        created_by: actorId ?? null,
      } as any)
      .select("*")
      .single();
    if (batchError) throw batchError;

    const items = entries.map((entry: any) => ({
      payout_batch_id: (batch as any).id,
      courier_ledger_entry_id: entry.id,
      amount: Number(entry.amount ?? 0),
    }));
    const { error: itemsError } = await this.supabaseAdmin.client.from("courier_payout_batch_items").insert(items as any);
    if (itemsError) throw itemsError;

    const ledgerIds = entries.map((e: any) => e.id);
    const { error: ledgerUpdateError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .update({
        payout_batch_id: (batch as any).id,
        status: "in_payout",
      } as any)
      .in("id", ledgerIds);
    if (ledgerUpdateError) throw ledgerUpdateError;

    await this.appendFinanceEvent({
      event_type: "courier_payout_batch_created",
      created_by: actorId ?? null,
      data: { payout_batch_id: (batch as any).id, delivery_company_id: payload.delivery_company_id, entries_count: entries.length },
    });

    return { ok: true, batch, entries_count: entries.length };
  }

  async listCourierPayoutBatches(params: { delivery_company_id?: string; status?: string; limit?: number }) {
    let req = this.supabaseAdmin.client
      .from("courier_payout_batches")
      .select("*,delivery_companies(name)")
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params.limit ?? 100, 1), 500));
    if (params.delivery_company_id) req = req.eq("delivery_company_id", params.delivery_company_id);
    if (params.status) req = req.eq("status", params.status);
    const { data, error } = await req;
    if (error) throw error;
    return { batches: data ?? [] };
  }

  async getCourierPayoutBatchDetail(batchId: string) {
    const { data: batch, error: batchError } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .select("*,delivery_companies(name)")
      .eq("id", batchId)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch) throw new NotFoundException("Courier payout batch not found.");

    const { data: items, error: itemsError } = await this.supabaseAdmin.client
      .from("courier_payout_batch_items")
      .select("*,courier_ledger_entries(id,order_id,entry_type,direction,amount,status,description,reference_id)")
      .eq("payout_batch_id", batchId)
      .order("created_at", { ascending: true });
    if (itemsError) throw itemsError;

    return { batch, items: items ?? [] };
  }

  async approveCourierPayoutBatch(batchId: string, actorId?: string | null) {
    const { data: batch, error: fetchError } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!batch) throw new NotFoundException("Courier payout batch not found.");
    if ((batch as any).status !== "draft") throw new ForbiddenException("Only draft courier payout batches can be approved.");

    const { data, error } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: actorId ?? null,
        locked_at: new Date().toISOString(),
      } as any)
      .eq("id", batchId)
      .select("*")
      .single();
    if (error) throw error;

    await this.appendFinanceEvent({
      event_type: "courier_payout_batch_approved",
      created_by: actorId ?? null,
      data: { payout_batch_id: batchId },
    });

    return { ok: true, batch: data };
  }

  async settleCourierPayoutBatch(batchId: string, payload: { reference?: string | null; notes?: string | null }, actorId?: string | null) {
    const nowIso = new Date().toISOString();
    const { data: batch, error: fetchError } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!batch) throw new NotFoundException("Courier payout batch not found.");
    if (!["approved", "processing"].includes(String((batch as any).status))) {
      throw new ForbiddenException("Only approved or processing courier payout batches can be settled.");
    }

    const { error: batchUpdateError } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .update({
        status: "settled",
        reference: payload.reference ?? (batch as any).reference ?? null,
        notes: payload.notes ?? (batch as any).notes ?? null,
        settled_at: nowIso,
        locked_at: (batch as any).locked_at ?? nowIso,
      } as any)
      .eq("id", batchId);
    if (batchUpdateError) throw batchUpdateError;

    const { data: items, error: itemsError } = await this.supabaseAdmin.client
      .from("courier_payout_batch_items")
      .select("courier_ledger_entry_id")
      .eq("payout_batch_id", batchId);
    if (itemsError) throw itemsError;
    const ledgerIds = (items ?? []).map((i: any) => i.courier_ledger_entry_id).filter(Boolean);
    if (ledgerIds.length) {
      const { error: ledgerError } = await this.supabaseAdmin.client
        .from("courier_ledger_entries")
        .update({ status: "settled", settled_at: nowIso } as any)
        .in("id", ledgerIds);
      if (ledgerError) throw ledgerError;
    }

    const { data: impactedOrders, error: impactedOrdersError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .select("order_id")
      .in("id", ledgerIds);
    if (impactedOrdersError) throw impactedOrdersError;
    const orderIds = Array.from(new Set((impactedOrders ?? []).map((r: any) => r.order_id).filter(Boolean)));
    if (orderIds.length) {
      const { error: ordersUpdateError } = await this.supabaseAdmin.client
        .from("orders")
        .update({ courier_settlement_status: "settled", courier_settled_at: nowIso } as any)
        .in("id", orderIds);
      if (ordersUpdateError) throw ordersUpdateError;
    }

    await this.appendFinanceEvent({
      event_type: "courier_payout_batch_settled",
      created_by: actorId ?? null,
      data: { payout_batch_id: batchId, settled_entries: ledgerIds.length, reference: payload.reference ?? null },
    });

    return { ok: true, batch_id: batchId, settled_entries: ledgerIds.length };
  }

  async cancelCourierPayoutBatch(batchId: string, actorId?: string | null) {
    const { data: batch, error: fetchError } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();
    if (fetchError) throw fetchError;
    if (!batch) throw new NotFoundException("Courier payout batch not found.");
    if (String((batch as any).status) !== "draft") throw new ForbiddenException("Only draft courier payout batches can be cancelled.");

    const { error: itemsError } = await this.supabaseAdmin.client
      .from("courier_payout_batch_items")
      .delete()
      .eq("payout_batch_id", batchId);
    if (itemsError) throw itemsError;

    const { error: ledgerRollbackError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .update({ payout_batch_id: null, status: "payable" } as any)
      .eq("payout_batch_id", batchId)
      .eq("status", "in_payout");
    if (ledgerRollbackError) throw ledgerRollbackError;

    const { error: batchUpdateError } = await this.supabaseAdmin.client
      .from("courier_payout_batches")
      .update({ status: "cancelled", locked_at: null } as any)
      .eq("id", batchId);
    if (batchUpdateError) throw batchUpdateError;

    await this.appendFinanceEvent({
      event_type: "courier_payout_batch_cancelled",
      created_by: actorId ?? null,
      data: { payout_batch_id: batchId },
    });

    return { ok: true, batch_id: batchId };
  }

  async getCourierBalances() {
    const { data: companies, error: companiesError } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("id,name")
      .order("name", { ascending: true });
    if (companiesError) throw companiesError;

    const { data: ledgerRows, error: ledgerError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .select("delivery_company_id,status,direction,amount");
    if (ledgerError) throw ledgerError;

    const rows = ledgerRows ?? [];
    const signedByStatus = (targetRows: any[], status: string) =>
      targetRows
        .filter((r: any) => r.status === status)
        .reduce((sum: number, r: any) => sum + (r.direction === "credit" ? 1 : -1) * Number(r.amount ?? 0), 0);

    const balances = (companies ?? []).map((company: any) => {
      const cRows = rows.filter((r: any) => r.delivery_company_id === company.id);
      const accrued = signedByStatus(cRows, "accrued");
      const payable = signedByStatus(cRows, "payable");
      const inPayout = signedByStatus(cRows, "in_payout");
      const settled = signedByStatus(cRows, "settled");
      const reversed = signedByStatus(cRows, "reversed");
      const disputed = signedByStatus(cRows, "disputed");
      return {
        delivery_company_id: company.id,
        delivery_company_name: company.name ?? "—",
        accrued_total: accrued,
        payable_total: payable,
        in_payout_total: inPayout,
        settled_total: settled,
        reversed_total: reversed,
        disputed_total: disputed,
        outstanding_total: accrued + payable + inPayout,
      };
    });
    return { balances };
  }

  async getCourierReconciliationOrders(params?: { limit?: number; delivery_company_id?: string; status?: string }) {
    let req = this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,order_number,delivery_company_id,courier_fee_payable,courier_settlement_status,courier_settled_at,financial_snapshot_version,settlement_status,courier_cod_remittance_mode,cash_gross_expected_amount,courier_fee_retained_amount,cash_net_expected_from_courier,cash_actual_remitted_amount,cash_remittance_difference,courier_fee_offset_applied,delivery_companies(name)",
      )
      .not("delivery_company_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(params?.limit ?? 200, 1), 500));
    if (params?.delivery_company_id) req = req.eq("delivery_company_id", params.delivery_company_id);
    if (params?.status) req = req.eq("courier_settlement_status", params.status);
    const { data, error } = await req;
    if (error) throw error;
    return { orders: data ?? [] };
  }

  async listCourierLedgerEntries(params: { delivery_company_id: string; status?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    let req = this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .select("*,orders(order_number)")
      .eq("delivery_company_id", params.delivery_company_id)
      .order("created_at", { ascending: false })
      .range(params.offset ?? 0, (params.offset ?? 0) + Math.min(Math.max(params.limit ?? 100, 1), 500) - 1);
    if (params.status) req = req.eq("status", params.status);
    if (params.from) req = req.gte("created_at", params.from);
    if (params.to) req = req.lte("created_at", params.to);
    const { data, error } = await req;
    if (error) throw error;
    return { entries: data ?? [] };
  }

  async getCourierCodReconciliationSummary(deliveryCompanyId?: string) {
    let ordersReq = this.supabaseAdmin.client
      .from("orders")
      .select(
        "delivery_company_id,courier_cod_remittance_mode,cash_gross_expected_amount,courier_fee_retained_amount,cash_net_expected_from_courier,cash_actual_remitted_amount,cash_remittance_difference,courier_fee_offset_applied",
      )
      .not("delivery_company_id", "is", null);
    if (deliveryCompanyId) {
      ordersReq = ordersReq.eq("delivery_company_id", deliveryCompanyId);
    }
    const { data: orders, error: ordersError } = await ordersReq;
    if (ordersError) throw ordersError;

    const { data: companies, error: companiesError } = await this.supabaseAdmin.client
      .from("delivery_companies")
      .select("id,name")
      .order("name", { ascending: true });
    if (companiesError) throw companiesError;

    const { data: ledgerRows, error: ledgerError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .select("delivery_company_id,status,direction,amount,settlement_method")
      .eq("entry_type", "delivery_fee_accrual");
    if (ledgerError) throw ledgerError;

    const byCompany = new Map<string, any>();
    for (const company of companies ?? []) {
      byCompany.set(company.id, {
        delivery_company_id: company.id,
        delivery_company_name: company.name ?? "—",
        gross_collected_total: 0,
        courier_retained_total: 0,
        net_expected_total: 0,
        actual_remitted_total: 0,
        difference_total: 0,
        offset_settled_courier_fees: 0,
        payout_payable_courier_fees: 0,
      });
    }

    for (const order of orders ?? []) {
      const row = byCompany.get((order as any).delivery_company_id);
      if (!row) continue;
      row.gross_collected_total += Number((order as any).cash_gross_expected_amount ?? 0);
      row.courier_retained_total += Number((order as any).courier_fee_retained_amount ?? 0);
      row.net_expected_total += Number((order as any).cash_net_expected_from_courier ?? 0);
      row.actual_remitted_total += Number((order as any).cash_actual_remitted_amount ?? 0);
      row.difference_total += Number((order as any).cash_remittance_difference ?? 0);
    }

    for (const ledger of ledgerRows ?? []) {
      const row = byCompany.get((ledger as any).delivery_company_id);
      if (!row) continue;
      const amount = Number((ledger as any).amount ?? 0) * ((ledger as any).direction === "credit" ? 1 : -1);
      if ((ledger as any).settlement_method === "offset" || (ledger as any).status === "settled" && (ledger as any).settlement_method === "offset") {
        row.offset_settled_courier_fees += amount;
      }
      if ((ledger as any).status === "payable") {
        row.payout_payable_courier_fees += amount;
      }
    }

    return {
      rows: Array.from(byCompany.values()),
    };
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
    actorId?: string | null,
  ) {
    const safeAmount = Math.max(0, Number(payload.amount ?? 0));
    if (!safeAmount) throw new ForbiddenException("Adjustment amount must be greater than zero.");
    if (!payload.reason_code?.trim()) throw new ForbiddenException("reason_code is required.");

    const idempotencyKey = `courier_manual_adjustment:${payload.delivery_company_id}:${payload.direction}:${safeAmount}:${payload.reason_code}:${payload.reference_id ?? ""}`;
    const row = {
      delivery_company_id: payload.delivery_company_id,
      agent_id: payload.agent_id ?? null,
      order_id: payload.order_id ?? null,
      entry_type: "manual_adjustment",
      direction: payload.direction,
      amount: safeAmount,
      currency_code: payload.currency_code ?? "IQD",
      status: "payable",
      description: payload.description ?? "Courier manual adjustment",
      reference_type: "manual_adjustment",
      reference_id: payload.reference_id ?? null,
      idempotency_key: idempotencyKey,
      metadata: {
        reason_code: payload.reason_code,
        created_from: "admin_courier_manual_adjustment",
      },
      created_by: actorId ?? null,
    };

    const { data, error } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .upsert(row as any, { onConflict: "idempotency_key" })
      .select("*")
      .single();
    if (error) throw error;

    await this.appendFinanceEvent({
      order_id: payload.order_id ?? null,
      event_type: "courier_manual_adjustment_created",
      created_by: actorId ?? null,
      data: {
        courier_ledger_entry_id: (data as any).id,
        delivery_company_id: payload.delivery_company_id,
        direction: payload.direction,
        amount: safeAmount,
        reason_code: payload.reason_code,
      },
    });

    return { ok: true, entry: data };
  }

  async reverseCourierLedgerEntry(
    ledgerEntryId: string,
    payload: { reason_code: string; description?: string | null },
    actorId?: string | null,
  ) {
    const reasonCode = String(payload.reason_code ?? "").trim();
    if (!reasonCode) throw new ForbiddenException("reason_code is required.");

    const { data: source, error: sourceError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .select("*")
      .eq("id", ledgerEntryId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) throw new NotFoundException("Courier ledger entry not found.");
    if ((source as any).status === "reversed") throw new ForbiddenException("Entry is already reversed.");

    const reversalDirection = (source as any).direction === "credit" ? "debit" : "credit";
    const idempotencyKey = `reverse_courier_ledger:${ledgerEntryId}:${reasonCode}`;
    const reversalRow = {
      delivery_company_id: (source as any).delivery_company_id,
      agent_id: (source as any).agent_id ?? null,
      order_id: (source as any).order_id ?? null,
      entry_type: "reversal",
      direction: reversalDirection,
      amount: Number((source as any).amount ?? 0),
      currency_code: (source as any).currency_code ?? "IQD",
      status: "reversed",
      description: payload.description ?? `Reversal for courier ledger ${ledgerEntryId}`,
      reference_type: "ledger_reversal",
      reference_id: ledgerEntryId,
      idempotency_key: idempotencyKey,
      metadata: { reversed_ledger_entry_id: ledgerEntryId, reason_code: reasonCode },
      created_by: actorId ?? null,
    };

    const { data: inserted, error: insertError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .upsert(reversalRow as any, { onConflict: "idempotency_key" })
      .select("*")
      .single();
    if (insertError) throw insertError;

    const { error: updateError } = await this.supabaseAdmin.client
      .from("courier_ledger_entries")
      .update({ status: "reversed", settled_at: new Date().toISOString() } as any)
      .eq("id", ledgerEntryId);
    if (updateError) throw updateError;

    await this.appendFinanceEvent({
      order_id: (source as any).order_id ?? null,
      event_type: "courier_ledger_entry_reversed",
      created_by: actorId ?? null,
      data: {
        source_entry_id: ledgerEntryId,
        reversal_entry_id: (inserted as any).id,
        reason_code: reasonCode,
      },
    });

    return { ok: true, source_entry_id: ledgerEntryId, reversal_entry: inserted };
  }
}
