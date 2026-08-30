/**
 * Barber Handoff data access. Raw code/state/session-token NEVER reach this layer — only SHA-256
 * hashes. Prepare finalization is a single atomic RPC (finalize_barber_handoff) that upserts
 * store_linked_profiles + inserts the PENDING handoff row together.
 */
import { Injectable, Logger } from "@nestjs/common";
import { SupabaseAdminService } from "../../supabase-admin/supabase-admin.service";

export interface FinalizeBarberInput {
  DilMartUserId: string;
  DilMartRole: "OWNER" | "BARBER";
  barbershopId: string;
  segment: string;
  displayName: string | null;
  phone: string | null;
  city: string | null;
  businessType: string | null;
  codeHash: string;
  stateHash: string;
  assertionJti: string;
  targetPath: string;
  sourceSurface: string;
  codeTtlSeconds: number;
  requestId: string;
}

export interface FinalizeBarberResult {
  status: string;
  errorCode: string | null;
  handoffId: string | null;
  expiresAt: string | null;
  linkedProfileId: string | null;
}

export interface RedeemBarberRpcRow {
  outcome_status: string;
  error_code: string | null;
  handoff_id: string | null;
  linked_profile_id: string | null;
  DilMart_user_id: string | null;
  DilMart_barbershop_id: string | null;
  role: string | null;
  display_name: string | null;
  target_path: string | null;
}

@Injectable()
export class BarberHandoffRepository {
  private readonly logger = new Logger(BarberHandoffRepository.name);

  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private get db() {
    return this.supabaseAdmin.client;
  }

  async finalizeHandoff(input: FinalizeBarberInput): Promise<FinalizeBarberResult> {
    const { data, error } = await this.db.rpc("finalize_barber_handoff", {
      p_DilMart_user_id: input.DilMartUserId,
      p_DilMart_role: input.DilMartRole,
      p_barbershop_id: input.barbershopId,
      p_segment: input.segment,
      p_display_name: input.displayName,
      p_phone: input.phone,
      p_city: input.city,
      p_business_type: input.businessType,
      p_code_hash: input.codeHash,
      p_state_hash: input.stateHash,
      p_assertion_jti: input.assertionJti,
      p_target_path: input.targetPath,
      p_source_surface: input.sourceSurface,
      p_code_ttl_seconds: input.codeTtlSeconds,
      p_request_id: input.requestId,
    });
    if (error) {
      if (error.code === "23505") {
        return { status: "ERROR", errorCode: "HANDOFF_INVALID", handoffId: null, expiresAt: null, linkedProfileId: null };
      }
      this.logger.error(`[barber-handoff] finalize rpc failed: ${error.code ?? "?"}`);
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

  /**
   * ONE atomic RPC (review P1): consume the code + revoke prior sessions + insert the new
   * session in a single transaction. A failure after consume rolls the consume back, so a
   * transient DB failure can never strand a valid login. Only the session token HASH ever
   * reaches this layer.
   */
  async redeemAndCreateSession(
    codeHash: string,
    stateHash: string,
    sessionTokenHash: string,
    sessionTtlSeconds: number,
  ): Promise<RedeemBarberRpcRow> {
    const { data, error } = await this.db.rpc("redeem_barber_handoff_and_create_session", {
      p_code_hash: codeHash,
      p_state_hash: stateHash,
      p_session_token_hash: sessionTokenHash,
      p_session_ttl_seconds: sessionTtlSeconds,
    });
    if (error) {
      this.logger.error(`[barber-handoff] redeem rpc failed: ${error.code ?? "?"}`);
      throw error;
    }
    const rows = (data ?? []) as RedeemBarberRpcRow[];
    if (!rows.length) {
      return {
        outcome_status: "ERROR", error_code: "HANDOFF_INVALID", handoff_id: null,
        linked_profile_id: null, DilMart_user_id: null, DilMart_barbershop_id: null,
        role: null, display_name: null, target_path: null,
      };
    }
    return rows[0];
  }

  /** Revokes every ACTIVE web session for a DilMart user. Returns the number revoked. */
  async revokeSessionsForUser(DilMartUserId: string): Promise<number> {
    const { data, error } = await this.db.rpc("revoke_barber_web_sessions_for_user", {
      p_DilMart_user_id: DilMartUserId,
    });
    if (error) {
      this.logger.error(`[barber-handoff] session revoke failed: ${error.code ?? "?"}`);
      throw error;
    }
    return typeof data === "number" ? data : 0;
  }

  async verifySession(sessionTokenHash: string): Promise<{
    linkedProfileId: string;
    DilMartUserId: string;
    DilMartBarbershopId: string;
    role: string;
  } | null> {
    const { data, error } = await this.db.rpc("verify_barber_web_session", { p_session_token_hash: sessionTokenHash });
    if (error) {
      this.logger.error(`[barber-handoff] session verify failed: ${error.code ?? "?"}`);
      throw error;
    }
    const rows = (data ?? []) as Array<{ linked_profile_id: string; DilMart_user_id: string; DilMart_barbershop_id: string; role: string }>;
    if (!rows.length) return null;
    const row = rows[0];
    return { linkedProfileId: row.linked_profile_id, DilMartUserId: row.DilMart_user_id, DilMartBarbershopId: row.DilMart_barbershop_id, role: row.role };
  }

  /**
   * Plain read of the existing store_linked_profiles columns the handoff already owns
   * (finalizeHandoff writes exactly these) — NOT an RPC, no migration involved. Used only to
   * enrich an already-verified session with display fields the session-verify RPC itself does
   * not return (it returns identity/role only).
   */
  async getLinkedProfileContactFields(
    linkedProfileId: string,
  ): Promise<{ displayName: string | null; phone: string | null; city: string | null; businessType: string | null } | null> {
    const { data, error } = await this.db
      .from("store_linked_profiles")
      .select("display_name, phone, city, business_type")
      .eq("id", linkedProfileId)
      .maybeSingle();
    if (error) {
      this.logger.warn(`[barber-handoff] linked profile contact fields read failed: ${error.code ?? "?"}`);
      return null;
    }
    if (!data) return null;
    return {
      displayName: (data.display_name as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      city: (data.city as string | null) ?? null,
      businessType: (data.business_type as string | null) ?? null,
    };
  }

  async writeAudit(input: {
    requestId?: string | null;
    handoffId?: string | null;
    linkedProfileId?: string | null;
    eventType: string;
    status?: string | null;
    errorCode?: string | null;
    sourceSurface?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.db.from("DilMart_barber_handoff_audit_events").insert({
      request_id: input.requestId ?? null,
      handoff_id: input.handoffId ?? null,
      linked_profile_id: input.linkedProfileId ?? null,
      event_type: input.eventType,
      status: input.status ?? null,
      error_code: input.errorCode ?? null,
      source_surface: input.sourceSurface ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) this.logger.warn(`[barber-handoff] audit write failed: ${error.code ?? "?"}`);
  }
}
