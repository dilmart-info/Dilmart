/**
 * STORE-PR4 — Federated Store Session core configuration (strict, fail-closed).
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §9, §16.6, §18.
 *
 * Store holds a private signing key + a public verification ring. Approved lifetimes are fixed (600s
 * access; 30d refresh/inactivity; 90d absolute). When STORE_FEDERATED_AUTH_ENABLED=true, boot fails
 * unless every security-critical value and key is present and valid. A shared-limiter analog is not
 * relevant here (refresh rate limiting is DB-backed).
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as jose from "jose";
import { FEDERATED_LIFETIMES } from "./federated-auth.types";

export type FederatedAlg = "EdDSA" | "RS256";
export interface FederatedPublicKey {
  alg: FederatedAlg;
  publicKeyPem: string;
}

const KID_RE = /^[A-Za-z0-9_.:-]{3,128}$/;

function strictInt(raw: string | undefined, label: string, min: number, max: number): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const t = String(raw).trim();
  if (t === "") throw new Error(`${label} is whitespace-only (fail closed).`);
  if (!/^-?\d+$/.test(t)) throw new Error(`${label} must be an integer (got "${t}").`);
  const n = Number(t);
  if (!Number.isSafeInteger(n)) throw new Error(`${label} is not a safe integer.`);
  if (n < min || n > max) throw new Error(`${label} must be in [${min}, ${max}] (got ${n}).`);
  return n;
}

/** Exactly `exact`, or fail. Missing → exact default. */
function exactInt(raw: string | undefined, label: string, exact: number): number {
  if (raw === undefined || raw === null) return exact;
  const n = strictInt(raw, label, exact, exact);
  return n as number;
}

