import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { DeliveryOperationsService } from "../shipping/delivery-operations.service";
import { JenniClientService } from "./jenni-client.service";
import { JenniProviderException } from "./jenni-provider.exception";
import {
  assertOrderEligibleForJenniDispatch,
  isJenniDispatchComplete,
  shouldRetryJenniLocalDispatchOnly,
} from "./jenni-dispatch.util";
import { JenniPricingService } from "./jenni-pricing.service";
import type { JenniAcceptedShipment, JenniCreateShipmentPayload } from "./jenni.types";

export function normalizeIraqMobilePhone(raw: string): string | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("07")) return digits;
  if (digits.length === 13 && digits.startsWith("9647")) return `0${digits.slice(3)}`;
  if (digits.length === 10 && digits.startsWith("7")) return `0${digits}`;
  return null;
}

@Injectable()
export class JenniDispatchService {
  private readonly logger = new Logger(JenniDispatchService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly jenniClient: JenniClientService,
    private readonly jenniPricing: JenniPricingService,
    private readonly deliveryOps: DeliveryOperationsService,
    private readonly config: ConfigService,
  ) {}

  private assertShipmentDispatchEnabled(): void {
    const allowed = String(this.config.get("JENNI_ALLOW_SHIPMENT_DISPATCH") ?? "").trim().toLowerCase();
    if (allowed !== "true") {
      throw new ForbiddenException(
        "Shipment dispatch is disabled. Set JENNI_ALLOW_SHIPMENT_DISPATCH=true to enable.",
      );
    }
  }

  private async loadOrderForDispatch(orderId: string) {
    const { data: order, error } = await this.supabaseAdmin.client
      .from("orders")
      .select(
        "id,order_number,customer_name,customer_phone,governorate_id,area,nearest_landmark,notes,total,cash_expected_amount,delivery_status,status,payment_method,delivery_company_id,merchant_id",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!order) throw new NotFoundException("Order not found.");

    const { data: items, error: itemsError } = await this.supabaseAdmin.client
      .from("order_items")
      .select("quantity,product_name")
      .eq("order_id", orderId);
    if (itemsError) throw itemsError;

    const { data: governorate, error: govError } = await this.supabaseAdmin.client
      .from("governorates")
      .select("id,name,jenni_governorate_code")
      .eq("id", (order as any).governorate_id)
      .maybeSingle();
    if (govError) throw govError;

    return { order, items: items ?? [], governorate };
  }

