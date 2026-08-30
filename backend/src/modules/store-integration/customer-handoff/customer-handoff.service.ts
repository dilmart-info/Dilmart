/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff orchestration.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §8.5 (prepare), §8.7 (redeem), §16 + hardening.
 *
 * Prepare: verify assertion → validate state/clientStateHash → validate target → rate limit →
 * resolve identity → 256-bit CSPRNG code → ATOMIC finalize (link + handoff + PREPARED audit +
 * DB-clock expiry) → safe URL (code+state only).
 * Redeem: FAIL-CLOSED behind a FederatedSessionIssuer (absent in PR3 ⇒ never consumes, no internal
 * IDs) → dual IP+device rate limits → atomic DB-time consume → issuer-minted session (STORE-PR4).
 */
import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { CustomerHandoffConfig } from "./customer-handoff.config";
import { CustomerHandoffAssertionService, AssertionInvalidError } from "./customer-handoff-assertion.service";
import { CustomerHandoffIdentityService } from "./customer-handoff-identity.service";
import { CustomerHandoffRepository } from "./customer-handoff-repository";
import { ShadowProvisioningError } from "./customer-shadow-provisioner.service";
import { validateHandoffTargetPath } from "./customer-handoff-target.validator";
import { SlidingWindowRateLimiter } from "./customer-handoff-rate-limiter";
import { HandoffError, HandoffErrors } from "./customer-handoff.errors";
import {
  FEDERATED_SESSION_ISSUER,
  FederatedSessionIssuer,
  RedeemAndIssueResult,
} from "./federated-session-issuer";
import { BOUNDS, PrepareResult, RATE_LIMITS, RedeemDevice } from "./customer-handoff.types";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
function hexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export type RedeemResult = RedeemAndIssueResult;

@Injectable()
export class CustomerHandoffService {
  private readonly logger = new Logger(CustomerHandoffService.name);
  private readonly prepareLimiter = new SlidingWindowRateLimiter(RATE_LIMITS.PREPARE_PER_USER_PER_MIN, 60_000);
  // Independent redeem limiters: BOTH apply when a device id is present (B7). Rotating the device id
  // cannot bypass the IP limit, and rotating the IP cannot bypass the device limit.
  private readonly redeemIpLimiter = new SlidingWindowRateLimiter(RATE_LIMITS.REDEEM_PER_DEVICE_PER_MIN, 60_000);
  private readonly redeemDeviceLimiter = new SlidingWindowRateLimiter(RATE_LIMITS.REDEEM_PER_DEVICE_PER_MIN, 60_000);

  constructor(
    private readonly config: CustomerHandoffConfig,
    private readonly assertions: CustomerHandoffAssertionService,
    private readonly identity: CustomerHandoffIdentityService,
    private readonly repo: CustomerHandoffRepository,
    @Optional() @Inject(FEDERATED_SESSION_ISSUER) private readonly sessionIssuer?: FederatedSessionIssuer,
  ) {}

