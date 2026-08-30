/**
 * STORE-PR4/PR5 — Federated session verification. It does BOTH cryptographic JWT verification AND DB
 * session-family validation. It does NOT modify the global RolesGuard, attach to endpoints, or accept
 * Supabase / X-Store-Session tokens.
 *
 * STORE-PR5 Blocker 1: failures are raised as the typed errors in `federated-verification.errors.ts`
 * (never message-classified downstream). Raw repository/key/config availability failures are caught at
 * this boundary and re-raised as FederatedVerificationDependencyError so infrastructure diagnostics
 * never escape into the guard.
 */
import { Injectable, Logger } from "@nestjs/common";
import * as jose from "jose";
import { FederatedAuthConfig, FederatedAlg } from "./federated-auth.config";
import { FederatedSessionRepository } from "./federated-session-repository";
import { VerifiedFederatedActor } from "./federated-auth.types";
import {
  FederatedSessionInvalidError,
  FederatedTokenInvalidError,
  FederatedSessionFamilyInvalidError,
  FederatedVerificationDependencyError,
} from "./federated-verification.errors";

// Re-export for backward compatibility with callers/tests that import the base error from this module.
export {
  FederatedSessionInvalidError,
  FederatedTokenInvalidError,
  FederatedSessionFamilyInvalidError,
  FederatedVerificationDependencyError,
} from "./federated-verification.errors";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED = new Set<FederatedAlg>(["EdDSA", "RS256"]);

@Injectable()
export class FederatedSessionVerifierService {
  private readonly logger = new Logger(FederatedSessionVerifierService.name);
  private readonly keyCache = new Map<string, jose.KeyLike | Uint8Array>();

  constructor(
    private readonly config: FederatedAuthConfig,
    private readonly repo: FederatedSessionRepository,
  ) {}

  /** Extracts a Bearer token when explicitly called (never wired into the global guard in PR4). */
  extractBearer(header: string | undefined): string | null {
    const h = (header ?? "").trim();
    if (!h.startsWith("Bearer ")) return null;
    const t = h.slice("Bearer ".length).trim();
    return t || null;
  }

  private async keyFor(kid: string, alg: FederatedAlg): Promise<jose.KeyLike | Uint8Array> {
    const cached = this.keyCache.get(kid);
    if (cached) return cached;
    let ring: Map<string, { alg: FederatedAlg; publicKeyPem: string }>;
    try {
      ring = this.config.getPublicKeyRing();
    } catch {
      // Public verification ring not configured / unreadable → dependency, not a bad token.
      throw new FederatedVerificationDependencyError("public verification ring unavailable");
    }
    const entry = ring.get(kid);
    if (!entry) throw new FederatedTokenInvalidError("unknown kid");
    if (entry.alg !== alg) throw new FederatedTokenInvalidError("kid/alg mismatch");
    let key: jose.KeyLike | Uint8Array;
    try {
      key = await jose.importSPKI(entry.publicKeyPem, alg);
    } catch {
      throw new FederatedVerificationDependencyError("public key import failed");
    }
    this.keyCache.set(kid, key);
    return key;
  }

