/**
 * STORE-PR4 — Federated session data access (service-role RPCs only). Raw tokens never reach this layer
 * — only keyed hashes.
 */
import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../../supabase-admin/supabase-admin.service";

export interface CreateSessionInput {
  codeHash: string;
  stateHash: string;
  familyId: string;
  refreshTokenId: string;
  refreshTokenHash: string;
  accessJti: string;
  deviceHash: string | null;
  // B6: the identity context the caller pre-signed the access token for. Re-checked under lock.
  expectedHandoffId: string;
  expectedStoreCustomerId: string;
  expectedLinkedProfileId: string;
  expectedDilMartUserId: string;
  expectedTargetPath: string;
  requestId: string;
}
export interface CreateSessionRow {
  status: string;
  error_code: string | null;
  store_customer_id: string | null;
  linked_profile_id: string | null;
  DilMart_user_id: string | null;
  target_path: string | null;
  display_name: string | null;
  session_version: number | null;
  refresh_expires_in_seconds: number | null;
}
export interface RotateInput {
  currentTokenHash: string;
  newTokenId: string;
  newTokenHash: string;
  deviceHash: string | null;
  // B6: the family context the caller pre-signed the new access token for. Re-checked under lock.
  expectedFamilyId: string;
  expectedStoreCustomerId: string;
  expectedLinkedProfileId: string;
  expectedDilMartUserId: string;
  expectedSessionVersion: number;
  requestId: string;
}
export interface RotateRow {
  status: string;
  error_code: string | null;
  family_id: string | null;
  store_customer_id: string | null;
  linked_profile_id: string | null;
  DilMart_user_id: string | null;
  session_version: number | null;
  refresh_expires_in_seconds: number | null;
}
export interface ValidateRow {
  valid: boolean;
  store_customer_id: string | null;
  linked_profile_id: string | null;
  DilMart_user_id: string | null;
  session_version: number | null;
  email: string | null;
  phone: string | null;
}
export interface NonSessionRow {
  outcome_status: string;
  error_code: string | null;
  handoff_id: string | null;
  identity_outcome: string | null;
}

