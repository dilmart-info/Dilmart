/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff data access.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §11, §16.2/§16.3 + hardening B4/B5/B6.
 *
 * All DB access for the handoff flow via the service-role Supabase client. Raw code/state NEVER
 * reach this layer — only SHA-256 hashes. Prepare finalization is a SINGLE atomic RPC
 * (finalize_customer_handoff) that persists link + handoff + PREPARED audit with DB-clock expiry.
 */
import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../../supabase-admin/supabase-admin.service";
import { IdentityOutcome, LinkMethod, LinkStatus, IdentityAssurance } from "./customer-handoff.types";

export interface RedeemRpcRow {
  outcome_status: string;
  error_code: string | null;
  handoff_id: string | null;
  linked_profile_id: string | null;
  store_customer_id: string | null;
  DilMart_user_id: string | null;
  target_path: string | null;
  identity_outcome: string | null;
}

export interface FinalizeInput {
  DilMartUserId: string;
  storeCustomerId: string | null;
  identityOutcome: IdentityOutcome;
  linkMethod: LinkMethod | null;
  linkStatus: LinkStatus | null;
  identityAssurance: IdentityAssurance | null;
  reuseExisting: boolean;
  conflictReason: string | null;
  codeHash: string;
  stateHash: string;
  assertionJti: string;
  targetPath: string;
  sourceSurface: string;
  campaign: string | null;
  codeTtlSeconds: number;
  kid: string;
  email: string | null;
  phoneVerifiedAt: string | null;
  emailVerifiedAt: string | null;
  requestId: string;
}

export interface FinalizeResult {
  status: string; // OK | ERROR
  errorCode: string | null; // HANDOFF_INVALID | IDENTITY_BLOCKED
  handoffId: string | null;
  expiresAt: string | null;
  linkedProfileId: string | null;
}

export interface LinkedProfileRow {
  id: string;
  DilMart_user_id: string | null;
  DilMart_role: string | null;
  store_customer_id: string | null;
  link_status: string | null;
  segment: string | null;
  source_app: string | null;
}