  private async getJenniIntegration(orderId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .select("*")
      .eq("order_id", orderId)
      .eq("provider_code", "jenni")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  private buildJenniPayload(
    order: Record<string, unknown>,
    items: Array<{ quantity?: number; product_name?: string }>,
    governorate: Record<string, unknown> | null,
    jenniStoreId: number,
    jenniMerchantId: number,
  ): JenniCreateShipmentPayload {
    const customerName = String(order.customer_name ?? "").trim();
    if (!customerName) throw new BadRequestException("Customer name is required for Jenni dispatch.");

    const phone = normalizeIraqMobilePhone(String(order.customer_phone ?? ""));
    if (!phone) {
      throw new BadRequestException("Customer phone must be Iraqi mobile format 07XXXXXXXXX for Jenni dispatch.");
    }

    const governorateCode = String(governorate?.jenni_governorate_code ?? "").trim().toUpperCase();
    if (!governorateCode) {
      throw new BadRequestException(
        `Governorate "${governorate?.name ?? ""}" is not mapped to a Jenni governorate_code.`,
      );
    }

    const city = String(order.area ?? "").trim();
    if (!city) throw new BadRequestException("Delivery area/city is required for Jenni dispatch.");

    const landmark = String(order.nearest_landmark ?? "").trim();
    const notes = String(order.notes ?? "").trim();
    const address = [city, landmark].filter(Boolean).join(" — ");
    if (!address) throw new BadRequestException("Full delivery address is required for Jenni dispatch.");

    const amountIqd = Math.round(Number(order.cash_expected_amount ?? order.total ?? 0));
    if (!Number.isFinite(amountIqd) || amountIqd <= 0) {
      throw new BadRequestException("Order COD amount must be greater than zero for Jenni dispatch.");
    }

    const quantity = items.reduce((sum, row) => sum + Math.max(1, Number(row.quantity ?? 1)), 0);
    const productInfo = items
      .map((row) => `${row.product_name ?? "Item"} x${row.quantity ?? 1}`)
      .join(", ")
      .slice(0, 500);

    const orderId = String(order.id);
    const shipmentNumber = String(order.order_number ?? orderId).replace("#", "");

    return {
      shipment_number: shipmentNumber,
      external_shipment_id: orderId,
      receiver_name: customerName,
      receiver_phone_1: phone,
      governorate_code: governorateCode,
      city,
      address,
      amount_iqd: amountIqd,
      quantity: Math.max(1, quantity),
      product_info: productInfo || "DilMart-Store order",
      note: notes || null,
      store_id: jenniStoreId,
      merchant_id: jenniMerchantId,
    };
  }

  private async persistJenniAcceptance(input: {
    orderId: string;
    jenniCompanyId: string;
    shipmentNumber: string;
    match: JenniAcceptedShipment;
    dispatchStatus: "dispatched" | "local_update_failed";
    dispatchError?: string | null;
    jenniStoreId: number;
  }) {
    const providerShipmentId = String(input.match.shipment_id);
    const now = new Date().toISOString();

    await this.supabaseAdmin.client.from("order_delivery_integrations").upsert(
      {
        order_id: input.orderId,
        delivery_company_id: input.jenniCompanyId,
        provider_code: "jenni",
        external_shipment_id: input.orderId,
        external_shipment_number: input.shipmentNumber,
        provider_shipment_id: providerShipmentId,
        airway_bill_number: input.match.airway_bill_number ?? null,
        dispatch_status: input.dispatchStatus,
        dispatch_error: input.dispatchError ?? null,
        dispatched_at: now,
        last_synced_at: now,
        provider_last_payload: { accepted: input.match } as Record<string, unknown>,
        jenni_store_id: input.jenniStoreId,
        updated_at: now,
      },
      { onConflict: "provider_code,external_shipment_id" },
    );

    return { providerShipmentId, airway_bill_number: input.match.airway_bill_number ?? null };
  }

  private async completeLocalDispatchAfterJenni(input: {
    orderId: string;
    actorId?: string;
    jenniCompanyId: string;
    providerShipmentId: string;
    airwayBillNumber: string | null;
    fromDeliveryStatus: string | null;
    jenniStoreId?: number | null;
  }) {
    await this.deliveryOps.assignOrderToDeliveryCompany(input.orderId, input.jenniCompanyId, {
      actorType: "admin",
      actorId: input.actorId,
    });

    await this.supabaseAdmin.client.from("delivery_events").insert({
      order_id: input.orderId,
      event_type: "provider_dispatched",
      from_status: input.fromDeliveryStatus,
      to_status: "assigned_to_company",
      delivery_company_id: input.jenniCompanyId,
      actor_id: input.actorId ?? null,
      actor_type: "admin",
      notes: `Dispatched to Jenni. shipment_id=${input.providerShipmentId}`,
      metadata: { provider: "jenni", airway_bill_number: input.airwayBillNumber },
    });

    const updatePayload: Record<string, any> = {
      dispatch_status: "dispatched",
      dispatch_error: null,
      updated_at: new Date().toISOString(),
    };
    if (input.jenniStoreId) {
      updatePayload.jenni_store_id = input.jenniStoreId;
    }

    await this.supabaseAdmin.client
      .from("order_delivery_integrations")
      .update(updatePayload)
      .eq("order_id", input.orderId)
      .eq("provider_code", "jenni");
  }

  private async retryLocalDispatchFromIntegration(
    orderId: string,
    actorId: string | undefined,
    integration: Record<string, unknown>,
    order: Record<string, unknown>,
  ) {
    const jenniCompanyId = await this.jenniPricing.getJenniCompanyId();
    const providerShipmentId = String(integration.provider_shipment_id ?? "");
    if (!providerShipmentId) {
      throw new BadRequestException("Jenni shipment id is missing; cannot retry local dispatch.");
    }

    let jenniStoreId = integration.jenni_store_id ? Number(integration.jenni_store_id) : null;
    if (!jenniStoreId || !Number.isInteger(jenniStoreId) || jenniStoreId <= 0) {
      const merchantId = (order as any).merchant_id;
      if (merchantId) {
        const { data: merchant } = await this.supabaseAdmin.client
          .from("merchants")
          .select("jenni_store_id")
          .eq("id", merchantId)
          .maybeSingle();
        const parsed = merchant?.jenni_store_id ? Number(merchant.jenni_store_id) : NaN;
        if (Number.isInteger(parsed) && parsed > 0) {
          jenniStoreId = parsed;
        }
      }
    }

    await this.completeLocalDispatchAfterJenni({
      orderId,
      actorId,
      jenniCompanyId,
      providerShipmentId,
      airwayBillNumber: (integration.airway_bill_number as string | null) ?? null,
      fromDeliveryStatus: (order.delivery_status as string | null) ?? null,
      jenniStoreId,
    });

    return {
      ok: true,
      provider_shipment_id: providerShipmentId,
      airway_bill_number: (integration.airway_bill_number as string | null) ?? null,
      shipment_number: String(integration.external_shipment_number ?? ""),
      retried_local_dispatch: true,
    };
  }

  async dispatchOrderToJenni(orderId: string, actorId?: string) {
    this.assertShipmentDispatchEnabled();
    const integration = await this.getJenniIntegration(orderId);
    if (isJenniDispatchComplete(integration)) {
      throw new ConflictException("Order was already dispatched to Jenni.");
    }

    const { order, items, governorate } = await this.loadOrderForDispatch(orderId);
    assertOrderEligibleForJenniDispatch(order as { id: string; delivery_status?: string | null; status?: string | null });

    const jenniCompanyId = await this.jenniPricing.getJenniCompanyId();

    if (shouldRetryJenniLocalDispatchOnly(integration as Record<string, unknown> | null)) {
      return this.retryLocalDispatchFromIntegration(
        orderId,
        actorId,
        integration as Record<string, unknown>,
        order as Record<string, unknown>,
      );
    }

    const shipmentNumber = String(order.order_number ?? orderId).replace("#", "");
    const errorMsg = "Cannot dispatch order to Jenni: associated merchant does not have a linked Jenni Store. Please link a store first.";

    const merchantId = (order as any).merchant_id;
    let jenniStoreId: number | null = null;
    let jenniMerchantId: number | null = null;

    if (!merchantId) {
      await this.saveDispatchFailure(orderId, shipmentNumber, errorMsg, null);
      throw new BadRequestException(errorMsg);
    }

    try {
      const { data: merchant, error: merchError } = await this.supabaseAdmin.client
        .from("merchants")
        .select("id, jenni_store_id, jenni_merchant_id")
        .eq("id", merchantId)
        .maybeSingle();

      if (merchError) throw merchError;

      const parsedStoreId = merchant?.jenni_store_id ? Number(merchant.jenni_store_id) : NaN;
      const parsedMerchantId = merchant?.jenni_merchant_id ? Number(merchant.jenni_merchant_id) : NaN;
      if (
        !merchant ||
        !Number.isInteger(parsedStoreId) ||
        parsedStoreId <= 0 ||
        !Number.isInteger(parsedMerchantId) ||
        parsedMerchantId <= 0
      ) {
        await this.saveDispatchFailure(orderId, shipmentNumber, errorMsg, null);
        throw new BadRequestException(errorMsg);
      }
      jenniStoreId = parsedStoreId;
      jenniMerchantId = parsedMerchantId;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      await this.saveDispatchFailure(orderId, shipmentNumber, `Local lookup error: ${msg}`, null);
      throw err;
    }

    const payload = this.buildJenniPayload(order as Record<string, unknown>, items, governorate as Record<string, unknown>, jenniStoreId, jenniMerchantId);

    let match: JenniAcceptedShipment | undefined;
    try {
      const { accepted, rejected } = await this.jenniClient.createShipments([payload]);
      match =
        accepted.find((row) => row.shipment_number === payload.shipment_number) ??
        accepted.find((row) => String(row.shipment_number ?? "") === payload.shipment_number) ??
        accepted[0];

      if (!match?.shipment_id) {
        const reason = rejected[0]?.reason ?? "Jenni rejected the shipment.";
        await this.saveDispatchFailure(orderId, payload.shipment_number, reason, null);
        throw new BadRequestException(reason);
      }
    } catch (err: unknown) {
      if (err instanceof JenniProviderException || !(err instanceof BadRequestException)) {
        const message = err instanceof Error ? err.message : "Jenni dispatch failed.";
        await this.saveDispatchFailure(orderId, payload.shipment_number, message, null);
      }
      throw err;
    }

    const saved = await this.persistJenniAcceptance({
      orderId,
      jenniCompanyId,
      shipmentNumber: payload.shipment_number,
      match,
      dispatchStatus: "dispatched",
      jenniStoreId,
    });

    try {
      await this.completeLocalDispatchAfterJenni({
        orderId,
        actorId,
        jenniCompanyId,
        providerShipmentId: saved.providerShipmentId,
        airwayBillNumber: saved.airway_bill_number,
        fromDeliveryStatus: (order as any).delivery_status ?? null,
        jenniStoreId,
      });
    } catch (localErr: unknown) {
      const message = localErr instanceof Error ? localErr.message : "Local dispatch update failed after Jenni acceptance.";
      this.logger.error(`Jenni local update failed for order ${orderId}: ${message}`);
      await this.supabaseAdmin.client
        .from("order_delivery_integrations")
        .update({
          dispatch_status: "local_update_failed",
          dispatch_error: message.slice(0, 2000),
          updated_at: new Date().toISOString(),
        })
        .eq("order_id", orderId)
        .eq("provider_code", "jenni");

      return {
        ok: true,
        provider_shipment_id: saved.providerShipmentId,
        airway_bill_number: saved.airway_bill_number,
        shipment_number: payload.shipment_number,
        local_update_failed: true,
        message:
          "Shipment was accepted by Jenni but local assignment/event update failed. Retry dispatch to complete local state without creating a duplicate shipment.",
      };
    }

    return {
      ok: true,
      provider_shipment_id: saved.providerShipmentId,
      airway_bill_number: saved.airway_bill_number,
      shipment_number: payload.shipment_number,
    };
  }

  private async saveDispatchFailure(
    orderId: string,
    shipmentNumber: string,
    message: string,
    providerShipmentId: string | null,
  ) {
    await this.supabaseAdmin.client.from("order_delivery_integrations").upsert(
      {
        order_id: orderId,
        provider_code: "jenni",
        external_shipment_id: orderId,
        external_shipment_number: shipmentNumber.replace("#", ""),
        provider_shipment_id: providerShipmentId,
        dispatch_status: "failed",
        dispatch_error: message.slice(0, 2000),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider_code,external_shipment_id" },
    );
  }
}
