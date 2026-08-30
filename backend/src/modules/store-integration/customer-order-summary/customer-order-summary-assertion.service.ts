/**
 * STORE-PR6A — DEDICATED Order Summary assertion verifier (spec §33.3, §7, §19).
 *
 * This is a SEPARATE business validator. It shares the asymmetric key-ring crypto (via config) but NEVER reuses
 * CustomerHandoffAssertionService.verify() and never validates/needs Handoff claims (target, sourceSurface,
 * clientStateHash, contact metadata). `jose` is the sole signature + time authority. Rejected unconditionally:
 * HS256/384/512, `none`, payload-chosen alg, missing/unknown kid, kid/alg mismatch, wrong signature/issuer, wrong
 * dedicated audience, wrong role/sourceApp, wrong/absent purpose, invalid sub/jti, missing/invalid time claims,
 * TTL > 60s. NEVER calls the Barber HMAC verifier and never uses a shared Barber secret.
 */
import { Injectable } from "@nestjs/common";
import * as jose from "jose";
import { CustomerOrderSummaryConfig } from "./customer-order-summary.config";
import type { HandoffKeyAlg } from "../customer-handoff/customer-handoff.config";
import { ASSERTION_BOUNDS, ORDER_SUMMARY_DEFAULTS, OrderSummaryAssertion } from "./customer-order-summary.types";

const ALLOWED_ALGS = new Set<HandoffKeyAlg>(["EdDSA", "RS256"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JTI_RE = /^[A-Za-z0-9_.:-]+$/;

/** Thrown for any assertion failure. The service maps it to a safe UNAUTHORIZED. */
export class OrderSummaryAssertionInvalidError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "OrderSummaryAssertionInvalidError";
  }
}

@Injectable()
export class CustomerOrderSummaryAssertionService {
  private readonly importedKeys = new Map<string, jose.KeyLike | Uint8Array>();

  constructor(private readonly config: CustomerOrderSummaryConfig) {}

  private async keyFor(kid: string, alg: HandoffKeyAlg): Promise<jose.KeyLike | Uint8Array> {
    const cached = this.importedKeys.get(kid);
    if (cached) return cached;
    const ring = this.config.getKeyRing();
    const entry = ring.get(kid);
    if (!entry) throw new OrderSummaryAssertionInvalidError("unknown kid");
    if (entry.alg !== alg) throw new OrderSummaryAssertionInvalidError("kid/alg mismatch");
    const key = await jose.importSPKI(entry.publicKeyPem, alg);
    this.importedKeys.set(kid, key);
    return key;
  }

  /** Verify a signed Order Summary assertion and return trusted minimal claims. Throws on any failure. */
  async verify(rawToken: string): Promise<OrderSummaryAssertion> {
    const token = (rawToken ?? "").trim();
    if (!token || token.split(".").length !== 3) {
      throw new OrderSummaryAssertionInvalidError("malformed token");
    }

    // 1) Header BEFORE trust: alg allowlist + mandatory kid.
    let header: jose.ProtectedHeaderParameters;
    try {
      header = jose.decodeProtectedHeader(token);
    } catch {
      throw new OrderSummaryAssertionInvalidError("unreadable protected header");
    }
    const alg = header.alg as HandoffKeyAlg | undefined;
    if (!alg || !ALLOWED_ALGS.has(alg)) {
      throw new OrderSummaryAssertionInvalidError("algorithm not allowed"); // rejects HS256/none/etc.
    }
    if (!header.kid || typeof header.kid !== "string") {
      throw new OrderSummaryAssertionInvalidError("missing kid");
    }

    // 2) Key for this kid; configured alg must match header alg.
    const key = await this.keyFor(header.kid, alg);

    // 3) jose = sole signature + time authority. Dedicated audience. algorithms:[alg] blocks confusion.
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
      throw new OrderSummaryAssertionInvalidError(`signature/time validation failed (${code})`);
    }

    return this.validateClaims(payload, header.kid);
  }

  /** Minimal business-claim validation, only AFTER jose verifies signature + iss/aud/exp/nbf/iat. */
  private validateClaims(p: jose.JWTPayload, kid: string): OrderSummaryAssertion {
    if (typeof p.sub !== "string" || !UUID_RE.test(p.sub)) throw new OrderSummaryAssertionInvalidError("invalid sub");
    if (
      typeof p.jti !== "string" ||
      p.jti.length < ASSERTION_BOUNDS.JTI_MIN_LEN ||
      p.jti.length > ASSERTION_BOUNDS.JTI_MAX_LEN ||
      !JTI_RE.test(p.jti)
    ) {
      throw new OrderSummaryAssertionInvalidError("invalid jti");
    }
    if (typeof p.iat !== "number") throw new OrderSummaryAssertionInvalidError("missing iat");
    if (typeof p.nbf !== "number") throw new OrderSummaryAssertionInvalidError("missing nbf");
    if (typeof p.exp !== "number") throw new OrderSummaryAssertionInvalidError("missing exp");
    if (p.exp <= p.nbf) throw new OrderSummaryAssertionInvalidError("exp<=nbf");
    if (p.exp - p.nbf > ORDER_SUMMARY_DEFAULTS.ASSERTION_MAX_TTL_SECONDS) {
      throw new OrderSummaryAssertionInvalidError("assertion lifetime exceeds 60s");
    }

    // Fixed identity + purpose claims (order-summary specific; NO handoff claims are read or required).
    if (p.role !== "CUSTOMER") throw new OrderSummaryAssertionInvalidError("role must be CUSTOMER");
    if (p.sourceApp !== "customer_app") throw new OrderSummaryAssertionInvalidError("sourceApp must be customer_app");
    if (p.purpose !== ORDER_SUMMARY_DEFAULTS.PURPOSE) {
      throw new OrderSummaryAssertionInvalidError("purpose must be order_summary");
    }

    return { sub: p.sub, jti: p.jti, iat: p.iat, nbf: p.nbf, exp: p.exp, kid };
  }
}
