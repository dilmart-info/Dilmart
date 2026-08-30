/**
 * STORE-PR5 — Dual actor resolver (spec §9.4/§9.5, §16 threat model).
 *
 * Composes the Supabase actor resolver and the PR4 federated session verifier behind a STRICT,
 * discriminated token classifier. Classification inspects only UNVERIFIED JWT header/claims to SELECT
 * a verifier — it never trusts decoded claims as identity. Invariants:
 *
 *   supabase_candidate            → Supabase resolver ONLY; never the federated verifier.
 *   federated_candidate           → federated verifier ONLY; failure is final; NEVER falls back to Supabase.
 *   ambiguous_or_invalid_federated→ fail closed via the federated-invalid path; NEVER touches Supabase.
 *
 * Blocker 2: the header and payload are decoded INDEPENDENTLY. Any credible federated marker visible in
 * EITHER segment prevents a Supabase fallback; if a segment needed to complete verification is
 * malformed/oversized, the token is ambiguous_or_invalid_federated (never Supabase).
 *
 * Blocker 1: federated verification failures are classified by the typed error `instanceof` (never by
 * matching human-readable messages).
 */
import { Injectable } from "@nestjs/common";
import { FederatedAuthConfig } from "../../modules/auth/federated/federated-auth.config";
import { FederatedSessionVerifierService } from "../../modules/auth/federated/federated-session-verifier.service";
import {
  FederatedSessionInvalidError,
  FederatedSessionFamilyInvalidError,
  FederatedVerificationDependencyError,
} from "../../modules/auth/federated/federated-verification.errors";
import { VerifiedFederatedActor } from "../../modules/auth/federated/federated-auth.types";
import { AuthSource } from "./auth-source";
import { SupabaseActorResolverService, SupabaseResolveResult } from "./supabase-actor-resolver.service";

/** Discriminated classification outcome (spec §16 — algorithm/confusion hardening). */
export type TokenClassification =
  | { kind: "supabase_candidate" }
  | { kind: "federated_candidate" }
  | { kind: "ambiguous_or_invalid_federated" }
  // A federated marker is visible but the routing configuration (issuer/audience/key-ring) needed to
  // finish classification was unavailable/malformed. Fails closed to a safe 503 — never Supabase.
  | { kind: "federated_routing_dependency_unavailable" };

/** Typed federated resolution outcome — the guard maps each reason to a distinct, safe HTTP response. */
export type FederatedResolveReason =
  | "FEDERATED_DISABLED"
  | "FEDERATED_INVALID"
  | "FEDERATED_EXPIRED_OR_REVOKED"
  | "FEDERATED_DEPENDENCY_UNAVAILABLE"
  | "FEDERATED_INTERNAL_ERROR";

export type FederatedResolveOutcome =
  | { ok: true; actor: VerifiedFederatedActor }
  | { ok: false; reason: FederatedResolveReason };

/** Upper bound on a base64url segment we are willing to decode for classification (DoS guard). */
const MAX_SEGMENT_LEN = 8192;
const SUPABASE_ISSUER_RE = /^https:\/\/[a-z0-9-]+\.supabase\.co(\/|$)/i;