export interface AuditEventInput {
  requestId?: string | null;
  handoffId?: string | null;
  linkedProfileId?: string | null;
  eventType: string;
  status?: string | null;
  errorCode?: string | null;
  sourceSurface?: string | null;
  campaign?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class CustomerHandoffRepository {
  private readonly logger = new Logger(CustomerHandoffRepository.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private get db() {
    return this.supabaseAdmin.client;
  }

  /** Atomic prepare finalization: link + handoff + PREPARED audit + DB-clock expiry, in one tx. */
  async finalizeHandoff(input: FinalizeInput): Promise<FinalizeResult> {
    const { data, error } = await this.db.rpc("finalize_customer_handoff", {
      p_DilMart_user_id: input.DilMartUserId,
      p_store_customer_id: input.storeCustomerId,
      p_identity_outcome: input.identityOutcome,
      p_link_method: input.linkMethod,
      p_link_status: input.linkStatus,
      p_identity_assurance: input.identityAssurance,
      p_reuse_existing: input.reuseExisting,
      p_conflict_reason: input.conflictReason,
      p_code_hash: input.codeHash,
      p_state_hash: input.stateHash,
      p_assertion_jti: input.assertionJti,
      p_target_path: input.targetPath,
      p_source_surface: input.sourceSurface,
      p_campaign: input.campaign,
      p_code_ttl_seconds: input.codeTtlSeconds,
      p_kid: input.kid,
      p_email: input.email,
      p_phone_verified_at: input.phoneVerifiedAt,
      p_email_verified_at: input.emailVerifiedAt,
      p_request_id: input.requestId,
    });
    if (error) {
      // A raw unique_violation that escaped the RPC's handler (defensive) → map deterministically.
      if (error.code === "23505") {
        const isCustomerLink = (error.message ?? "").includes("uq_store_linked_profiles_store_customer_id");
        return { status: "ERROR", errorCode: isCustomerLink ? "IDENTITY_BLOCKED" : "HANDOFF_INVALID", handoffId: null, expiresAt: null, linkedProfileId: null };
      }
      this.logger.error(`[customer-handoff] finalize rpc failed: ${error.code ?? "?"}`);
      throw error;
    }
    const row = ((data ?? []) as Array<Record<string, unknown>>)[0] ?? {};
    return {
      status: String(row.status ?? "ERROR"),
      errorCode: (row.error_code as string | null) ?? null,
      handoffId: (row.handoff_id as string | null) ?? null,
      expiresAt: (row.expires_at as string | null) ?? null,
      linkedProfileId: (row.linked_profile_id as string | null) ?? null,
    };
  }

  /** Atomic single-use consume via the DB-time RPC. Returns the single result row. */
  async redeemAtomic(codeHash: string, stateHash: string): Promise<RedeemRpcRow> {
    const { data, error } = await this.db.rpc("redeem_customer_handoff", {
      p_code_hash: codeHash,
      p_state_hash: stateHash,
    });
    if (error) {
      this.logger.error(`[customer-handoff] redeem rpc failed: ${error.code ?? "?"}`);
      throw error;
    }
    const rows = (data ?? []) as RedeemRpcRow[];
    if (!rows.length) {
      return {
        outcome_status: "ERROR", error_code: "HANDOFF_INVALID", handoff_id: null,
        linked_profile_id: null, store_customer_id: null, DilMart_user_id: null,
        target_path: null, identity_outcome: null,
      };
    }
    return rows[0];
  }

  /** Idempotent, ownership-validated shadow provisioning (direct-insert RPC). */
  async provisionShadowCustomer(DilMartUserId: string, federatedId: string): Promise<{ storeCustomerId: string | null; errorCode: string | null }> {
    const { data, error } = await this.db.rpc("provision_DilMart_federated_customer", {
      p_DilMart_user_id: DilMartUserId,
      p_federated_id: federatedId,
    });
    if (error) {
      this.logger.error(`[customer-handoff] provision rpc failed: ${error.code ?? "?"}`);
      throw error;
    }
    const row = ((data ?? []) as Array<{ store_customer_id: string | null; error_code: string | null }>)[0] ?? { store_customer_id: null, error_code: "IDENTITY_BLOCKED" };
    return { storeCustomerId: row.store_customer_id ?? null, errorCode: row.error_code ?? null };
  }

  async findLinkByDilMartUser(DilMartUserId: string): Promise<LinkedProfileRow | null> {
    const { data, error } = await this.db
      .from("store_linked_profiles")
      .select("id, DilMart_user_id, DilMart_role, store_customer_id, link_status, segment, source_app")
      .eq("DilMart_user_id", DilMartUserId)
      .maybeSingle();
    if (error) throw error;
    return (data as LinkedProfileRow | null) ?? null;
  }

  async confirmedPhoneCandidates(phoneDigits: string): Promise<string[]> {
    const { data, error } = await this.db.rpc("find_confirmed_auth_users_by_phone", { p_phone_digits: phoneDigits });
    if (error) throw error;
    return ((data ?? []) as { store_customer_id: string }[]).map((r) => r.store_customer_id);
  }

  async confirmedEmailCandidates(emailNormalized: string): Promise<string[]> {
    const { data, error } = await this.db.rpc("find_confirmed_auth_users_by_email", { p_email_normalized: emailNormalized });
    if (error) throw error;
    return ((data ?? []) as { store_customer_id: string }[]).map((r) => r.store_customer_id);
  }

  /** Is this Store customer already linked to a DIFFERENT DilMart user? (one-to-one guard). */
  async storeCustomerLinkedToOtherDilMartUser(storeCustomerId: string, DilMartUserId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("store_linked_profiles")
      .select("DilMart_user_id")
      .eq("store_customer_id", storeCustomerId)
      .maybeSingle();
    if (error) throw error;
    const owner = (data as { DilMart_user_id: string | null } | null)?.DilMart_user_id ?? null;
    return owner !== null && owner !== DilMartUserId;
  }

  /** Append-only audit write for redeem-path events (prepare audit is written inside finalize). */
  async writeAudit(input: AuditEventInput): Promise<void> {
    const { error } = await this.db.from("DilMart_customer_handoff_audit_events").insert({
      request_id: input.requestId ?? null,
      handoff_id: input.handoffId ?? null,
      linked_profile_id: input.linkedProfileId ?? null,
      event_type: input.eventType,
      status: input.status ?? null,
      error_code: input.errorCode ?? null,
      source_surface: input.sourceSurface ?? null,
      campaign: input.campaign ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) this.logger.warn(`[customer-handoff] audit write failed: ${error.code ?? "?"}`);
  }
}
