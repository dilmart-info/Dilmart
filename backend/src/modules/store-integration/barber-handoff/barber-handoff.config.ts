/**
 * Barber Handoff configuration & flags. Mirrors ../customer-handoff/customer-handoff.config.ts's
 * fail-closed conventions exactly, with its own, independent flag/key/secret namespace — this
 * module NEVER reads STORE_CUSTOMER_HANDOFF_*, DilMart_CUSTOMER_HANDOFF_*, or the Barber HMAC
 * DilMart_INTEGRATION_SECRET. All flags default FALSE. A present-but-malformed value (bad number,
 * malformed PEM, bad host, out-of-range TTL) throws at startup rather than silently falling back.
 */
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as jose from "jose";
import { BARBER_HANDOFF_DEFAULTS } from "./barber-handoff.types";

export type BarberHandoffKeyAlg = "EdDSA" | "RS256";
export interface BarberHandoffPublicKey {
  alg: BarberHandoffKeyAlg;
  publicKeyPem: string;
}

// Review P1: ONLY the current live Store host. `staging-store.DilMart.org` is deliberately NOT
// included — the authoritative topology (Main's ai/ENVIRONMENT_SOURCE_OF_TRUTH.md, mirrored in
// this repo's AGENTS.md) states no Store staging environment exists; defaulting a nonexistent
// host into the allowlist would let a misconfigured OPEN_BASE_URL emit handoff links to it.
// Introduce it only via STORE_BARBER_HANDOFF_APPROVED_HOSTS after an explicit owner topology change.
const APPROVED_HOSTS_DEFAULT = ["store.DilMart.org"];
const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;
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

@Injectable()
export class BarberHandoffConfig {
  private readonly logger = new Logger(BarberHandoffConfig.name);
  private keyRingCache: Map<string, BarberHandoffPublicKey> | null = null;

  constructor(private readonly config: ConfigService) {}

  get handoffEnabled(): boolean {
    return this.config.get<string>("STORE_BARBER_HANDOFF_ENABLED") === "true";
  }

