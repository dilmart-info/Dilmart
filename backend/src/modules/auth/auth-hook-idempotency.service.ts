/**
 * Durable idempotency for the Supabase "Send SMS" auth hook.
 *
 * The in-process Map this replaces survives nothing — a restart, a deploy, a crash or a
 * second instance all lose it, and a Supabase retry that lands elsewhere sends a second
 * real WhatsApp message to a real person. This service owns the durable ledger instead.
 *
 * It is the only place that knows the table or the RPC names. Nothing here accepts an OTP,
 * a phone number or a raw body: the caller passes a digest, and a digest is all that is
 * ever written.
 *
 * In production the durable store is mandatory. If it is missing or an RPC fails, the hook
 * fails closed rather than quietly degrading to in-memory dedupe, because a degraded hook
 * looks identical to a working one right up until it double-sends.
 */
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

/** What the caller is allowed to do with this webhook-id. */
export type ClaimStatus =
  /** Dispatch now; this instance holds the lease. */
  | "CLAIMED"
  /** Already delivered. Answer 200 and send nothing. */
  | "SUCCEEDED"
  /** Another instance holds a live lease. Do not send. */
  | "IN_FLIGHT"
  /** A previous attempt may have delivered. Never auto-resend this id. */
  | "UNCERTAIN"
  /** Same id, different payload. Send nothing. */
  | "CONFLICT"
  /** Retry ceiling reached after explicit provider refusals. */
  | "EXHAUSTED";

export interface ClaimResult {
  status: ClaimStatus;
  attemptCount: number;
  providerMessageId: string | null;
}

/** Lease length. Comfortably longer than the hook's own dispatch deadline. */
const LEASE_SECONDS = 30;
/** How long a delivery record is kept before cleanup may remove it. */
const RECORD_TTL_SECONDS = 24 * 60 * 60;
/** Explicit provider refusals that may be retried under the same webhook-id. */
const MAX_ATTEMPTS = 3;

@Injectable()
export class AuthHookIdempotencyService {
  private readonly logger = new Logger(AuthHookIdempotencyService.name);

