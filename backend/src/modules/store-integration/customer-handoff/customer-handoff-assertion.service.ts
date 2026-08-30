/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Asymmetric Customer Assertion verifier.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8.3, §8.4, §16.6.
 *
 * The Customer Handoff assertion uses ASYMMETRIC signing (EdDSA/Ed25519 preferred, RS256
 * permitted). A mature JOSE implementation (`jose`) is the SOLE authority for signature and
 * time-claim validation — no hand-rolled ASN.1/JWT parsing, and no weaker preliminary parse
 * that trusts data before verification.
 *
 * Rejected unconditionally: HS256/HS384/HS512, `none`, alg chosen by payload, missing kid,
 * unknown kid, alg/key mismatch. This verifier NEVER calls the Barber HMAC
 * `verifyIntegrationToken()` and never shares the Barber secret.
 */
import { Injectable, Logger } from "@nestjs/common";
import * as jose from "jose";
import { CustomerHandoffConfig, HandoffKeyAlg } from "./customer-handoff.config";
import { CustomerHandoffAssertion, HANDOFF_DEFAULTS, BOUNDS } from "./customer-handoff.types";

const ALLOWED_ALGS = new Set<HandoffKeyAlg>(["EdDSA", "RS256"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JTI_RE = /^[A-Za-z0-9_.:-]+$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const E164_RE = /^\+[1-9]\d{6,14}$/;

/** Thrown for any assertion failure. The service maps it to a safe HANDOFF_INVALID. */
export class AssertionInvalidError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "AssertionInvalidError";
  }
}

@Injectable()
export class CustomerHandoffAssertionService {
  private readonly logger = new Logger(CustomerHandoffAssertionService.name);
  private readonly importedKeys = new Map<string, jose.KeyLike | Uint8Array>();

  constructor(private readonly config: CustomerHandoffConfig) {}

  private async keyFor(kid: string, alg: HandoffKeyAlg): Promise<jose.KeyLike | Uint8Array> {
    const cached = this.importedKeys.get(kid);
    if (cached) return cached;
    const ring = this.config.getKeyRing();
    const entry = ring.get(kid);
    if (!entry) throw new AssertionInvalidError("unknown kid");
    if (entry.alg !== alg) throw new AssertionInvalidError("kid/alg mismatch");
    const key = await jose.importSPKI(entry.publicKeyPem, alg);
    this.importedKeys.set(kid, key);
    return key;
  }

  /**
   * Verifies a signed customer assertion and returns the trusted claims.
   * Throws AssertionInvalidError on any failure (no partial trust).
   */
  async verify(rawToken: string): Promise<CustomerHandoffAssertion> {
    const token = (rawToken ?? "").trim();
    if (!token || token.split(".").length !== 3) {
      throw new AssertionInvalidError("malformed token");
    }

    // 1) Inspect the protected header BEFORE any trust: alg allowlist + mandatory kid.
    let header: jose.ProtectedHeaderParameters;
    try {
      header = jose.decodeProtectedHeader(token);
    } catch {
      throw new AssertionInvalidError("unreadable protected header");
    }
    const alg = header.alg as HandoffKeyAlg | undefined;
    if (!alg || !ALLOWED_ALGS.has(alg)) {
      throw new AssertionInvalidError("algorithm not allowed"); // rejects HS256/none/etc.
    }
    if (!header.kid || typeof header.kid !== "string") {
      throw new AssertionInvalidError("missing kid");
    }

    // 2) Select the configured key for this kid; configured alg must match header alg.
    const key = await this.keyFor(header.kid, alg);

    // 3) JOSE is the sole signature + time authority. algorithms:[alg] blocks confusion.
    let payload: jose.JWTPayload;
    try {
      const result = await jose.jwtVerify(token, key, {
        algorithms: [alg],
        issuer: this.config.issuer,
        audience: this.config.audience,
        clockTolerance: `${this.config.clockToleranceSeconds}s`,
        maxTokenAge: `${this.config.assertionMaxTtlSeconds}s`,
      });
      payload = result.payload;
    } catch (err) {
      const code = (err as { code?: string })?.code ?? "verify_failed";
      throw new AssertionInvalidError(`signature/time validation failed (${code})`);
    }

    return this.validateClaims(payload, header.kid);
  }

