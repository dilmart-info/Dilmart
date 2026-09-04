import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { SupabaseAdminService } from "../supabase-admin/supabase-admin.service";
import { ScopeResolverService } from "../scope-resolver/scope-resolver.service";
import { sanitizeSearchTerm, buildSafeOrFilter } from "../../common/search-utils";
import {
  AssignMerchantOwnerDto,
  CreateMerchantDto,
  ListMerchantCustomersQueryDto,
  ListMerchantOrdersQueryDto,
  MerchantFinanceStatementQueryDto,
  MerchantPayoutHistoryQueryDto,
  PatchMerchantSettingsDto,
  UpdateMerchantDto,
  UpdateMerchantStatusDto,
  UpsertMerchantSettingsDto,
  UpdateMerchantRegistrationDetailsDto,
} from "./merchants.dto";


const MERCHANT_SETTINGS_RPC = "upsert_merchant_settings_atomic";

/**
 * Settings fields the request contract may change. `logo_url` is deliberately NOT here: it lives on
 * `merchants`, not `merchant_settings`, and is added to the patch separately under the string-only
 * rule below.
 */
const MERCHANT_SETTINGS_PATCH_FIELDS = [
  "contact_phone",
  "whatsapp_phone",
  "support_email",
  "city",
  "address",
  "delivery_notes",
  "push_enabled",
  "sound_enabled",
  "sound_repeat_interval_seconds",
  "sound_max_duration_seconds",
] as const;

/** The canonical settings snapshot: the merchant_settings row plus the merchant's logo. */
export type MerchantSettingsSnapshot = Record<string, unknown> & { merchant_id: string; logo_url: string | null };

export type CanonicalMerchantSettings = {
  contact_phone: string | null;
  whatsapp_phone: string | null;
  support_email: string | null;
  city: string | null;
  address: string | null;
  delivery_notes: string | null;
  logo_url: string | null;
  push_enabled: boolean;
  sound_enabled: boolean;
  sound_repeat_interval_seconds: number;
  sound_max_duration_seconds: number;
};

export type CanonicalMerchantSettingsResponse = {
  merchant_id: string;
  settings_exists: boolean;
  settings: CanonicalMerchantSettings | null;
};

/**
 * Builds the RPC patch from the validated DTO.
 *
 * PRESENCE, not truthiness, decides what is written — `contact_phone: ""` is a real update that
 * clears the field, while an absent key leaves the stored value alone. `merchant_id` is never part
 * of the patch: the resolved merchant id is passed separately, so a merchant id from the browser can
 * never reach the write.
 *
 * `logo_url` reproduces the previous `typeof logo_url === "string"` rule exactly: omitted and null
 * both leave the logo untouched (null is NOT reinterpreted as "clear"), while `""` clears it and a
 * URL replaces it.
 */
function buildMerchantSettingsPatch(payload: UpsertMerchantSettingsDto | PatchMerchantSettingsDto): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const source = payload as unknown as Record<string, unknown>;
  for (const field of MERCHANT_SETTINGS_PATCH_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      patch[field] = source[field];
    }
  }
  if (typeof payload.logo_url === "string") {
    patch.logo_url = payload.logo_url;
  }
  return patch;
}

/** The embedded one-to-one row PostgREST returns — an object, or null when the merchant has none. */
function normalizeEmbeddedSettings(embedded: unknown): Record<string, unknown> | null {
  if (Array.isArray(embedded)) {
    const first = embedded[0];
    return first && typeof first === "object" ? (first as Record<string, unknown>) : null;
  }
  if (embedded && typeof embedded === "object") return embedded as Record<string, unknown>;
  return null;
}

/**
 * Fail-closed parsing of the atomic RPC's snapshot.
 *
 * The function returns the complete post-write row or raises, so a missing or malformed payload is a
 * contract failure. Nothing is defaulted here: inventing an empty settings object would report a
 * failed write back to the merchant as a successful save.
 */
function parseMerchantSettingsSnapshot(data: unknown): MerchantSettingsSnapshot {
  if (data === null || data === undefined) {
    throw new Error(MERCHANT_SETTINGS_RPC + " returned no payload.");
  }
  if (typeof data !== "object" || Array.isArray(data)) {
    throw new Error(MERCHANT_SETTINGS_RPC + " returned a malformed payload: expected an object.");
  }
  const snapshot = data as Record<string, unknown>;
  if (typeof snapshot.merchant_id !== "string" || snapshot.merchant_id === "") {
    throw new Error(MERCHANT_SETTINGS_RPC + " returned a malformed payload: merchant_id is missing.");
  }
  if (!Object.prototype.hasOwnProperty.call(snapshot, "logo_url")) {
    throw new Error(MERCHANT_SETTINGS_RPC + " returned a malformed payload: logo_url is missing.");
  }
  if (snapshot.logo_url !== null && typeof snapshot.logo_url !== "string") {
    throw new Error(MERCHANT_SETTINGS_RPC + " returned a malformed payload: logo_url must be a string or null.");
  }
  if (!Object.prototype.hasOwnProperty.call(snapshot, "updated_at")) {
    throw new Error(MERCHANT_SETTINGS_RPC + " returned a malformed payload: updated_at is missing.");
  }
  return snapshot as MerchantSettingsSnapshot;
}

/** One merchant row of the platform readiness summary (admin executive governance). */
export type MerchantReadinessSummaryRow = {
  merchant_id: string;
  display_name: string;
  status: string;
  score: number;
  is_ready: boolean;
};

/** Contract returned by `getPlatformMerchantReadinessSummariesForAdmin()` — unchanged shape. */
export type PlatformMerchantReadinessSummary = {
  merchants: MerchantReadinessSummaryRow[];
  distribution: Array<{ key: string; label: string; count: number }>;
  avg_readiness_score: number;
  ready_merchants: number;
  total_merchants: number;
};

const READINESS_SUMMARY_RPC = "admin_merchant_readiness_summary";

function describeValue(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function malformedSummary(detail: string): Error {
  return new Error(READINESS_SUMMARY_RPC + " returned a malformed payload: " + detail + ".");
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw malformedSummary(field + " must be an object, received " + describeValue(value));
  }
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw malformedSummary(field + " must be an array, received " + describeValue(value));
  }
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw malformedSummary(field + " must be a string, received " + describeValue(value));
  }
  return value;
}

function requireNonEmptyString(value: unknown, field: string): string {
  const text = requireString(value, field);
  if (text.trim() === "") {
    throw malformedSummary(field + " must not be empty");
  }
  return text;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw malformedSummary(field + " must be a boolean, received " + describeValue(value));
  }
  return value;
}

/** Finite, integral and >= 0 — counts and rounded scores are the only numbers this RPC emits. */
function requireCount(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw malformedSummary(field + " must be a finite non-negative integer, received " + describeValue(value));
  }
  return value;
}

function requireScore(value: unknown, field: string): number {
  const score = requireCount(value, field);
  if (score > 100) {
    throw malformedSummary(field + " must be between 0 and 100, received " + String(score));
  }
  return score;
}

/**
 * Fail-closed parsing of the `admin_merchant_readiness_summary()` payload.
 *
 * The RPC always returns the COMPLETE contract, including the legitimate empty-platform answer
 * (`merchants: []`, the three zero-count buckets, and zeroed counters) — that response is valid
 * precisely because every field is present. Anything else is a contract or schema failure, so
 * nothing here substitutes `[]` or `0` for a missing or malformed field: defaulting would render
 * a broken payload as a healthy, empty platform on the executive governance page and hide the
 * failure exactly where an operator would trust it most.
 */
