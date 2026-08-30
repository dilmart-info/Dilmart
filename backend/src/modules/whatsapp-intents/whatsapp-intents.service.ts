import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { CreateWhatsAppIntentDto } from "./whatsapp-intents.dto";

type IntentStatus = "CREATED" | "OPENED" | "EXPIRED" | "CONVERTED";

@Injectable()
export class WhatsAppIntentsService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private generateIntentToken() {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `INT-${random}`;
  }

  private async ensureMerchantOwnsProduct(merchantId: string, productId?: string) {
    if (!productId) return;
    const { data, error } = await this.supabaseAdmin.client
      .from("products")
      .select("id, merchant_id")
      .eq("id", productId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id || data.merchant_id !== merchantId) {
      throw new BadRequestException("Product does not belong to merchant.");
    }
  }

  private async getMerchantWhatsApp(merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_settings")
      .select("whatsapp_phone")
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (error) throw error;
    return (data as { whatsapp_phone?: string | null } | null)?.whatsapp_phone ?? null;
  }

  async createIntent(dto: CreateWhatsAppIntentDto) {
    await this.ensureMerchantOwnsProduct(dto.merchant_id, dto.product_id);

    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, display_name, whatsapp_restricted")
      .eq("id", dto.merchant_id)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant?.id) throw new NotFoundException("Merchant not found.");
    if ((merchant as any).whatsapp_restricted) {
      throw new ForbiddenException("WhatsApp channel is temporarily restricted for this merchant.");
    }

    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    const intentToken = this.generateIntentToken();
    const whatsappPhone = await this.getMerchantWhatsApp(dto.merchant_id);

    const insertPayload = {
      intent_token: intentToken,
      merchant_id: dto.merchant_id,
      product_id: dto.product_id ?? null,
      cart_snapshot: dto.cart && dto.cart.length > 0 ? dto.cart : null,
      session_id: dto.session_id ?? null,
      source_surface: dto.source_surface,
      status: "CREATED" as IntentStatus,
      expires_at: expiresAt,
    };
    const { data, error } = await this.supabaseAdmin.client.from("whatsapp_intents").insert(insertPayload as any).select("*").single();
    if (error) throw error;

    // M10.7: whatsapp_phone is intentionally omitted. Merchant-directed WhatsApp
    // contact is superseded by platform-controlled intake. The intent token is
    // preserved for future platform-assisted order desk use.
    return {
      intent_id: data.id,
      intent_token: data.intent_token,
      expires_at: data.expires_at,
      merchant_name: (merchant as any).display_name ?? "",
    };
  }

  async markOpened(intentId: string) {
    const { data, error } = await this.supabaseAdmin.client.from("whatsapp_intents").select("*").eq("id", intentId).maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new NotFoundException("Intent not found.");
    if (data.status === "CONVERTED") {
      return { ok: true, status: data.status };
    }
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      await this.supabaseAdmin.client.from("whatsapp_intents").update({ status: "EXPIRED" } as any).eq("id", intentId);
      throw new BadRequestException("Intent is expired.");
    }
    const nextStatus: IntentStatus = data.status === "OPENED" ? "OPENED" : "OPENED";
    const { error: updateError } = await this.supabaseAdmin.client.from("whatsapp_intents").update({ status: nextStatus } as any).eq("id", intentId);
    if (updateError) throw updateError;
    return { ok: true, status: nextStatus };
  }

  async resolveIntentForManualOrder(intentId: string, merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client.from("whatsapp_intents").select("*").eq("id", intentId).maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new BadRequestException("Intent not found.");
    if (data.merchant_id !== merchantId) {
      throw new ForbiddenException("Intent merchant mismatch.");
    }
    if (data.status === "CONVERTED") {
      throw new BadRequestException("Intent already converted.");
    }
    if (new Date(data.expires_at).getTime() <= Date.now()) {
      await this.supabaseAdmin.client.from("whatsapp_intents").update({ status: "EXPIRED" } as any).eq("id", intentId);
      throw new BadRequestException("Intent expired.");
    }
    return data;
  }

  async markIntentConverted(intentId: string, orderId: string) {
    const { error } = await this.supabaseAdmin.client
      .from("whatsapp_intents")
      .update({ status: "CONVERTED", converted_order_id: orderId } as any)
      .eq("id", intentId);
    if (error) throw error;
  }

  async getMerchantComplianceMetrics(merchantId: string) {
    const nowIso = new Date().toISOString();
    const { data, error } = await this.supabaseAdmin.client
      .from("whatsapp_intents")
      .select("id, status, created_at, expires_at")
      .eq("merchant_id", merchantId);
    if (error) throw error;
    const rows = data ?? [];
    const totalIntents = rows.length;
    const openedIntents = rows.filter((x: any) => x.status === "OPENED" || x.status === "CONVERTED").length;
    const convertedIntents = rows.filter((x: any) => x.status === "CONVERTED").length;
    const missingIntents = rows.filter((x: any) => x.status === "OPENED" && x.expires_at < nowIso).length;
    const trackedOrderRatio = totalIntents > 0 ? Math.round((convertedIntents / totalIntents) * 100) : 0;
    const checkoutCompletionRatio = openedIntents > 0 ? Math.round((convertedIntents / openedIntents) * 100) : 0;
    const leakageRisk = openedIntents >= 5 && checkoutCompletionRatio < 30 ? "high" : checkoutCompletionRatio < 60 ? "medium" : "low";

    return {
      merchant_id: merchantId,
      total_intents: totalIntents,
      opened_intents: openedIntents,
      converted_intents: convertedIntents,
      tracked_order_ratio: trackedOrderRatio,
      checkout_completion_ratio: checkoutCompletionRatio,
      missing_intents: missingIntents,
      leakage_risk: leakageRisk,
    };
  }

  async resolveMetricsMerchantScope(merchantId: string | undefined, actor?: { actorRole?: string; actorId?: string }) {
    const isAdmin = actor?.actorRole === "admin" || actor?.actorRole === "super_admin";
    if (isAdmin) {
      if (!merchantId) throw new BadRequestException("merchant_id is required.");
      return merchantId;
    }
    if (!actor?.actorId) throw new ForbiddenException("Missing actor identity.");
    let req = this.supabaseAdmin.client.from("merchant_users").select("merchant_id").eq("user_id", actor.actorId);
    if (merchantId) req = req.eq("merchant_id", merchantId);
    const { data, error } = await req.limit(1).maybeSingle();
    if (error) throw error;
    if (!data?.merchant_id) throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    return data.merchant_id as string;
  }

  async getComplianceMultiplierMap(merchantIds: string[]) {
    const unique = Array.from(new Set(merchantIds.filter(Boolean)));
    const map = new Map<string, number>();
    await Promise.all(
      unique.map(async (merchantId) => {
        try {
          const metrics = await this.getMerchantComplianceMetrics(merchantId);
          const ratio = metrics.tracked_order_ratio;
          const multiplier = ratio >= 90 ? 1.1 : ratio >= 70 ? 1.0 : 0.8;
          map.set(merchantId, multiplier);
        } catch {
          map.set(merchantId, 1.0);
        }
      }),
    );
    return map;
  }

  async resolveIntentByToken(intentToken: string, actor?: { actorRole?: string; actorId?: string }) {
    const { data, error } = await this.supabaseAdmin.client
      .from("whatsapp_intents")
      .select("*")
      .eq("intent_token", intentToken)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) throw new NotFoundException("Intent not found.");

    const merchantId = data.merchant_id as string;
    await this.resolveMetricsMerchantScope(merchantId, actor);

    if (new Date(data.expires_at).getTime() <= Date.now() && data.status !== "CONVERTED") {
      await this.supabaseAdmin.client.from("whatsapp_intents").update({ status: "EXPIRED" } as any).eq("id", data.id);
      throw new BadRequestException("Intent is expired.");
    }

    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, display_name")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;

    let fallbackItem: { product_id: string; product_name: string; price: number; quantity: number } | null = null;
    if ((!data.cart_snapshot || (Array.isArray(data.cart_snapshot) && data.cart_snapshot.length === 0)) && data.product_id) {
      const { data: product, error: productError } = await this.supabaseAdmin.client
        .from("products")
        .select("id, name, price, discount_price")
        .eq("id", data.product_id)
        .maybeSingle();
      if (productError) throw productError;
      if (product?.id) {
        fallbackItem = {
          product_id: product.id,
          product_name: (product as any).name ?? "Product",
          price: Number((product as any).discount_price ?? (product as any).price ?? 0),
          quantity: 1,
        };
      }
    }

    // M10.7: customer_name and customer_phone are NEVER returned via token resolution.
    // Customer identity is platform-controlled and must not reach merchant actors.
    return {
      id: data.id,
      intent_token: data.intent_token,
      merchant_id: merchantId,
      merchant_name: (merchant as any)?.display_name ?? "",
      source_surface: data.source_surface,
      status: data.status as IntentStatus,
      created_at: data.created_at,
      expires_at: data.expires_at,
      cart_snapshot: (data.cart_snapshot as any[]) ?? [],
      fallback_item: fallbackItem,
    };
  }
}