  /** Business-claim validation, applied only AFTER jose verifies signature + iss/aud/exp/nbf/iat. */
  private validateClaims(p: jose.JWTPayload, kid: string): CustomerHandoffAssertion {
    // Required primitive claims.
    if (typeof p.sub !== "string" || !UUID_RE.test(p.sub)) throw new AssertionInvalidError("invalid sub");
    if (typeof p.jti !== "string" || p.jti.length < BOUNDS.JTI_MIN_LEN || p.jti.length > BOUNDS.JTI_MAX_LEN || !JTI_RE.test(p.jti)) {
      throw new AssertionInvalidError("invalid jti");
    }
    if (typeof p.iat !== "number") throw new AssertionInvalidError("missing iat");
    if (typeof p.nbf !== "number") throw new AssertionInvalidError("missing nbf");
    if (typeof p.exp !== "number") throw new AssertionInvalidError("missing exp");
    if (p.exp <= p.nbf) throw new AssertionInvalidError("exp<=nbf");
    if (p.exp - p.nbf > HANDOFF_DEFAULTS.ASSERTION_MAX_TTL_SECONDS) {
      throw new AssertionInvalidError("assertion lifetime exceeds 60s");
    }

    // Fixed identity claims.
    if (p.role !== "CUSTOMER") throw new AssertionInvalidError("role must be CUSTOMER");
    if (p.sourceApp !== "customer_app") throw new AssertionInvalidError("sourceApp must be customer_app");

    // Bounded strings.
    const sourceSurface = p.sourceSurface;
    if (typeof sourceSurface !== "string" || sourceSurface.length === 0 || sourceSurface.length > BOUNDS.SOURCE_SURFACE_MAX_LEN) {
      throw new AssertionInvalidError("invalid sourceSurface");
    }
    let campaign: string | undefined;
    if (p.campaign !== undefined && p.campaign !== null) {
      if (typeof p.campaign !== "string" || p.campaign.length > BOUNDS.CAMPAIGN_MAX_LEN) {
        throw new AssertionInvalidError("invalid campaign");
      }
      campaign = p.campaign;
    }

    // clientStateHash must be a SHA-256 hex representation.
    if (typeof p.clientStateHash !== "string" || !SHA256_HEX_RE.test(p.clientStateHash.toLowerCase())) {
      throw new AssertionInvalidError("invalid clientStateHash");
    }

    // target validated by the canonical validator (defense-in-depth; also re-validated at prepare).
    if (typeof p.target !== "string") throw new AssertionInvalidError("invalid target");

    // Verification metadata rules (§8.3, task B3).
    const phoneVerified = p.phoneVerified === true;
    let phone: string | undefined;
    let phoneVerifiedAt: string | null = null;
    if (phoneVerified) {
      if (typeof p.phone !== "string" || !E164_RE.test(p.phone)) {
        throw new AssertionInvalidError("phoneVerified requires a canonical E.164 phone");
      }
      if (typeof p.phoneVerifiedAt !== "string" || Number.isNaN(Date.parse(p.phoneVerifiedAt))) {
        throw new AssertionInvalidError("phoneVerified requires a valid phoneVerifiedAt");
      }
      phone = p.phone;
      phoneVerifiedAt = p.phoneVerifiedAt;
    }
    // phoneVerified=false → phone MUST NOT be used for automatic linking (dropped for linking).

    const emailVerified = p.emailVerified === true;
    let email: string | undefined;
    let emailVerifiedAt: string | null = null;
    if (emailVerified) {
      const rawEmail = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
      if (!rawEmail || !rawEmail.includes("@")) {
        throw new AssertionInvalidError("emailVerified requires an email");
      }
      if (typeof p.emailVerifiedAt !== "string" || Number.isNaN(Date.parse(p.emailVerifiedAt))) {
        throw new AssertionInvalidError("emailVerified requires a valid emailVerifiedAt");
      }
      email = rawEmail; // normalized lower(trim())
      emailVerifiedAt = p.emailVerifiedAt;
    }
    // emailVerified=false → email MUST NOT be used for automatic linking (dropped for linking).

    return {
      iss: String(p.iss),
      aud: String(p.aud),
      sub: p.sub,
      jti: p.jti,
      iat: p.iat,
      nbf: p.nbf,
      exp: p.exp,
      role: "CUSTOMER",
      sourceApp: "customer_app",
      displayName: typeof p.displayName === "string" ? p.displayName.slice(0, 200) : undefined,
      phone,
      phoneVerified,
      phoneVerifiedAt,
      email,
      emailVerified,
      emailVerifiedAt,
      locale: typeof p.locale === "string" ? p.locale.slice(0, 32) : undefined,
      city: typeof p.city === "string" ? p.city.slice(0, 64) : undefined,
      target: p.target,
      sourceSurface,
      campaign,
      clientStateHash: p.clientStateHash.toLowerCase(),
      kid,
    };
  }
}