  private requiredString(key: string, fallback: string): string {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === null) return fallback;
    if (String(raw).trim() === "") throw new Error(`${key} is present but whitespace-only (fail closed).`);
    return String(raw);
  }

  get issuer(): string {
    return this.requiredString("DilMart_BARBER_HANDOFF_ISSUER", "DilMart-main");
  }
  get audience(): string {
    return this.requiredString("DilMart_BARBER_HANDOFF_AUDIENCE", "DilMart-store-barber-handoff");
  }

  get trustedProxyHops(): number {
    return strictInt(this.config.get("STORE_BARBER_TRUSTED_PROXY_HOPS"), "STORE_BARBER_TRUSTED_PROXY_HOPS", 0, 8) ?? 0;
  }

  get assertionMaxTtlSeconds(): number {
    return (
      strictInt(this.config.get("STORE_BARBER_HANDOFF_ASSERTION_MAX_TTL_SECONDS"), "STORE_BARBER_HANDOFF_ASSERTION_MAX_TTL_SECONDS", 1, 60) ??
      BARBER_HANDOFF_DEFAULTS.ASSERTION_MAX_TTL_SECONDS
    );
  }

  get clockToleranceSeconds(): number {
    return (
      strictInt(this.config.get("STORE_BARBER_HANDOFF_CLOCK_TOLERANCE_SECONDS"), "STORE_BARBER_HANDOFF_CLOCK_TOLERANCE_SECONDS", 0, 10) ??
      BARBER_HANDOFF_DEFAULTS.CLOCK_TOLERANCE_SECONDS
    );
  }

  /** Exactly 120s for this implementation, or fail startup — matches the Customer handoff contract. */
  get codeTtlSeconds(): number {
    const raw = this.config.get<string>("STORE_BARBER_HANDOFF_CODE_TTL_SECONDS");
    if (raw === undefined || raw === null) return BARBER_HANDOFF_DEFAULTS.CODE_TTL_SECONDS;
    return strictInt(raw, "STORE_BARBER_HANDOFF_CODE_TTL_SECONDS", 120, 120) as number;
  }

  get sessionTtlSeconds(): number {
    return (
      strictInt(this.config.get("STORE_BARBER_WEB_SESSION_TTL_SECONDS"), "STORE_BARBER_WEB_SESSION_TTL_SECONDS", 300, 86400) ??
      BARBER_HANDOFF_DEFAULTS.SESSION_TTL_SECONDS
    );
  }

  private get prodLike(): boolean {
    const env = (this.config.get<string>("STORE_ENV") ?? this.config.get<string>("NODE_ENV") ?? "").toLowerCase();
    return env === "staging" || env === "production" || env === "prod";
  }

  private get approvedHosts(): Set<string> {
    const raw = this.config.get<string>("STORE_BARBER_HANDOFF_APPROVED_HOSTS");
    if (raw === undefined || raw === null) return new Set(APPROVED_HOSTS_DEFAULT);
    if (raw.trim() === "") throw new Error("STORE_BARBER_HANDOFF_APPROVED_HOSTS is present but whitespace-only (fail closed).");
    const hosts = raw.split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
    if (hosts.length === 0) throw new Error("STORE_BARBER_HANDOFF_APPROVED_HOSTS is present but empty (fail closed).");
    for (const h of hosts) {
      if (!HOSTNAME_RE.test(h)) throw new Error(`STORE_BARBER_HANDOFF_APPROVED_HOSTS contains an invalid hostname: "${h}".`);
    }
    return new Set(hosts);
  }

  getKeyRing(): Map<string, BarberHandoffPublicKey> {
    if (this.keyRingCache) return this.keyRingCache;
    const raw = this.config.get<string>("DilMart_BARBER_HANDOFF_PUBLIC_KEYS_JSON");
    if (!raw || !raw.trim()) {
      throw new Error("Barber handoff key ring (DilMart_BARBER_HANDOFF_PUBLIC_KEYS_JSON) is not configured.");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("DilMart_BARBER_HANDOFF_PUBLIC_KEYS_JSON is not valid JSON (fail closed).");
    }
    if (!Array.isArray(parsed)) {
      throw new Error("DilMart_BARBER_HANDOFF_PUBLIC_KEYS_JSON must be a JSON array of {kid, alg, publicKeyPem} (fail closed).");
    }
    const ring = new Map<string, BarberHandoffPublicKey>();
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

  async validateKeyRingImportable(): Promise<void> {
    const ring = this.getKeyRing();
    for (const [kid, entry] of ring) {
      let key: jose.KeyLike | Uint8Array;
      try {
        key = await jose.importSPKI(entry.publicKeyPem, entry.alg);
      } catch {
        throw new Error(`Key ring entry '${kid}' PEM failed jose.importSPKI for alg ${entry.alg} (malformed key).`);
      }
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

  /** Validated web-open base URL. HTTPS + approved host in prod-like envs; exact path; no query/fragment. */
  getOpenBaseUrl(): string {
    const raw = this.config.get<string>("STORE_BARBER_HANDOFF_OPEN_BASE_URL");
    if (!raw || !raw.trim()) throw new Error("STORE_BARBER_HANDOFF_OPEN_BASE_URL is not configured (fail closed).");
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      throw new Error("STORE_BARBER_HANDOFF_OPEN_BASE_URL is not a valid URL (fail closed).");
    }
    if (this.prodLike && url.protocol !== "https:") throw new Error("STORE_BARBER_HANDOFF_OPEN_BASE_URL must be HTTPS in staging/production.");
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("STORE_BARBER_HANDOFF_OPEN_BASE_URL must be http(s).");
    if (url.pathname !== "/open-barber") throw new Error("STORE_BARBER_HANDOFF_OPEN_BASE_URL path must be exactly /open-barber.");
    if (url.search || url.hash) throw new Error("STORE_BARBER_HANDOFF_OPEN_BASE_URL must not contain a query or fragment.");
    if (this.prodLike && !this.approvedHosts.has(url.hostname.toLowerCase())) {
      throw new Error(`STORE_BARBER_HANDOFF_OPEN_BASE_URL host '${url.hostname}' is not an approved Store host.`);
    }
    return `${url.origin}/open-barber`;
  }

  async assertOnBoot(): Promise<void> {
    if (!this.handoffEnabled) {
      this.logger.log("[barber-handoff] Feature disabled (STORE_BARBER_HANDOFF_ENABLED!=true). Endpoints return STORE_INTEGRATION_DISABLED.");
      return;
    }
    this.getKeyRing();
    await this.validateKeyRingImportable();
    this.getOpenBaseUrl();
    void this.assertionMaxTtlSeconds;
    void this.clockToleranceSeconds;
    void this.codeTtlSeconds;
    void this.trustedProxyHops;
    void this.sessionTtlSeconds;
    this.logger.warn("[barber-handoff] Feature ENABLED. Key ring imported + open base URL validated.");
  }
}
