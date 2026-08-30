/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff configuration & flags.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §16.6 (key rotation), §18 (flags), §8.10 (TTLs).
 *
 * Backend flags are authoritative (§18). All three default to FALSE and are NOT enabled in any
 * environment by this PR. Security-critical config is STRICTLY fail-closed: a present-but-malformed
 * value (bad number, malformed PEM, bad host, out-of-range TTL) throws at startup rather than
 * silently falling back to a development default. Missing OPTIONAL values may use approved defaults.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as jose from "jose";
import { HANDOFF_DEFAULTS } from "./customer-handoff.types";

export type HandoffKeyAlg = "EdDSA" | "RS256";
export interface HandoffPublicKey {
  alg: HandoffKeyAlg;
  publicKeyPem: string;
}

const APPROVED_HOSTS_DEFAULT = ["store.DilMart.org", "staging-store.DilMart.org"];
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
const KID_RE = /^[A-Za-z0-9_.:-]{3,128}$/;

/** Strict positive integer parser. Present-but-malformed → throw (fail closed). Missing → undefined. */
function strictInt(raw: string | undefined, label: string, min: number, max: number): number | undefined {
  if (raw === undefined || raw === null) return undefined;
  const t = String(raw).trim();
  if (t === "") throw new Error(`${label} is whitespace-only (fail closed).`);
  if (!/^-?\d+$/.test(t)) throw new Error(`${label} must be an integer (got "${t}").`); // rejects NaN, Infinity, decimals, "1e9"
  const n = Number(t);
  if (!Number.isSafeInteger(n)) throw new Error(`${label} is not a safe integer.`);
  if (n < min || n > max) throw new Error(`${label} must be in [${min}, ${max}] (got ${n}).`);
  return n;
}

@Injectable()
export class CustomerHandoffConfig {
  private readonly logger = new Logger(CustomerHandoffConfig.name);
  private keyRingCache: Map<string, HandoffPublicKey> | null = null;

  constructor(private readonly config: ConfigService) {}

  // ── Feature flags (default false) ─────────────────────────────────────────────
  get handoffEnabled(): boolean {
    return this.config.get<string>("STORE_CUSTOMER_HANDOFF_ENABLED") === "true";
  }
  get federatedAuthEnabled(): boolean {
    return this.config.get<string>("STORE_FEDERATED_AUTH_ENABLED") === "true";
  }
  get autoLinkEnabled(): boolean {
    return this.config.get<string>("STORE_IDENTITY_AUTO_LINK_ENABLED") === "true";
  }

