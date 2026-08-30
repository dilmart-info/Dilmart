import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { ActorContext } from "../../common/authz/actor-context.decorator";
import {
  RegisterPushSubscriptionDto,
  TestPushSubscriptionDto,
} from "./merchant-push.dto";
import {
  buildMerchantNewOrderPushPayload,
  isPermanentWebPushFailure,
  isTerminalPushDeliveryStatus,
  ProcessMerchantPushResult,
} from "./merchant-push.helpers";

type WebPushModule = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
    options?: Record<string, unknown>,
  ) => Promise<unknown>;
};

type PushSubRow = {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  status: string;
};

type DeliveryRow = {
  id: string;
  outbox_id: string;
  subscription_id: string;
  status: string;
  attempt_count: number;
  next_attempt_at: string;
};

@Injectable()
export class MerchantPushService {
  private readonly logger = new Logger(MerchantPushService.name);
  private webPush: WebPushModule | null = null;
  private vapidConfigured = false;

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
    private readonly config: ConfigService,
  ) {}

  getVapidPublicKey(): { publicKey: string } {
    const publicKey = this.config.get<string>("WEB_PUSH_VAPID_PUBLIC_KEY")?.trim();
    if (!publicKey) {
      throw new ServiceUnavailableException("Web Push is not configured on this server.");
    }
    return { publicKey };
  }

  isVapidConfigured(): boolean {
    const publicKey = this.config.get<string>("WEB_PUSH_VAPID_PUBLIC_KEY")?.trim();
    const privateKey = this.config.get<string>("WEB_PUSH_VAPID_PRIVATE_KEY")?.trim();
    return Boolean(publicKey && privateKey);
  }

  private async ensureWebPush(): Promise<WebPushModule> {
    if (this.webPush && this.vapidConfigured) return this.webPush;

    const publicKey = this.config.get<string>("WEB_PUSH_VAPID_PUBLIC_KEY")?.trim();
    const privateKey = this.config.get<string>("WEB_PUSH_VAPID_PRIVATE_KEY")?.trim();
    const subject = this.config.get<string>("WEB_PUSH_SUBJECT")?.trim() || "mailto:ops@DilMart.store";

    if (!publicKey || !privateKey) {
      throw new ServiceUnavailableException("Web Push VAPID keys are not configured.");
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("web-push") as WebPushModule;
    mod.setVapidDetails(subject, publicKey, privateKey);
    this.webPush = mod;
    this.vapidConfigured = true;
    return mod;
  }

  async listSubscriptions(merchantId: string, actor: ActorContext) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(
      merchantId,
      actor.actorRole,
      actor.actorId,
    );
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Merchant scope is required.");
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .select(
        "id, merchant_id, user_id, device_label, user_agent, status, last_success_at, last_failure_at, failure_count, created_at, updated_at",
      )
      .eq("merchant_id", resolvedMerchantId)
      .order("created_at", { ascending: false });

    if (error) {
      this.logger.error(`Failed to list push subscriptions: ${error.message}`);
      throw error;
    }

    return data ?? [];
  }

  async registerSubscription(payload: RegisterPushSubscriptionDto, actor: ActorContext) {
    if (!actor.actorId) {
      throw new ForbiddenException("Actor context required");
    }

    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(
      payload.merchant_id,
      actor.actorRole,
      actor.actorId,
    );
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Merchant scope is required.");
    }

    if (!payload.keys?.p256dh || !payload.keys?.auth) {
      throw new BadRequestException("Subscription keys are required.");
    }

    const now = new Date().toISOString();
    const row = {
      merchant_id: resolvedMerchantId,
      user_id: actor.actorId,
      endpoint: payload.endpoint.trim(),
      p256dh_key: payload.keys.p256dh,
      auth_key: payload.keys.auth,
      device_label: payload.device_label?.trim() || null,
      user_agent: payload.user_agent?.trim() || null,
      status: "active",
      updated_at: now,
    };

    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .upsert(row as any, { onConflict: "merchant_id,endpoint" })
      .select(
        "id, merchant_id, user_id, device_label, user_agent, status, last_success_at, last_failure_at, failure_count, created_at, updated_at",
      )
      .single();

    if (error) {
      this.logger.error(`Failed to register push subscription: ${error.message}`);
      throw error;
    }

    return data;
  }

  async deleteSubscription(id: string, actor: ActorContext) {
    const { data: existing, error: fetchError } = await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .select("id, merchant_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!existing) throw new NotFoundException("Subscription not found.");

    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(
      existing.merchant_id,
      actor.actorRole,
      actor.actorId,
    );
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Access denied to this merchant scope.");
    }

    const { error } = await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .delete()
      .eq("id", id)
      .eq("merchant_id", resolvedMerchantId);

    if (error) throw error;
    return { success: true };
  }

  async sendTestNotification(payload: TestPushSubscriptionDto, actor: ActorContext) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(
      payload.merchant_id,
      actor.actorRole,
      actor.actorId,
    );
    if (!resolvedMerchantId) {
      throw new ForbiddenException("Merchant scope is required.");
    }

    let query = this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key, status")
      .eq("merchant_id", resolvedMerchantId)
      .eq("status", "active");

    if (payload.subscription_id) {
      query = query.eq("id", payload.subscription_id);
    }

    const { data: subscriptions, error } = await query;
    if (error) throw error;
    if (!subscriptions?.length) {
      throw new NotFoundException("No active push subscriptions found for this merchant.");
    }

    const body = JSON.stringify({
      type: "merchant_push_test",
      title: "تم تفعيل إشعارات ديلمارت ستور بنجاح",
      body: "سيصلك تنبيه عند وصول طلب جديد.",
      url: "/merchant",
    });

    const results: Array<{ id: string; ok: boolean; error?: string }> = [];
    for (const sub of subscriptions) {
      try {
        await this.sendRawPush(sub as PushSubRow, body, "merchant-push-test");
        results.push({ id: sub.id, ok: true });
      } catch (err: any) {
        results.push({ id: sub.id, ok: false, error: String(err?.message ?? err) });
      }
    }

    return {
      success: results.some((r) => r.ok),
      results,
    };
  }

  /**
   * Process one merchant outbox event with per-subscription delivery ledger.
   * Idempotent: accepted devices are never re-pushed on retry.
   */
  async processMerchantOutboxEvent(input: {
    outboxId: string;
    merchantId: string;
    orderId: string;
    orderNumber?: string | null;
  }): Promise<ProcessMerchantPushResult> {
    const { data: settings } = await this.supabaseAdmin.client
      .from("merchant_settings")
      .select("push_enabled")
      .eq("merchant_id", input.merchantId)
      .maybeSingle();

    if (settings && settings.push_enabled === false) {
      return {
        complete: true,
        skipped: true,
        skipReason: "merchant_push_disabled",
        accepted: 0,
        retryable: 0,
        permanentFailures: 0,
      };
    }

    if (!this.isVapidConfigured()) {
      // Do NOT mark success — leave outbox pending/retryable via thrown error path.
      throw new ServiceUnavailableException("vapid_not_configured");
    }

    const { data: subscriptions, error: subError } = await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .select("id, endpoint, p256dh_key, auth_key, status")
      .eq("merchant_id", input.merchantId)
      .eq("status", "active");

    if (subError) throw subError;

    if (!subscriptions?.length) {
      return {
        complete: true,
        skipped: true,
        skipReason: "no_active_subscriptions",
        accepted: 0,
        retryable: 0,
        permanentFailures: 0,
      };
    }

    // Fan-out delivery rows (idempotent).
    const deliveryRows = subscriptions.map((sub) => ({
      outbox_id: input.outboxId,
      subscription_id: sub.id,
      status: "pending",
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await this.supabaseAdmin.client
      .from("merchant_push_deliveries")
      .upsert(deliveryRows as any, {
        onConflict: "outbox_id,subscription_id",
        ignoreDuplicates: true,
      });

    if (upsertError) throw upsertError;

    const { data: deliveries, error: delError } = await this.supabaseAdmin.client
      .from("merchant_push_deliveries")
      .select("id, outbox_id, subscription_id, status, attempt_count, next_attempt_at")
      .eq("outbox_id", input.outboxId);

    if (delError) throw delError;

    const { data: notification } = await this.supabaseAdmin.client
      .from("merchant_notifications")
      .select("id")
      .eq("merchant_id", input.merchantId)
      .eq("order_id", input.orderId)
      .eq("type", "new_order")
      .maybeSingle();

    const payload = buildMerchantNewOrderPushPayload({
      orderId: input.orderId,
      orderNumber: input.orderNumber ?? null,
      notificationId: notification?.id ?? null,
    });
    const payloadJson = JSON.stringify(payload);
    const subById = new Map((subscriptions as PushSubRow[]).map((s) => [s.id, s]));
    const now = Date.now();

    let accepted = 0;
    let retryable = 0;
    let permanentFailures = 0;

    for (const delivery of (deliveries ?? []) as DeliveryRow[]) {
      if (isTerminalPushDeliveryStatus(delivery.status)) {
        if (delivery.status === "accepted") accepted += 1;
        else if (delivery.status === "permanent_failure" || delivery.status === "skipped") {
          permanentFailures += 1;
        }
        continue;
      }

      if (
        delivery.status === "retryable_failure" &&
        delivery.next_attempt_at &&
        new Date(delivery.next_attempt_at).getTime() > now
      ) {
        retryable += 1;
        continue;
      }

      const sub = subById.get(delivery.subscription_id);
      if (!sub) {
        await this.updateDelivery(delivery.id, {
          status: "skipped",
          last_error: "subscription_missing",
          attempt_count: delivery.attempt_count + 1,
        });
        permanentFailures += 1;
        continue;
      }

      await this.updateDelivery(delivery.id, {
        status: "sending",
        attempt_count: delivery.attempt_count + 1,
      });

      try {
        await this.sendRawPush(sub, payloadJson, input.orderId);
        await this.updateDelivery(delivery.id, {
          status: "accepted",
          accepted_at: new Date().toISOString(),
          last_error: null,
          provider_status_code: 201,
        });
        accepted += 1;
      } catch (err: any) {
        const statusCode = Number(err?.statusCode ?? err?.status ?? 0) || null;
        const message = String(err?.message ?? err);
        if (isPermanentWebPushFailure(statusCode)) {
          await this.disableSubscription(sub.id, message);
          await this.updateDelivery(delivery.id, {
            status: "permanent_failure",
            last_error: message,
            provider_status_code: statusCode,
          });
          permanentFailures += 1;
        } else {
          const attempts = delivery.attempt_count + 1;
          const delaySec = Math.pow(2, Math.min(attempts, 6)) * 10;
          await this.updateDelivery(delivery.id, {
            status: "retryable_failure",
            last_error: message,
            provider_status_code: statusCode,
            next_attempt_at: new Date(Date.now() + delaySec * 1000).toISOString(),
          });
          await this.recordSubscriptionFailure(sub.id, message);
          retryable += 1;
        }
      }
    }

    const complete = retryable === 0;
    return {
      complete,
      skipped: false,
      accepted,
      retryable,
      permanentFailures,
    };
  }

  private async updateDelivery(id: string, patch: Record<string, unknown>) {
    const { error } = await this.supabaseAdmin.client
      .from("merchant_push_deliveries")
      .update({ ...patch, updated_at: new Date().toISOString() } as any)
      .eq("id", id);
    if (error) throw error;
  }

  /** Web Push transport — overridable in tests. */
  async sendRawPush(sub: PushSubRow, payload: string, tag: string) {
    const webPush = await this.ensureWebPush();
    await webPush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
      },
      payload,
      {
        TTL: 60 * 60,
        urgency: "high",
        topic: tag.slice(0, 32),
      },
    );

    await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .update({
        last_success_at: new Date().toISOString(),
        failure_count: 0,
        last_failure_at: null,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", sub.id);
  }

  private async disableSubscription(id: string, reason: string) {
    await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .update({
        status: "disabled",
        last_failure_at: new Date().toISOString(),
        failure_count: 999,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    this.logger.warn(`Disabled push subscription ${id}: ${reason}`);
  }

  private async recordSubscriptionFailure(id: string, reason: string) {
    const { data } = await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .select("failure_count")
      .eq("id", id)
      .maybeSingle();

    const next = (data?.failure_count ?? 0) + 1;
    await this.supabaseAdmin.client
      .from("merchant_push_subscriptions")
      .update({
        last_failure_at: new Date().toISOString(),
        failure_count: next,
        updated_at: new Date().toISOString(),
      } as any)
      .eq("id", id);
    this.logger.warn(`Push failure for ${id} (count=${next}): ${reason}`);
  }
}
