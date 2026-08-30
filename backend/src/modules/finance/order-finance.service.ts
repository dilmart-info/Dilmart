import { Injectable, Logger } from "@nestjs/common";
import { CommercialEngineService, type CommercialResolveResult } from "./commercial-engine.service";
import { CourierFinanceService } from "./courier-finance.service";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

/**
 * M11.0 foundation shell.
 * This service becomes the single source for finance-event orchestration in later M11 phases.
 */
@Injectable()
export class OrderFinanceService {
  private readonly logger = new Logger(OrderFinanceService.name);
  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly courierFinanceService: CourierFinanceService,
    private readonly commercialEngineService: CommercialEngineService,
  ) {}

  async getActiveCommercialTerms(merchantId: string) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_commercial_terms")
      .select("*")
      .eq("merchant_id", merchantId)
      .eq("is_active", true)
      .or(`active_to.is.null,active_to.gte.${nowIso}`)
      .lte("active_from", nowIso)
      .order("active_from", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (
      data ?? {
        commission_type: "percentage",
        commission_rate: 0,
        assisted_fee_rate: 0,
        delivery_billing_mode: "customer_pays",
      }
    );
  }

  computeOrderFinancialSnapshot(input: {
    subtotal: number;
    discount: number;
    deliveryFeeCharged: number;
    channel?: string | null;
    categoryIds?: string[];
    terms: {
      commission_type?: string;
      commission_rate?: number;
      assisted_fee_rate?: number;
      platform_fee_rate?: number;
      delivery_billing_mode?: string;
      commission_rule_id?: string | null;
      assisted_fee_rule_id?: string | null;
      platform_fee_rule_id?: string | null;
      delivery_billing_rule_id?: string | null;
      plan_id?: string | null;
      plan_code?: string | null;
      commercial_snapshot_version?: number;
      plan_defaults?: CommercialResolveResult["plan_defaults"];
    };
  }) {
    const merchandiseSubtotal = Number(input.subtotal ?? 0);
    const discountTotal = Number(input.discount ?? 0);
    const deliveryFeeCharged = Number(input.deliveryFeeCharged ?? 0);
    const merchantGrossAmount = Math.max(0, merchandiseSubtotal - discountTotal);

    const commissionType = String(input.terms.commission_type ?? "percentage");
    const commissionRate = Number(input.terms.commission_rate ?? 0);
    const assistedFeeRate = Number(input.terms.assisted_fee_rate ?? 0);
    const platformFeeRate = Number(input.terms.platform_fee_rate ?? 0);
    const deliveryBillingMode = String(input.terms.delivery_billing_mode ?? "customer_pays");

    const platformCommissionAmount =
      commissionType === "fixed" ? Math.max(0, commissionRate) : Math.max(0, (merchantGrossAmount * commissionRate) / 100);
    const isAssistedChannel = input.channel === "whatsapp_assisted" || input.channel === "manual_assisted";
    const platformAssistedFeeAmount = isAssistedChannel ? Math.max(0, (merchantGrossAmount * assistedFeeRate) / 100) : 0;
    const platformExtraFeeAmount = Math.max(0, (merchantGrossAmount * platformFeeRate) / 100);
    const courierFeePayable = Math.max(0, deliveryFeeCharged);

    const merchantDeliveryDeduction = deliveryBillingMode === "merchant_pays" ? courierFeePayable : deliveryBillingMode === "mixed" ? courierFeePayable * 0.5 : 0;
    const merchantNetAmount = Math.max(
      0,
      merchantGrossAmount - platformCommissionAmount - platformAssistedFeeAmount - platformExtraFeeAmount - merchantDeliveryDeduction,
    );
    const grossCollectedAmount = Math.max(0, merchantGrossAmount + deliveryFeeCharged);
    const platformNetRevenueAmount = Math.max(0, platformCommissionAmount + platformAssistedFeeAmount + platformExtraFeeAmount);

    return {
      merchandise_subtotal: merchandiseSubtotal,
      discount_total: discountTotal,
      delivery_fee_charged: deliveryFeeCharged,
      platform_commission_type: commissionType,
      platform_commission_rate: commissionRate,
      platform_commission_amount: platformCommissionAmount,
      platform_assisted_fee_amount: platformAssistedFeeAmount,
      platform_extra_fee_amount: platformExtraFeeAmount,
      courier_fee_payable: courierFeePayable,
      merchant_gross_amount: merchantGrossAmount,
      merchant_net_amount: merchantNetAmount,
      gross_collected_amount: grossCollectedAmount,
      platform_net_revenue_amount: platformNetRevenueAmount,
      currency_code: "IQD",
      financial_snapshot_version: 1,
      commission_rule_id: input.terms.commission_rule_id ?? null,
      assisted_fee_rule_id: input.terms.assisted_fee_rule_id ?? null,
      platform_fee_rule_id: input.terms.platform_fee_rule_id ?? null,
      delivery_billing_rule_id: input.terms.delivery_billing_rule_id ?? null,
      resolved_plan_id: input.terms.plan_id ?? null,
      resolved_plan_code: input.terms.plan_code ?? null,
      commercial_snapshot_version: Number(input.terms.commercial_snapshot_version ?? 0),
    };
  }

  async resolveCommercialTerms(
    input: {
      merchant_id: string;
      channel?: string | null;
      order_value?: number;
      category_ids?: string[];
      effective_at?: string;
    },
    options?: { debug?: boolean },
  ): Promise<CommercialResolveResult> {
    const raw = await this.commercialEngineService.resolveCommercialTerms(input, options);
    const sanitized = await this.sanitizeCommercialRuleReferences(raw);
    if (raw.debug) {
      return { ...sanitized, debug: raw.debug };
    }
    return sanitized;
  }

  /**
   * M13-R: ensures snapshot rule IDs still point at active, supported rows; otherwise falls back to plan_defaults (no silent mismatch).
   */
  private async sanitizeCommercialRuleReferences(terms: CommercialResolveResult): Promise<CommercialResolveResult> {
    const ids = [terms.commission_rule_id, terms.assisted_fee_rule_id, terms.platform_fee_rule_id, terms.delivery_billing_rule_id].filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (!ids.length) return terms;

    const { data, error } = await this.supabaseAdmin.client.from("commercial_rules").select("id,is_active,value_type").in("id", ids);
    if (error) throw error;
    type RuleRefRow = { id: string; is_active: boolean; value_type: string | null };
    const valid = new Map<string, { is_active: boolean; value_type: string }>();
    for (const r of (data ?? []) as RuleRefRow[]) {
      valid.set(String(r.id), {
        is_active: !!r.is_active,
        value_type: String(r.value_type ?? "").toLowerCase(),
      });
    }

    const isBad = (ruleId: string | null | undefined) => {
      if (!ruleId) return false;
      const row = valid.get(ruleId);
      return !row || !row.is_active || row.value_type === "hybrid";
    };

    let out: CommercialResolveResult = { ...terms };

    if (isBad(out.commission_rule_id)) {
      this.logger.warn({
        message: "M13-R: commission_rule_id invalid or inactive; using plan_defaults.",
        commission_rule_id: out.commission_rule_id,
      });
      out = {
        ...out,
        commission_rule_id: null,
        commission_type: out.plan_defaults.default_commission_type,
        commission_rate: out.plan_defaults.default_commission_rate,
      };
    }
    if (isBad(out.assisted_fee_rule_id)) {
      this.logger.warn({ message: "M13-R: assisted_fee_rule_id invalid; using plan_defaults.", assisted_fee_rule_id: out.assisted_fee_rule_id });
      out = { ...out, assisted_fee_rule_id: null, assisted_fee_rate: out.plan_defaults.default_assisted_fee_rate };
    }
    if (isBad(out.platform_fee_rule_id)) {
      this.logger.warn({ message: "M13-R: platform_fee_rule_id invalid; using plan_defaults.", platform_fee_rule_id: out.platform_fee_rule_id });
      out = { ...out, platform_fee_rule_id: null, platform_fee_rate: out.plan_defaults.default_platform_fee_rate };
    }
    if (isBad(out.delivery_billing_rule_id)) {
      this.logger.warn({
        message: "M13-R: delivery_billing_rule_id invalid; using plan_defaults.",
        delivery_billing_rule_id: out.delivery_billing_rule_id,
      });
      out = {
        ...out,
        delivery_billing_rule_id: null,
        delivery_billing_mode: out.plan_defaults.default_delivery_billing_mode,
      };
    }

    return out;
  }

  /**
   * Generates deterministic idempotency keys for future financial events.
   * The key format is intentionally stable to simplify DB uniqueness constraints in next phases.
   */
  buildIdempotencyKey(orderId: string, eventType: string, referenceId?: string) {
    const suffix = referenceId ? `:${referenceId}` : "";
    return `order:${orderId}:event:${eventType}${suffix}`;
  }

  /**
   * Placeholder hook for future M11 finance posting pipeline.
   * Intentionally side-effect free in M11.0.
   */
  async emitOrderFinanceEvent(orderId: string, eventType: string, payload: Record<string, unknown> = {}) {
    this.logger.debug({
      message: "Order finance event shell invoked.",
      orderId,
      eventType,
      payload,
      stage: "M11.0",
    });
    return {
      accepted: true,
      stage: "M11.0",
      idempotency_key: this.buildIdempotencyKey(orderId, eventType, String(payload["reference_id"] ?? "")),
    };
  }

  /**
   * Finance Consistency Model — Option B (Idempotent Event-Driven Safe)
   *
   * The `transition_delivery_status` PostgreSQL RPC commits atomically:
   *   - order.delivery_status = 'delivered'
   *   - delivery_events row inserted
   *   - A sentinel row is written to order_finance_events
   *     (idempotency_key = 'finance-sentinel-<order_id>') via ON CONFLICT DO NOTHING
   *
   * This method runs AFTER the RPC commits, in the NestJS process.
   * If it fails for any reason (network, exception, process crash), the sentinel
   * row in order_finance_events remains and a reconciliation job can detect
   * orders where 'delivery_completed_pending_finance' exists without a
   * corresponding 'order_accrued' event and retry this method.
   *
   * Duplicate-safe: merchant_ledger_entries use idempotency_key + upsert
   * ignoreDuplicates, so calling this method twice for the same order is safe.
   * The settlement_status = 'accrued' update is also idempotent.
   *
   * Runbook (reconciliation):
   *   SELECT o.id FROM orders o
   *   JOIN order_finance_events fen ON fen.order_id = o.id
   *     AND fen.event_type = 'delivery_completed_pending_finance'
   *   WHERE NOT EXISTS (
   *     SELECT 1 FROM order_finance_events fac
   *     WHERE fac.order_id = o.id AND fac.event_type = 'order_accrued'
   *   );
   *   -- For each: call handleOrderStatusTransition(orderId, 'pending', 'delivered')
   */
  async handleOrderStatusTransition(input: {
    orderId: string;
    previousStatus: string;
    nextStatus: string;
    actorId?: string;
  }) {
    const movedToDelivered = input.previousStatus !== "delivered" && input.nextStatus === "delivered";
    const movedToReversal = input.previousStatus === "delivered" && (input.nextStatus === "cancelled" || input.nextStatus === "returned");

    if (movedToDelivered) {
      // Phase 5 guard: skip if finance was already applied for this order.
      // merchant_ledger_entries are idempotent (upsert+ignoreDuplicates), but
      // this early-exit avoids redundant DB round-trips on duplicate calls.
      const { data: existing } = await this.supabaseAdmin.client
        .from("orders")
        .select("settlement_status")
        .eq("id", input.orderId)
        .maybeSingle();
      if ((existing as any)?.settlement_status === "accrued") {
        // Finance already applied — skip to prevent duplicate event log rows.
        return;
      }

      await this.postMerchantAccrualEntries(input.orderId, input.actorId);
      await this.evaluatePayableTransition(input.orderId, input.actorId);
      await this.courierFinanceService.postCourierAccrualForOrder(input.orderId, input.actorId);
      await this.courierFinanceService.evaluateCourierPayableTransition(input.orderId, input.actorId);
      return;
    }

    if (movedToReversal) {
      await this.postMerchantReversalEntry(input.orderId, input.nextStatus as "cancelled" | "returned", input.actorId);
      await this.courierFinanceService.postCourierReversalForOrder(input.orderId, input.nextStatus as "cancelled" | "returned", input.actorId);
    }
  }

  private async postMerchantAccrualEntries(orderId: string, actorId?: string) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        "id, merchant_id, merchant_gross_amount, merchant_net_amount, platform_commission_amount, platform_assisted_fee_amount, platform_extra_fee_amount, courier_fee_payable, settlement_status, currency_code, delivery_fee_charged, financial_snapshot_version",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.merchant_id) return;
    if (Number((order as any).financial_snapshot_version ?? 0) === 0) {
      await this.appendFinanceEvent({
        order_id: orderId,
        merchant_id: (order as any).merchant_id,
        event_type: "order_accrual_skipped_legacy",
        created_by: actorId ?? null,
        payload: { reason: "financial_snapshot_version=0" },
      });
      return;
    }

    const merchantGrossAmount = Number((order as any).merchant_gross_amount ?? 0);
    const merchantNetAmount = Number((order as any).merchant_net_amount ?? 0);
    const commissionAmount =
      Number((order as any).platform_commission_amount ?? 0) +
      Number((order as any).platform_assisted_fee_amount ?? 0) +
      Number((order as any).platform_extra_fee_amount ?? 0);
    const deliveryDeduction = Math.max(0, merchantGrossAmount - merchantNetAmount - commissionAmount);
    const currencyCode = String((order as any).currency_code ?? "IQD");

    const entries = [
      {
        merchant_id: (order as any).merchant_id,
        order_id: orderId,
        entry_type: "order_accrual",
        direction: "credit",
        amount: merchantGrossAmount,
        currency_code: currencyCode,
        status: "accrued",
        description: "Order accrual at delivery",
        reference_type: "order_status_transition",
        reference_id: "delivered",
        idempotency_key: this.buildIdempotencyKey(orderId, "order_accrual"),
        created_by: actorId ?? null,
      },
      {
        merchant_id: (order as any).merchant_id,
        order_id: orderId,
        entry_type: "commission_charge",
        direction: "debit",
        amount: Math.max(0, commissionAmount),
        currency_code: currencyCode,
        status: "accrued",
        description: "Platform commission charge",
        reference_type: "order_status_transition",
        reference_id: "delivered",
        idempotency_key: this.buildIdempotencyKey(orderId, "commission_charge"),
        created_by: actorId ?? null,
      },
      {
        merchant_id: (order as any).merchant_id,
        order_id: orderId,
        entry_type: "delivery_deduction",
        direction: "debit",
        amount: deliveryDeduction,
        currency_code: currencyCode,
        status: "accrued",
        description: "Delivery deduction from merchant share",
        reference_type: "order_status_transition",
        reference_id: "delivered",
        idempotency_key: this.buildIdempotencyKey(orderId, "delivery_deduction"),
        created_by: actorId ?? null,
      },
    ].filter((row) => Number(row.amount) > 0);

    if (entries.length) {
      const { error: insertError } = await this.supabaseAdmin.client.from("merchant_ledger_entries").upsert(entries, {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      });
      if (insertError) throw insertError;
    }

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id,
      event_type: "order_accrued",
      created_by: actorId ?? null,
      payload: {
        entries_posted: entries.map((e) => ({ entry_type: e.entry_type, direction: e.direction, amount: e.amount })),
      },
    });

    const { error: updateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        settlement_status: "accrued",
        courier_settlement_status: Number((order as any).delivery_fee_charged ?? 0) > 0 ? "payable" : "pending",
      } as any)
      .eq("id", orderId);
    if (updateError) throw updateError;
  }

  async evaluatePayableTransition(orderId: string, actorId?: string) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,merchant_id,status,payment_method,payment_status,collection_status,settlement_status,courier_cod_remittance_mode,cash_gross_expected_amount,cash_net_expected_from_courier,cash_actual_remitted_amount",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.id || !order?.merchant_id) return { transitioned: false, reason: "order_not_found" as const };
    if ((order as any).settlement_status === "payable" || (order as any).settlement_status === "in_payout" || (order as any).settlement_status === "settled") {
      return { transitioned: false, reason: "already_payable_or_beyond" as const };
    }
    if ((order as any).status !== "delivered") return { transitioned: false, reason: "not_delivered" as const };

    const paymentMethod = String((order as any).payment_method ?? "cod").toLowerCase();
    const paymentStatus = String((order as any).payment_status ?? "unpaid").toLowerCase();
    const collectionStatus = String((order as any).collection_status ?? "not_collected").toLowerCase();

    let canTransition = false;
    if (paymentMethod === "cod") {
      const mode = String((order as any).courier_cod_remittance_mode ?? "gross_remittance");
      const expected =
        mode === "net_remittance"
          ? Number((order as any).cash_net_expected_from_courier ?? 0)
          : Number((order as any).cash_gross_expected_amount ?? 0);
      const actual = Number((order as any).cash_actual_remitted_amount ?? 0);
      const hasCollectionFlag = collectionStatus === "remitted_to_platform" || collectionStatus === "remitted_to_merchant";
      // Backward compatibility for older rows without M18 snapshot fields.
      canTransition = hasCollectionFlag && (expected <= 0 ? true : actual >= expected);
    } else {
      canTransition = paymentStatus === "paid";
    }
    if (!canTransition) return { transitioned: false, reason: "conditions_not_met" as const };

    const { error: orderUpdateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({ settlement_status: "payable" } as any)
      .eq("id", orderId)
      .neq("settlement_status", "payable");
    if (orderUpdateError) throw orderUpdateError;

    const { error: ledgerError } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .update({ status: "payable" } as any)
      .eq("order_id", orderId)
      .eq("status", "accrued");
    if (ledgerError) throw ledgerError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id,
      event_type: "order_marked_payable",
      created_by: actorId ?? null,
      payload: {
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        collection_status: collectionStatus,
      },
    });
    return { transitioned: true };
  }

  private async postMerchantReversalEntry(orderId: string, reason: "cancelled" | "returned", actorId?: string) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id, merchant_id, merchant_net_amount, currency_code")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order?.merchant_id) return;

    const reversalEntry = {
      merchant_id: (order as any).merchant_id,
      order_id: orderId,
      entry_type: "refund_reversal",
      direction: "debit",
      amount: Math.max(0, Number((order as any).merchant_net_amount ?? 0)),
      currency_code: String((order as any).currency_code ?? "IQD"),
      status: "reversed",
      reversal_reason_code: reason === "cancelled" ? "ORDER_CANCELLED_AFTER_DELIVERY" : "ORDER_RETURNED_AFTER_DELIVERY",
      description: `Order reversal after ${reason}`,
      reference_type: "order_status_transition",
      reference_id: reason,
      idempotency_key: this.buildIdempotencyKey(orderId, "refund_reversal", reason),
      metadata: { source: "status_transition", reason },
      created_by: actorId ?? null,
    };

    if (Number(reversalEntry.amount) > 0) {
      const { error: reversalError } = await this.supabaseAdmin.client.from("merchant_ledger_entries").upsert(reversalEntry, {
        onConflict: "idempotency_key",
        ignoreDuplicates: true,
      });
      if (reversalError) throw reversalError;
    }

    const { error: updateError } = await this.supabaseAdmin.client
      .from("orders")
      .update({
        settlement_status: "reversed",
        courier_settlement_status: "reversed",
      } as any)
      .eq("id", orderId);
    if (updateError) throw updateError;

    await this.appendFinanceEvent({
      order_id: orderId,
      merchant_id: (order as any).merchant_id,
      event_type: "order_reversed",
      created_by: actorId ?? null,
      payload: {
        reason,
        reversal_amount: reversalEntry.amount,
      },
    });
  }

  private async appendFinanceEvent(payload: {
    order_id?: string | null;
    merchant_id?: string | null;
    event_type: string;
    created_by?: string | null;
    payload?: Record<string, unknown>;
  }) {
    const { error } = await this.supabaseAdmin.client.from("order_finance_events").insert({
      order_id: payload.order_id ?? null,
      merchant_id: payload.merchant_id ?? null,
      event_type: payload.event_type,
      payload: payload.payload ?? {},
      created_by: payload.created_by ?? null,
    } as any);
    if (error) throw error;
  }
}
