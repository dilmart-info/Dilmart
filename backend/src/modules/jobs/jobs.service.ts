import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AnalyticsService } from "../analytics/analytics.service";
import { NotificationsService } from "../notifications/notifications.service";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { MerchantPushService } from "../merchants/merchant-push.service";
import { parseOrderIdFromPushEventKey } from "../merchants/merchant-push.helpers";

type JobStatus = "ok" | "partial" | "failed";

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly replayPerRunCap: number;
  private readonly replayMinAgeMinutes: number;
  private readonly retentionOlderThanDays: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly analyticsService: AnalyticsService,
    private readonly notificationsService: NotificationsService,
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly merchantPushService: MerchantPushService,
  ) {
    this.replayPerRunCap = Math.min(50, Math.max(1, Number(this.configService.get<string>("OPS_REPLAY_MAX_PER_RUN") ?? 10)));
    this.replayMinAgeMinutes = Math.min(24 * 60, Math.max(5, Number(this.configService.get<string>("OPS_REPLAY_MIN_AGE_MINUTES") ?? 30)));
    this.retentionOlderThanDays = Math.min(365, Math.max(7, Number(this.configService.get<string>("OPS_RETENTION_OLDER_THAN_DAYS") ?? 90)));
  }

  private isEnabled(flagName: string, defaultValue = true) {
    const raw = this.configService.get<string>(flagName);
    if (!raw) return defaultValue;
    return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
  }

  private async recordJobRun(input: {
    job_name: string;
    status: JobStatus;
    started_at: string;
    finished_at: string;
    processed_count: number;
    error_count: number;
    notes?: string;
  }) {
    const row = {
      job_name: input.job_name,
      status: input.status,
      started_at: input.started_at,
      finished_at: input.finished_at,
      processed_count: input.processed_count,
      error_count: input.error_count,
      notes: input.notes ?? null,
      created_at: new Date().toISOString(),
    } as any;

    const { error } = await this.supabaseAdmin.client.from("operations_job_runs").insert(row);
    if (!error) return;

    // Backward compatibility: attempt minimal insert when richer schema is unavailable.
    const { error: minimalError } = await this.supabaseAdmin.client.from("operations_job_runs").insert({
      job_name: input.job_name,
      status: input.status,
      started_at: input.started_at,
      finished_at: input.finished_at,
      processed_count: input.processed_count,
      error_count: input.error_count,
      created_at: new Date().toISOString(),
    } as any);
    if (minimalError) {
      this.logger.debug(`Job run logging skipped for ${input.job_name}: ${minimalError.message}`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async runAnalyticsRetentionCleanup() {
    if (!this.isEnabled("OPS_JOB_RETENTION_ENABLED", true)) return;
    const startedAt = new Date().toISOString();
    try {
      const result = await this.analyticsService.cleanupOldEvents({
        older_than_days: this.retentionOlderThanDays,
        dry_run: false,
      });
      const ok = Boolean((result as { ok?: boolean }).ok);
      const deletedRows = Number((result as { deleted_rows?: number }).deleted_rows ?? 0);
      const candidateRows = Number((result as { candidate_rows?: number }).candidate_rows ?? 0);
      await this.recordJobRun({
        job_name: "analytics_retention_cleanup",
        status: ok ? "ok" : "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        processed_count: ok ? deletedRows : candidateRows,
        error_count: ok ? 0 : 1,
        notes: ok ? `deleted_rows=${deletedRows}` : String((result as { message?: string }).message ?? "Retention cleanup failed."),
      });
    } catch (error: any) {
      await this.recordJobRun({
        job_name: "analytics_retention_cleanup",
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        processed_count: 0,
        error_count: 1,
        notes: String(error?.message ?? error),
      });
      this.logger.warn(`analytics_retention_cleanup failed: ${String(error?.message ?? error)}`);
    }
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async runFailedDispatchScan() {
    if (!this.isEnabled("OPS_JOB_FAILED_DISPATCH_SCAN_ENABLED", true)) return;
    const startedAt = new Date().toISOString();
    try {
      const attemptsRes = await this.notificationsService.listOutboundDispatchAttempts({
        limit: 200,
        only_failed: true,
      });
      const attempts = (attemptsRes.attempts ?? []) as Array<{ created_at?: string | null }>;
      const staleThresholdMs = this.replayMinAgeMinutes * 60 * 1000;
      const now = Date.now();
      const staleCount = attempts.filter((a) => {
        const ts = a.created_at ? Date.parse(a.created_at) : NaN;
        if (Number.isNaN(ts)) return true;
        return now - ts >= staleThresholdMs;
      }).length;

      await this.recordJobRun({
        job_name: "failed_dispatch_scan",
        status: "ok",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        processed_count: attempts.length,
        error_count: 0,
        notes: `stale_failed_attempts=${staleCount}`,
      });
    } catch (error: any) {
      await this.recordJobRun({
        job_name: "failed_dispatch_scan",
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        processed_count: 0,
        error_count: 1,
        notes: String(error?.message ?? error),
      });
      this.logger.warn(`failed_dispatch_scan failed: ${String(error?.message ?? error)}`);
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async runBoundedReplayWindow() {
    if (!this.isEnabled("OPS_JOB_BOUNDED_REPLAY_ENABLED", false)) return;
    const startedAt = new Date().toISOString();
    let processed = 0;
    let errors = 0;
    try {
      const attemptsRes = await this.notificationsService.listOutboundDispatchAttempts({
        limit: 300,
        only_failed: true,
      });
      const attempts = (attemptsRes.attempts ?? []) as Array<{
        dispatch_key?: string | null;
        alert_id?: string | null;
        alert_type?: string | null;
        alert_title?: string | null;
        alert_message?: string | null;
        alert_link?: string | null;
        created_at?: string | null;
      }>;
      const now = Date.now();
      const minAgeMs = this.replayMinAgeMinutes * 60 * 1000;
      const eligible = attempts
        .filter((a) => {
          const ts = a.created_at ? Date.parse(a.created_at) : NaN;
          if (Number.isNaN(ts)) return true;
          return now - ts >= minAgeMs;
        })
        .filter((a) => Boolean(a.dispatch_key && a.alert_id && a.alert_type && a.alert_title && a.alert_message))
        .slice(0, this.replayPerRunCap);

      for (const attempt of eligible) {
        processed += 1;
        const replayResult = await this.notificationsService.replayOutboundDispatch({
          dispatch_key: String(attempt.dispatch_key),
          alert_id: String(attempt.alert_id),
          alert_type: String(attempt.alert_type),
          alert_title: String(attempt.alert_title),
          alert_message: String(attempt.alert_message),
          alert_link: attempt.alert_link ?? null,
          mode: "scheduled",
        });
        if (!replayResult.ok) errors += 1;
      }

      const status: JobStatus = errors === 0 ? "ok" : processed === 0 ? "failed" : "partial";
      await this.recordJobRun({
        job_name: "bounded_replay_window",
        status,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        processed_count: processed,
        error_count: errors,
        notes: `max_per_run=${this.replayPerRunCap}`,
      });
    } catch (error: any) {
      await this.recordJobRun({
        job_name: "bounded_replay_window",
        status: "failed",
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        processed_count: processed,
        error_count: errors + 1,
        notes: String(error?.message ?? error),
      });
      this.logger.warn(`bounded_replay_window failed: ${String(error?.message ?? error)}`);
    }
  }

  private readonly workerId = `worker-${Math.random().toString(36).substring(2, 11)}`;

  @Cron("*/10 * * * * *")
  async runNotificationOutboxWorker() {
    if (!this.isEnabled("NOTIFICATION_OUTBOX_WORKER_ENABLED", true)) return;
    const startedAt = new Date().toISOString();
    let processed = 0;
    let errors = 0;

    try {
      const { data: batch, error: claimError } = await this.supabaseAdmin.client.rpc(
        "claim_notification_outbox_batch" as any,
        {
          p_worker_id: this.workerId,
          p_limit: 20,
        }
      );

      if (claimError) {
        throw new Error(`Failed to claim outbox batch: ${claimError.message}`);
      }

      const events = Array.isArray(batch) ? batch : [];
      processed = events.length;

      for (const event of events) {
        try {
          if (event.recipient_type === "admin") {
            const { error: insertError } = await this.supabaseAdmin.client
              .from("admin_notifications")
              .insert({
                title: event.title,
                message: event.message,
                link: event.link,
                source_event_key: event.event_key,
              } as any);

            if (insertError && !insertError.message.includes("duplicate key")) {
              throw insertError;
            }
          } else if (event.recipient_type === "customer") {
            if (!event.recipient_id) {
              throw new Error("Missing recipient_id for customer notification");
            }
            const { error: insertError } = await this.supabaseAdmin.client
              .from("user_notifications")
              .insert({
                user_id: event.recipient_id,
                title: event.title,
                message: event.message,
                link: event.link,
                is_read: false,
                source_event_key: event.event_key,
              } as any);

            if (insertError && !insertError.message.includes("duplicate key")) {
              throw insertError;
            }
          } else if (event.recipient_type === "merchant") {
            if (!event.recipient_id) {
              throw new Error("Missing recipient_id for merchant push notification");
            }
            const orderId = parseOrderIdFromPushEventKey(String(event.event_key ?? ""));
            if (!orderId) {
              throw new Error(`Invalid merchant push event_key: ${event.event_key}`);
            }

            const { data: orderRow } = await this.supabaseAdmin.client
              .from("orders")
              .select("order_number")
              .eq("id", orderId)
              .maybeSingle();

            const result = await this.merchantPushService.processMerchantOutboxEvent({
              outboxId: event.id,
              merchantId: event.recipient_id,
              orderId,
              orderNumber: (orderRow as { order_number?: string } | null)?.order_number ?? null,
            });

            if (!result.complete) {
              throw new Error(
                `merchant_push_incomplete:retryable=${result.retryable};accepted=${result.accepted}`,
              );
            }

            const { error: updateError } = await this.supabaseAdmin.client
              .from("notification_outbox")
              .update({
                status: "processed",
                processed_at: new Date().toISOString(),
                last_error: result.skipReason ?? null,
              })
              .eq("id", event.id);

            if (updateError) {
              throw updateError;
            }
            continue;
          }

          const { error: updateError } = await this.supabaseAdmin.client
            .from("notification_outbox")
            .update({
              status: "processed",
              processed_at: new Date().toISOString(),
              last_error: null,
            })
            .eq("id", event.id);

          if (updateError) {
            throw updateError;
          }
        } catch (eventError: any) {
          errors += 1;
          this.logger.error(`Failed to process outbox event ${event.id}: ${eventError.message}`);

          const { data: currentEvent } = await this.supabaseAdmin.client
            .from("notification_outbox")
            .select("attempt_count")
            .eq("id", event.id)
            .maybeSingle();

          const attempts = currentEvent?.attempt_count || 1;
          const status = attempts >= 5 ? "dead_letter" : "pending";
          const nextAttemptDelay = Math.pow(2, attempts) * 10;
          const nextAttemptAt = new Date(Date.now() + nextAttemptDelay * 1000).toISOString();

          await this.supabaseAdmin.client
            .from("notification_outbox")
            .update({
              status,
              last_error: eventError.message,
              next_attempt_at: nextAttemptAt,
              locked_at: null,
              locked_by: null,
            })
            .eq("id", event.id);
        }
      }

      if (processed > 0) {
        await this.recordJobRun({
          job_name: "notification_outbox_worker",
          status: errors === 0 ? "ok" : errors === processed ? "failed" : "partial",
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          processed_count: processed,
          error_count: errors,
          notes: `worker_id=${this.workerId}`,
        });
      }
    } catch (error: any) {
      this.logger.error(`notification_outbox_worker failed: ${error.message}`);
    }
  }
}

