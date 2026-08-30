import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

type OutboundAlert = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  created_at: string;
};

type OutboundChannel = "in_app" | "webhook" | "email";

const DISPATCH_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const WEBHOOK_TIMEOUT_MS = 3000;
const DEFAULT_MAX_RETRIES = 2; // total attempts = retries + 1

type DispatchAttemptRow = {
  dispatch_key?: string | null;
  alert_id?: string | null;
  alert_type?: string | null;
  alert_title?: string | null;
  alert_message?: string | null;
  alert_link?: string | null;
  channel?: string | null;
  attempt_no?: number | null;
  ok?: boolean | null;
  status_code?: string | number | null;
  error_message?: string | null;
  provider_name?: string | null;
  provider_message_id?: string | null;
  ack_status?: string | null;
  ack_at?: string | null;
  provider_error_code?: string | null;
  created_at?: string | null;
};

type ReplayLifecycleState = "new" | "retrying" | "dead_lettered" | "resolved";

type DeadLetterRow = {
  dispatch_key?: string | null;
  alert_id?: string | null;
  alert_type?: string | null;
  alert_title?: string | null;
  alert_message?: string | null;
  alert_link?: string | null;
  failure_category?: string | null;
  last_error_message?: string | null;
  state?: ReplayLifecycleState | null;
  created_at?: string | null;
  updated_at?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

type FailureCategory =
  | "network_timeout"
  | "rate_limited_429"
  | "provider_5xx"
  | "terminal_4xx"
  | "payload_schema_error"
  | "config_missing"
  | "unknown";

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly webhookUrl: string | null;
  private readonly emailWebhookUrl: string | null;
  private readonly maxRetries: number;
  private readonly replayWindowMinutes: number;
  private readonly replayMaxAttemptsPerWindow: number;
  private readonly replaySignatureCooldownMinutes: number;
  private readonly dispatchCache = new Map<string, number>();

  constructor(
    private readonly configService: ConfigService,
    private readonly supabaseAdmin: SupabaseAdminService,
  ) {
    this.webhookUrl = this.configService.get<string>("OUTBOUND_ALERT_WEBHOOK_URL") ?? null;
    this.emailWebhookUrl = this.configService.get<string>("OUTBOUND_ALERT_EMAIL_WEBHOOK_URL") ?? null;
    this.maxRetries = Math.max(0, Math.min(5, Number(this.configService.get<string>("OUTBOUND_ALERT_WEBHOOK_MAX_RETRIES") ?? DEFAULT_MAX_RETRIES)));
    this.replayWindowMinutes = Math.min(24 * 60, Math.max(5, Number(this.configService.get<string>("OUTBOUND_REPLAY_WINDOW_MINUTES") ?? 60)));
    this.replayMaxAttemptsPerWindow = Math.min(50, Math.max(1, Number(this.configService.get<string>("OUTBOUND_REPLAY_MAX_ATTEMPTS_PER_WINDOW") ?? 5)));
    this.replaySignatureCooldownMinutes = Math.min(
      24 * 60,
      Math.max(1, Number(this.configService.get<string>("OUTBOUND_REPLAY_SIGNATURE_COOLDOWN_MINUTES") ?? 15)),
    );
  }

  private parseDeliveryOrder() {
    const raw = this.configService.get<string>("OUTBOUND_ALERT_CHANNEL_ORDER") ?? "webhook,email";
    const parsed = raw
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter((x): x is "webhook" | "email" => x === "webhook" || x === "email");
    const unique = Array.from(new Set(parsed));
    return unique.length > 0 ? unique : (["webhook", "email"] as Array<"webhook" | "email">);
  }

  private isChannelConfigured(channel: "webhook" | "email") {
    if (channel === "webhook") return Boolean(this.webhookUrl);
    return Boolean(this.emailWebhookUrl);
  }

  private channelsForAlert(alertType: string): OutboundChannel[] {
    if (alertType === "alert_delayed_orders") {
      const deliveryOrder = this.parseDeliveryOrder().filter((ch) => this.isChannelConfigured(ch));
      return ["in_app", ...deliveryOrder];
    }
    return ["in_app"];
  }

  private shouldDispatch(signature: string) {
    const now = Date.now();
    const last = this.dispatchCache.get(signature) ?? 0;
    if (now - last < DISPATCH_COOLDOWN_MS) return false;
    this.dispatchCache.set(signature, now);
    return true;
  }

  private buildDispatchKey(alert: OutboundAlert, channel: "webhook" | "email") {
    return `${channel}:${alert.type}:${alert.id}:${alert.title}:${alert.message}`;
  }

  private async wasRecentlyDelivered(dispatchKey: string, channel: "webhook" | "email") {
    const cooldownSinceIso = new Date(Date.now() - DISPATCH_COOLDOWN_MS).toISOString();
    const { data, error } = await this.supabaseAdmin.client
      .from("outbound_dispatch_attempts")
      .select("created_at")
      .eq("dispatch_key", dispatchKey)
      .eq("channel", channel)
      .eq("ok", true)
      .gte("created_at", cooldownSinceIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) {
      this.logger.debug(`Recent dispatch check skipped: ${error.message}`);
      return false;
    }
    return (data ?? []).length > 0;
  }

  private async recordDispatchAttempt(input: {
    dispatch_key: string;
    alert_id: string;
    alert_type: string;
    alert_title: string;
    alert_message: string;
    alert_link: string | null;
    channel: "webhook" | "email";
    attempt_no: number;
    ok: boolean;
    status_code?: string | number | null;
    error_message?: string | null;
    provider_name?: string | null;
    provider_message_id?: string | null;
    ack_status?: string | null;
    ack_at?: string | null;
    provider_error_code?: string | null;
  }) {
    const richRow = {
      dispatch_key: input.dispatch_key,
      alert_id: input.alert_id,
      alert_type: input.alert_type,
      alert_title: input.alert_title,
      alert_message: input.alert_message,
      alert_link: input.alert_link,
      channel: input.channel,
      attempt_no: input.attempt_no,
      ok: input.ok,
      status_code: input.status_code == null ? null : String(input.status_code),
      error_message: input.error_message ?? null,
      provider_name: input.provider_name ?? null,
      provider_message_id: input.provider_message_id ?? null,
      ack_status: input.ack_status ?? null,
      ack_at: input.ack_at ?? null,
      provider_error_code: input.provider_error_code ?? null,
      created_at: new Date().toISOString(),
    } as any;
    const { error } = await this.supabaseAdmin.client.from("outbound_dispatch_attempts").insert(richRow);
    if (!error) return;
    // Backward compatibility: if new columns are not available, retry minimal row.
    const { error: minimalError } = await this.supabaseAdmin.client.from("outbound_dispatch_attempts").insert({
      dispatch_key: input.dispatch_key,
      alert_id: input.alert_id,
      alert_type: input.alert_type,
      channel: input.channel,
      attempt_no: input.attempt_no,
      ok: input.ok,
      status_code: input.status_code == null ? null : String(input.status_code),
      error_message: input.error_message ?? null,
      provider_name: input.provider_name ?? null,
      provider_message_id: input.provider_message_id ?? null,
      ack_status: input.ack_status ?? null,
      ack_at: input.ack_at ?? null,
      provider_error_code: input.provider_error_code ?? null,
      created_at: new Date().toISOString(),
    } as any);
    if (minimalError) {
      this.logger.debug(`Dispatch attempt logging skipped: ${minimalError.message}`);
    }
  }

  private shouldRetryDelivery(statusCode?: number | null, errorMessage?: string | null) {
    if (statusCode == null) return true; // network/timeout issues
    if (statusCode === 429) return true;
    if (statusCode >= 500) return true;
    if (errorMessage && errorMessage.toLowerCase().includes("abort")) return true;
    return false;
  }

  private async dispatchWebhookOnce(alert: OutboundAlert) {
    if (!this.webhookUrl) return { ok: false as const, channel: "webhook" as const, message: "No webhook URL configured." };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const response = await fetch(this.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "operational_alert",
          alert,
          dispatched_at: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
      const providerMessageId =
        response.headers.get("x-provider-message-id") ??
        response.headers.get("x-request-id") ??
        response.headers.get("x-correlation-id") ??
        null;
      return {
        ok: response.ok,
        channel: "webhook" as const,
        status: response.status,
        provider_name: "webhook",
        provider_message_id: providerMessageId,
        ack_status: response.ok ? "acknowledged" : "rejected",
        ack_at: new Date().toISOString(),
        provider_error_code: response.ok ? null : `http_${response.status}`,
      };
    } catch (error: any) {
      return {
        ok: false as const,
        channel: "webhook" as const,
        error: String(error?.message ?? error),
        provider_name: "webhook",
        provider_message_id: null,
        ack_status: "no_ack",
        ack_at: null,
        provider_error_code: "transport_error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async dispatchEmailOnce(alert: OutboundAlert) {
    if (!this.emailWebhookUrl) return { ok: false as const, channel: "email" as const, message: "No email webhook URL configured." };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
    try {
      const response = await fetch(this.emailWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "operational_alert_email",
          email: {
            subject: `[DilMart Ops] ${alert.title}`,
            text: `${alert.message}${alert.link ? `\n\nLink: ${alert.link}` : ""}`,
          },
          alert,
          dispatched_at: new Date().toISOString(),
        }),
        signal: controller.signal,
      });
      const providerMessageId =
        response.headers.get("x-provider-message-id") ??
        response.headers.get("x-request-id") ??
        response.headers.get("x-correlation-id") ??
        null;
      return {
        ok: response.ok,
        channel: "email" as const,
        status: response.status,
        provider_name: "email",
        provider_message_id: providerMessageId,
        ack_status: response.ok ? "acknowledged" : "rejected",
        ack_at: new Date().toISOString(),
        provider_error_code: response.ok ? null : `http_${response.status}`,
      };
    } catch (error: any) {
      return {
        ok: false as const,
        channel: "email" as const,
        error: String(error?.message ?? error),
        provider_name: "email",
        provider_message_id: null,
        ack_status: "no_ack",
        ack_at: null,
        provider_error_code: "transport_error",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async dispatchChannelWithRetry(alert: OutboundAlert, channel: "webhook" | "email") {
    const dispatchKey = this.buildDispatchKey(alert, channel);
    const maxAttempts = this.maxRetries + 1;
    let lastResult: Record<string, unknown> = { ok: false, channel, message: "No attempts made." };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = channel === "email" ? await this.dispatchEmailOnce(alert) : await this.dispatchWebhookOnce(alert);
      lastResult = result as Record<string, unknown>;
      const ok = Boolean((result as { ok?: boolean }).ok);
      const statusCode = Number((result as { status?: number }).status ?? NaN);
      const normalizedStatus = Number.isNaN(statusCode) ? null : statusCode;
      const errorMessage = (result as { error?: string; message?: string }).error ?? (result as { message?: string }).message ?? null;
      const providerName = (result as { provider_name?: string | null }).provider_name ?? channel;
      const providerMessageId = (result as { provider_message_id?: string | null }).provider_message_id ?? null;
      const ackStatus =
        (result as { ack_status?: string | null }).ack_status ?? (ok ? "acknowledged" : normalizedStatus != null ? "rejected" : "no_ack");
      const ackAt = (result as { ack_at?: string | null }).ack_at ?? (normalizedStatus != null ? new Date().toISOString() : null);
      const providerErrorCode =
        (result as { provider_error_code?: string | null }).provider_error_code ?? (ok ? null : normalizedStatus != null ? `http_${normalizedStatus}` : null);
      await this.recordDispatchAttempt({
        dispatch_key: dispatchKey,
        alert_id: alert.id,
        alert_type: alert.type,
        alert_title: alert.title,
        alert_message: alert.message,
        alert_link: alert.link,
        channel,
        attempt_no: attempt,
        ok,
        status_code: normalizedStatus,
        error_message: errorMessage,
        provider_name: providerName,
        provider_message_id: providerMessageId,
        ack_status: ackStatus,
        ack_at: ackAt,
        provider_error_code: providerErrorCode,
      });
      if (ok) {
        return { ...result, attempts: attempt };
      }
      if (!this.shouldRetryDelivery(normalizedStatus, errorMessage) || attempt >= maxAttempts) {
        return { ...result, attempts: attempt };
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, attempt * 500)));
    }
    return { ...lastResult, attempts: maxAttempts };
  }

  async dispatchOperationalAlerts(alerts: OutboundAlert[]) {
    const results: Array<Record<string, unknown>> = [];
    for (const alert of alerts) {
      const signature = `${alert.type}:${alert.message}`;
      if (!this.shouldDispatch(signature)) continue;
      const channels = this.channelsForAlert(alert.type);
      for (const channel of channels) {
        if (channel === "in_app") {
          // In-app feed is already produced by admin notifications merging path.
          results.push({ id: alert.id, channel, ok: true, mode: "already_available_in_app" });
          continue;
        }
        const dispatchKey = this.buildDispatchKey(alert, channel);
        if (await this.wasRecentlyDelivered(dispatchKey, channel)) {
          results.push({ id: alert.id, channel, ok: true, skipped: true, reason: "recent_success_cooldown" });
          continue;
        }
        const deliveryResult = await this.dispatchChannelWithRetry(alert, channel);
        results.push({ id: alert.id, ...deliveryResult });
        if (!("ok" in deliveryResult) || !deliveryResult.ok) {
          this.logger.warn(`Outbound ${channel} dispatch failed for ${alert.id}: ${JSON.stringify(deliveryResult)}`);
          continue;
        }
        // Primary success stops failover chain for delivery channels.
        break;
      }
    }
    return { dispatched: results.length, results };
  }

  async listOutboundDispatchAttempts(input?: { limit?: number; only_failed?: boolean }) {
    const limit = Math.min(300, Math.max(20, Number(input?.limit ?? 120)));
    let req = this.supabaseAdmin.client.from("outbound_dispatch_attempts").select("*").order("created_at", { ascending: false }).limit(limit);
    if (input?.only_failed !== false) req = req.eq("ok", false);
    const { data, error } = await req;
    if (error) {
      return { attempts: [], message: "Dispatch attempts table unavailable.", error: error.message };
    }
    return { attempts: (data ?? []) as DispatchAttemptRow[] };
  }

  private classifyFailure(row: DispatchAttemptRow): FailureCategory {
    const statusCode = Number(row.status_code ?? NaN);
    const error = String(row.error_message ?? "").toLowerCase();
    if (error.includes("no webhook url configured") || error.includes("no email webhook url configured") || error.includes("configured")) {
      return "config_missing";
    }
    if (error.includes("schema") || error.includes("payload")) return "payload_schema_error";
    if (Number.isNaN(statusCode)) {
      if (error.includes("timeout") || error.includes("abort") || error.includes("network")) return "network_timeout";
      return "unknown";
    }
    if (statusCode === 429) return "rate_limited_429";
    if (statusCode >= 500) return "provider_5xx";
    if (statusCode >= 400) return "terminal_4xx";
    return "unknown";
  }

  async getOutboundDiagnostics(input?: { window_hours?: number; limit?: number }) {
    const windowHours = Math.min(24 * 30, Math.max(1, Number(input?.window_hours ?? 72)));
    const limit = Math.min(2000, Math.max(100, Number(input?.limit ?? 1000)));
    const minIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabaseAdmin.client
      .from("outbound_dispatch_attempts")
      .select("*")
      .gte("created_at", minIso)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      return {
        window_hours: windowHours,
        totals: { attempts: 0, failed_attempts: 0, replay_success_after_failure: 0, repeated_failure_keys: 0 },
        by_category: [],
        by_channel: [],
        message: "Outbound diagnostics unavailable.",
        error: error.message,
      };
    }

    const rows = (data ?? []) as DispatchAttemptRow[];
    const failedRows = rows.filter((r) => r.ok === false);
    const categoryCount: Record<string, number> = {};
    const channelCount: Record<string, { total: number; failed: number }> = {};
    const byKey = new Map<string, DispatchAttemptRow[]>();

    for (const row of rows) {
      const channel = String(row.channel ?? "unknown");
      if (!channelCount[channel]) channelCount[channel] = { total: 0, failed: 0 };
      channelCount[channel].total += 1;
      if (row.ok === false) channelCount[channel].failed += 1;

      const dispatchKey = String(row.dispatch_key ?? "");
      if (dispatchKey) {
        const existing = byKey.get(dispatchKey) ?? [];
        existing.push(row);
        byKey.set(dispatchKey, existing);
      }
    }

    for (const row of failedRows) {
      const category = this.classifyFailure(row);
      categoryCount[category] = (categoryCount[category] ?? 0) + 1;
    }

    let replaySuccessAfterFailure = 0;
    let repeatedFailureKeys = 0;
    for (const [, keyRows] of byKey) {
      const sorted = [...keyRows].sort((a, b) => {
        const ta = Date.parse(String(a.created_at ?? ""));
        const tb = Date.parse(String(b.created_at ?? ""));
        return (Number.isNaN(ta) ? 0 : ta) - (Number.isNaN(tb) ? 0 : tb);
      });
      const hasFailure = sorted.some((r) => r.ok === false);
      const hasSuccess = sorted.some((r) => r.ok === true);
      if (hasFailure && hasSuccess) replaySuccessAfterFailure += 1;
      const failureCount = sorted.filter((r) => r.ok === false).length;
      if (failureCount >= 2 && !hasSuccess) repeatedFailureKeys += 1;
    }

    const { data: deadLettersData, error: deadLettersError } = await this.supabaseAdmin.client
      .from("outbound_dead_letters")
      .select("dispatch_key,last_error_message,state,updated_at,created_at")
      .gte("updated_at", minIso)
      .order("updated_at", { ascending: false })
      .limit(limit);
    const deadLetters = deadLettersError ? [] : (deadLettersData ?? []);
    const policyBlockedRows = deadLetters.filter((row: any) =>
      String(row.last_error_message ?? "")
        .toLowerCase()
        .includes("replay blocked"),
    );
    const policyBlockedKeys = new Set(policyBlockedRows.map((row: any) => String(row.dispatch_key ?? "")).filter(Boolean));
    const policyBlockedRate = deadLetters.length > 0 ? Number((policyBlockedRows.length / deadLetters.length).toFixed(3)) : 0;

    let leadTimeCount = 0;
    let leadTimeTotalMinutes = 0;
    for (const [, keyRows] of byKey) {
      const firstFailure = keyRows
        .filter((r) => r.ok === false)
        .map((r) => Date.parse(String(r.created_at ?? "")))
        .filter((ts) => !Number.isNaN(ts))
        .sort((a, b) => a - b)[0];
      const firstSuccess = keyRows
        .filter((r) => r.ok === true)
        .map((r) => Date.parse(String(r.created_at ?? "")))
        .filter((ts) => !Number.isNaN(ts))
        .sort((a, b) => a - b)[0];
      if (firstFailure != null && firstSuccess != null && firstSuccess >= firstFailure) {
        leadTimeCount += 1;
        leadTimeTotalMinutes += (firstSuccess - firstFailure) / (1000 * 60);
      }
    }
    const avgRecoveryLeadTimeMinutes = leadTimeCount > 0 ? Number((leadTimeTotalMinutes / leadTimeCount).toFixed(1)) : 0;

    return {
      window_hours: windowHours,
      totals: {
        attempts: rows.length,
        failed_attempts: failedRows.length,
        replay_success_after_failure: replaySuccessAfterFailure,
        repeated_failure_keys: repeatedFailureKeys,
      },
      by_category: Object.entries(categoryCount)
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      by_channel: Object.entries(channelCount)
        .map(([channel, values]) => ({
          channel,
          total: values.total,
          failed: values.failed,
          failure_rate: values.total > 0 ? Number((values.failed / values.total).toFixed(3)) : 0,
        }))
        .sort((a, b) => b.failed - a.failed),
      trend: {
        policy_blocked_replays: policyBlockedRows.length,
        policy_blocked_replay_rate: policyBlockedRate,
        repeated_failure_clusters: repeatedFailureKeys,
        avg_recovery_lead_time_minutes: avgRecoveryLeadTimeMinutes,
        policy_blocked_keys: policyBlockedKeys.size,
      },
      dead_letter_window_totals: {
        rows: deadLetters.length,
        policy_blocked_rows: policyBlockedRows.length,
      },
    };
  }

  private async upsertDeadLetter(input: {
    dispatch_key: string;
    alert_id: string;
    alert_type: string;
    alert_title: string;
    alert_message: string;
    alert_link?: string | null;
    state: ReplayLifecycleState;
    failure_category?: FailureCategory | "none";
    last_error_message?: string | null;
    resolved_by?: string | null;
  }) {
    const nowIso = new Date().toISOString();
    const row = {
      dispatch_key: input.dispatch_key,
      alert_id: input.alert_id,
      alert_type: input.alert_type,
      alert_title: input.alert_title,
      alert_message: input.alert_message,
      alert_link: input.alert_link ?? null,
      failure_category: input.failure_category ?? null,
      last_error_message: input.last_error_message ?? null,
      state: input.state,
      updated_at: nowIso,
      resolved_at: input.state === "resolved" ? nowIso : null,
      resolved_by: input.state === "resolved" ? input.resolved_by ?? null : null,
    } as any;
    const { error } = await this.supabaseAdmin.client.from("outbound_dead_letters").upsert(row, { onConflict: "dispatch_key" });
    if (!error) return;

    const minimalRow = {
      dispatch_key: input.dispatch_key,
      alert_id: input.alert_id,
      alert_type: input.alert_type,
      state: input.state,
      last_error_message: input.last_error_message ?? null,
      updated_at: nowIso,
      resolved_at: input.state === "resolved" ? nowIso : null,
      resolved_by: input.state === "resolved" ? input.resolved_by ?? null : null,
    } as any;
    const { error: minimalError } = await this.supabaseAdmin.client.from("outbound_dead_letters").upsert(minimalRow, { onConflict: "dispatch_key" });
    if (minimalError) {
      this.logger.debug(`Dead-letter upsert skipped: ${minimalError.message}`);
    }
  }

  async listDeadLetters(input?: { limit?: number; state?: ReplayLifecycleState }) {
    const limit = Math.min(300, Math.max(20, Number(input?.limit ?? 120)));
    let req = this.supabaseAdmin.client.from("outbound_dead_letters").select("*").order("updated_at", { ascending: false }).limit(limit);
    if (input?.state) req = req.eq("state", input.state);
    const { data, error } = await req;
    if (error) {
      return { dead_letters: [], message: "Dead-letter table unavailable.", error: error.message };
    }
    return { dead_letters: (data ?? []) as DeadLetterRow[] };
  }

  async transitionDeadLetter(input: {
    dispatch_key: string;
    state: ReplayLifecycleState;
    reason?: string | null;
    actor_id?: string | null;
  }) {
    const dispatchKey = String(input.dispatch_key ?? "").trim();
    if (!dispatchKey) {
      return { ok: false as const, message: "dispatch_key is required." };
    }
    const { data, error } = await this.supabaseAdmin.client
      .from("outbound_dead_letters")
      .select("*")
      .eq("dispatch_key", dispatchKey)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      return { ok: false as const, message: "Dead-letter read failed.", error: error.message };
    }
    const row = (data ?? {}) as DeadLetterRow;
    await this.upsertDeadLetter({
      dispatch_key: dispatchKey,
      alert_id: String(row.alert_id ?? "dead-letter"),
      alert_type: String(row.alert_type ?? "alert_delayed_orders"),
      alert_title: String(row.alert_title ?? "Operational Dead Letter"),
      alert_message: String(row.alert_message ?? row.last_error_message ?? "Dead-letter lifecycle transition"),
      alert_link: row.alert_link ?? null,
      state: input.state,
      failure_category: input.state === "resolved" ? "none" : ((row.failure_category as FailureCategory | null) ?? "unknown"),
      last_error_message: input.reason ?? row.last_error_message ?? null,
      resolved_by: input.state === "resolved" ? input.actor_id ?? null : null,
    });
    return { ok: true as const, dispatch_key: dispatchKey, state: input.state };
  }

  private async checkReplayPolicy(input: {
    dispatch_key: string;
    alert_type: string;
    mode: "manual" | "scheduled";
  }) {
    const now = Date.now();
    const windowStartIso = new Date(now - this.replayWindowMinutes * 60 * 1000).toISOString();
    const cooldownStartIso = new Date(now - this.replaySignatureCooldownMinutes * 60 * 1000).toISOString();
    const dispatchKey = String(input.dispatch_key ?? "").trim();
    const alertType = String(input.alert_type ?? "").trim();

    if (!dispatchKey || !alertType) {
      return { allowed: false as const, reason: "Replay policy requires dispatch_key and alert_type." };
    }

    const { count: keyCount, error: keyCountError } = await this.supabaseAdmin.client
      .from("outbound_dispatch_attempts")
      .select("attempt_no", { count: "exact", head: true })
      .eq("dispatch_key", dispatchKey)
      .gte("created_at", windowStartIso);
    if (keyCountError) {
      return { allowed: false as const, reason: `Replay policy check failed (window): ${keyCountError.message}` };
    }
    if ((keyCount ?? 0) >= this.replayMaxAttemptsPerWindow) {
      return {
        allowed: false as const,
        reason: `Replay blocked: dispatch_key exceeded max attempts (${this.replayMaxAttemptsPerWindow}) in ${this.replayWindowMinutes}m window.`,
      };
    }

    const { data: cooldownRows, error: cooldownError } = await this.supabaseAdmin.client
      .from("outbound_dispatch_attempts")
      .select("created_at")
      .eq("alert_type", alertType)
      .gte("created_at", cooldownStartIso)
      .order("created_at", { ascending: false })
      .limit(1);
    if (cooldownError) {
      return { allowed: false as const, reason: `Replay policy check failed (cooldown): ${cooldownError.message}` };
    }
    if ((cooldownRows ?? []).length > 0 && input.mode === "scheduled") {
      return {
        allowed: false as const,
        reason: `Replay blocked: alert_type cooldown active (${this.replaySignatureCooldownMinutes}m).`,
      };
    }

    return { allowed: true as const };
  }

  async replayOutboundDispatch(input: {
    dispatch_key: string;
    alert_id: string;
    alert_type: string;
    alert_title: string;
    alert_message: string;
    alert_link?: string | null;
    mode?: "manual" | "scheduled";
    actor_id?: string | null;
  }) {
    const mode = input.mode ?? "manual";
    const replayPolicy = await this.checkReplayPolicy({
      dispatch_key: input.dispatch_key,
      alert_type: input.alert_type,
      mode,
    });
    if (!replayPolicy.allowed) {
      await this.upsertDeadLetter({
        dispatch_key: input.dispatch_key,
        alert_id: input.alert_id,
        alert_type: input.alert_type,
        alert_title: input.alert_title,
        alert_message: input.alert_message,
        alert_link: input.alert_link ?? null,
        state: "dead_lettered",
        failure_category: "unknown",
        last_error_message: replayPolicy.reason ?? "Replay policy blocked.",
      });
      return {
        ok: false,
        dispatch_key: input.dispatch_key,
        blocked_by_policy: true,
        reason: replayPolicy.reason,
        mode,
      };
    }

    const alert: OutboundAlert = {
      id: input.alert_id,
      type: input.alert_type,
      title: input.alert_title,
      message: input.alert_message,
      link: input.alert_link ?? null,
      created_at: new Date().toISOString(),
    };
    await this.upsertDeadLetter({
      dispatch_key: input.dispatch_key,
      alert_id: input.alert_id,
      alert_type: input.alert_type,
      alert_title: input.alert_title,
      alert_message: input.alert_message,
      alert_link: input.alert_link ?? null,
      state: "retrying",
      failure_category: "unknown",
      last_error_message: null,
    });
    const channels = this.channelsForAlert(alert.type).filter((x): x is "webhook" | "email" => x !== "in_app");
    let result: Record<string, unknown> = { ok: false, message: "No delivery channel configured." };
    for (const channel of channels) {
      const attempt = await this.dispatchChannelWithRetry(alert, channel);
      result = attempt;
      if (Boolean((attempt as { ok?: boolean }).ok)) break;
    }
    const ok = Boolean((result as { ok?: boolean }).ok);
    if (ok) {
      await this.upsertDeadLetter({
        dispatch_key: input.dispatch_key,
        alert_id: input.alert_id,
        alert_type: input.alert_type,
        alert_title: input.alert_title,
        alert_message: input.alert_message,
        alert_link: input.alert_link ?? null,
        state: "resolved",
        failure_category: "none",
        last_error_message: null,
        resolved_by: input.actor_id ?? null,
      });
    } else {
      const lastError = String((result as { error?: string; message?: string }).error ?? (result as { message?: string }).message ?? "Replay failed.");
      const statusCode = Number((result as { status?: number }).status ?? NaN);
      const category = this.classifyFailure({
        status_code: Number.isNaN(statusCode) ? null : statusCode,
        error_message: lastError,
      });
      await this.upsertDeadLetter({
        dispatch_key: input.dispatch_key,
        alert_id: input.alert_id,
        alert_type: input.alert_type,
        alert_title: input.alert_title,
        alert_message: input.alert_message,
        alert_link: input.alert_link ?? null,
        state: "dead_lettered",
        failure_category: category,
        last_error_message: lastError,
      });
    }
    return {
      ok: Boolean((result as { ok?: boolean }).ok),
      dispatch_key: input.dispatch_key,
      blocked_by_policy: false,
      mode,
      result,
    };
  }
}