@Injectable()
export class FederatedAuthConfig {
  private readonly logger = new Logger(FederatedAuthConfig.name);
  private privateKeyCache: jose.KeyLike | null = null;
  private ringCache: Map<string, FederatedPublicKey> | null = null;

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>("STORE_FEDERATED_AUTH_ENABLED") === "true";
  }

  private requiredString(key: string, fallback: string): string {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === null) return fallback;
    if (String(raw).trim() === "") throw new Error(`${key} is present but whitespace-only (fail closed).`);
    return String(raw);
  }

  get issuer(): string {
    return this.requiredString("STORE_FEDERATED_ACCESS_ISSUER", "DilMart-store");
  }
  get audience(): string {
    return this.requiredString("STORE_FEDERATED_ACCESS_AUDIENCE", "DilMart-store-api");
  }
  get signingAlg(): FederatedAlg {
    const raw = this.config.get<string>("STORE_FEDERATED_ACCESS_SIGNING_ALG") ?? "EdDSA";
    if (raw !== "EdDSA" && raw !== "RS256") throw new Error("STORE_FEDERATED_ACCESS_SIGNING_ALG must be EdDSA or RS256.");
    return raw;
  }
  get signingKid(): string {
    const raw = this.config.get<string>("STORE_FEDERATED_ACCESS_SIGNING_KID");
    if (!raw || !raw.trim()) throw new Error("STORE_FEDERATED_ACCESS_SIGNING_KID is not set (fail closed).");
    if (!KID_RE.test(raw)) throw new Error("STORE_FEDERATED_ACCESS_SIGNING_KID has an invalid format.");
    return raw;
  }

  // Exact lifetimes.
  get accessTtlSeconds(): number {
    return exactInt(this.config.get("STORE_FEDERATED_ACCESS_TTL_SECONDS"), "STORE_FEDERATED_ACCESS_TTL_SECONDS", FEDERATED_LIFETIMES.ACCESS_TTL_SECONDS);
  }
  get refreshTtlSeconds(): number {
    return exactInt(this.config.get("STORE_FEDERATED_REFRESH_TTL_SECONDS"), "STORE_FEDERATED_REFRESH_TTL_SECONDS", FEDERATED_LIFETIMES.REFRESH_TTL_SECONDS);
  }
  get inactiveTtlSeconds(): number {
    return exactInt(this.config.get("STORE_FEDERATED_INACTIVE_TTL_SECONDS"), "STORE_FEDERATED_INACTIVE_TTL_SECONDS", FEDERATED_LIFETIMES.INACTIVE_TTL_SECONDS);
  }
  get absoluteTtlSeconds(): number {
    return exactInt(this.config.get("STORE_FEDERATED_ABSOLUTE_TTL_SECONDS"), "STORE_FEDERATED_ABSOLUTE_TTL_SECONDS", FEDERATED_LIFETIMES.ABSOLUTE_TTL_SECONDS);
  }
  get clockToleranceSeconds(): number {
    return strictInt(this.config.get("STORE_FEDERATED_ACCESS_CLOCK_TOLERANCE_SECONDS"), "STORE_FEDERATED_ACCESS_CLOCK_TOLERANCE_SECONDS", 0, 10) ?? 5;
  }

  /** Keyed HMAC secret for refresh-token + device hashing. base64url decoding to >= 32 bytes. */
  getRefreshHashSecret(): string {
    const raw = this.config.get<string>("STORE_FEDERATED_REFRESH_HASH_SECRET");
    if (raw === undefined || raw === null || raw.trim() === "") throw new Error("STORE_FEDERATED_REFRESH_HASH_SECRET is not set (fail closed).");
    const value = raw.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("STORE_FEDERATED_REFRESH_HASH_SECRET must be base64url (no padding/other chars).");
    if (Buffer.from(value, "base64url").length < 32) throw new Error("STORE_FEDERATED_REFRESH_HASH_SECRET must decode to >= 32 bytes.");
    return value;
  }

  /** Public verification ring: JSON array [{kid, alg, publicKeyPem}] with duplicate-kid detection. */
  getPublicKeyRing(): Map<string, FederatedPublicKey> {
    if (this.ringCache) return this.ringCache;
    const raw = this.config.get<string>("STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON");
    if (!raw || !raw.trim()) throw new Error("STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON is not set (fail closed).");
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error("STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON is not valid JSON."); }
    if (!Array.isArray(parsed)) throw new Error("STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON must be a JSON array.");
    const ring = new Map<string, FederatedPublicKey>();
    for (const e of parsed as Array<{ kid?: unknown; alg?: unknown; publicKeyPem?: unknown }>) {
      if (typeof e?.kid !== "string" || !KID_RE.test(e.kid)) throw new Error(`Public ring has an invalid kid: ${JSON.stringify(e?.kid)}.`);
      if (ring.has(e.kid)) throw new Error(`Public ring has a DUPLICATE kid '${e.kid}'.`);
      if (e.alg !== "EdDSA" && e.alg !== "RS256") throw new Error(`Public ring entry '${e.kid}' has unsupported alg.`);
      if (typeof e.publicKeyPem !== "string" || !e.publicKeyPem.includes("BEGIN PUBLIC KEY")) throw new Error(`Public ring entry '${e.kid}' has an invalid publicKeyPem.`);
      ring.set(e.kid, { alg: e.alg, publicKeyPem: e.publicKeyPem });
    }
    if (ring.size === 0) throw new Error("Public ring is empty (fail closed).");
    this.ringCache = ring;
    return ring;
  }

  /** Imports the PKCS8 private signing key (cached). */
  async getPrivateKey(): Promise<jose.KeyLike> {
    if (this.privateKeyCache) return this.privateKeyCache;
    const pem = this.config.get<string>("STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM");
    if (!pem || !pem.trim()) throw new Error("STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM is not set (fail closed).");
    if (!pem.includes("BEGIN PRIVATE KEY")) throw new Error("STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM must be PKCS8.");
    let key: jose.KeyLike;
    try {
      key = await jose.importPKCS8(pem, this.signingAlg);
    } catch {
      throw new Error("STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM failed jose.importPKCS8 (malformed key).");
    }
    this.privateKeyCache = key;
    return key;
  }

  /** Full boot validation when enabled: import every key, verify private/public compatibility + kid membership. */
  async assertOnBoot(): Promise<void> {
    if (!this.enabled) {
      this.logger.log("[federated-auth] Feature disabled (STORE_FEDERATED_AUTH_ENABLED!=true).");
      return;
    }
    // Touch strict getters so any malformed value fails the boot.
    void this.issuer; void this.audience; void this.signingAlg;
    void this.accessTtlSeconds; void this.refreshTtlSeconds; void this.inactiveTtlSeconds;
    void this.absoluteTtlSeconds; void this.clockToleranceSeconds;
    this.getRefreshHashSecret();
    const kid = this.signingKid;
    const ring = this.getPublicKeyRing();
    const entry = ring.get(kid);
    if (!entry) throw new Error(`Signing kid '${kid}' is not present in STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON.`);
    if (entry.alg !== this.signingAlg) throw new Error(`Signing kid '${kid}' alg mismatch with the public ring.`);
    // Import each public key (rejects malformed PEMs that merely contain the marker) + alg/type compat.
    for (const [k, e] of ring) {
      let pub: jose.KeyLike | Uint8Array;
      try { pub = await jose.importSPKI(e.publicKeyPem, e.alg); } catch { throw new Error(`Public ring entry '${k}' failed jose.importSPKI.`); }
      const kt = (pub as { asymmetricKeyType?: string }).asymmetricKeyType;
      if (kt && !((e.alg === "EdDSA" && (kt === "ed25519" || kt === "ed448")) || (e.alg === "RS256" && kt === "rsa"))) {
        throw new Error(`Public ring entry '${k}' key type '${kt}' incompatible with alg ${e.alg}.`);
      }
    }
    // Private key imports and, by signing + verifying a probe, is compatible with the signing public key.
    const priv = await this.getPrivateKey();
    const pub = await jose.importSPKI(entry.publicKeyPem, entry.alg);
    const probe = await new jose.SignJWT({ probe: true })
      .setProtectedHeader({ alg: this.signingAlg, kid })
      .setIssuedAt().setExpirationTime("30s").sign(priv);
    await jose.jwtVerify(probe, pub, { algorithms: [this.signingAlg] }); // throws on private/public mismatch
    this.logger.warn("[federated-auth] Feature ENABLED. Keys imported + private/public compatibility verified.");
  }
}