  /** A present-but-whitespace value fails closed; a missing value uses the approved default. */
  private requiredString(key: string, fallback: string): string {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === null) return fallback;
    if (String(raw).trim() === "") throw new Error(`${key} is present but whitespace-only (fail closed).`);
    return String(raw);
  }

  // ── Assertion contract ────────────────────────────────────────────────────────
  get issuer(): string {
    return this.requiredString("DilMart_CUSTOMER_HANDOFF_ISSUER", "DilMart-main");
  }
  get audience(): string {
    return this.requiredString("DilMart_CUSTOMER_HANDOFF_AUDIENCE", "DilMart-store-customer-handoff");
  }

  /** Trusted reverse-proxy hop count for client-IP resolution (B6). Default 0 = trust nothing. */
  get trustedProxyHops(): number {
    return strictInt(this.config.get("STORE_TRUSTED_PROXY_HOPS"), "STORE_TRUSTED_PROXY_HOPS", 0, 8) ?? 0;
  }

  /** Integer, 1..60 s. Present-but-malformed/out-of-range → throw. Missing → 60. */
  get assertionMaxTtlSeconds(): number {
    return strictInt(this.config.get("STORE_HANDOFF_ASSERTION_MAX_TTL_SECONDS"), "STORE_HANDOFF_ASSERTION_MAX_TTL_SECONDS", 1, 60)
      ?? HANDOFF_DEFAULTS.ASSERTION_MAX_TTL_SECONDS;
  }

  /** Integer, 0..10 s (narrow reviewed range). Present-but-malformed/out-of-range → throw. Missing → 5. */
  get clockToleranceSeconds(): number {
    return strictInt(this.config.get("STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS"), "STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS", 0, 10)
      ?? HANDOFF_DEFAULTS.CLOCK_TOLERANCE_SECONDS;
  }

  /** Exactly 120 s for this implementation, or fail startup. Missing → 120; present-but-whitespace/other → throw. */
  get codeTtlSeconds(): number {
    const raw = this.config.get<string>("STORE_HANDOFF_CODE_TTL_SECONDS");
    if (raw === undefined || raw === null) return HANDOFF_DEFAULTS.CODE_TTL_SECONDS;
    // strictInt rejects whitespace/NaN/decimal/out-of-range; [120,120] enforces the exact value.
    return strictInt(raw, "STORE_HANDOFF_CODE_TTL_SECONDS", 120, 120) as number;
  }

  private get prodLike(): boolean {
    const env = (this.config.get<string>("STORE_ENV") ?? this.config.get<string>("NODE_ENV") ?? "").toLowerCase();
    return env === "staging" || env === "production" || env === "prod";
  }

  /** Non-empty list of syntactically valid hostnames. Present-but-whitespace/empty/malformed fails closed. */
  private get approvedHosts(): Set<string> {
    const raw = this.config.get<string>("STORE_HANDOFF_APPROVED_HOSTS");
    if (raw === undefined || raw === null) return new Set(APPROVED_HOSTS_DEFAULT);
    if (raw.trim() === "") throw new Error("STORE_HANDOFF_APPROVED_HOSTS is present but whitespace-only (fail closed).");
    const hosts = raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (hosts.length === 0) throw new Error("STORE_HANDOFF_APPROVED_HOSTS is present but empty (fail closed).");
    for (const h of hosts) {
      if (!HOSTNAME_RE.test(h)) throw new Error(`STORE_HANDOFF_APPROVED_HOSTS contains an invalid hostname: "${h}".`);
    }
    return new Set(hosts);
  }

  /**
   * Store-only HMAC key for the opaque federated identifier. Required when the feature is enabled, never
   * committed, and must be a real random key: base64url decoding to >= 32 bytes (a human-readable 16-char
   * password is rejected).
   */
  getFederatedIdSecret(): string {
    const raw = this.config.get<string>("STORE_FEDERATED_ID_SECRET");
    if (raw === undefined || raw === null || raw.trim() === "") {
      throw new Error("STORE_FEDERATED_ID_SECRET is not set (fail closed).");
    }
    const value = raw.trim();
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
      throw new Error("STORE_FEDERATED_ID_SECRET must be a base64url random key (no padding/other chars).");
    }
    let bytes: Buffer;
    try {
      bytes = Buffer.from(value, "base64url");
    } catch {
      throw new Error("STORE_FEDERATED_ID_SECRET is not valid base64url.");
    }
    if (bytes.length < 32) {
      throw new Error("STORE_FEDERATED_ID_SECRET must decode to >= 32 bytes of entropy (not a short password).");
    }
    return value;
  }

  /**
   * Parses & validates the environment key ring (§16.6). Store holds PUBLIC keys only. The value is a JSON
   * ARRAY of `{ kid, alg: 'EdDSA'|'RS256', publicKeyPem }` — an array (not an object) so DUPLICATE kids are
   * detectable (JSON.parse silently collapses duplicate object keys). Structural validation only (sync); PEM
   * import happens in validateKeyRingImportable() at boot. Fails closed on any malformation.
   */
  getKeyRing(): Map<string, HandoffPublicKey> {
    if (this.keyRingCache) return this.keyRingCache;
    const raw = this.config.get<string>("DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON");
    if (!raw || !raw.trim()) {
      throw new Error("Customer handoff key ring (DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON) is not configured.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON is not valid JSON (fail closed).");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON must be a JSON array of {kid, alg, publicKeyPem} (fail closed).");
    }
    const ring = new Map<string, HandoffPublicKey>();
    for (const entry of parsed as Array<{ kid?: unknown; alg?: unknown; publicKeyPem?: unknown }>) {
      const kid = entry?.kid;
      if (typeof kid !== "string" || !KID_RE.test(kid)) {
        throw new Error(`Key ring contains an invalid kid (length/charset): ${JSON.stringify(kid)}.`);
      }
      if (ring.has(kid)) throw new Error(`Key ring contains a DUPLICATE kid '${kid}' (fail closed).`);
      if (entry.alg !== "EdDSA" && entry.alg !== "RS256") {
        throw new Error(`Key ring entry '${kid}' has unsupported alg (only EdDSA/RS256).`);
      }
      if (typeof entry.publicKeyPem !== "string" || !entry.publicKeyPem.includes("BEGIN PUBLIC KEY")) {
        throw new Error(`Key ring entry '${kid}' has an invalid publicKeyPem.`);
      }
      ring.set(kid, { alg: entry.alg, publicKeyPem: entry.publicKeyPem });
    }
    if (ring.size === 0) throw new Error("Key ring is empty (fail closed).");
    this.keyRingCache = ring;
    return ring;
  }

  /**
   * B6/C5 production limiter gate. The rate limiter is per-instance and STORE-PR3 ships NO distributed
   * limiter implementation, so a `STORE_HANDOFF_SHARED_LIMITER_URL` must NOT unlock production — claiming a
   * shared limiter that does not exist would be worse than an honest single-instance deployment. The ONLY
   * permitted prod-like invariant is an explicit reviewed single-instance acknowledgement. Enforced at boot.
   */
  assertLimiterDeploymentSafe(): void {
    if (!this.prodLike) return;
    const ack = this.config.get<string>("STORE_HANDOFF_SINGLE_INSTANCE_ACK") === "true";
    if (!ack) {
      throw new Error(
        "Customer handoff rate limiter is per-instance and no distributed limiter is implemented in STORE-PR3. " +
          "In staging/production set STORE_HANDOFF_SINGLE_INSTANCE_ACK=true (reviewed single-instance deployment) " +
          "— a STORE_HANDOFF_SHARED_LIMITER_URL is ignored and does not satisfy this gate. Fail closed.",
      );
    }
  }

  /**
   * Boot-time cryptographic validation: actually import every PEM with jose.importSPKI so a malformed
   * key that merely contains the "BEGIN PUBLIC KEY" marker is rejected, and the alg/key type match.
   */
  async validateKeyRingImportable(): Promise<void> {
    const ring = this.getKeyRing();
    for (const [kid, entry] of ring) {
      let key: jose.KeyLike | Uint8Array;
      try {
        key = await jose.importSPKI(entry.publicKeyPem, entry.alg);
      } catch {
        throw new Error(`Key ring entry '${kid}' PEM failed jose.importSPKI for alg ${entry.alg} (malformed key).`);
      }
      // Reject an alg/key-type mismatch (e.g. an RSA key configured as EdDSA).
      const kt = (key as { asymmetricKeyType?: string }).asymmetricKeyType;
      if (kt) {
        const okEd = entry.alg === "EdDSA" && (kt === "ed25519" || kt === "ed448");
        const okRs = entry.alg === "RS256" && kt === "rsa";
        if (!okEd && !okRs) {
          throw new Error(`Key ring entry '${kid}' key type '${kt}' is incompatible with alg ${entry.alg}.`);
        }
      }
    }
  }

  /** Validated `/open` base URL (§16.1). HTTPS + approved host in prod-like envs; exact /open path; no query/fragment. */
  getOpenBaseUrl(): string {
    const raw = this.config.get<string>("STORE_HANDOFF_OPEN_BASE_URL");
    if (!raw || !raw.trim()) throw new Error("STORE_HANDOFF_OPEN_BASE_URL is not configured (fail closed).");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("STORE_HANDOFF_OPEN_BASE_URL is not a valid URL (fail closed).");
    }
    if (this.prodLike && url.protocol !== "https:") throw new Error("STORE_HANDOFF_OPEN_BASE_URL must be HTTPS in staging/production.");
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("STORE_HANDOFF_OPEN_BASE_URL must be http(s).");
    if (url.pathname !== "/open") throw new Error("STORE_HANDOFF_OPEN_BASE_URL path must be exactly /open.");
    if (url.search || url.hash) throw new Error("STORE_HANDOFF_OPEN_BASE_URL must not contain a query or fragment.");
    if (this.prodLike && !this.approvedHosts.has(url.hostname.toLowerCase())) {
      throw new Error(`STORE_HANDOFF_OPEN_BASE_URL host '${url.hostname}' is not an approved Store host.`);
    }
    return `${url.origin}/open`;
  }

  /**
   * Boot-time validation (§18). When the handoff feature is ENABLED every security-critical value must be
   * present and valid or the app fails to boot (fail closed). B1 gate (issuer requirement when federated
   * auth is enabled) is enforced by the module, which has access to the optional issuer provider.
   */
  async assertOnBoot(): Promise<void> {
    if (!this.handoffEnabled) {
      this.logger.log("[customer-handoff] Feature disabled (STORE_CUSTOMER_HANDOFF_ENABLED!=true). Endpoints return STORE_INTEGRATION_DISABLED.");
      return;
    }
    this.getKeyRing();
    await this.validateKeyRingImportable();
    this.getOpenBaseUrl();
    this.getFederatedIdSecret();
    // Touch the strict numeric getters so a malformed value fails the boot.
    void this.assertionMaxTtlSeconds;
    void this.clockToleranceSeconds;
    void this.codeTtlSeconds;
    void this.trustedProxyHops;
    this.assertLimiterDeploymentSafe();
    this.logger.warn("[customer-handoff] Feature ENABLED. Key ring imported + open base URL + secrets + limiter gate validated.");
  }
}
