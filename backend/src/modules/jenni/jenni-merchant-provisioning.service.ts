import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { JenniClientService } from "./jenni-client.service";
import { normalizeIraqMobilePhone } from "./jenni-dispatch.service";
import { JenniProviderException } from "./jenni-provider.exception";
import type { JenniMerchantCreatePayload } from "./jenni.types";

const STALE_LOCK_TTL_MINUTES = 10;

export type MerchantProvisioningResult = {
  jenni_merchant_id: string;
  was_created: boolean;
};

export type MerchantProvisioningStatus = {
  merchant_slug: string;
  jenni_merchant_id: string | null;
  jenni_merchant_synced_at: string | null;
  jenni_merchant_sync_error: string | null;
  is_linked: boolean;
};

@Injectable()
export class JenniMerchantProvisioningService {
  private readonly logger = new Logger(JenniMerchantProvisioningService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly jenniClient: JenniClientService,
    private readonly config: ConfigService,
  ) {}

  private assertMerchantProvisioningEnabled(): void {
    const allowed = String(this.config.get("JENNI_ALLOW_MERCHANT_PROVISIONING") ?? "").trim().toLowerCase();
    if (allowed !== "true") {
      throw new ForbiddenException(
        "Merchant provisioning is disabled. Set JENNI_ALLOW_MERCHANT_PROVISIONING=true to enable.",
      );
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Ensure a Jenni Merchant exists for this DilMart merchant.
   * - If merchant.jenni_merchant_id exists → return immediately (idempotent).
   * - If not → acquire table lock → double-check → create via Jenni API.
   * - On failure → save jenni_merchant_sync_error, do NOT update jenni_merchant_id.
   * - On success → save jenni_merchant_id + jenni_merchant_synced_at + clear error.
   * - Lock is always released in finally.
   */
  async ensureMerchantForMerchant(merchantId: string, attemptId?: string): Promise<MerchantProvisioningResult> {
    const activeAttemptId = attemptId ?? `jenni-merchant-${merchantId}-${Date.now()}`;

    // 1. Quick check without lock
    const merchant = await this.getMerchantWithJenniFields(merchantId);
    this.logger.log(
      `ensureMerchantForMerchant: quick-check | merchantId=${merchantId} | attemptId=${activeAttemptId} | jenni_merchant_id_exists=${!!merchant.jenni_merchant_id}`
    );
    if (merchant.jenni_merchant_id) {
      return { jenni_merchant_id: merchant.jenni_merchant_id, was_created: false };
    }

    // 2. Acquire table-based lock
    await this.acquireTableLock(merchantId, activeAttemptId);

    try {
      // 3. Re-check after lock (double-check pattern)
      const refreshed = await this.getMerchantWithJenniFields(merchantId);
      this.logger.log(
        `ensureMerchantForMerchant: double-check after lock | merchantId=${merchantId} | attemptId=${activeAttemptId} | jenni_merchant_id_exists=${!!refreshed.jenni_merchant_id}`
      );
      if (refreshed.jenni_merchant_id) {
        return { jenni_merchant_id: refreshed.jenni_merchant_id, was_created: false };
      }

      // 4. Build and validate payload
      const settings = await this.getMerchantSettings(merchantId);
      const payload = await this.buildMerchantPayload(refreshed, settings);

      const maskedPhone = payload.phone ? payload.phone.slice(0, 3) + "****" + payload.phone.slice(-4) : "";
      this.logger.log(
        `ensureMerchantForMerchant: payload validation success | merchantId=${merchantId} | attemptId=${activeAttemptId} | has_merchant_name=${!!payload.merchant_name} | phone=${maskedPhone} | merchant_system_code_exists=true`
      );

      // 5. Call Jenni API
      this.assertMerchantProvisioningEnabled();
      this.logger.log(`ensureMerchantForMerchant: safety gate passed | merchantId=${merchantId} | attemptId=${activeAttemptId}`);

      this.logger.log(`ensureMerchantForMerchant: calling Jenni API createMerchant | merchantId=${merchantId} | attemptId=${activeAttemptId}`);
      const response = await this.jenniClient.createMerchant(payload);

      const jenniMerchantId = response.merchant_id != null ? String(response.merchant_id) : response.id != null ? String(response.id) : "";
      this.logger.log(
        `ensureMerchantForMerchant: Jenni API response summary | merchantId=${merchantId} | attemptId=${activeAttemptId} | jenni_merchant_id=${jenniMerchantId || "missing"} | has_jenni_merchant_id=${!!jenniMerchantId}`
      );

      if (!jenniMerchantId) {
        const msg = "Jenni API returned success but no merchant_id in response";
        await this.saveSyncError(merchantId, msg);
        throw new BadRequestException(msg);
      }

      // 6. Save result (Never save or log generated_password)
      await this.saveMerchantJenniId(merchantId, jenniMerchantId);
      this.logger.log(`ensureMerchantForMerchant: merchant ID saved to DB | merchantId=${merchantId} | attemptId=${activeAttemptId} | jenni_merchant_id=${jenniMerchantId}`);

      return { jenni_merchant_id: jenniMerchantId, was_created: true };
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode ?? 500;
      this.logger.error(
        `ensureMerchantForMerchant: error occurred | merchantId=${merchantId} | attemptId=${activeAttemptId} | errorClass=${err?.constructor?.name} | status=${status} | message="${err?.message}"`
      );

      if (err instanceof JenniProviderException) {
        await this.saveSyncError(merchantId, `Jenni API error: ${err.message}`);
      } else if (err instanceof BadRequestException || err instanceof ForbiddenException) {
        // Local validation/security gate error - do not save in DB
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        await this.saveSyncError(merchantId, `Jenni API error: ${msg}`);
      }
      throw err;
    } finally {
      // Always release the table lock
      await this.releaseTableLock(merchantId, activeAttemptId);
    }
  }

  /**
   * Get the Jenni merchant provisioning status for a merchant.
   */
  async getProvisioningStatus(merchantId: string): Promise<MerchantProvisioningStatus> {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("slug, jenni_merchant_id, jenni_merchant_synced_at, jenni_merchant_sync_error")
      .eq("id", merchantId)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException(`Merchant not found: ${merchantId}`);
    }

    return {
      merchant_slug: data.slug,
      jenni_merchant_id: data.jenni_merchant_id,
      jenni_merchant_synced_at: data.jenni_merchant_synced_at,
      jenni_merchant_sync_error: data.jenni_merchant_sync_error,
      is_linked: data.jenni_merchant_id != null,
    };
  }

  // ── Private: Data Access ──────────────────────────────────────────────────

  private async getMerchantWithJenniFields(merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, slug, display_name, jenni_merchant_id, jenni_merchant_synced_at, jenni_merchant_sync_error")
      .eq("id", merchantId)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException(`Merchant not found: ${merchantId}`);
    }

    return data;
  }