function parsePlatformMerchantReadinessSummary(data: unknown): PlatformMerchantReadinessSummary {
  const payload = requireObject(data, "payload");

  const merchants = requireArray(payload.merchants, "merchants").map((entry, index) => {
    const row = requireObject(entry, "merchants[" + index + "]");
    return {
      merchant_id: requireNonEmptyString(row.merchant_id, "merchants[" + index + "].merchant_id"),
      // display_name/status are COALESCEd to '' by the RPC, so empty is valid but absent is not.
      display_name: requireString(row.display_name, "merchants[" + index + "].display_name"),
      status: requireString(row.status, "merchants[" + index + "].status"),
      score: requireScore(row.score, "merchants[" + index + "].score"),
      is_ready: requireBoolean(row.is_ready, "merchants[" + index + "].is_ready"),
    };
  });

  // The RPC always emits the three buckets; an empty array is the healthy-looking default this
  // parser exists to reject.
  const distributionEntries = requireArray(payload.distribution, "distribution");
  if (distributionEntries.length === 0) {
    throw malformedSummary("distribution must contain the readiness buckets, received an empty array");
  }
  const distribution = distributionEntries.map((entry, index) => {
    const bucket = requireObject(entry, "distribution[" + index + "]");
    return {
      key: requireNonEmptyString(bucket.key, "distribution[" + index + "].key"),
      label: requireNonEmptyString(bucket.label, "distribution[" + index + "].label"),
      count: requireCount(bucket.count, "distribution[" + index + "].count"),
    };
  });

  const avg_readiness_score = requireScore(payload.avg_readiness_score, "avg_readiness_score");
  const ready_merchants = requireCount(payload.ready_merchants, "ready_merchants");
  const total_merchants = requireCount(payload.total_merchants, "total_merchants");

  // Internal consistency — the RPC derives every counter from one CTE in a single statement, so a
  // mismatch means a truncated or stitched-together payload, not a legitimate platform state.
  if (merchants.length !== total_merchants) {
    throw malformedSummary(
      "total_merchants (" + String(total_merchants) + ") does not match the " + String(merchants.length) + " merchant rows returned",
    );
  }
  const bucketed = distribution.reduce((sum, bucket) => sum + bucket.count, 0);
  if (bucketed !== total_merchants) {
    throw malformedSummary(
      "distribution counts total " + String(bucketed) + " but total_merchants is " + String(total_merchants),
    );
  }
  const readyRows = merchants.filter((merchant) => merchant.is_ready).length;
  if (readyRows !== ready_merchants) {
    throw malformedSummary(
      "ready_merchants (" + String(ready_merchants) + ") does not match the " + String(readyRows) + " ready merchant rows returned",
    );
  }

  return { merchants, distribution, avg_readiness_score, ready_merchants, total_merchants };
}