function decodeSegment(seg: string | undefined): Record<string, unknown> | null {
  if (!seg || seg.length > MAX_SEGMENT_LEN) return null;
  try {
    const parsed = JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

@Injectable()
export class DualActorResolverService {
  constructor(
    private readonly supabaseResolver: SupabaseActorResolverService,
    private readonly federatedVerifier: FederatedSessionVerifierService,
    private readonly federatedConfig: FederatedAuthConfig,
  ) {}

  /**
   * Detect federated markers from the INDEPENDENTLY decoded header/payload, without letting any
   * FederatedAuthConfig exception escape. Returns:
   *   - intrinsic:  a config-free marker (sessionType) is present — this token is federated regardless of config;
   *   - configMarker: an issuer/audience/kid marker matched (needed config was readable);
   *   - configUnavailable: reading issuer/audience or the key ring threw (malformed/whitespace config).
   */
  private detectMarkers(
    header: Record<string, unknown> | null,
    payload: Record<string, unknown> | null,
  ): { intrinsic: boolean; configMarker: boolean; configUnavailable: boolean } {
    const sessionType = payload?.["sessionType"];
    const intrinsic = sessionType === "DilMart_federated_customer";

    let configUnavailable = false;
    let issuer: string | undefined;
    let audience: string | undefined;
    try {
      issuer = this.federatedConfig.issuer;
      audience = this.federatedConfig.audience;
    } catch {
      configUnavailable = true;
    }

    const iss = payload?.["iss"];
    const aud = payload?.["aud"];
    const issMarker = !configUnavailable && typeof iss === "string" && iss === issuer;
    const audMarker =
      !configUnavailable &&
      ((typeof aud === "string" && aud === audience) || (Array.isArray(aud) && aud.some((a) => a === audience)));

    let kidMarker = false;
    const kid = header?.["kid"];
    if (typeof kid === "string" && kid) {
      try {
        kidMarker = this.federatedConfig.getPublicKeyRing().has(kid);
      } catch {
        configUnavailable = true; // ring is malformed/unreadable — a routing dependency issue
      }
    }

    return { intrinsic, configMarker: Boolean(issMarker || audMarker || kidMarker), configUnavailable };
  }

  /**
   * Select a verifier from unverified markers only, decoding header and payload INDEPENDENTLY, and
   * NEVER letting a configuration exception escape.
   *
   *  - No federated marker visible (incl. normal Supabase tokens and non-JWT garbage) → supabase_candidate,
   *    even when the optional federated key-ring config is absent and the feature is disabled.
   *  - A federated marker visible but the routing config (issuer/audience/ring) was unavailable/malformed
   *    → federated_routing_dependency_unavailable (safe 503, never Supabase).
   *  - A federated marker visible, but a needed segment is malformed/oversized, the token is not a
   *    well-formed 3-segment JWT, the header alg is none/HS*, or a Supabase issuer contradicts it
   *    → ambiguous_or_invalid_federated (never Supabase).
   *  - A federated marker with a well-formed header (valid asymmetric alg) and no contradiction → federated_candidate.
   */
  classify(token: string): TokenClassification {
    const parts = (token ?? "").split(".");
    const header = decodeSegment(parts[0]);
    const payload = decodeSegment(parts[1]);

    const { intrinsic, configMarker, configUnavailable } = this.detectMarkers(header, payload);

    if (!intrinsic && !configMarker) {
      // No federated marker we could confirm. A federated token always carries the intrinsic sessionType
      // marker, so its absence (given readable payloads) means Supabase. If config was unavailable we
      // still route to Supabase here only because NO intrinsic marker was seen — a real federated token
      // would have shown one.
      return { kind: "supabase_candidate" };
    }

    // A credible federated marker is present → this token must NEVER be resolved by Supabase.
    if (configUnavailable) return { kind: "federated_routing_dependency_unavailable" };
    if (parts.length !== 3) return { kind: "ambiguous_or_invalid_federated" }; // structurally not a JWT
    if (!header || !payload) return { kind: "ambiguous_or_invalid_federated" }; // a needed segment unreadable

    const alg = typeof header["alg"] === "string" ? (header["alg"] as string) : "";
    if (alg !== "EdDSA" && alg !== "RS256") return { kind: "ambiguous_or_invalid_federated" }; // none / HS* / unknown

    const iss = payload["iss"];
    if (typeof iss === "string" && SUPABASE_ISSUER_RE.test(iss)) return { kind: "ambiguous_or_invalid_federated" };

    return { kind: "federated_candidate" };
  }

  /**
   * Verify a federated-classified token into a typed outcome. Never touches Supabase. Classification is
   * by typed-error `instanceof` only:
   *   dependency → FEDERATED_DEPENDENCY_UNAVAILABLE
   *   session family invalid → FEDERATED_EXPIRED_OR_REVOKED
   *   token invalid (base FederatedSessionInvalidError incl. FederatedTokenInvalidError) → FEDERATED_INVALID
   *   anything else → FEDERATED_INTERNAL_ERROR
   */
  async resolveFederatedActor(token: string): Promise<FederatedResolveOutcome> {
    if (!this.federatedConfig.enabled) return { ok: false, reason: "FEDERATED_DISABLED" };
    try {
      const actor = await this.federatedVerifier.verify(token);
      return { ok: true, actor };
    } catch (e) {
      if (e instanceof FederatedVerificationDependencyError) return { ok: false, reason: "FEDERATED_DEPENDENCY_UNAVAILABLE" };
      if (e instanceof FederatedSessionFamilyInvalidError) return { ok: false, reason: "FEDERATED_EXPIRED_OR_REVOKED" };
      if (e instanceof FederatedSessionInvalidError) return { ok: false, reason: "FEDERATED_INVALID" };
      return { ok: false, reason: "FEDERATED_INTERNAL_ERROR" };
    }
  }

  /** Resolve a supabase-classified token via the extracted Supabase resolver. Never touches federated. */
  resolveSupabaseActor(token: string): Promise<SupabaseResolveResult> {
    return this.supabaseResolver.resolve(token);
  }
}