  private async getMerchantSettings(merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchant_settings")
      .select("contact_phone, whatsapp_phone")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`Failed to load merchant settings: ${error.message}`);
    }

    return data ?? { contact_phone: null, whatsapp_phone: null };
  }

  // ── Private: Payload Builder ──────────────────────────────────────────────

  private async buildMerchantPayload(
    merchant: { id: string; display_name: string | null },
    settings: { contact_phone: string | null; whatsapp_phone: string | null },
  ): Promise<JenniMerchantCreatePayload> {
    const errors: string[] = [];

    // 1. display_name — required
    if (!merchant.display_name) {
      errors.push("display_name");
    }

    // 2. phone — contact_phone then whatsapp_phone fallback
    const phone = normalizeIraqMobilePhone(
      settings.contact_phone || settings.whatsapp_phone || "",
    );
    if (!phone) {
      errors.push("phone (contact_phone or whatsapp_phone)");
    }

    // 3. system_code — deterministic unique login id generated from merchant UUID
    const normalized = merchant.id.replace(/-/g, "").toUpperCase();
    if (!/^[0-9A-F]{12,}$/.test(normalized)) {
      throw new BadRequestException("Invalid merchant ID format for system_code generation");
    }

    const systemCode = `DilMart_M_${normalized.slice(0, 12)}`;

    // Validate generated system_code characters and length
    if (!systemCode || systemCode.length < 3 || systemCode.length > 45 || !/^[A-Z0-9_]+$/.test(systemCode)) {
      errors.push("system_code (invalid format)");
    }

    if (errors.length > 0) {
      const msg = `Cannot provision Jenni Merchant: missing ${errors.join(", ")}`;
      throw new BadRequestException(msg);
    }

    return {
      merchant_name: merchant.display_name!,
      phone: phone!,
      system_code: systemCode,
    };
  }

  // ── Private: Table-Based Lock ──────────────────────────────────────────────

  async acquireTableLock(merchantId: string, attemptId: string): Promise<void> {
    // Try to insert lock row
    const { error } = await this.supabaseAdmin.client
      .from("jenni_merchant_provisioning_locks")
      .insert({ merchant_id: merchantId })
      .single();

    if (!error) {
      this.logger.log(`ensureMerchantForMerchant: lock acquired | merchantId=${merchantId} | attemptId=${attemptId}`);
      return; // Lock acquired
    }

    // Conflict — another request holds the lock
    await this.cleanStaleLocks();

    // Retry once after stale cleanup
    const { error: retryError } = await this.supabaseAdmin.client
      .from("jenni_merchant_provisioning_locks")
      .insert({ merchant_id: merchantId })
      .single();

    if (retryError) {
      this.logger.warn(`ensureMerchantForMerchant: lock acquisition conflict | merchantId=${merchantId} | attemptId=${attemptId}`);
      throw new BadRequestException(
        "Merchant provisioning already in progress for this merchant. Please wait and try again.",
      );
    }

    this.logger.log(`ensureMerchantForMerchant: lock acquired after retry | merchantId=${merchantId} | attemptId=${attemptId}`);
  }

  async releaseTableLock(merchantId: string, attemptId: string): Promise<void> {
    const { error } = await this.supabaseAdmin.client
      .from("jenni_merchant_provisioning_locks")
      .delete()
      .eq("merchant_id", merchantId);

    if (error) {
      this.logger.warn(`ensureMerchantForMerchant: failed to release lock | merchantId=${merchantId} | attemptId=${attemptId} | error=${error.message}`);
    } else {
      this.logger.log(`ensureMerchantForMerchant: lock released | merchantId=${merchantId} | attemptId=${attemptId}`);
    }
  }

  private async cleanStaleLocks(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_LOCK_TTL_MINUTES * 60_000).toISOString();
    const { error } = await this.supabaseAdmin.client
      .from("jenni_merchant_provisioning_locks")
      .delete()
      .lt("created_at", cutoff);

    if (error) {
      this.logger.warn(`Failed to clean stale locks: ${error.message}`);
    }
  }

  // ── Private: Persistence ──────────────────────────────────────────────────

  private async saveMerchantJenniId(merchantId: string, jenniMerchantId: string): Promise<void> {
    const { error } = await this.supabaseAdmin.client
      .from("merchants")
      .update({
        jenni_merchant_id: jenniMerchantId,
        jenni_merchant_synced_at: new Date().toISOString(),
        jenni_merchant_sync_error: null,
      })
      .eq("id", merchantId);

    if (error) {
      this.logger.error(`Failed to save jenni_merchant_id=${jenniMerchantId} for merchant=${merchantId}: ${error.message}`);
      throw new BadRequestException(`Failed to save Jenni merchant link: ${error.message}`);
    }
  }

  private async saveSyncError(merchantId: string, errorMessage: string): Promise<void> {
    const { error } = await this.supabaseAdmin.client
      .from("merchants")
      .update({ jenni_merchant_sync_error: errorMessage })
      .eq("id", merchantId);

    if (error) {
      this.logger.error(`Failed to save sync error for merchant=${merchantId}: ${error.message}`);
    }
  }
}
