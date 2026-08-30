import { createHash } from "crypto";
import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { assertJenniWebhookSystemCode } from "./jenni-webhook.util";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { OrderFinanceService } from "../finance/order-finance.service";
import { DeliveryOperationsService, DeliveryStatus } from "../shipping/delivery-operations.service";
import { JenniClientService } from "./jenni-client.service";
import { mapJenniProviderUpdate } from "./jenni-status-mapper";
import type { JenniProviderUpdate } from "./jenni.types";

@Injectable()
export class JenniSyncService {
  private readonly logger = new Logger(JenniSyncService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly deliveryOps: DeliveryOperationsService,
    private readonly orderFinance: OrderFinanceService,
    private readonly jenniClient: JenniClientService,
  ) {}

  hashPayload(payload: unknown): string {
    return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  }

  async getIntegrationByOrderId(orderId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .select("*")
      .eq("order_id", orderId)
      .eq("provider_code", "jenni")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private async recordSyncEvent(input: {
    provider_shipment_id?: string | null;
    shipment_number?: string | null;
    action_code?: string | null;
    current_step?: string | null;
    payload: unknown;
    source: "webhook" | "query_sync" | "manual_sync";
  }): Promise<"new" | "duplicate"> {
    const payload_hash = this.hashPayload(input.payload);
    const { error } = await this.supabaseAdmin.client.from("delivery_provider_sync_events").insert({
      provider_code: "jenni",
      provider_shipment_id: input.provider_shipment_id ? String(input.provider_shipment_id) : null,
      shipment_number: input.shipment_number ?? null,
      action_code: input.action_code ?? null,
      current_step: input.current_step ?? null,
      payload_hash,
      payload: input.payload as Record<string, unknown>,
      source: input.source,
      processed_at: new Date().toISOString(),
    });

    if (error) {
      if (String((error as { code?: string }).code) === "23505") return "duplicate";
      throw error;
    }
    return "new";
  }

  private async findOrderIdForUpdate(update: JenniProviderUpdate): Promise<string | null> {
    const externalId = String(update.external_id ?? update.external_shipment_id ?? "").trim();
    if (externalId) {
      const { data } = await this.supabaseAdmin.client
        .from("order_delivery_integrations")
        .select("order_id")
        .eq("provider_code", "jenni")
        .eq("external_shipment_id", externalId)
        .maybeSingle();
      if (data?.order_id) return data.order_id as string;
    }

    const shipmentNumber = String(update.shipment_number ?? "").trim();
    if (shipmentNumber) {
      const { data: byIntegration } = await this.supabaseAdmin.client
        .from("order_delivery_integrations")
        .select("order_id")
        .eq("provider_code", "jenni")
        .eq("external_shipment_number", shipmentNumber)
        .maybeSingle();
      if (byIntegration?.order_id) return byIntegration.order_id as string;

      const normalized = shipmentNumber.replace("#", "");
      const { data: byOrder } = await this.supabaseAdmin.client
        .from("orders")
        .select("id")
        .eq("order_number", normalized)
        .maybeSingle();
      if (byOrder?.id) return byOrder.id as string;
    }

    const providerShipmentId = update.shipment_id != null ? String(update.shipment_id) : "";
    if (providerShipmentId) {
      const { data } = await this.supabaseAdmin.client
        .from("order_delivery_integrations")
        .select("order_id")
        .eq("provider_code", "jenni")
        .eq("provider_shipment_id", providerShipmentId)
        .maybeSingle();
      if (data?.order_id) return data.order_id as string;
    }

    return null;
  }

  private async applyDeliveryTransition(orderId: string, target: DeliveryStatus, reason: string) {
    const actor = { actorType: "system" as const, actorId: undefined };
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select("id,delivery_status,status,delivery_company_id")
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new NotFoundException("Order not found.");

    const current = String((order as any).delivery_status ?? "pending_assignment") as DeliveryStatus;
    if (current === target) return;

    try {
      if (target === "picked_up") await this.deliveryOps.markPickedUp(orderId, actor);
      else if (target === "in_transit") await this.deliveryOps.markInTransit(orderId, actor);
      else if (target === "delivered") await this.deliveryOps.markDelivered(orderId, actor);
      else if (target === "returned") await this.deliveryOps.markReturned(orderId, "jenni_return", reason, actor);
      else if (target === "failed") await this.deliveryOps.markFailed(orderId, "jenni_failed", reason, actor);
      else if (target === "assigned_to_company" && !(order as any).delivery_company_id) {
        throw new Error("needs_company");
      }
    } catch {
      await this.supabaseAdmin.client.rpc("admin_override_delivery_status" as any, {
        p_order_id: orderId,
        p_next_status: target,
        p_actor_id: null,
        p_reason: reason,
      });
    }

    if (target === "delivered") {
      const { data: refreshed } = await this.supabaseAdmin.client
        .from("orders")
        .select("settlement_status")
        .eq("id", orderId)
        .maybeSingle();
      if ((refreshed as any)?.settlement_status !== "accrued") {
        await this.orderFinance.handleOrderStatusTransition({
          orderId,
          previousStatus: "preparing",
          nextStatus: "delivered",
        });
      }
    }
  }

  private async insertDeliveryEvent(orderId: string, eventType: string, notes: string, metadata: Record<string, unknown>) {
    const { data: order } = await this.supabaseAdmin.client
      .from("orders")
      .select("delivery_company_id,agent_id,delivery_status")
      .eq("id", orderId)
      .maybeSingle();

    await this.supabaseAdmin.client.from("delivery_events").insert({
      order_id: orderId,
      event_type: eventType,
      from_status: (order as any)?.delivery_status ?? null,
      to_status: (order as any)?.delivery_status ?? null,
      delivery_company_id: (order as any)?.delivery_company_id ?? null,
      agent_id: (order as any)?.agent_id ?? null,
      actor_type: "external_provider",
      notes,
      metadata,
    });
  }

  async applyProviderUpdate(
    update: JenniProviderUpdate,
    source: "webhook" | "query_sync" | "manual_sync",
  ): Promise<{ ok: boolean; duplicate?: boolean; order_id?: string }> {
    const current_step = update.current_step ?? (update as any).step ?? (update as any).status ?? (update as any).shipment_step;
    const current_step_ar = update.current_step_ar ?? (update as any).step_ar ?? (update as any).status_ar;
    const current_stage = update.current_stage ?? (update as any).stage;

    const normalizedUpdate = {
      ...update,
      current_step,
      current_step_ar,
      current_stage,
    };

    const dedupe = await this.recordSyncEvent({
      provider_shipment_id: update.shipment_id != null ? String(update.shipment_id) : null,
      shipment_number: update.shipment_number ?? null,
      action_code: update.action_code ?? null,
      current_step: current_step ?? null,
      payload: update,
      source,
    });
    if (dedupe === "duplicate") {
      if (source === "manual_sync") {
        const orderId = await this.findOrderIdForUpdate(update);
        if (orderId) {
          await this.supabaseAdmin.client
            .from("order_delivery_integrations")
            .update({
              last_synced_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("order_id", orderId)
            .eq("provider_code", "jenni");
        }
      }
      return { ok: true, duplicate: true };
    }

    const orderId = await this.findOrderIdForUpdate(update);
    if (!orderId) {
      this.logger.warn("Jenni update could not be matched to a local order.");
      return { ok: true };
    }

    const mapping = mapJenniProviderUpdate(normalizedUpdate);
    const providerShipmentId = update.shipment_id != null ? String(update.shipment_id) : null;

    const amountIqd = update.amount_iqd != null ? Number(update.amount_iqd) : null;
    let amountChangeFlag = mapping.requiresAdminReview;
    if (amountIqd != null && Number.isFinite(amountIqd)) {
      const { data: orderRow } = await this.supabaseAdmin.client
        .from("orders")
        .select("total,cash_expected_amount")
        .eq("id", orderId)
        .maybeSingle();
      const expected = Number((orderRow as any)?.cash_expected_amount ?? (orderRow as any)?.total ?? 0);
      if (Math.abs(expected - amountIqd) > 1) {
        amountChangeFlag = true;
        await this.insertDeliveryEvent(orderId, "amount_change_reported", "Jenni reported COD amount change", {
          expected_amount_iqd: expected,
          provider_amount_iqd: amountIqd,
        });
      }
    }

    await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .update({
        provider_shipment_id: providerShipmentId,
        provider_current_step: current_step ?? null,
        provider_current_step_ar: current_step_ar ?? null,
        provider_current_stage: current_stage ?? null,
        provider_last_payload: update as Record<string, unknown>,
        amount_change_flag: amountChangeFlag,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("order_id", orderId)
      .eq("provider_code", "jenni");

    if (mapping.deliveryStatus) {
      const reason = `Jenni ${source}: ${update.action_code ?? ""} → ${current_step ?? ""}`.trim();
      await this.applyDeliveryTransition(orderId, mapping.deliveryStatus, reason);
    }

    if (mapping.eventType) {
      await this.insertDeliveryEvent(
        orderId,
        mapping.eventType,
        reasonFromUpdate(normalizedUpdate),
        {
          ...(update as Record<string, unknown>),
          ...(mapping.eventMetadata ?? {}),
        },
      );
    }

    return { ok: true, order_id: orderId };
  }

  async syncOrderFromJenni(orderId: string) {
    const integration = await this.getIntegrationByOrderId(orderId);
    if (!integration) throw new NotFoundException("Order is not linked to Jenni.");

    const providerShipmentId = integration.provider_shipment_id;
    if (!providerShipmentId) {
      throw new BadRequestException("Order is missing a linked Jenni Provider Shipment ID.");
    }

    const queryBody = { shipment_ids: [Number(providerShipmentId)] };

    const result = await this.jenniClient.queryShipments(queryBody);
    const shipments = (result.shipments ?? result.data ?? []) as JenniProviderUpdate[];
    if (!shipments.length) {
      return { ok: true, updated: false, message: "No shipment data returned from Jenni." };
    }

    let last: { ok: boolean; duplicate?: boolean; order_id?: string } = { ok: true };
    for (const shipment of shipments) {
      last = await this.applyProviderUpdate({ ...shipment, external_id: integration.external_shipment_id }, "manual_sync");
    }
    return { ...last, ok: true, updated: !last.duplicate };
  }

  async processWebhook(body: { system_code?: string; updates?: JenniProviderUpdate[] }) {
    assertJenniWebhookSystemCode(body, this.jenniClient.systemCode());

    const updates = body.updates ?? [];
    const results = [];
    for (const update of updates) {
      results.push(await this.applyProviderUpdate(update, "webhook"));
    }
    return { ok: true, processed: results.length, results };
  }
}

function reasonFromUpdate(update: JenniProviderUpdate): string {
  const parts = [update.action_code, update.current_step, update.current_step_ar].filter(Boolean);
  return parts.join(" / ") || "Jenni provider update";
}