  /**
   * Identifies this process in the ledger. Random per boot: two instances of the same
   * deploy must never be able to complete each other's leases.
   */
  readonly instanceId = `hook-${crypto.randomUUID()}`;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseAdminService,
  ) {}

  private isProductionRuntime(): boolean {
    return (process.env.NODE_ENV || "").toLowerCase() === "production";
  }

  /**
   * Whether the durable store is mandatory.
   *
   * Explicitly on via OTP_DURABLE_IDEMPOTENCY_REQUIRED, and implicitly on in production —
   * a production deploy that forgets the flag must not silently run without a ledger.
   * Only an explicit "false" outside production turns it off, which is what local runs and
   * the test suite use.
   */
  isRequired(): boolean {
    const raw = this.config.get<string>("OTP_DURABLE_IDEMPOTENCY_REQUIRED")?.trim().toLowerCase();
    if (raw === "true" || raw === "1" || raw === "yes") return true;
    if (raw === "false" || raw === "0" || raw === "no") {
      if (this.isProductionRuntime()) {
        this.logger.error(
          "[AUTH_HOOK] OTP_DURABLE_IDEMPOTENCY_REQUIRED=false is ignored in production",
        );
        return true;
      }
      return false;
    }
    return this.isProductionRuntime();
  }

  /** Uniform fail-closed error. Retryable, and it never explains the internals. */
  private unavailable(code: string): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code,
      message: "تعذر إرسال رمز التحقق حالياً. حاول مرة أخرى",
    });
  }

  /**
   * Atomically claims the right to dispatch this webhook-id.
   *
   * @param webhookId  the Standard Webhooks id, already signature-verified
   * @param digest     SHA-256 of the exact signed bytes — never the body itself
   */
  async claim(webhookId: string, digest: string): Promise<ClaimResult> {
    const { data, error } = await this.supabase.client.rpc("claim_auth_hook_delivery", {
      p_webhook_id: webhookId,
      p_payload_digest: digest,
      p_owner_instance: this.instanceId,
      p_lease_seconds: LEASE_SECONDS,
      p_ttl_seconds: RECORD_TTL_SECONDS,
      p_max_attempts: MAX_ATTEMPTS,
    });

    if (error) {
      // Includes the case where the migration has not been applied. Never fall back.
      this.logger.error(`[AUTH_HOOK] Durable claim failed — refusing dispatch (${error.code ?? "rpc"})`);
      throw this.unavailable("SUPABASE_AUTH_HOOK_DURABLE_STORE_UNAVAILABLE");
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.status) {
      this.logger.error("[AUTH_HOOK] Durable claim returned no status — refusing dispatch");
      throw this.unavailable("SUPABASE_AUTH_HOOK_DURABLE_STORE_UNAVAILABLE");
    }

    return {
      status: row.status as ClaimStatus,
      attemptCount: Number(row.attempt_count ?? 0),
      providerMessageId: row.provider_message_id ?? null,
    };
  }

  /**
   * Records a terminal transition. A false return means the row moved on without us —
   * typically our lease expired and the sweeper retired it — which is logged and otherwise
   * tolerated, because the dispatch itself has already happened either way.
   */
  private async transition(
    rpc: "complete_auth_hook_delivery" | "fail_auth_hook_delivery" | "mark_auth_hook_delivery_uncertain",
    webhookId: string,
    extra: Record<string, string | null>,
  ): Promise<boolean> {
    const { data, error } = await this.supabase.client.rpc(rpc, {
      p_webhook_id: webhookId,
      p_owner_instance: this.instanceId,
      ...extra,
    });

    if (error) {
      this.logger.error(`[AUTH_HOOK] Durable transition ${rpc} failed (${error.code ?? "rpc"})`);
      return false;
    }
    if (data === false) {
      this.logger.warn(`[AUTH_HOOK] Durable transition ${rpc} did not apply — lease was lost`);
    }
    return data === true;
  }

  /** Meta accepted the send and returned a wamid. Terminal. */
  async complete(webhookId: string, providerMessageId: string | null): Promise<boolean> {
    return this.transition("complete_auth_hook_delivery", webhookId, {
      p_provider_message_id: providerMessageId,
    });
  }

  /** Meta explicitly refused before accepting. Nothing was delivered; bounded retry is safe. */
  async fail(webhookId: string, errorCode: string | null): Promise<boolean> {
    return this.transition("fail_auth_hook_delivery", webhookId, { p_error_code: errorCode });
  }

  /**
   * We do not know whether Meta accepted the send — a timeout, an abort, or any ambiguous
   * transport failure. Terminal on purpose: a duplicate here costs a real message.
   */
  async markUncertain(webhookId: string, errorCode: string | null): Promise<boolean> {
    return this.transition("mark_auth_hook_delivery_uncertain", webhookId, {
      p_error_code: errorCode,
    });
  }

  /** Reads a single delivery's state. Used to poll a lease held by another instance. */
  async peekStatus(webhookId: string): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from("auth_hook_deliveries")
      .select("state")
      .eq("webhook_id", webhookId)
      .maybeSingle();

    if (error) return null;
    return (data as { state?: string } | null)?.state ?? null;
  }

  /**
   * Housekeeping. Retires expired leases to UNCERTAIN and deletes finished rows.
   * Never deletes an IN_FLIGHT row — losing the guard is worse than keeping a stale row.
   */
  async cleanup(uncertainRetentionDays = 30): Promise<{
    leasesRetired: number;
    rowsDeleted: number;
    uncertainKept: number;
  }> {
    const { data, error } = await this.supabase.client.rpc("cleanup_expired_auth_hook_deliveries", {
      p_uncertain_retention_days: uncertainRetentionDays,
    });

    if (error) {
      this.logger.error(`[AUTH_HOOK] Delivery cleanup failed (${error.code ?? "rpc"})`);
      throw this.unavailable("SUPABASE_AUTH_HOOK_CLEANUP_FAILED");
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      leasesRetired: Number(row?.leases_retired ?? 0),
      rowsDeleted: Number(row?.rows_deleted ?? 0),
      uncertainKept: Number(row?.uncertain_kept ?? 0),
    };
  }
}
