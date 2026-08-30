/**
 * STORE-PR6A — Customer Order Summary configuration & flag (spec §33.6, §18).
 *
 * The Store-side flag STORE_CUSTOMER_ORDER_SUMMARY_ENABLED is authoritative and defaults to FALSE. It is
 * INDEPENDENT of STORE_CUSTOMER_HANDOFF_ENABLED / STORE_FEDERATED_AUTH_ENABLED / STORE_IDENTITY_AUTO_LINK_ENABLED
 * — no existing Handoff/Barber flag activates Order Summary, and it is NOT enabled in any environment here.
 *
 * Crypto is SHARED, business contract is NOT (spec §33.3/§7): the reviewed asymmetric key ring and clock
 * tolerance are delegated to CustomerHandoffConfig (shared key material), while the audience is the dedicated
 * Order Summary audience and the business validation lives in its own verifier. This class never reuses the
 * Handoff business verifier.
 */
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CustomerHandoffConfig, HandoffPublicKey } from "../customer-handoff/customer-handoff.config";
import { ORDER_SUMMARY_DEFAULTS } from "./customer-order-summary.types";

/** Strict positive integer parser. Present-but-malformed → throw (fail closed). Missing → undefined. */
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
export class CustomerOrderSummaryConfig {
  constructor(
    private readonly config: ConfigService,
    /** Shared asymmetric key-ring + clock tolerance ONLY (crypto material, not business contract). */
    private readonly handoffConfig: CustomerHandoffConfig,
  ) {}

  /** Authoritative, default-false, independent feature flag (§18, §33.6). */
  get enabled(): boolean {
    return this.config.get<string>("STORE_CUSTOMER_ORDER_SUMMARY_ENABLED") === "true";
  }

  private requiredString(key: string, fallback: string): string {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === null) return fallback;
    if (String(raw).trim() === "") throw new Error(`${key} is present but whitespace-only (fail closed).`);
    return String(raw);
  }

  get issuer(): string {
    return this.requiredString("DilMart_CUSTOMER_ORDER_SUMMARY_ISSUER", ORDER_SUMMARY_DEFAULTS.ISSUER);
  }

  /** Dedicated Order Summary audience (purpose-separated from the handoff audience). */
  get audience(): string {
    return this.requiredString("DilMart_CUSTOMER_ORDER_SUMMARY_AUDIENCE", ORDER_SUMMARY_DEFAULTS.AUDIENCE);
  }

  /** Integer, 1..60 s. Present-but-malformed/out-of-range → throw. Missing → 60. */
  get assertionMaxTtlSeconds(): number {
    return (
      strictInt(
        this.config.get("STORE_ORDER_SUMMARY_ASSERTION_MAX_TTL_SECONDS"),
        "STORE_ORDER_SUMMARY_ASSERTION_MAX_TTL_SECONDS",
        1,
        60,
      ) ?? ORDER_SUMMARY_DEFAULTS.ASSERTION_MAX_TTL_SECONDS
    );
  }

  /** Shared, reviewed clock tolerance (crypto behaviour) — delegated to the handoff config. */
  get clockToleranceSeconds(): number {
    return this.handoffConfig.clockToleranceSeconds;
  }

  /** SHARED asymmetric public-key ring (crypto material, §7). Delegated to the reviewed handoff parser. */
  getKeyRing(): Map<string, HandoffPublicKey> {
    return this.handoffConfig.getKeyRing();
  }

  /**
   * Boot-time validation of EVERY security-critical value the Summary verifier consumes, when the independent
   * STORE_CUSTOMER_ORDER_SUMMARY_ENABLED flag is enabled (fail closed). It validates ONLY the shared crypto/time
   * primitives actually used here — the importable key ring, the assertion max TTL, and the shared clock
   * tolerance — and deliberately does NOT call CustomerHandoffConfig.assertOnBoot() (which would enforce
   * unrelated Handoff URL / secret / limiter requirements). Summary enablement is NOT coupled to any Handoff flag.
   */
  async assertOnBoot(): Promise<void> {
    if (!this.enabled) return;
    this.getKeyRing();
    await this.handoffConfig.validateKeyRingImportable();
    // Touch the strict getters so a malformed value fails the boot (both are consumed by the verifier).
    void this.assertionMaxTtlSeconds;
    void this.clockToleranceSeconds;
  }
}
