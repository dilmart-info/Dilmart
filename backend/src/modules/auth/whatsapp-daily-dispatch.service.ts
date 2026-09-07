import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";

export interface DailyDispatchClaimOptions {
  correlationId: string;
  mode: "disabled" | "sandbox" | "live";
}

export interface DailyDispatchClaimResult {
  allowed: boolean;
  errorCode?: "OTP_DAILY_LIMIT_EXCEEDED" | "OTP_DAILY_LIMIT_INVALID_CONFIG";
  reason?: string;
  currentCount?: number;
  bucketDate?: string;
}

const DEFAULT_TIMEZONE = "Asia/Baghdad";

/**
 * WhatsAppDailyDispatchService
 *
 * Enforces a durable global daily dispatch cap for Meta WhatsApp OTP.
 *
 * Operational & Governance Contract:
 * 1. OTP_WHATSAPP_DAILY_GLOBAL_LIMIT is mandatory in sandbox mode.
 *    Recommended controlled-canary value: 200.
 *    There is NO implicit default. Missing or non-positive value fails closed.
 * 2. In live mode, the limit is optional (null allows dispatch without cap).
 * 3. Meaning of Counter: The slot is claimed and reserved in the database immediately
 *    BEFORE calling Meta. It tracks `reserved WhatsApp dispatch attempts`, not confirmed
 *    deliveries. If the subsequent Meta request fails, errors, or times out, the slot
 *    is NOT refunded. This behavior is deliberate and cost-defensive.
 */
@Injectable()
export class WhatsAppDailyDispatchService {
  private readonly logger = new Logger(WhatsAppDailyDispatchService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase?: SupabaseAdminService,
  ) {}

  /**
   * Resolves the configured daily global dispatch limit.
   * Returns:
   *  - a positive integer if validly configured
   *  - -1 if explicitly set to an invalid, zero, or negative value
   *  - null if unset or empty
   */
  getLimit(): number | null {
    const raw = this.config.get<string>("OTP_WHATSAPP_DAILY_GLOBAL_LIMIT");
    if (raw === undefined || raw === null || String(raw).trim() === "") {
      return null;
    }
    const parsed = Number(String(raw).trim());
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return -1;
    }
    return parsed;
  }

  getTimezone(): string {
    const raw = this.config.get<string>("OTP_WHATSAPP_DAILY_LIMIT_TIMEZONE");
    if (raw && String(raw).trim()) {
      return String(raw).trim();
    }
    return DEFAULT_TIMEZONE;
  }

  /**
   * Atomically claims a dispatch slot against the durable ledger.
   * Fails closed if the limit is exceeded, invalid, or the ledger is unreachable.
   * Never leaks recipient phone, OTP, tokens, or current counts to external callers.
   */
  async claimDispatch(options: DailyDispatchClaimOptions): Promise<DailyDispatchClaimResult> {
    const { correlationId, mode } = options;
    const limit = this.getLimit();
    const timezone = this.getTimezone();

    // 1. In sandbox mode, missing or non-positive limit must fail closed
    if (mode === "sandbox") {
      if (limit === null || limit <= 0) {
        this.logger.error(
          `[WHATSAPP][DAILY_LIMIT] Sandbox requires valid OTP_WHATSAPP_DAILY_GLOBAL_LIMIT correlationId=${correlationId} mode=${mode} category=INVALID_CONFIG`,
        );
        return {
          allowed: false,
          errorCode: "OTP_DAILY_LIMIT_INVALID_CONFIG",
          reason: "INVALID_CONFIG",
        };
      }
    } else if (mode === "live") {
      if (limit === null) {
        return { allowed: true };
      }
      if (limit <= 0) {
        this.logger.error(
          `[WHATSAPP][DAILY_LIMIT] Invalid OTP_WHATSAPP_DAILY_GLOBAL_LIMIT correlationId=${correlationId} mode=${mode} category=INVALID_CONFIG`,
        );
        return {
          allowed: false,
          errorCode: "OTP_DAILY_LIMIT_INVALID_CONFIG",
          reason: "INVALID_CONFIG",
        };
      }
    } else {
      // disabled mode
      return {
        allowed: false,
        errorCode: "OTP_DAILY_LIMIT_EXCEEDED",
        reason: "DISABLED",
      };
    }

    // 2. Perform atomic database claim
    if (!this.supabase?.client) {
      this.logger.error(
        `[WHATSAPP][DAILY_LIMIT] Supabase client unavailable correlationId=${correlationId} mode=${mode} category=STORE_UNAVAILABLE`,
      );
      return {
        allowed: false,
        errorCode: "OTP_DAILY_LIMIT_EXCEEDED",
        reason: "STORE_UNAVAILABLE",
      };
    }

    try {
      const { data, error } = await this.supabase.client.rpc("claim_whatsapp_daily_dispatch", {
        p_max_limit: limit,
        p_timezone: timezone,
      });

      if (error) {
        this.logger.error(
          `[WHATSAPP][DAILY_LIMIT] RPC claim_whatsapp_daily_dispatch failed correlationId=${correlationId} mode=${mode} error=${error.code ?? "unknown"}`,
        );
        return {
          allowed: false,
          errorCode: "OTP_DAILY_LIMIT_EXCEEDED",
          reason: "STORE_UNAVAILABLE",
        };
      }

      const row = Array.isArray(data) ? data[0] : data;
      const allowed = Boolean(row?.allowed);
      const currentCount = Number(row?.current_count ?? 0);
      const bucketDate = String(row?.bucket_date ?? "");

      if (!allowed) {
        this.logger.warn(
          `[WHATSAPP][DAILY_LIMIT] Daily cap exceeded correlationId=${correlationId} mode=${mode} category=GLOBAL_DAILY_LIMIT`,
        );
        return {
          allowed: false,
          errorCode: "OTP_DAILY_LIMIT_EXCEEDED",
          reason: "LIMIT_REACHED",
          currentCount,
          bucketDate,
        };
      }

      this.logger.log(
        `[WHATSAPP][DAILY_LIMIT] Dispatch slot reserved correlationId=${correlationId} mode=${mode} category=ALLOWED`,
      );
      return {
        allowed: true,
        currentCount,
        bucketDate,
      };
    } catch {
      this.logger.error(
        `[WHATSAPP][DAILY_LIMIT] Unexpected error in claimDispatch correlationId=${correlationId} mode=${mode}`,
      );
      return {
        allowed: false,
        errorCode: "OTP_DAILY_LIMIT_EXCEEDED",
        reason: "EXCEPTION",
      };
    }
  }

  async getCount(timezone = this.getTimezone()): Promise<{ currentCount: number; bucketDate: string }> {
    if (!this.supabase?.client) return { currentCount: 0, bucketDate: "" };
    const { data, error } = await this.supabase.client.rpc("get_whatsapp_daily_dispatch_count", {
      p_timezone: timezone,
    });
    if (error) return { currentCount: 0, bucketDate: "" };
    const row = Array.isArray(data) ? data[0] : data;
    return {
      currentCount: Number(row?.current_count ?? 0),
      bucketDate: String(row?.bucket_date ?? ""),
    };
  }
}
