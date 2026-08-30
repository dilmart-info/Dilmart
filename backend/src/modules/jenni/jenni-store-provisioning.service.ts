import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { JenniClientService } from "./jenni-client.service";
import { normalizeIraqMobilePhone } from "./jenni-dispatch.service";
import { JenniProviderException } from "./jenni-provider.exception";
import type { JenniStoreCreatePayload } from "./jenni.types";

// ── Constants ───────────────────────────────────────────────────────────────

/** Stale lock TTL in minutes — locks older than this are auto-cleaned. */
const STALE_LOCK_TTL_MINUTES = 10;

// ── Governorate Aliases ─────────────────────────────────────────────────────
// Normalized exact matching — NO fuzzy ilike. Supervisor decision.
// Keys are lowercase, diacritics-stripped, alef-unified.

const GOVERNORATE_ALIASES: Record<string, string> = {
  // أربيل / Erbil
  "اربيل": "ARB",
  "أربيل": "ARB",
  "erbil": "ARB",
  "arbil": "ARB",
  "irbil": "ARB",
  // الأنبار / Anbar
  "الانبار": "ANB",
  "الأنبار": "ANB",
  "anbar": "ANB",
  "al-anbar": "ANB",
  "الرمادي": "ANB",
  "رمادي": "ANB",
  "ramadi": "ANB",
  // البصرة / Basra
  "البصرة": "BAS",
  "بصرة": "BAS",
  "basra": "BAS",
  "al-basra": "BAS",
  // السليمانية / Sulaymaniyah
  "السليمانية": "SMH",
  "سليمانية": "SMH",
  "sulaymaniyah": "SMH",
  // القادسية (الديوانية)
  "القادسية": "QAD",
  "القادسية (الديوانية)": "QAD",
  "الديوانية": "QAD",
  "ديوانية": "QAD",
  "qadisiyah": "QAD",
  "diwaniyah": "QAD",
  // المثنى (السماوة)
  "المثنى": "MTH",
  "المثني": "MTH",
  "المثنى (السماوة)": "MTH",
  "المثني (السماوة)": "MTH",
  "السماوة": "MTH",
  "سماوة": "MTH",
  "muthanna": "MTH",
  "samawah": "MTH",
  // النجف / Najaf
  "النجف": "NJF",
  "نجف": "NJF",
  "najaf": "NJF",
  // بابل / Babylon
  "بابل": "BBL",
  "babel": "BBL",
  "babylon": "BBL",
  "babil": "BBL",
  "الحلة": "BBL",
  "حلة": "BBL",
  "hillah": "BBL",
  "hilla": "BBL",
  // بغداد / Baghdad
  "بغداد": "BGD",
  "بغداد الرصافة": "BGD",
  "بغداد الكرخ": "BGD",
  "baghdad": "BGD",
  // حلبجة / Halabja
  "حلبجة": "HAL",
  "halabja": "HAL",
  // دهوك / Duhok
  "دهوك": "DOH",
  "dahuk": "DOH",
  "duhok": "DOH",
  "dohuk": "DOH",
  // ديالى / Diyala
  "ديالى": "DYL",
  "ديالي": "DYL",
  "diyala": "DYL",
  // ذي قار (الناصرية)
  "ذي قار": "DHI",
  "ذي قار (الناصرية)": "DHI",
  "الناصرية": "DHI",
  "ناصرية": "DHI",
  "dhi qar": "DHI",
  "nasiriyah": "DHI",
  // صلاح الدين / Saladin
  "صلاح الدين": "SAH",
  "saladin": "SAH",
  "salah al-din": "SAH",
  "tikrit": "SAH",
  // كربلاء / Karbala
  "كربلاء": "KRB",
  "karbala": "KRB",
  // كركوك / Kirkuk
  "كركوك": "KRK",
  "kirkuk": "KRK",
  // ميسان (العمارة)
  "ميسان": "MYS",
  "ميسان (العمارة)": "MYS",
  "العمارة": "MYS",
  "عمارة": "MYS",
  "maysan": "MYS",
  "amarah": "MYS",
  // نينوى (الموصل)
  "نينوى": "NIN",
  "نينوي": "NIN",
  "نينوى (الموصل)": "NIN",
  "نينوي (الموصل)": "NIN",
  "الموصل": "NIN",
  "موصل": "NIN",
  "nineveh": "NIN",
  "mosul": "NIN",
  // واسط (الكوت)
  "واسط": "WST",
  "واسط (الكوت)": "WST",
  "الكوت": "WST",
  "كوت": "WST",
  "wasit": "WST",
  "kut": "WST",
};

