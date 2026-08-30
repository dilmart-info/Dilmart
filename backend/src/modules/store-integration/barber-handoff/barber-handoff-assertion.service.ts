/**
 * Asymmetric Barber/Owner assertion verifier. Mirrors ../customer-handoff's assertion service
 * exactly (jose is the sole signature + time authority; EdDSA/RS256 only; mandatory kid; alg
 * confusion impossible) with its own independent key ring and issuer/audience — this verifier
 * NEVER calls the Barber HMAC verifyIntegrationToken() (native X-Store-Session exchange) and
 * never shares that secret, and never touches the Customer handoff's key ring either.
 */
import { Injectable, Logger } from "@nestjs/common";
import * as jose from "jose";
import { BarberHandoffConfig, BarberHandoffKeyAlg } from "./barber-handoff.config";
import { BarberHandoffAssertion, BARBER_BOUNDS } from "./barber-handoff.types";

const ALLOWED_ALGS = new Set<BarberHandoffKeyAlg>(["EdDSA", "RS256"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JTI_RE = /^[A-Za-z0-9_.:-]+$/;
const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

export class BarberAssertionInvalidError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "BarberAssertionInvalidError";
  }
}

@Injectable()
export class BarberHandoffAssertionService {
  private readonly logger = new Logger(BarberHandoffAssertionService.name);
  private readonly importedKeys = new Map<string, jose.KeyLike | Uint8Array>();

  constructor(private readonly config: BarberHandoffConfig) {}

  private async keyFor(kid: string, alg: BarberHandoffKeyAlg): Promise<jose.KeyLike | Uint8Array> {
    // Review: check the kid/alg binding BEFORE any cache lookup so the rejection reason never
    // depends on cache state (a cached key with a mismatched header alg must still report
    // "kid/alg mismatch", not fall through to a generic signature failure).
    const ring = this.config.getKeyRing();
    const entry = ring.get(kid);
    if (!entry) throw new BarberAssertionInvalidError("unknown kid");
    if (entry.alg !== alg) throw new BarberAssertionInvalidError("kid/alg mismatch");
    const cached = this.importedKeys.get(kid);
    if (cached) return cached;
    const key = await jose.importSPKI(entry.publicKeyPem, alg);
    this.importedKeys.set(kid, key);
    return key;
  }

  async verify(rawToken: string): Promise<BarberHandoffAssertion> {
    const token = (rawToken ?? "").trim();
    if (!token || token.split(".").length !== 3) {
      throw new BarberAssertionInvalidError("malformed token");
    }

    let header: jose.ProtectedHeaderParameters;
    try {
      header = jose.decodeProtectedHeader(token);
    } catch {
      throw new BarberAssertionInvalidError("unreadable protected header");
    }
    const alg = header.alg as BarberHandoffKeyAlg | undefined;
    if (!alg || !ALLOWED_ALGS.has(alg)) {
      throw new BarberAssertionInvalidError("algorithm not allowed");
    }
    if (!header.kid || typeof header.kid !== "string") {
      throw new BarberAssertionInvalidError("missing kid");
    }

    const key = await this.keyFor(header.kid, alg);

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
      throw new BarberAssertionInvalidError(`signature/time validation failed (${code})`);
    }

    return this.validateClaims(payload, header.kid);
  }

  private validateClaims(p: jose.JWTPayload, kid: string): BarberHandoffAssertion {
    if (typeof p.sub !== "string" || !UUID_RE.test(p.sub)) throw new BarberAssertionInvalidError("invalid sub");
    if (typeof p.jti !== "string" || p.jti.length < BARBER_BOUNDS.JTI_MIN_LEN || p.jti.length > BARBER_BOUNDS.JTI_MAX_LEN || !JTI_RE.test(p.jti)) {
      throw new BarberAssertionInvalidError("invalid jti");
    }
    if (typeof p.iat !== "number") throw new BarberAssertionInvalidError("missing iat");
    if (typeof p.nbf !== "number") throw new BarberAssertionInvalidError("missing nbf");
    if (typeof p.exp !== "number") throw new BarberAssertionInvalidError("missing exp");
    if (p.exp <= p.nbf) throw new BarberAssertionInvalidError("exp<=nbf");
    // Review P2: enforce the CONFIGURED maximum declared lifetime, not the hardcoded default —
    // jose's maxTokenAge only bounds elapsed age since iat, so a tighter configured maximum
    // must be applied to exp-nbf here. The config getter itself caps this at 60s.
    if (p.exp - p.nbf > this.config.assertionMaxTtlSeconds) {
      throw new BarberAssertionInvalidError("assertion lifetime exceeds the configured maximum");
    }

    if (p.role !== "OWNER" && p.role !== "BARBER") throw new BarberAssertionInvalidError("role must be OWNER or BARBER");
    if (p.sourceApp !== "barber_app") throw new BarberAssertionInvalidError("sourceApp must be barber_app");

    if (typeof p.barbershopId !== "string" || !UUID_RE.test(p.barbershopId)) {
      throw new BarberAssertionInvalidError("invalid barbershopId");
    }
    if (typeof p.salonVerified !== "boolean") throw new BarberAssertionInvalidError("missing salonVerified");

    const sourceSurface = p.sourceSurface;
    if (typeof sourceSurface !== "string" || sourceSurface.length === 0 || sourceSurface.length > BARBER_BOUNDS.SOURCE_SURFACE_MAX_LEN) {
      throw new BarberAssertionInvalidError("invalid sourceSurface");
    }

    if (typeof p.clientStateHash !== "string" || !SHA256_HEX_RE.test(p.clientStateHash.toLowerCase())) {
      throw new BarberAssertionInvalidError("invalid clientStateHash");
    }

    if (typeof p.target !== "string") throw new BarberAssertionInvalidError("invalid target");

    return {
      iss: String(p.iss),
      aud: String(p.aud),
      sub: p.sub,
      jti: p.jti,
      iat: p.iat,
      nbf: p.nbf,
      exp: p.exp,
      role: p.role,
      sourceApp: "barber_app",
      barbershopId: p.barbershopId,
      salonVerified: p.salonVerified,
      shopName: typeof p.shopName === "string" ? p.shopName.slice(0, 200) : undefined,
      businessType: typeof p.businessType === "string" ? p.businessType.slice(0, 64) : undefined,
      displayName: typeof p.displayName === "string" ? p.displayName.slice(0, 200) : undefined,
      phone: typeof p.phone === "string" ? p.phone.slice(0, 32) : undefined,
      city: typeof p.city === "string" ? p.city.slice(0, 64) : undefined,
      target: p.target,
      sourceSurface,
      clientStateHash: p.clientStateHash.toLowerCase(),
      kid,
    };
  }
}