@Injectable()
export class MerchantsService {
  /**
   * Explicit merchant-level negotiated commission agreement — a `commercial_rules` row with
   * scope_type='merchant', rule_type='commission' that is currently in effect (see the
   * Merchant Commercial Agreement admin feature). This is intentionally distinct from a plan
   * default / channel / global fallback rate, which is not a negotiated agreement.
   */
  private async hasExplicitMerchantCommissionAgreement(merchantId: string): Promise<boolean> {
    const nowIso = new Date().toISOString();
    const { count, error } = await this.supabaseAdmin.client
      .from("commercial_rules")
      .select("id", { count: "exact", head: true })
      .eq("scope_type", "merchant")
      .eq("scope_reference_id", merchantId)
      .eq("rule_type", "commission")
      .eq("is_active", true)
      .lte("start_at", nowIso)
      .or(`end_at.is.null,end_at.gt.${nowIso}`);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  private async computeReadinessByMerchantId(resolvedMerchantId: string) {
    const [merchantRes, settingsRes, productsCountRes, activeProductsCountRes, categorizedProductsCountRes, commercialAgreementConfigured] =
      await Promise.all([
        this.supabaseAdmin.client
          .from("merchants")
          .select("id,display_name,status")
          .eq("id", resolvedMerchantId)
          .maybeSingle(),
        this.supabaseAdmin.client
          .from("merchant_settings")
          .select("contact_phone,whatsapp_phone,support_email,city,address")
          .eq("merchant_id", resolvedMerchantId)
          .maybeSingle(),
        this.supabaseAdmin.client.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", resolvedMerchantId),
        this.supabaseAdmin.client
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("merchant_id", resolvedMerchantId)
          .eq("is_active", true),
        this.supabaseAdmin.client
          .from("products")
          .select("id", { count: "exact", head: true })
          .eq("merchant_id", resolvedMerchantId)
          .not("category_id", "is", null),
        this.hasExplicitMerchantCommissionAgreement(resolvedMerchantId),
      ]);

    if (merchantRes.error) throw merchantRes.error;
    if (settingsRes.error) throw settingsRes.error;
    if (productsCountRes.error) throw productsCountRes.error;
    if (activeProductsCountRes.error) throw activeProductsCountRes.error;
    if (categorizedProductsCountRes.error) throw categorizedProductsCountRes.error;

    const merchant = merchantRes.data;
    const settings = settingsRes.data as any;
    if (!merchant?.id) {
      throw new ForbiddenException("Merchant not found.");
    }

    const checks = {
      profile_completed: Boolean(String(merchant.display_name ?? "").trim()),
      contact_completed: Boolean(
        String(settings?.contact_phone ?? "").trim() ||
          String(settings?.whatsapp_phone ?? "").trim() ||
          String(settings?.support_email ?? "").trim(),
      ),
      address_completed: Boolean(String(settings?.city ?? "").trim() && String(settings?.address ?? "").trim()),
      has_products: (productsCountRes.count ?? 0) > 0,
      has_active_products: (activeProductsCountRes.count ?? 0) > 0,
      has_categorized_products: (categorizedProductsCountRes.count ?? 0) > 0,
      merchant_is_active: merchant.status === "active",
    };

    const checklist = [
      { key: "profile_completed", label: "إكمال ملف المتجر", passed: checks.profile_completed },
      { key: "contact_completed", label: "إدخال وسائل التواصل", passed: checks.contact_completed },
      { key: "address_completed", label: "إدخال المدينة والعنوان", passed: checks.address_completed },
      { key: "has_products", label: "إضافة منتجات", passed: checks.has_products },
      { key: "has_active_products", label: "تفعيل منتجات للبيع", passed: checks.has_active_products },
      { key: "has_categorized_products", label: "ربط المنتجات بأقسام", passed: checks.has_categorized_products },
      { key: "merchant_is_active", label: "تفعيل حالة التاجر", passed: checks.merchant_is_active },
    ];

    const passedChecks = checklist.filter((item) => item.passed).length;
    const totalChecks = checklist.length;
    const score = Math.round((passedChecks / totalChecks) * 100);

    return {
      merchant_id: resolvedMerchantId,
      score,
      passed_checks: passedChecks,
      total_checks: totalChecks,
      is_ready: passedChecks === totalChecks,
      checklist,
      stats: {
        products_count: productsCountRes.count ?? 0,
        active_products_count: activeProductsCountRes.count ?? 0,
        categorized_products_count: categorizedProductsCountRes.count ?? 0,
      },
      // Informational only — intentionally NOT part of `checklist`/`score` so it never changes the
      // existing readiness percentage or blocks a merchant that is already active (see Phase G:
      // rollout must not cause an unexpected mass outage for already-active merchants).
      commercial_agreement_configured: commercialAgreementConfigured,
    };
  }

  constructor(
    private readonly supabaseAdmin: SupabaseAdminService,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  private isSettingsPlatformRole(role?: string): boolean {
    return role === "super_admin" || role === "admin";
  }

  private isSettingsMerchantReadRole(role?: string): boolean {
    const normalized = (role ?? "").trim().toLowerCase();
    return (
      normalized === "merchant_owner" ||
      normalized === "owner" ||
      normalized === "merchant_manager" ||
      normalized === "manager" ||
      normalized === "merchant_staff" ||
      normalized === "staff"
    );
  }

  private isSettingsMerchantMutateRole(role?: string): boolean {
    const normalized = (role ?? "").trim().toLowerCase();
    return (
      normalized === "merchant_owner" ||
      normalized === "owner" ||
      normalized === "merchant_manager" ||
      normalized === "manager"
    );
  }

  async resolveMerchantSettingsScope(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
    requireMutation = false,
  ): Promise<string> {
    if (!actor?.actor_role || !actor?.actor_id) {
      throw new ForbiddenException("Actor context is required.");
    }

    if (this.isSettingsPlatformRole(actor.actor_role)) {
      const { data: merchant, error } = await this.supabaseAdmin.client
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .maybeSingle();
      if (error) throw error;
      if (!merchant) throw new NotFoundException("Merchant not found.");
      return merchantId;
    }

    if (requireMutation) {
      if (!this.isSettingsMerchantMutateRole(actor.actor_role)) {
        throw new ForbiddenException("Staff is not permitted to mutate store settings.");
      }
    } else {
      if (!this.isSettingsMerchantReadRole(actor.actor_role)) {
        throw new ForbiddenException("Actor is not permitted to view store settings.");
      }
    }

    // Exact membership in merchant_users (no first-store fallback)
    const { data: membership, error: memError } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("role")
      .eq("user_id", actor.actor_id)
      .eq("merchant_id", merchantId)
      .maybeSingle();

    if (memError) throw memError;
    if (!membership) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    if (requireMutation) {
      const normalizedRole = (membership.role ?? "").trim().toLowerCase();
      if (normalizedRole !== "owner" && normalizedRole !== "manager") {
        throw new ForbiddenException("Staff is not permitted to mutate store settings.");
      }
    }

    // Exact merchant status in merchants table must equal 'active'
    const { data: merchant, error: merchError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, status")
      .eq("id", merchantId)
      .maybeSingle();

    if (merchError) throw merchError;
    if (!merchant) throw new NotFoundException("Merchant not found.");
    if (merchant.status !== "active") {
      throw new ForbiddenException("Merchant is not active.");
    }

    return merchantId;
  }

  async getMerchantSettingsExplicit(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
  ): Promise<CanonicalMerchantSettingsResponse> {
    const resolvedMerchantId = await this.resolveMerchantSettingsScope(merchantId, actor, false);

    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("logo_url, merchant_settings(*)")
      .eq("id", resolvedMerchantId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new NotFoundException("Merchant not found.");

    const row = data as { logo_url?: string | null; merchant_settings?: unknown };
    const logoUrl = (typeof row.logo_url === "string" && row.logo_url.trim()) ? row.logo_url : null;
    const rawSettings = normalizeEmbeddedSettings(row.merchant_settings);

    if (!rawSettings) {
      return {
        merchant_id: resolvedMerchantId,
        settings_exists: false,
        settings: null,
      };
    }

    return {
      merchant_id: resolvedMerchantId,
      settings_exists: true,
      settings: {
        contact_phone: (rawSettings.contact_phone as string) ?? null,
        whatsapp_phone: (rawSettings.whatsapp_phone as string) ?? null,
        support_email: (rawSettings.support_email as string) ?? null,
        city: (rawSettings.city as string) ?? null,
        address: (rawSettings.address as string) ?? null,
        delivery_notes: (rawSettings.delivery_notes as string) ?? null,
        logo_url: logoUrl,
        push_enabled: rawSettings.push_enabled !== false,
        sound_enabled: rawSettings.sound_enabled !== false,
        sound_repeat_interval_seconds:
          typeof rawSettings.sound_repeat_interval_seconds === "number"
            ? rawSettings.sound_repeat_interval_seconds
            : 15,
        sound_max_duration_seconds:
          typeof rawSettings.sound_max_duration_seconds === "number"
            ? rawSettings.sound_max_duration_seconds
            : 300,
      },
    };
  }

  async patchMerchantSettingsExplicit(
    merchantId: string,
    payload: PatchMerchantSettingsDto,
    actor?: { actor_role?: string; actor_id?: string },
  ): Promise<CanonicalMerchantSettingsResponse> {
    const resolvedMerchantId = await this.resolveMerchantSettingsScope(merchantId, actor, true);

    const patch = buildMerchantSettingsPatch(payload);
    const { data, error } = await this.supabaseAdmin.client.rpc(MERCHANT_SETTINGS_RPC, {
      p_merchant_id: resolvedMerchantId,
      p_patch: patch,
    });
    if (error) throw error;
    const snapshot = parseMerchantSettingsSnapshot(data);

    const logoUrl = (typeof snapshot.logo_url === "string" && snapshot.logo_url.trim()) ? snapshot.logo_url : null;

    return {
      merchant_id: resolvedMerchantId,
      settings_exists: true,
      settings: {
        contact_phone: (snapshot.contact_phone as string) ?? null,
        whatsapp_phone: (snapshot.whatsapp_phone as string) ?? null,
        support_email: (snapshot.support_email as string) ?? null,
        city: (snapshot.city as string) ?? null,
        address: (snapshot.address as string) ?? null,
        delivery_notes: (snapshot.delivery_notes as string) ?? null,
        logo_url: logoUrl,
        push_enabled: snapshot.push_enabled !== false,
        sound_enabled: snapshot.sound_enabled !== false,
        sound_repeat_interval_seconds:
          typeof snapshot.sound_repeat_interval_seconds === "number"
            ? snapshot.sound_repeat_interval_seconds
            : 15,
        sound_max_duration_seconds:
          typeof snapshot.sound_max_duration_seconds === "number"
            ? snapshot.sound_max_duration_seconds
            : 300,
      },
    };
  }

  async getMerchantSettings(merchantId: string, actor?: { actor_role?: string; actor_id?: string }) {
    if (actor?.actor_role && !this.isSettingsPlatformRole(actor.actor_role)) {
      throw new ForbiddenException("Legacy settings endpoint is restricted to platform administrators.");
    }
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, actor?.actor_role, actor?.actor_id);
    if (!resolvedMerchantId) throw new ForbiddenException("Merchant id is required.");
    // ONE statement, ONE snapshot. The previous Promise.all issued two independent reads, so a
    // settings write committing between them could return old settings beside a newer logo (or the
    // reverse). merchant_settings.merchant_id is both the primary key and a foreign key to
    // merchants.id, so PostgREST embeds it as a to-one relation: at most one row per merchant.
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("logo_url, merchant_settings(*)")
      .eq("id", resolvedMerchantId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const row = data as { logo_url?: string | null; merchant_settings?: unknown };
    const logoUrl = row.logo_url ?? null;
    const settings = normalizeEmbeddedSettings(row.merchant_settings);
    // Unchanged response contract: no settings row means the logo alone (when it is non-empty),
    // otherwise null.
    if (!settings) return logoUrl ? { logo_url: logoUrl } : null;
    return { ...settings, logo_url: logoUrl };
  }

  async upsertMerchantSettings(payload: UpsertMerchantSettingsDto, actor?: { actor_role?: string; actor_id?: string }) {
    if (actor?.actor_role && !this.isSettingsPlatformRole(actor.actor_role)) {
      throw new ForbiddenException("Legacy settings endpoint is restricted to platform administrators.");
    }
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(payload.merchant_id, actor?.actor_role, actor?.actor_id);
    if (!resolvedMerchantId) throw new ForbiddenException("Merchant id is required.");
    // ONE transaction. The settings write and the logo write used to be two statements: the first
    // committed on its own, so a failure in the second returned an error to a caller whose settings
    // had already been saved — a torn write. The RPC performs both inside one transaction and
    // returns the post-write snapshot from that same transaction, so no follow-up read is needed.
    const patch = buildMerchantSettingsPatch(payload);
    const { data, error } = await this.supabaseAdmin.client.rpc(MERCHANT_SETTINGS_RPC, {
      p_merchant_id: resolvedMerchantId,
      p_patch: patch,
    });
    if (error) throw error;
    return parseMerchantSettingsSnapshot(data);
  }

  async getActiveMerchants() {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id, display_name, status")
      .eq("status", "active")
      .order("display_name", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getAllMerchants() {
    const { data, error } = await this.supabaseAdmin.client.from("merchants").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async getMerchantById(id: string) {
    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) return null;

    // Resolve owner membership: role = owner, earliest first
    const { data: ownerUser, error: ownerUserError } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("user_id")
      .eq("merchant_id", id)
      .eq("role", "owner")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (ownerUserError) throw ownerUserError;

    let profile: any = null;
    if (ownerUser?.user_id) {
      const { data: profileData, error: profileError } = await this.supabaseAdmin.client
        .from("profiles")
        .select("email, full_name, phone")
        .eq("id", ownerUser.user_id)
        .maybeSingle();
      if (profileError) throw profileError;
      profile = profileData;
    }

    const { data: settings, error: settingsError } = await this.supabaseAdmin.client
      .from("merchant_settings")
      .select("city, address, contact_phone, whatsapp_phone, support_email")
      .eq("merchant_id", id)
      .maybeSingle();
    if (settingsError) throw settingsError;

    return {
      ...merchant,
      registration_details: {
        applicant_user_id: ownerUser?.user_id ?? null,
        email: profile?.email ?? null,
        owner_full_name: profile?.full_name ?? null,
        owner_phone: profile?.phone ?? null,
        store_name_ar: merchant.name_ar ?? null,
        store_name_en: merchant.name_en ?? null,
        display_name: merchant.display_name ?? null,
        slug: merchant.slug ?? null,
        business_type: merchant.business_type ?? null,
        description: merchant.description ?? null,
        city: settings?.city ?? null,
        address: settings?.address ?? null,
        contact_phone: settings?.contact_phone ?? null,
        whatsapp_phone: settings?.whatsapp_phone ?? null,
        support_email: settings?.support_email ?? null,
        submitted_at: merchant.submitted_at ?? null,
        status: merchant.status ?? null,
      },
    };
  }

  async createMerchant(payload: CreateMerchantDto) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .insert({ ...payload, status: "draft" } as any)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Generic merchant profile update. Deliberately never touches `status` — even if a caller's
   * payload happens to carry one — so the activation readiness/agreement guard in
   * `updateMerchantStatus` can never be bypassed through this route. Status transitions have
   * exactly ONE authoritative path: `updateMerchantStatus` below.
   */
  async updateMerchant(id: string, payload: UpdateMerchantDto) {
    const { error } = await this.supabaseAdmin.client
      .from("merchants")
      .update({ display_name: payload.display_name, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  }

  async updateMerchantStatus(id: string, payload: UpdateMerchantStatusDto) {
    let expectedPriorStatus: string | null = null;
    if (payload.status === "active") {
      const { data: existingMerchant, error: existingError } = await this.supabaseAdmin.client
        .from("merchants")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      if (existingError) throw existingError;
      const currentStatus = (existingMerchant as { status?: string } | null)?.status ?? null;
      expectedPriorStatus = currentStatus;
      const wasAlreadyActive = currentStatus === "active";

      const readiness = await this.computeReadinessByMerchantId(id);
      const blocking = readiness.checklist.filter((item) => item.key !== "merchant_is_active" && !item.passed);
      if (blocking.length > 0) {
        throw new ForbiddenException({
          message: "Merchant is not ready for activation yet.",
          code: "MERCHANT_NOT_READY",
          missing_checks: blocking.map((item) => ({ key: item.key, label: item.label })),
        });
      }

      // Activation guard (new activations only): a merchant transitioning into 'active' for the
      // first time — or being re-activated after a non-active status — must have an explicit
      // negotiated commercial agreement, so it never silently sells under the fallback
      // plan/global commission rate. Already-active merchants are intentionally NOT re-checked or
      // deactivated here — see Phase G: no unexpected mass outage for existing Production merchants.
      if (!wasAlreadyActive && !readiness.commercial_agreement_configured) {
        throw new ForbiddenException({
          message: "Merchant has no explicit commercial agreement. Configure one before activating.",
          code: "COMMERCIAL_AGREEMENT_REQUIRED",
        });
      }
    }

    // Guard the read-then-write gap: re-affirm the status we validated against is still the row's
    // status at write time. If another request changed it in between (e.g. two concurrent
    // activation attempts, or a suspend racing an activation), this update matches zero rows and
    // we surface that clearly instead of silently activating a merchant whose state moved under us.
    let updateQuery = this.supabaseAdmin.client.from("merchants").update({ status: payload.status }).eq("id", id);
    if (expectedPriorStatus !== null) {
      updateQuery = updateQuery.eq("status", expectedPriorStatus);
    }
    const { data: updatedRows, error } = await updateQuery.select("id");
    if (error) throw error;
    if (payload.status === "active" && (updatedRows ?? []).length === 0) {
      throw new ForbiddenException({
        message: "Merchant status changed concurrently. Re-check and retry.",
        code: "MERCHANT_STATUS_CONFLICT",
      });
    }
    return { ok: true };
  }

  async assignMerchantOwner(id: string, payload: AssignMerchantOwnerDto) {
    const { error: membershipError } = await this.supabaseAdmin.client.from("merchant_users").upsert({
      merchant_id: id,
      user_id: payload.user_id,
      role: "owner",
    } as any);
    if (membershipError) throw membershipError;

    const { error: roleError } = await this.supabaseAdmin.client
      .from("profiles")
      .update({ role: "merchant_owner" } as any)
      .eq("id", payload.user_id);
    if (roleError) throw roleError;

    return { ok: true };
  }

  async getStorefrontDefaultMerchant(defaultSlug?: string) {
    if (defaultSlug) {
      const { data: configured, error: configuredError } = await this.supabaseAdmin.client
        .from("merchants")
        .select("*")
        .eq("slug", defaultSlug)
        .eq("status", "active")
        .maybeSingle();
      if (configuredError) throw configuredError;
      if (configured) return configured;
    }

    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("*")
      .eq("status", "active")
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getActiveMerchantBySlug(slug: string) {
    const { data, error } = await this.supabaseAdmin.client
      .from("merchants")
      .select("*")
      .eq("slug", slug)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getMerchantDashboardStats(merchantId: string, actor?: { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, actor?.actor_role, actor?.actor_id);
    if (!resolvedMerchantId) throw new ForbiddenException("Merchant id is required.");
    const [productsRes, ordersRes] = await Promise.all([
      this.supabaseAdmin.client.from("products").select("id", { count: "exact", head: true }).eq("merchant_id", resolvedMerchantId),
      this.supabaseAdmin.client.from("orders").select("id,total,status", { count: "exact" }).eq("merchant_id", resolvedMerchantId),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (ordersRes.error) throw ordersRes.error;

    const orderRows = ordersRes.data ?? [];
    const deliveredRevenue = orderRows
      .filter((o: any) => o.status === "delivered")
      .reduce((sum: number, o: any) => sum + Number(o.total ?? 0), 0);

    return {
      productsCount: productsRes.count ?? 0,
      ordersCount: ordersRes.count ?? 0,
      deliveredRevenue,
    };
  }

  async getMyMerchantDashboard(actor?: { actor_role?: string; actor_id?: string }, requestedMerchantId?: string) {
    if (!requestedMerchantId) {
      throw new ForbiddenException("Merchant id is required.");
    }
    const merchantId = await this.scopeResolver.resolveMerchantScope(requestedMerchantId, actor?.actor_role, actor?.actor_id);
    if (!merchantId) throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    const merchantStatusRes = await this.supabaseAdmin.client.from("merchants").select("status").eq("id", merchantId).maybeSingle();
    if (merchantStatusRes.error) throw merchantStatusRes.error;
    if (String((merchantStatusRes.data as any)?.status ?? "") !== "active") {
      throw new ForbiddenException("Merchant is pending approval or not active.");
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [productsRes, ordersTodayRes, orders7dRes, topProductsRes, lowStockRes, recentOrdersRes, thresholdRes] = await Promise.all([
      this.supabaseAdmin.client
        .from("products")
        .select("id,is_active,stock,low_stock_threshold")
        .eq("merchant_id", merchantId),
      this.supabaseAdmin.client
        .from("orders")
        .select("id")
        .eq("merchant_id", merchantId)
        .gte("created_at", todayStart),
      this.supabaseAdmin.client
        .from("orders")
        .select("id,total,status")
        .eq("merchant_id", merchantId)
        .gte("created_at", sevenDaysAgo),
      this.supabaseAdmin.client
        .from("order_items")
        .select("product_id,product_name,quantity,price,orders!inner(merchant_id,status)")
        .eq("orders.merchant_id", merchantId)
        .in("orders.status", ["delivered", "shipped", "preparing", "contacted"])
        .gte("created_at", sevenDaysAgo),
      this.supabaseAdmin.client
        .from("products")
        .select("id,name,stock,low_stock_threshold")
        .eq("merchant_id", merchantId)
        .order("stock", { ascending: true })
        .limit(30),
      this.supabaseAdmin.client
        .from("orders")
        .select("id,order_number,status,total,created_at")
        .eq("merchant_id", merchantId)
        .order("created_at", { ascending: false })
        .limit(8),
      this.supabaseAdmin.client
        .from("merchant_settings")
        .select("default_low_stock_threshold")
        .eq("merchant_id", merchantId)
        .maybeSingle(),
    ]);

    if (productsRes.error) throw productsRes.error;
    if (ordersTodayRes.error) throw ordersTodayRes.error;
    if (orders7dRes.error) throw orders7dRes.error;
    if (topProductsRes.error) throw topProductsRes.error;
    if (lowStockRes.error) throw lowStockRes.error;
    if (recentOrdersRes.error) throw recentOrdersRes.error;
    if (thresholdRes.error) throw thresholdRes.error;

    const defaultThreshold = Number((thresholdRes.data as any)?.default_low_stock_threshold ?? 5);
    const products = productsRes.data ?? [];
    const orders7d = orders7dRes.data ?? [];
    const completed7d = orders7d.filter((o: any) => o.status === "delivered");
    const revenue7d = completed7d.reduce((sum: number, o: any) => sum + Number(o.total ?? 0), 0);
    const avgOrder = completed7d.length > 0 ? revenue7d / completed7d.length : 0;

    const topMap = new Map<string, { product_id: string; name: string; units_sold: number; revenue: number }>();
    for (const row of topProductsRes.data ?? []) {
      const id = String((row as any).product_id ?? "");
      if (!id) continue;
      const current = topMap.get(id) ?? {
        product_id: id,
        name: String((row as any).product_name ?? "منتج"),
        units_sold: 0,
        revenue: 0,
      };
      current.units_sold += Number((row as any).quantity ?? 0);
      current.revenue += Number((row as any).price ?? 0) * Number((row as any).quantity ?? 0);
      topMap.set(id, current);
    }
    const topProducts = Array.from(topMap.values())
      .sort((a, b) => b.units_sold - a.units_sold)
      .slice(0, 5);

    const lowStockProducts = (lowStockRes.data ?? [])
      .map((p: any) => ({
        product_id: p.id,
        name: p.name,
        stock: Number(p.stock ?? 0),
        threshold: Number(p.low_stock_threshold ?? defaultThreshold),
      }))
      .filter((p: any) => p.stock <= p.threshold)
      .slice(0, 8);

    return {
      merchant_id: merchantId,
      products: {
        total: products.length,
        active: products.filter((p: any) => !!p.is_active).length,
        inactive: products.filter((p: any) => !p.is_active).length,
        low_stock: products.filter((p: any) => Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? defaultThreshold)).length,
      },
      orders: {
        today: (ordersTodayRes.data ?? []).length,
        completed_7d: completed7d.length,
        average_order_value_7d: Number(avgOrder.toFixed(2)),
        revenue_7d: revenue7d,
      },
      top_products: topProducts,
      low_stock_products: lowStockProducts,
      recent_orders: (recentOrdersRes.data ?? []).map((o: any) => ({
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        total: Number(o.total ?? 0),
        created_at: o.created_at,
      })),
    };
  }

  async getMerchantReadiness(merchantId: string, actor?: { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, actor?.actor_role, actor?.actor_id);
    if (!resolvedMerchantId) throw new ForbiddenException("Merchant id is required.");
    return this.computeReadinessByMerchantId(resolvedMerchantId);
  }

  async getMerchantPerformanceScorecard(merchantId: string, actor?: { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.scopeResolver.resolveMerchantScope(merchantId, actor?.actor_role, actor?.actor_id);
    if (!resolvedMerchantId) throw new ForbiddenException("Merchant id is required.");

    const [readiness, productsRes, ordersRes] = await Promise.all([
      this.computeReadinessByMerchantId(resolvedMerchantId),
      this.supabaseAdmin.client
        .from("products")
        .select("id,is_active,stock,low_stock_threshold,name,description,images,category_id,price,discount_price")
        .eq("merchant_id", resolvedMerchantId),
      this.supabaseAdmin.client.from("orders").select("id,status,created_at,total").eq("merchant_id", resolvedMerchantId),
    ]);
    if (productsRes.error) throw productsRes.error;
    if (ordersRes.error) throw ordersRes.error;

    const products = productsRes.data ?? [];
    const orders = ordersRes.data ?? [];
    const totalProducts = products.length;

    const readyProducts = products.filter((p: any) => {
      const hasImage = Array.isArray(p.images) && p.images.length > 0;
      const discountValid = p.discount_price == null || (Number(p.discount_price) > 0 && Number(p.discount_price) < Number(p.price ?? 0));
      return (
        Boolean(String(p.name ?? "").trim()) &&
        Boolean(String(p.description ?? "").trim()) &&
        Boolean(p.category_id) &&
        Number(p.price ?? 0) > 0 &&
        hasImage &&
        Number(p.stock ?? 0) >= 0 &&
        discountValid &&
        Boolean(p.is_active)
      );
    }).length;

    const lowStockProducts = products.filter((p: any) => Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 5)).length;
    const activeProducts = products.filter((p: any) => p.is_active).length;

    const totalPendingOrders = orders.filter((o: any) => o.status === "new" || o.status === "contacted" || o.status === "preparing").length;
    const delayedPendingOrders = orders.filter((o: any) => {
      const pending = o.status === "new" || o.status === "contacted" || o.status === "preparing";
      if (!pending || !o.created_at) return false;
      return Date.now() - new Date(o.created_at).getTime() > 24 * 60 * 60 * 1000;
    }).length;

    const deliveredOrders = orders.filter((o: any) => o.status === "delivered");
    const deliveredRevenue = deliveredOrders.reduce((sum: number, o: any) => sum + Number(o.total ?? 0), 0);

    const productReadinessCoverage = totalProducts > 0 ? Math.round((readyProducts / totalProducts) * 100) : 0;
    const activeCatalogRatio = totalProducts > 0 ? Math.round((activeProducts / totalProducts) * 100) : 0;
    const lowStockRatio = totalProducts > 0 ? Math.round((lowStockProducts / totalProducts) * 100) : 0;
    const delayedOrderRatio = totalPendingOrders > 0 ? Math.round((delayedPendingOrders / totalPendingOrders) * 100) : 0;
    const avgOrderValue = deliveredOrders.length > 0 ? Math.round(deliveredRevenue / deliveredOrders.length) : 0;

    const score = Math.round(
      readiness.score * 0.35 +
        productReadinessCoverage * 0.25 +
        activeCatalogRatio * 0.15 +
        Math.max(0, 100 - lowStockRatio) * 0.1 +
        Math.max(0, 100 - delayedOrderRatio) * 0.15,
    );

    return {
      merchant_id: resolvedMerchantId,
      score,
      trend: "stable",
      kpis: {
        store_readiness_score: readiness.score,
        product_readiness_coverage: productReadinessCoverage,
        active_catalog_ratio: activeCatalogRatio,
        low_stock_ratio: lowStockRatio,
        delayed_order_ratio: delayedOrderRatio,
        delivered_revenue: deliveredRevenue,
        avg_order_value: avgOrderValue,
      },
      totals: {
        total_products: totalProducts,
        total_orders: orders.length,
        delayed_pending_orders: delayedPendingOrders,
      },
    };
  }

  private isMerchantFinanceRole(role?: string) {
    return role === "merchant_owner" || role === "merchant_manager" || role === "merchant_staff";
  }

  private isPlatformFinanceRole(role?: string) {
    return role === "super_admin" || role === "admin";
  }

  private async resolveMerchantFinanceReadScope(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
  ): Promise<string> {
    if (!merchantId || typeof merchantId !== "string" || !merchantId.trim()) {
      throw new ForbiddenException("Merchant id is required.");
    }
    if (!actor?.actor_role || !actor?.actor_id) {
      throw new ForbiddenException("Actor identity and role are required.");
    }

    if (this.isPlatformFinanceRole(actor.actor_role)) {
      const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .maybeSingle();
      if (merchantError) throw merchantError;
      if (!merchant?.id) {
        throw new NotFoundException("Merchant not found.");
      }
      return merchantId;
    }

    if (!this.isMerchantFinanceRole(actor.actor_role)) {
      throw new ForbiddenException("Finance read access is not permitted for this role.");
    }

    // Exact membership in merchant_users for target merchantId (no first membership fallback)
    const { data: membership, error: membershipError } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id")
      .eq("user_id", actor.actor_id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership?.merchant_id) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    // Exact merchant status in merchants table must equal 'active'
    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("status")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant || merchant.status !== "active") {
      throw new ForbiddenException("Merchant is not active.");
    }

    return merchantId;
  }

  async getMerchantFinanceSummary(merchantId: string, actor?: { actor_role?: string; actor_id?: string }) {
    const resolvedMerchantId = await this.resolveMerchantFinanceReadScope(merchantId, actor);

    const { data: ledgerRows, error: ledgerError } = await this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .select("status,direction,amount,created_at")
      .eq("merchant_id", resolvedMerchantId);
    if (ledgerError) throw ledgerError;

    const rows = ledgerRows ?? [];
    const sumBy = (status: string) =>
      rows
        .filter((r: any) => r.status === status)
        .reduce((sum: number, r: any) => sum + (r.direction === "credit" ? 1 : -1) * Number(r.amount ?? 0), 0);

    const totalAccrued = sumBy("accrued");
    const totalPayable = sumBy("payable");
    const totalInPayout = sumBy("in_payout");
    const totalSettled = sumBy("settled");
    const outstandingBalance = totalAccrued + totalPayable + totalInPayout;

    const { data: lastPayout, error: payoutError } = await this.supabaseAdmin.client
      .from("merchant_payout_batches")
      .select("net_amount,settled_at")
      .eq("merchant_id", resolvedMerchantId)
      .eq("status", "settled")
      .order("settled_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (payoutError) throw payoutError;

    return {
      merchant_id: resolvedMerchantId,
      total_accrued: totalAccrued,
      total_payable: totalPayable,
      total_in_payout: totalInPayout,
      total_settled: totalSettled,
      outstanding_balance: outstandingBalance,
      last_payout_amount: Number((lastPayout as any)?.net_amount ?? 0),
      last_payout_date: (lastPayout as any)?.settled_at ?? null,
      currency_code: "IQD",
    };
  }

  async listMerchantStatementEntries(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
    params?: MerchantFinanceStatementQueryDto,
  ) {
    const resolvedMerchantId = await this.resolveMerchantFinanceReadScope(merchantId, actor);

    const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);
    const offset = Math.max(params?.offset ?? 0, 0);

    let req = this.supabaseAdmin.client
      .from("merchant_ledger_entries")
      .select("id,order_id,entry_type,direction,amount,status,created_at,effective_at,settled_at,description,payout_batch_id", { count: "exact" })
      .eq("merchant_id", resolvedMerchantId)
      .order("effective_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (params?.status) req = req.eq("status", params.status);
    if (params?.from) req = req.gte("effective_at", params.from);
    if (params?.to) req = req.lte("effective_at", params.to);
    const { data, error, count } = await req;
    if (error) throw error;
    return {
      merchant_id: resolvedMerchantId,
      entries: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    };
  }

  async listMerchantPayoutHistory(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
    params?: MerchantPayoutHistoryQueryDto,
  ) {
    const resolvedMerchantId = await this.resolveMerchantFinanceReadScope(merchantId, actor);

    const limit = Math.min(Math.max(params?.limit ?? 20, 1), 100);
    const offset = Math.max(params?.offset ?? 0, 0);

    let req = this.supabaseAdmin.client
      .from("merchant_payout_batches")
      .select("id,status,period_start,period_end,total_credits,total_debits,net_amount,currency_code,created_at,approved_at,settled_at,locked_at", {
        count: "exact",
      })
      .eq("merchant_id", resolvedMerchantId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (params?.status) req = req.eq("status", params.status);
    if (params?.from) req = req.gte("created_at", params.from);
    if (params?.to) req = req.lte("created_at", params.to);
    const { data, error, count } = await req;
    if (error) throw error;
    return {
      merchant_id: resolvedMerchantId,
      payouts: data ?? [],
      total: count ?? 0,
      limit,
      offset,
    };
  }


  /**
   * M4.8 — platform-wide readiness summaries for executive governance (admin only).
   *
   * ONE set-based RPC (`admin_merchant_readiness_summary`, migration 20260820140000) instead of
   * the previous per-merchant loop: listing merchants and then calling
   * `computeReadinessByMerchantId()` for each cost 1 + 6N Supabase operations (~133 at 22
   * merchants) and grew linearly with the merchant count. The checklist, per-merchant score,
   * distribution buckets and the average-of-rounded-scores are computed with identical semantics
   * in SQL, so the returned contract is unchanged.
   *
   * `computeReadinessByMerchantId()` is deliberately untouched — it still serves the
   * single-merchant readiness endpoint, the activation guard and the performance scorecard,
   * including their commercial-agreement behaviour. This platform summary never used that field.
   *
   * Reliability: the old loop swallowed a per-merchant failure and silently dropped that merchant
   * from the platform totals. A database failure now propagates instead of returning a
   * quietly-incomplete summary.
   */
  async getPlatformMerchantReadinessSummariesForAdmin(): Promise<PlatformMerchantReadinessSummary> {
    const { data, error } = await this.supabaseAdmin.client.rpc(READINESS_SUMMARY_RPC);
    if (error) throw error;

    if (data === null || data === undefined) {
      throw new Error(READINESS_SUMMARY_RPC + " returned no payload.");
    }
    // Validated, never defaulted: a partial payload must surface as an error rather than as an
    // empty — and therefore healthy-looking — platform summary.
    return parsePlatformMerchantReadinessSummary(data);
  }

  async updateMerchantRegistrationDetails(id: string, payload: UpdateMerchantRegistrationDetailsDto) {
    // 1. Confirm the merchant exists
    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant) {
      throw new NotFoundException("Merchant not found.");
    }

    // Helper to trim and convert blank to null for nullable fields
    const trimAndNullify = (val?: string | null): string | null => {
      if (val === undefined) return undefined as any;
      if (val === null) return null;
      const trimmed = val.trim();
      return trimmed === "" ? null : trimmed;
    };

    const trimRequired = (val?: string, fieldName?: string): string => {
      if (val === undefined) return undefined as any;
      const trimmed = val.trim();
      if (!trimmed) {
        throw new BadRequestException(`${fieldName} is required and cannot be empty.`);
      }
      return trimmed;
    };

    // 2. Validate owner membership and profile if owner update payload is supplied
    let ownerUserId: string | null = null;
    if (payload.owner) {
      const { data: ownerUser, error: ownerUserError } = await this.supabaseAdmin.client
        .from("merchant_users")
        .select("user_id")
        .eq("merchant_id", id)
        .eq("role", "owner")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (ownerUserError) throw ownerUserError;

      if (!ownerUser?.user_id) {
        throw new BadRequestException("No owner membership exists for this merchant.");
      }

      const { data: profile, error: profileError } = await this.supabaseAdmin.client
        .from("profiles")
        .select("id")
        .eq("id", ownerUser.user_id)
        .maybeSingle();
      if (profileError) throw profileError;

      if (!profile) {
        throw new BadRequestException("Owner profile not found.");
      }

      ownerUserId = ownerUser.user_id;
    }

    // 3. Update merchant fields
    if (payload.merchant) {
      const merchantUpdates: any = {};
      if (payload.merchant.name_ar !== undefined) {
        merchantUpdates.name_ar = trimRequired(payload.merchant.name_ar, "name_ar");
      }
      if (payload.merchant.name_en !== undefined) {
        merchantUpdates.name_en = trimRequired(payload.merchant.name_en, "name_en");
      }
      if (payload.merchant.display_name !== undefined) {
        merchantUpdates.display_name = trimRequired(payload.merchant.display_name, "display_name");
      }
      if (payload.merchant.description !== undefined) {
        merchantUpdates.description = trimAndNullify(payload.merchant.description);
      }
      if (payload.merchant.business_type !== undefined) {
        merchantUpdates.business_type = trimAndNullify(payload.merchant.business_type);
      }

      if (Object.keys(merchantUpdates).length > 0) {
        const { error: updateError } = await this.supabaseAdmin.client
          .from("merchants")
          .update({
            ...merchantUpdates,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) throw updateError;
      }
    }

    // 4. Update settings fields (upsert using merchant_id)
    if (payload.settings) {
      const settingsUpdates: any = {};
      if (payload.settings.city !== undefined) settingsUpdates.city = trimAndNullify(payload.settings.city);
      if (payload.settings.address !== undefined) settingsUpdates.address = trimAndNullify(payload.settings.address);
      if (payload.settings.contact_phone !== undefined) settingsUpdates.contact_phone = trimAndNullify(payload.settings.contact_phone);
      if (payload.settings.whatsapp_phone !== undefined) settingsUpdates.whatsapp_phone = trimAndNullify(payload.settings.whatsapp_phone);
      if (payload.settings.support_email !== undefined) settingsUpdates.support_email = trimAndNullify(payload.settings.support_email);

      if (Object.keys(settingsUpdates).length > 0) {
        const { error: settingsError } = await this.supabaseAdmin.client
          .from("merchant_settings")
          .upsert({
            ...settingsUpdates,
            merchant_id: id,
            updated_at: new Date().toISOString(),
          } as any);
        if (settingsError) throw settingsError;
      }
    }

    // 5. Update owner profile
    if (payload.owner && ownerUserId) {
      const profileUpdates: any = {};
      if (payload.owner.full_name !== undefined) {
        profileUpdates.full_name = trimAndNullify(payload.owner.full_name);
      }
      if (payload.owner.phone !== undefined) {
        profileUpdates.phone = trimAndNullify(payload.owner.phone);
      }

      if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await this.supabaseAdmin.client
          .from("profiles")
          .update(profileUpdates)
          .eq("id", ownerUserId);
        if (profileError) throw profileError;
      }
    }

    // 6. Return refreshed getMerchantById result
    return this.getMerchantById(id);
  }

  private isMerchantRole(role?: string): boolean {
    return this.isMerchantCustomerRole(role);
  }

  private isMerchantCustomerRole(role?: string): boolean {
    if (!role || typeof role !== "string") return false;
    const normalized = role.trim().toLowerCase();
    return (
      normalized === "owner" ||
      normalized === "merchant_owner" ||
      normalized === "manager" ||
      normalized === "merchant_manager" ||
      normalized === "staff" ||
      normalized === "merchant_staff"
    );
  }

  private isPlatformCustomerRole(role?: string): boolean {
    if (!role || typeof role !== "string") return false;
    const normalized = role.trim().toLowerCase();
    return normalized === "super_admin" || normalized === "admin";
  }

  private async resolveMerchantCustomerReadScope(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
  ): Promise<string> {
    if (!merchantId || typeof merchantId !== "string" || !merchantId.trim()) {
      throw new ForbiddenException("Merchant id is required.");
    }
    if (!actor?.actor_role || !actor?.actor_id || typeof actor.actor_id !== "string" || !actor.actor_id.trim()) {
      throw new ForbiddenException("Actor identity and role are required.");
    }

    if (this.isPlatformCustomerRole(actor.actor_role)) {
      const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .maybeSingle();
      if (merchantError) throw merchantError;
      if (!merchant?.id) {
        throw new NotFoundException("Merchant not found.");
      }
      return merchantId;
    }

    if (!this.isMerchantCustomerRole(actor.actor_role)) {
      throw new ForbiddenException("Customer read access is not permitted for this role.");
    }

    // Exact membership in merchant_users for target merchantId (no first membership fallback)
    const { data: membership, error: membershipError } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id")
      .eq("user_id", actor.actor_id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership?.merchant_id) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    // Exact merchant status in merchants table must equal 'active'
    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("status")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant || merchant.status !== "active") {
      throw new ForbiddenException("Merchant is not active.");
    }

    return merchantId;
  }

  async listMerchantCustomers(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
    query?: ListMerchantCustomersQueryDto,
  ) {
    const resolvedMerchantId = await this.resolveMerchantCustomerReadScope(merchantId, actor);

    const rpcLimit = Math.min(Math.max(1, Math.floor(Number(query?.limit ?? 50))), 100);
    const rpcPage = Math.max(1, Math.floor(Number(query?.page ?? 1)));
    const rpcOffset = (rpcPage - 1) * rpcLimit;
    const sanitizedSearch = sanitizeSearchTerm(query?.search) || null;

    const { data, error } = await this.supabaseAdmin.client.rpc("merchant_customer_summary", {
      p_merchant_id: resolvedMerchantId,
      p_search: sanitizedSearch,
      p_limit: rpcLimit,
      p_offset: rpcOffset,
    });
    if (error) throw error;

    // Strict structural validation: do not tolerate malformed or missing RPC payload
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new ServiceUnavailableException("Malformed customer summary payload received from database.");
    }

    const raw = data as Record<string, unknown>;

    if (!Array.isArray(raw.items)) {
      throw new ServiceUnavailableException("Malformed customer summary items received from database.");
    }

    const total = Number(raw.total);
    if (!Number.isInteger(total) || total < 0) {
      throw new ServiceUnavailableException("Malformed customer summary total received from database.");
    }

    const limit = Number(raw.limit);
    if (!Number.isInteger(limit) || limit < 0) {
      throw new ServiceUnavailableException("Malformed customer summary limit received from database.");
    }

    const offset = Number(raw.offset);
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ServiceUnavailableException("Malformed customer summary offset received from database.");
    }

    if (typeof raw.has_more !== "boolean") {
      throw new ServiceUnavailableException("Malformed customer summary pagination state received from database.");
    }

    const MASKED_PHONE_REGEX = /^\*{4}\d{4}$/;
    const MASKED_CUSTOMER_REF_REGEX = /^عميل #[A-F0-9]{4}$/;

    const validatedItems = raw.items.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        throw new ServiceUnavailableException(`Malformed customer item at index ${index}.`);
      }
      const it = item as Record<string, unknown>;

      if (typeof it.customer_ref !== "string" || !MASKED_CUSTOMER_REF_REGEX.test(it.customer_ref)) {
        throw new ServiceUnavailableException(`Invalid customer_ref at index ${index}.`);
      }

      if (typeof it.phone_masked !== "string" || !MASKED_PHONE_REGEX.test(it.phone_masked)) {
        throw new ServiceUnavailableException(`Invalid phone_masked at index ${index}.`);
      }

      const orders = Number(it.orders);
      if (!Number.isInteger(orders) || orders < 0) {
        throw new ServiceUnavailableException(`Invalid orders count at index ${index}.`);
      }

      const spent = Number(it.spent);
      if (typeof spent !== "number" || !Number.isFinite(spent) || spent < 0) {
        throw new ServiceUnavailableException(`Invalid spent amount at index ${index}.`);
      }

      if (typeof it.last_order_at !== "string" || isNaN(Date.parse(it.last_order_at))) {
        throw new ServiceUnavailableException(`Invalid last_order_at timestamp at index ${index}.`);
      }

      // Explicit whitelist of 5 fields only; any extraneous keys (e.g. full_name, email, phone) are dropped
      return {
        customer_ref: it.customer_ref,
        phone_masked: it.phone_masked,
        orders,
        spent,
        last_order_at: it.last_order_at,
      };
    });

    return {
      merchant_id: resolvedMerchantId,
      items: validatedItems,
      page: rpcPage,
      limit: rpcLimit,
      total,
      hasMore: raw.has_more,
    };
  }

  async listMerchantOrders(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
    query?: ListMerchantOrdersQueryDto,
  ) {
    const resolvedMerchantId = await this.resolveMerchantOrdersReadScope(merchantId, actor);

    const limit = Math.min(Math.max(1, Math.floor(Number(query?.limit ?? 50))), 100);
    const offset = query?.offset !== undefined && query.offset !== null
      ? Math.max(0, Math.floor(Number(query.offset)))
      : (Math.max(1, Math.floor(Number(query?.page ?? 1))) - 1) * limit;

    let req = this.supabaseAdmin.client
      .from("orders")
      .select(
        "id, order_number, merchant_id, status, channel, created_at, updated_at, subtotal, discount, delivery_cost, total, payment_method, merchant_notes, merchant_decision_status, governorates(name)",
        { count: "exact" },
      )
      .eq("merchant_id", resolvedMerchantId)
      .order("created_at", { ascending: false });

    if (query?.status && query.status !== "all") {
      req = req.eq("status", query.status);
    }
    if (query?.merchant_decision_status && query.merchant_decision_status !== "all") {
      req = req.eq("merchant_decision_status", query.merchant_decision_status);
    }
    if (query?.date_from) {
      req = req.gte("created_at", query.date_from);
    }
    if (query?.date_to) {
      req = req.lte("created_at", query.date_to);
    }

    const sanitizedSearch = sanitizeSearchTerm(query?.search);
    if (sanitizedSearch) {
      req = req.or(buildSafeOrFilter(sanitizedSearch, ["order_number"]));
    }

    req = req.range(offset, offset + limit - 1);
    const { data, error, count } = await req;
    if (error) throw error;

    const total = count ?? 0;

    // Guaranteed safe projection without ANY customer phone, street address, or PII
    const sanitizedOrders = (data ?? []).map((row: any) => ({
      id: String(row.id),
      order_number: String(row.order_number),
      merchant_id: String(row.merchant_id),
      status: String(row.status),
      channel: row.channel ? String(row.channel) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      subtotal: Number(row.subtotal ?? 0),
      discount: Number(row.discount ?? 0),
      delivery_cost: Number(row.delivery_cost ?? 0),
      total: Number(row.total ?? 0),
      payment_method: row.payment_method ? String(row.payment_method) : null,
      merchant_notes: row.merchant_notes ? String(row.merchant_notes) : null,
      merchant_decision_status: row.merchant_decision_status ? String(row.merchant_decision_status) : null,
      governorate: row.governorates?.name ? String(row.governorates.name) : null,
    }));

    return {
      merchant_id: resolvedMerchantId,
      orders: sanitizedOrders,
      total,
      limit,
      offset,
      items: sanitizedOrders,
      page: Math.floor(offset / limit) + 1,
      hasMore: offset + limit < total,
    };
  }

  private async resolveMerchantOrdersReadScope(
    merchantId: string,
    actor?: { actor_role?: string; actor_id?: string },
  ): Promise<string> {
    if (!merchantId || typeof merchantId !== "string" || !merchantId.trim()) {
      throw new ForbiddenException("Merchant id is required.");
    }
    if (!actor?.actor_role || !actor?.actor_id || typeof actor.actor_id !== "string" || !actor.actor_id.trim()) {
      throw new ForbiddenException("Actor identity and role are required.");
    }

    if (this.isPlatformCustomerRole(actor.actor_role)) {
      const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
        .from("merchants")
        .select("id")
        .eq("id", merchantId)
        .maybeSingle();
      if (merchantError) throw merchantError;
      if (!merchant?.id) {
        throw new NotFoundException("Merchant not found.");
      }
      return merchantId;
    }

    if (!this.isMerchantRole(actor.actor_role)) {
      throw new ForbiddenException("Orders read access is not permitted for this role.");
    }

    // Exact membership in merchant_users for target merchantId (no first membership fallback)
    const { data: membership, error: membershipError } = await this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id")
      .eq("user_id", actor.actor_id)
      .eq("merchant_id", merchantId)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership?.merchant_id) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    // Exact merchant status in merchants table must equal 'active'
    const { data: merchant, error: merchantError } = await this.supabaseAdmin.client
      .from("merchants")
      .select("status")
      .eq("id", merchantId)
      .maybeSingle();
    if (merchantError) throw merchantError;
    if (!merchant || merchant.status !== "active") {
      throw new ForbiddenException("Merchant is not active.");
    }

    return merchantId;
  }
}