@Injectable()
export class FederatedSessionRepository {
  private readonly logger = new Logger(FederatedSessionRepository.name);
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}
  private get db() {
    return this.supabaseAdmin.client;
  }

  /**
   * Read-only routing inspection (never consumes): identity_outcome + the identity context needed to
   * pre-sign the access token before the atomic consuming RPC re-validates everything under lock.
   */
  async inspectHandoffOutcome(codeHash: string): Promise<{
    found: boolean; identityOutcome: string | null; handoffId: string | null; targetPath: string | null;
    storeCustomerId: string | null; linkedProfileId: string | null; DilMartUserId: string | null;
  }> {
    const { data, error } = await this.db
      .from("DilMart_customer_handoffs")
      .select("id, identity_outcome, target_path, store_customer_id, linked_profile_id, DilMart_user_id")
      .eq("code_hash", codeHash)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { found: false, identityOutcome: null, handoffId: null, targetPath: null, storeCustomerId: null, linkedProfileId: null, DilMartUserId: null };
    const d = data as { id: string; identity_outcome: string; target_path: string | null; store_customer_id: string | null; linked_profile_id: string | null; DilMart_user_id: string | null };
    return { found: true, identityOutcome: d.identity_outcome, handoffId: d.id, targetPath: d.target_path, storeCustomerId: d.store_customer_id, linkedProfileId: d.linked_profile_id, DilMartUserId: d.DilMart_user_id };
  }

  async redeemAndCreate(i: CreateSessionInput): Promise<CreateSessionRow> {
    const { data, error } = await this.db.rpc("redeem_and_create_federated_session", {
      p_code_hash: i.codeHash, p_state_hash: i.stateHash, p_family_id: i.familyId,
      p_refresh_token_id: i.refreshTokenId, p_refresh_token_hash: i.refreshTokenHash, p_access_jti: i.accessJti,
      p_device_hash: i.deviceHash,
      p_expected_handoff_id: i.expectedHandoffId, p_expected_store_customer_id: i.expectedStoreCustomerId,
      p_expected_linked_profile_id: i.expectedLinkedProfileId, p_expected_DilMart_user_id: i.expectedDilMartUserId,
      p_expected_target_path: i.expectedTargetPath,
      p_request_id: i.requestId,
    });
    if (error) { this.logger.error(`[federated] create rpc failed: ${error.code ?? "?"}`); throw error; }
    return ((data ?? []) as CreateSessionRow[])[0] ?? { status: "ERROR", error_code: "HANDOFF_INVALID", store_customer_id: null, linked_profile_id: null, DilMart_user_id: null, target_path: null, display_name: null, session_version: null, refresh_expires_in_seconds: null };
  }

  /** Consume a non-LINKED handoff through the existing safe PR3 path. */
  async consumeNonSession(codeHash: string, stateHash: string): Promise<NonSessionRow> {
    const { data, error } = await this.db.rpc("redeem_customer_handoff", { p_code_hash: codeHash, p_state_hash: stateHash });
    if (error) throw error;
    const row = ((data ?? []) as Array<Record<string, unknown>>)[0] ?? {};
    return {
      outcome_status: String(row.outcome_status ?? "ERROR"),
      error_code: (row.error_code as string | null) ?? "HANDOFF_INVALID",
      handoff_id: (row.handoff_id as string | null) ?? null,
      identity_outcome: (row.identity_outcome as string | null) ?? null,
    };
  }

  /** Read-only resolve of the family context for a current refresh-token hash (to pre-sign the new access
   *  token before the locking rotation RPC). Returns null if the token is unknown. Not authoritative for
   *  expiry/reuse — the rotation RPC re-validates under lock. */
  async resolveFamilyForToken(tokenHash: string): Promise<{ familyId: string; sessionVersion: number; storeCustomerId: string; linkedProfileId: string; DilMartUserId: string } | null> {
    const { data: tok, error: e1 } = await this.db
      .from("store_federated_refresh_tokens").select("session_family_id").eq("token_hash", tokenHash).maybeSingle();
    if (e1) throw e1;
    if (!tok) return null;
    const { data: fam, error: e2 } = await this.db
      .from("store_federated_session_families")
      .select("id, session_version, store_customer_id, linked_profile_id, DilMart_user_id")
      .eq("id", (tok as { session_family_id: string }).session_family_id).maybeSingle();
    if (e2) throw e2;
    if (!fam) return null;
    const f = fam as { id: string; session_version: number; store_customer_id: string; linked_profile_id: string; DilMart_user_id: string };
    return { familyId: f.id, sessionVersion: f.session_version, storeCustomerId: f.store_customer_id, linkedProfileId: f.linked_profile_id, DilMartUserId: f.DilMart_user_id };
  }

  async rotate(i: RotateInput): Promise<RotateRow> {
    const { data, error } = await this.db.rpc("rotate_federated_refresh_token", {
      p_current_token_hash: i.currentTokenHash, p_new_token_id: i.newTokenId, p_new_token_hash: i.newTokenHash,
      p_device_hash: i.deviceHash,
      p_expected_family_id: i.expectedFamilyId, p_expected_store_customer_id: i.expectedStoreCustomerId,
      p_expected_linked_profile_id: i.expectedLinkedProfileId, p_expected_DilMart_user_id: i.expectedDilMartUserId,
      p_expected_session_version: i.expectedSessionVersion, p_request_id: i.requestId,
    });
    if (error) { this.logger.error(`[federated] rotate rpc failed: ${error.code ?? "?"}`); throw error; }
    return ((data ?? []) as RotateRow[])[0] ?? { status: "ERROR", error_code: "FEDERATED_SESSION_EXPIRED", family_id: null, store_customer_id: null, linked_profile_id: null, DilMart_user_id: null, session_version: null, refresh_expires_in_seconds: null };
  }

  async logout(tokenHash: string, requestId: string): Promise<void> {
    const { error } = await this.db.rpc("logout_federated_session", { p_refresh_token_hash: tokenHash, p_request_id: requestId });
    if (error) throw error;
  }
  async logoutAll(tokenHash: string, requestId: string): Promise<void> {
    const { error } = await this.db.rpc("logout_all_federated_sessions", { p_refresh_token_hash: tokenHash, p_request_id: requestId });
    if (error) throw error;
  }

  async validateSessionFamily(familyId: string, sessionVersion: number): Promise<ValidateRow> {
    const { data, error } = await this.db.rpc("validate_federated_session_family", {
      p_family_id: familyId, p_session_version: sessionVersion,
    });
    if (error) throw error;
    return ((data ?? []) as ValidateRow[])[0] ?? { valid: false, store_customer_id: null, linked_profile_id: null, DilMart_user_id: null, session_version: null, email: null, phone: null };
  }

  /** Internal revoke foundation (not exposed as an endpoint in PR4). */
  async revokeForIdentity(DilMartUserId: string | null, linkedProfileId: string | null, reason: string, requestId: string): Promise<number> {
    const { data, error } = await this.db.rpc("revoke_federated_sessions_for_identity", {
      p_DilMart_user_id: DilMartUserId, p_linked_profile_id: linkedProfileId, p_reason: reason, p_request_id: requestId,
    });
    if (error) throw error;
    return ((data ?? []) as Array<{ revoked_count: number }>)[0]?.revoked_count ?? 0;
  }
}
