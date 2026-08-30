/**
 * STORE-PR5 — Supabase actor resolution, extracted verbatim from the pre-PR5 RolesGuard so the guard
 * can compose it with the federated verifier without changing any existing Supabase behavior.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9.4.
 *
 * This service performs ONLY Supabase identity resolution: token → user → profile role, with the exact
 * project-ref diagnostics and DB-probe reachability check the guard previously did inline. It returns a
 * discriminated result; the guard maps failures to the SAME HTTP responses as before (URL-aware
 * 401 for /auth/context, 403 elsewhere) so the pinned policy-matrix contract is preserved.
 *
 * Role-normalization semantics are unchanged from the original guard (moved here verbatim).
 */
import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import type { User } from "@supabase/supabase-js";
import { AppActorRole } from "./roles.decorator";
import { SupabaseAdminService } from "../../modules/supabase-admin/supabase-admin.service";

/** Non-reversible 12-hex fingerprint — a safe correlation code for logs (never the raw value). */
function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

/** Normalized Supabase actor (spec §9.4 — the "supabase" branch of ActorContext). */
export type ResolvedSupabaseActor = {
  actorRole: AppActorRole | undefined;
  actorId: string;
  actorEmail: string | null;
  actorPhone: string | null;
  authSource: "supabase";
  actorToken: string;
};

/**
 * Why Supabase resolution failed — the guard maps each to the historical HTTP response.
 * STORE-PR5 Blocker 2: NO free-form operational text. `diagnosticCode` is a non-reversible fingerprint
 * (never a raw Supabase/PostgreSQL message, project ref, URL, service-role key, or setup instruction).
 */
export type SupabaseResolveFailure =
  | { ok: false; reason: "invalid_token" }
  | { ok: false; reason: "project_ref_mismatch"; diagnosticCode?: string }
  | { ok: false; reason: "backend_unavailable"; diagnosticCode?: string }
  | { ok: false; reason: "role_error" };

export type SupabaseResolveResult = ({ ok: true } & ResolvedSupabaseActor) | SupabaseResolveFailure;

@Injectable()
export class SupabaseActorResolverService {
  constructor(private readonly supabaseAdmin: SupabaseAdminService) {}

  private normalizeActorRole(roleValue: unknown): AppActorRole | undefined {
    const raw = String(roleValue ?? "").trim().toLowerCase();
    if (!raw) return undefined;
    const collapsed = raw.replace(/[\s_-]+/g, "");
    if (collapsed === "superadmin") return "super_admin";
    if (collapsed === "platformadmin" || raw === "administrator") return "admin";
    if (raw === "platform_admin") return "admin";
    if (raw === "merchantowner") return "merchant_owner";
    if (raw === "merchantmanager") return "merchant_manager";
    if (raw === "merchantstaff") return "merchant_staff";
    if (raw === "merchantapplicant") return "merchant_applicant";
    if (raw === "store_admin" || raw === "dashboard_admin" || raw === "ops_admin") return "admin";
    return raw as AppActorRole;
  }

  /** Prefer DB profile when set; if missing/empty role, fall back to JWT claims (Supabase metadata). */
  private decodeJwtProjectRef(token: string): string | null {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
        iss?: string;
        ref?: string;
      };
      if (payload.ref) return String(payload.ref);
      const iss = String(payload.iss ?? "");
      const match = iss.match(/https:\/\/([^.]+)\.supabase\.co/i);
      return match?.[1] ?? null;
    } catch {
      return null;
    }
  }

  private resolveActorRole(profile: { role?: string | null } | null, user: User): AppActorRole | undefined {
    const trimmedRole = String(profile?.role ?? "").trim();
    const fromProfile = trimmedRole ? this.normalizeActorRole(trimmedRole) : undefined;
    if (fromProfile) return fromProfile;

    const appMeta = (user as User & { app_metadata?: Record<string, unknown> }).app_metadata;
    const userMeta = (user as User & { user_metadata?: Record<string, unknown> }).user_metadata;
    const fromJwt =
      this.normalizeActorRole(appMeta?.role) ??
      this.normalizeActorRole(userMeta?.role) ??
      this.normalizeActorRole(userMeta?.app_role) ??
      this.normalizeActorRole(userMeta?.user_role);

    if (fromJwt) return fromJwt;

    if (!profile) return "customer";
    return undefined;
  }

  /**
   * Resolve a Supabase Bearer token to a normalized actor, or a typed failure.
   * The token is assumed already validated as a NON-federated (Supabase-candidate) token by the caller.
   */
  async resolve(token: string): Promise<SupabaseResolveResult> {
    const user = await this.supabaseAdmin.resolveUserFromAccessToken(token);
    if (!user) {
      const jwtRef = this.decodeJwtProjectRef(token);
      const backendRef = this.supabaseAdmin.projectRef;
      if (jwtRef && backendRef && jwtRef !== backendRef) {
        // Only a non-reversible fingerprint of the mismatch is surfaced (for log correlation). No raw refs.
        return { ok: false, reason: "project_ref_mismatch", diagnosticCode: fingerprint(`${jwtRef}:${backendRef}`) };
      }
      const dbProbe = await this.supabaseAdmin.probeDatabase();
      if (!dbProbe.ok) {
        // Fingerprint the probe error — never the raw Supabase/PostgreSQL message.
        return { ok: false, reason: "backend_unavailable", diagnosticCode: fingerprint(String(dbProbe.error ?? "unknown")) };
      }
      return { ok: false, reason: "invalid_token" };
    }

    // Use service-role read for role resolution to avoid client-RLS false 403s.
    const { data: profile, error: profileError } = await this.supabaseAdmin.client
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return { ok: false, reason: "role_error" };
    }

    return {
      ok: true,
      actorRole: this.resolveActorRole(profile, user),
      actorId: user.id,
      actorEmail: user.email ?? null,
      actorPhone: user.phone ?? null,
      authSource: "supabase",
      actorToken: token,
    };
  }
}