// ── Service ─────────────────────────────────────────────────────────────────

export type StoreProvisioningResult = {
  jenni_store_id: number;
  was_created: boolean;
};

export type ProvisioningStatus = {
  merchant_slug: string;
  jenni_store_id: number | null;
  jenni_synced_at: string | null;
  jenni_sync_error: string | null;
  is_linked: boolean;
};

@Injectable()
export class JenniStoreProvisioningService {
  private readonly logger = new Logger(JenniStoreProvisioningService.name);

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly jenniClient: JenniClientService,
    private readonly config: ConfigService,
  ) {}

  private assertStoreProvisioningEnabled(): void {
    const allowed = String(this.config.get("JENNI_ALLOW_STORE_PROVISIONING") ?? "").trim().toLowerCase();
    if (allowed !== "true") {
      throw new ForbiddenException(
        "Store provisioning is disabled. Set JENNI_ALLOW_STORE_PROVISIONING=true to enable.",
      );
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Ensure a Jenni Store exists for this merchant.
   * - If merchant.jenni_store_id exists → return immediately (idempotent).
   * - If not → acquire table lock → double-check → create via Jenni API.
   * - On failure → save jenni_sync_error, do NOT update jenni_store_id.
   * - On success → save jenni_store_id + jenni_synced_at + clear error.
   * - Lock is always released in finally (table-based, not advisory).
   */
  async ensureStoreForMerchant(merchantId: string, attemptId?: string): Promise<StoreProvisioningResult> {
    const activeAttemptId = attemptId ?? `jenni-store-${merchantId}-${Date.now()}`;

    // 1. Quick check without lock
    const merchant = await this.getMerchantWithJenniFields(merchantId);
    this.logger.log(
      `ensureStoreForMerchant: quick-check | merchantId=${merchantId} | attemptId=${activeAttemptId} | jenni_store_id_exists=${!!merchant.jenni_store_id}`
    );
    if (merchant.jenni_store_id) {
      return { jenni_store_id: merchant.jenni_store_id, was_created: false };
    }

    // 2. Acquire table-based lock
    await this.acquireTableLock(merchantId, activeAttemptId);

    try {
      // 3. Re-check after lock (double-check pattern)
      const refreshed = await this.getMerchantWithJenniFields(merchantId);
      this.logger.log(
        `ensureStoreForMerchant: double-check after lock | merchantId=${merchantId} | attemptId=${activeAttemptId} | jenni_store_id_exists=${!!refreshed.jenni_store_id}`
      );
      if (refreshed.jenni_store_id) {
        return { jenni_store_id: refreshed.jenni_store_id, was_created: false };
      }

      // 4. Build and validate payload
      const settings = await this.getMerchantSettings(merchantId);
      const payload = await this.buildStorePayload(refreshed, settings);

      const maskedPhone = payload.store_phone ? payload.store_phone.slice(0, 3) + "****" + payload.store_phone.slice(-4) : "";
      this.logger.log(
        `ensureStoreForMerchant: payload validation success | merchantId=${merchantId} | attemptId=${activeAttemptId} | has_store_name=${!!payload.store_name} | phone=${maskedPhone} | governorate_code=${payload.governorate_code} | has_address=${!!payload.address} | jenni_merchant_id_exists=true`
      );

      // 5. Call Jenni API
      this.assertStoreProvisioningEnabled();
      this.logger.log(`ensureStoreForMerchant: safety gate passed | merchantId=${merchantId} | attemptId=${activeAttemptId}`);

      let response: any;
      let usedUniqueFallback = false;

      this.logger.log(`ensureStoreForMerchant: calling Jenni API createStore | merchantId=${merchantId} | attemptId=${activeAttemptId}`);
      try {
        response = await this.jenniClient.createStore(payload);
      } catch (firstErr: any) {
        if (this.isDuplicateStoreNameError(firstErr)) {
          const uniqueStoreName = this.buildUniqueStoreName(refreshed.display_name!, refreshed.slug, refreshed.id);
          this.logger.warn(
            `ensureStoreForMerchant: duplicate store name detected on initial attempt | merchantId=${merchantId} | attemptId=${activeAttemptId} | retrying with deterministic unique name`
          );
          const retryPayload: JenniStoreCreatePayload = {
            ...payload,
            store_name: uniqueStoreName,
          };
          try {
            this.logger.log(
              `ensureStoreForMerchant: calling Jenni API createStore (retry with unique name) | merchantId=${merchantId} | attemptId=${activeAttemptId}`
            );
            response = await this.jenniClient.createStore(retryPayload);
            usedUniqueFallback = true;
            this.logger.log(
              `ensureStoreForMerchant: duplicate store name fallback retry succeeded | merchantId=${merchantId} | attemptId=${activeAttemptId}`
            );
          } catch (retryErr: any) {
            const retryStatus = retryErr?.status ?? retryErr?.statusCode ?? 500;
            this.logger.error(
              `ensureStoreForMerchant: duplicate store name fallback retry also failed | merchantId=${merchantId} | attemptId=${activeAttemptId} | status=${retryStatus} | message="${retryErr?.message}"`
            );

            if (this.isDuplicateStoreNameError(retryErr)) {
              // Retry also got duplicate — save clean message and throw duplicate-specific error
              const duplicateErrMsg = "Jenni Store name duplicate. Retry with unique name also failed.";
              await this.saveSyncError(merchantId, duplicateErrMsg);
              throw new JenniProviderException(
                duplicateErrMsg,
                400,
                retryErr?.sanitizedBodyPreview ?? firstErr?.sanitizedBodyPreview,
              );
            }

            // Non-duplicate retry failure (500, timeout, auth, etc.)
            // Re-throw as-is — let the outer catch handle it without a misleading duplicate label
            throw retryErr;
          }
        } else {
          throw firstErr;
        }
      }

      const storeId = response.store_id ?? response.id;
      this.logger.log(
        `ensureStoreForMerchant: Jenni API response summary | merchantId=${merchantId} | attemptId=${activeAttemptId} | store_id=${storeId ?? "missing"} | has_store_id=${!!storeId} | used_unique_fallback=${usedUniqueFallback}`
      );

      if (!storeId) {
        const msg = "Jenni API returned success but no store_id in response";
        await this.saveSyncError(merchantId, msg);
        throw new BadRequestException(msg);
      }

      // 6. Save result
      await this.saveMerchantStoreId(merchantId, storeId);
      this.logger.log(`ensureStoreForMerchant: store ID saved to DB | merchantId=${merchantId} | attemptId=${activeAttemptId} | store_id=${storeId}`);

      return { jenni_store_id: storeId, was_created: true };
    } catch (err: any) {
      const status = err?.status ?? err?.statusCode ?? 500;
      this.logger.error(
        `ensureStoreForMerchant: error occurred | merchantId=${merchantId} | attemptId=${activeAttemptId} | errorClass=${err?.constructor?.name} | status=${status} | message="${err?.message}"`
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
   * Check whether an error from Jenni API indicates a duplicate/reduplicate store name.
   */
  isDuplicateStoreNameError(err: any): boolean {
    if (!err) return false;
    const status = err?.providerStatus ?? err?.status ?? err?.statusCode;
    const body = String(err?.sanitizedBodyPreview ?? err?.responseBody ?? err?.message ?? "").toLowerCase();
    if (status === 400 && (body.includes("reduplicate") || body.includes("duplicate"))) {
      return true;
    }
    return false;
  }

  /**
   * Build a deterministic unique store name using display_name + slug/shortId.
   */
  buildUniqueStoreName(displayName: string, slug?: string | null, merchantId?: string | null): string {
    const cleanDisplay = (displayName || "Store").trim();
    const cleanSlug = (slug || "").trim();
    const shortId = (merchantId || "").replace(/-/g, "").slice(0, 8);
    const suffix = cleanSlug || shortId;
    const candidate = suffix ? `${cleanDisplay} - ${suffix}` : cleanDisplay;
    if (candidate.length > 100 && suffix) {
      const maxDisplayLen = Math.max(10, 100 - suffix.length - 3);
      return `${cleanDisplay.slice(0, maxDisplayLen).trim()} - ${suffix}`;
    }
    return candidate;
  }

  /**
   * Manually link an existing Jenni Store ID to a merchant.
   * Admin-only operation. Does NOT call Jenni API.
   * Rejects if jenni_store_id is already linked to another merchant.
   */
  async linkExistingStore(merchantId: string, jenniStoreId: number): Promise<void> {
    if (!jenniStoreId || jenniStoreId <= 0) {
      throw new BadRequestException("Invalid jenni_store_id");
    }

    // Check if this store_id is already linked to another merchant
    const { data: existing } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, slug")
      .eq("jenni_store_id", jenniStoreId)
      .neq("id", merchantId)
      .maybeSingle();

    if (existing) {
      throw new BadRequestException(
        `jenni_store_id=${jenniStoreId} is already linked to merchant ${existing.slug ?? existing.id}`,
      );
    }

    const { error } = await this.supabaseAdmin.client
      .from("merchants")
      .update({
        jenni_store_id: jenniStoreId,
        jenni_synced_at: new Date().toISOString(),
        jenni_sync_error: null,
      })
      .eq("id", merchantId);

    if (error) {
      throw new BadRequestException(`Failed to link store: ${error.message}`);
    }

    this.logger.log(`Manually linked jenni_store_id=${jenniStoreId} to merchant=${merchantId}`);
  }

  /**
   * Get the Jenni provisioning status for a merchant.
   */
  async getProvisioningStatus(merchantId: string): Promise<ProvisioningStatus> {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("slug, jenni_store_id, jenni_synced_at, jenni_sync_error")
      .eq("id", merchantId)
      .maybeSingle();

    if (error || !data) {
      throw new BadRequestException(`Merchant not found: ${merchantId}`);
    }

    return {
      merchant_slug: data.slug,
      jenni_store_id: data.jenni_store_id,
      jenni_synced_at: data.jenni_synced_at,
      jenni_sync_error: data.jenni_sync_error,
      is_linked: data.jenni_store_id != null,
    };
  }

  // ── Private: Data Access ──────────────────────────────────────────────────

  private async getMerchantWithJenniFields(merchantId: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, slug, display_name, jenni_store_id, jenni_synced_at, jenni_sync_error, jenni_merchant_id")
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
      .select("contact_phone, whatsapp_phone, address, city")
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(`Failed to load merchant settings: ${error.message}`);
    }

    return data ?? { contact_phone: null, whatsapp_phone: null, address: null, city: null };
  }

  // ── Private: Payload Builder ──────────────────────────────────────────────

  /**
   * Build and validate the Jenni Store creation payload.
   * Strict validation — no fallbacks for address or governorate.
   * Saves jenni_sync_error with a clear message if validation fails.
   */
  private async buildStorePayload(
    merchant: { id: string; display_name: string | null; jenni_merchant_id: string | number | null },
    settings: { contact_phone: string | null; whatsapp_phone: string | null; address: string | null; city: string | null },
  ): Promise<JenniStoreCreatePayload> {
    const errors: string[] = [];

    // 1. display_name — required, no fallback
    if (!merchant.display_name) {
      errors.push("display_name");
    }

    // 2. phone — contact_phone then whatsapp_phone, no further fallback
    const phone = normalizeIraqMobilePhone(
      settings.contact_phone || settings.whatsapp_phone || "",
    );
    if (!phone) {
      errors.push("phone (contact_phone or whatsapp_phone)");
    }

    // 3. address — from merchant_settings.address ONLY, no city fallback
    if (!settings.address) {
      errors.push("address");
    }

    // 4. governorate — normalized exact matching, no BGD default
    const govCode = this.resolveGovernorateCode(settings.city);
    if (!govCode) {
      errors.push(`city/governorate mapping (city=${JSON.stringify(settings.city)})`);
    }

    // 5. jenni_merchant_id — required and must be a valid positive integer
    if (merchant.jenni_merchant_id === null || merchant.jenni_merchant_id === undefined || String(merchant.jenni_merchant_id).trim() === "") {
      errors.push("jenni_merchant_id (Merchant must be linked in Jenni first)");
    } else {
      const jenniMerchantId = Number(merchant.jenni_merchant_id);
      if (!(Number.isInteger(jenniMerchantId) && jenniMerchantId > 0)) {
        errors.push("jenni_merchant_id (Must be a positive integer)");
      }
    }

    if (errors.length > 0) {
      const msg = `Cannot provision Jenni Store: missing ${errors.join(", ")}`;
      await this.saveSyncError(merchant.id, msg);
      throw new BadRequestException(msg);
    }

    const jenniMerchantId = Number(merchant.jenni_merchant_id);

    return {
      store_name: merchant.display_name!,
      store_phone: phone!,
      governorate_code: govCode!,
      address: settings.address!,
      merchant_id: jenniMerchantId,
    };
  }

  // ── Private: Governorate Resolution ───────────────────────────────────────

  /**
   * Resolve city name to Jenni governorate code using normalized exact matching.
   * NO fuzzy ilike. If no exact match → returns null → caller throws error.
   */
  resolveGovernorateCode(city: string | null): string | null {
    if (!city) return null;

    const normalized = this.normalizeGovernorateInput(city);
    return GOVERNORATE_ALIASES[normalized] ?? null;
  }

  private normalizeGovernorateInput(input: string): string {
    return input
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, "") // remove Arabic diacritics (tashkeel)
      .replace(/[\u0623\u0625\u0622]/g, "\u0627") // أ/إ/آ → ا (alef unification)
      .replace(/\u0649/g, "\u064A")              // ى → ي (alef maqsura → ya)
      .replace(/\s+/g, " ");
  }

  // ── Private: Table-Based Lock ──────────────────────────────────────────────

  /**
   * Acquire a table-based lock for store provisioning.
   * Inserts a row into jenni_store_provisioning_locks.
   * If row already exists (another request in progress) → cleans stale locks → retries once.
   * If still locked → throws.
   */
  async acquireTableLock(merchantId: string, attemptId: string): Promise<void> {
    // Try to insert lock row
    const { error } = await this.supabaseAdmin.client
      .from("jenni_store_provisioning_locks")
      .insert({ merchant_id: merchantId })
      .single();

    if (!error) {
      this.logger.log(`ensureStoreForMerchant: lock acquired | merchantId=${merchantId} | attemptId=${attemptId}`);
      return; // Lock acquired
    }

    // Conflict — another request holds the lock
    // Try to clean stale locks older than TTL
    await this.cleanStaleLocks();

    // Retry once after stale cleanup
    const { error: retryError } = await this.supabaseAdmin.client
      .from("jenni_store_provisioning_locks")
      .insert({ merchant_id: merchantId })
      .single();

    if (retryError) {
      this.logger.warn(`ensureStoreForMerchant: lock acquisition conflict | merchantId=${merchantId} | attemptId=${attemptId}`);
      throw new BadRequestException(
        "Store provisioning already in progress for this merchant. Please wait and try again.",
      );
    }

    this.logger.log(`ensureStoreForMerchant: lock acquired after retry | merchantId=${merchantId} | attemptId=${attemptId}`);
  }

  /**
   * Release the table-based lock. Called in finally block.
   */
  async releaseTableLock(merchantId: string, attemptId: string): Promise<void> {
    const { error } = await this.supabaseAdmin.client
      .from("jenni_store_provisioning_locks")
      .delete()
      .eq("merchant_id", merchantId);

    if (error) {
      this.logger.warn(`ensureStoreForMerchant: failed to release lock | merchantId=${merchantId} | attemptId=${attemptId} | error=${error.message}`);
    } else {
      this.logger.log(`ensureStoreForMerchant: lock released | merchantId=${merchantId} | attemptId=${attemptId}`);
    }
  }

  /**
   * Clean up stale locks older than STALE_LOCK_TTL_MINUTES.
   * Prevents deadlocks from crashed processes.
   */
  private async cleanStaleLocks(): Promise<void> {
    const cutoff = new Date(Date.now() - STALE_LOCK_TTL_MINUTES * 60_000).toISOString();
    const { error } = await this.supabaseAdmin.client
      .from("jenni_store_provisioning_locks")
      .delete()
      .lt("locked_at", cutoff);

    if (error) {
      this.logger.warn(`Failed to clean stale locks: ${error.message}`);
    }
  }

  // ── Private: Persistence ──────────────────────────────────────────────────

  private async saveMerchantStoreId(merchantId: string, storeId: number): Promise<void> {
    const { error } = await this.supabaseAdmin.client
      .from("merchants")
      .update({
        jenni_store_id: storeId,
        jenni_synced_at: new Date().toISOString(),
        jenni_sync_error: null,
      })
      .eq("id", merchantId);

    if (error) {
      this.logger.error(`Failed to save jenni_store_id=${storeId} for merchant=${merchantId}: ${error.message}`);
      throw new BadRequestException(`Failed to save Jenni store link: ${error.message}`);
    }
  }

  private async saveSyncError(merchantId: string, errorMessage: string): Promise<void> {
    const { error } = await this.supabaseAdmin.client
      .from("merchants")
      .update({ jenni_sync_error: errorMessage })
      .eq("id", merchantId);

    if (error) {
      this.logger.error(`Failed to save sync error for merchant=${merchantId}: ${error.message}`);
    }
  }
}