  // ── PREPARE ──────────────────────────────────────────────────────────────────
  async prepare(bearerToken: string | undefined, state: unknown, requestId = randomUUID()): Promise<PrepareResult> {
    if (!this.config.handoffEnabled) throw HandoffErrors.storeIntegrationDisabled();

    const raw = this.extractBearer(bearerToken);

    let assertion;
    try {
      assertion = await this.assertions.verify(raw);
    } catch (err) {
      if (err instanceof AssertionInvalidError) throw HandoffErrors.handoffInvalid();
      throw err;
    }

    if (typeof state !== "string" || state.length < BOUNDS.STATE_MIN_LEN || state.length > BOUNDS.STATE_MAX_LEN) {
      throw HandoffErrors.stateMismatch();
    }
    const stateHash = sha256Hex(state);
    if (!hexEqual(stateHash, assertion.clientStateHash)) throw HandoffErrors.stateMismatch();

    const targetPath = validateHandoffTargetPath(assertion.target);
    if (!targetPath) throw HandoffErrors.invalidTarget();

    if (!this.prepareLimiter.allow(assertion.sub)) throw HandoffErrors.rateLimited();

    let resolution;
    try {
      resolution = await this.identity.resolve(assertion);
    } catch (err) {
      if (err instanceof ShadowProvisioningError) throw HandoffErrors.storeUnavailable();
      this.logger.error("[customer-handoff] identity resolution error.");
      throw HandoffErrors.storeUnavailable();
    }

    const code = randomBytes(32).toString("base64url"); // 256-bit CSPRNG
    const codeHash = sha256Hex(code);
    const ttl = this.config.codeTtlSeconds;

    // ATOMIC: link + handoff + PREPARED audit + DB-clock expiry (task B4/B6). No app-clock expiry.
    let result;
    try {
      result = await this.repo.finalizeHandoff({
        DilMartUserId: assertion.sub,
        storeCustomerId: resolution.storeCustomerId,
        identityOutcome: resolution.outcome,
        linkMethod: resolution.linkMethod,
        linkStatus: resolution.linkStatus,
        identityAssurance: resolution.identityAssurance,
        reuseExisting: resolution.reuseExisting,
        conflictReason: resolution.conflictReason ?? null,
        codeHash,
        stateHash,
        assertionJti: assertion.jti,
        targetPath,
        sourceSurface: assertion.sourceSurface,
        campaign: assertion.campaign ?? null,
        codeTtlSeconds: ttl,
        kid: assertion.kid,
        email: assertion.emailVerified ? assertion.email ?? null : null,
        phoneVerifiedAt: assertion.phoneVerifiedAt ?? null,
        emailVerifiedAt: assertion.emailVerifiedAt ?? null,
        requestId,
      });
    } catch {
      this.logger.error("[customer-handoff] handoff finalize error.");
      throw HandoffErrors.storeUnavailable();
    }

    if (result.status !== "OK" || !result.handoffId) {
      // Deterministic race outcomes (not a generic 503).
      if (result.errorCode === "IDENTITY_BLOCKED") throw HandoffErrors.identityBlocked();
      throw HandoffErrors.handoffInvalid(); // jti/code_hash replay
    }

    // Safe URL: ONLY code & state.
    const base = this.config.getOpenBaseUrl();
    const handoffUrl = `${base}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;

    return { handoffId: result.handoffId, handoffUrl, expiresIn: ttl, target: targetPath };
  }

  // ── REDEEM ───────────────────────────────────────────────────────────────────
  // FAIL CLOSED. The entire consume+session-issue operation is owned atomically by the
  // FederatedSessionIssuer (STORE-PR4). The Store does NOT consume the one-time code here, so a valid
  // code is never lost to a later issuance failure. STORE-PR3 provides no issuer ⇒ always disabled,
  // and never returns internal identity — regardless of STORE_FEDERATED_AUTH_ENABLED.
  async redeem(
    body: { code?: unknown; state?: unknown; device?: RedeemDevice },
    clientIp?: string,
    requestId = randomUUID(),
  ): Promise<RedeemResult> {
    if (!this.config.handoffEnabled) throw HandoffErrors.storeIntegrationDisabled();
    if (!this.sessionIssuer || !this.config.federatedAuthEnabled) throw HandoffErrors.federatedAuthDisabled();

    const code = this.boundedString(body.code, BOUNDS.CODE_MAX_LEN);
    const state = this.boundedString(body.state, BOUNDS.STATE_MAX_LEN);
    if (!code || !state) throw HandoffErrors.handoffInvalid();
    this.validateDevice(body.device);

    // Dual rate limits — BOTH enforced (rotating the device id cannot bypass the IP limit, and
    // vice-versa). Checked BEFORE any consume; a rejection never touches the handoff.
    const ipKey = (clientIp || "unknown").slice(0, 64);
    const deviceId = body.device?.deviceId?.slice(0, BOUNDS.DEVICE_FIELD_MAX_LEN);
    const ipOk = this.redeemIpLimiter.allow(`ip:${ipKey}`);
    const deviceOk = deviceId ? this.redeemDeviceLimiter.allow(`dev:${deviceId}`) : true;
    if (!ipOk || !deviceOk) throw HandoffErrors.rateLimited();

    // The issuer owns lock+consume+session+refresh+audit atomically.
    return this.sessionIssuer.redeemAndIssue({
      codeHash: sha256Hex(code),
      stateHash: sha256Hex(state),
      device: body.device,
      requestId,
    });
  }

  // ── helpers ────────────────────────────────────────────────────────────────────
  private extractBearer(header: string | undefined): string {
    const h = (header ?? "").trim();
    if (!h.startsWith("Bearer ")) throw HandoffErrors.handoffInvalid();
    const token = h.slice("Bearer ".length).trim();
    if (!token) throw HandoffErrors.handoffInvalid();
    return token;
  }

  private boundedString(v: unknown, max: number): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length === 0 || t.length > max) return null;
    return t;
  }

  private validateDevice(device: RedeemDevice | undefined): void {
    if (device === undefined || device === null) return;
    if (typeof device !== "object") throw HandoffErrors.handoffInvalid();
    for (const key of ["platform", "appVersion", "deviceId"] as const) {
      const val = device[key];
      if (val !== undefined && (typeof val !== "string" || val.length > BOUNDS.DEVICE_FIELD_MAX_LEN)) {
        throw HandoffErrors.handoffInvalid();
      }
    }
  }
}