  /**
   * Cryptographic verify + DB family validation. Throws a typed federated verification error:
   *  - FederatedTokenInvalidError        (malformed / signature / claims / kid / alg)
   *  - FederatedSessionFamilyInvalidError (valid token, invalid/revoked/expired/version-mismatched family)
   *  - FederatedVerificationDependencyError (repository / key / config availability failure)
   */
  async verify(token: string): Promise<VerifiedFederatedActor> {
    const raw = (token ?? "").trim();
    if (!raw || raw.split(".").length !== 3) throw new FederatedTokenInvalidError("malformed token");

    let header: jose.ProtectedHeaderParameters;
    try {
      header = jose.decodeProtectedHeader(raw);
    } catch {
      throw new FederatedTokenInvalidError("unreadable header");
    }
    const alg = header.alg as FederatedAlg | undefined;
    if (!alg || !ALLOWED.has(alg)) throw new FederatedTokenInvalidError("algorithm not allowed"); // rejects HS*/none
    if (!header.kid || typeof header.kid !== "string") throw new FederatedTokenInvalidError("missing kid");

    // Config-derived expectations. A misconfigured issuer/audience/ttl is a dependency, not a bad token.
    let issuer: string, audience: string, clockTolerance: number, accessTtl: number;
    try {
      issuer = this.config.issuer;
      audience = this.config.audience;
      clockTolerance = this.config.clockToleranceSeconds;
      accessTtl = this.config.accessTtlSeconds;
    } catch {
      throw new FederatedVerificationDependencyError("federated auth configuration unavailable");
    }

    const key = await this.keyFor(header.kid, alg);
    let payload: jose.JWTPayload;
    try {
      const r = await jose.jwtVerify(raw, key, {
        algorithms: [alg],
        issuer,
        audience,
        clockTolerance: `${clockTolerance}s`,
        maxTokenAge: `${accessTtl}s`,
        requiredClaims: [
          "iss", "aud", "sub", "jti", "iat", "nbf", "exp",
          "sessionType", "sessionFamilyId", "linkedProfileId", "DilMartUserId", "role", "origin", "sessionVersion",
        ],
      });
      payload = r.payload;
    } catch {
      throw new FederatedTokenInvalidError("signature/time/required-claims validation failed");
    }

    // B5: registered-claim types + the exact 600s lifetime contract (nbf === iat, exp - iat === 600).
    if (typeof payload.jti !== "string" || !UUID_RE.test(payload.jti)) throw new FederatedTokenInvalidError("invalid jti");
    if (!Number.isInteger(payload.iat)) throw new FederatedTokenInvalidError("invalid iat");
    if (!Number.isInteger(payload.nbf)) throw new FederatedTokenInvalidError("invalid nbf");
    if (!Number.isInteger(payload.exp)) throw new FederatedTokenInvalidError("invalid exp");
    const iat = payload.iat as number, nbf = payload.nbf as number, exp = payload.exp as number;
    if (nbf !== iat) throw new FederatedTokenInvalidError("nbf must equal iat (signing contract)");
    if (exp <= iat) throw new FederatedTokenInvalidError("exp must be after iat");
    if (exp - iat !== accessTtl) throw new FederatedTokenInvalidError("access lifetime exceeds approved TTL");

    // Business claim shape.
    if (typeof payload.sub !== "string" || !UUID_RE.test(payload.sub)) throw new FederatedTokenInvalidError("invalid sub");
    if (payload.sessionType !== "DilMart_federated_customer") throw new FederatedTokenInvalidError("wrong sessionType");
    if (payload.role !== "customer") throw new FederatedTokenInvalidError("wrong role");
    if (payload.origin !== "customer_app") throw new FederatedTokenInvalidError("wrong origin");
    if (typeof payload.sessionFamilyId !== "string" || !UUID_RE.test(payload.sessionFamilyId)) throw new FederatedTokenInvalidError("invalid sessionFamilyId");
    if (typeof payload.linkedProfileId !== "string" || !UUID_RE.test(payload.linkedProfileId)) throw new FederatedTokenInvalidError("invalid linkedProfileId");
    if (typeof payload.DilMartUserId !== "string" || !UUID_RE.test(payload.DilMartUserId)) throw new FederatedTokenInvalidError("invalid DilMartUserId");
    if (typeof payload.sessionVersion !== "number" || !Number.isInteger(payload.sessionVersion) || payload.sessionVersion < 1) throw new FederatedTokenInvalidError("invalid sessionVersion");

    // DB family validation (DB-time authority). A repository/transport failure here is a DEPENDENCY error;
    // an authoritative "invalid family" answer is a SESSION-FAMILY error. Raw DB errors never escape.
    let v: Awaited<ReturnType<FederatedSessionRepository["validateSessionFamily"]>>;
    try {
      v = await this.repo.validateSessionFamily(payload.sessionFamilyId, payload.sessionVersion);
    } catch {
      throw new FederatedVerificationDependencyError("session family validation unavailable");
    }
    if (!v.valid || v.store_customer_id !== payload.sub || v.linked_profile_id !== payload.linkedProfileId || v.DilMart_user_id !== payload.DilMartUserId) {
      throw new FederatedSessionFamilyInvalidError("session family invalid");
    }

    return {
      actorRole: "customer",
      actorId: v.store_customer_id!,
      actorEmail: v.email ?? null,
      actorPhone: v.phone ?? null,
      authSource: "DilMart_federated",
      linkedProfileId: v.linked_profile_id!,
      DilMartUserId: v.DilMart_user_id!,
      sessionFamilyId: payload.sessionFamilyId,
      sessionVersion: v.session_version!,
    };
  }
}
