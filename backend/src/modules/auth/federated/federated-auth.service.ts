/**
 * STORE-PR4 — Federated refresh / logout / logout-all orchestration (spec §9.3, §9.6). The RAW refresh
 * token exists only in memory + the HTTPS response. Refresh pre-signs the new access token before the
 * locking rotation RPC (same "no lost token" guarantee as redeem). Unknown/invalid tokens are additionally
 * IP-limited at the boundary; the authoritative per-family limit + reuse detection live in the RPC.
 */
import { Injectable, Logger } from "@nestjs/common";
import { randomUUID } from "crypto";
import { FederatedAuthConfig } from "./federated-auth.config";
import { FederatedAccessTokenService } from "./federated-access-token.service";
import { FederatedRefreshTokenService } from "./federated-refresh-token.service";
import { FederatedSessionRepository } from "./federated-session-repository";
import { FederatedErrors, mapRpcErrorCode } from "./federated-auth.errors";
import { BOUNDS, RedeemDevice } from "./federated-auth.types";
import { SlidingWindowRateLimiter } from "../../store-integration/customer-handoff/customer-handoff-rate-limiter";

export interface RefreshResult {
  session: { accessToken: string; expiresIn: number; refreshToken: string; refreshExpiresIn: number };
}

@Injectable()
export class FederatedAuthService {
  private readonly logger = new Logger(FederatedAuthService.name);
  // Boundary guard for unknown-token spraying (per IP). Authoritative limiting is DB per-family.
  private readonly ipLimiter = new SlidingWindowRateLimiter(60, 60_000, 50_000);

  constructor(
    private readonly config: FederatedAuthConfig,
    private readonly access: FederatedAccessTokenService,
    private readonly refreshTokens: FederatedRefreshTokenService,
    private readonly repo: FederatedSessionRepository,
  ) {}

  private assertEnabled(): void {
    if (!this.config.enabled) throw FederatedErrors.disabled();
  }
  private bounded(v: unknown): string | null {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (!t || t.length > BOUNDS.REFRESH_TOKEN_MAX_LEN) return null;
    return t;
  }
  private validateDevice(device: RedeemDevice | undefined): void {
    if (device == null) return;
    if (typeof device !== "object") throw FederatedErrors.handoffInvalid();
    for (const k of ["platform", "appVersion", "deviceId"] as const) {
      const val = device[k];
      if (val !== undefined && (typeof val !== "string" || val.length > BOUNDS.DEVICE_FIELD_MAX_LEN)) {
        throw FederatedErrors.handoffInvalid();
      }
    }
  }

  async refresh(body: { refreshToken?: unknown; device?: RedeemDevice }, clientIp: string, requestId = randomUUID()): Promise<RefreshResult> {
    this.assertEnabled();
    if (!this.ipLimiter.allow(`ip:${(clientIp || "unknown").slice(0, 64)}`)) throw FederatedErrors.rateLimited();

    const rawCurrent = this.bounded(body.refreshToken);
    if (!rawCurrent) throw FederatedErrors.sessionExpired(); // no oracle for malformed vs unknown
    this.validateDevice(body.device);

    const currentHash = this.refreshTokens.hashToken(rawCurrent);
    const deviceHash = this.refreshTokens.hashDevice(body.device?.deviceId);

    // Resolve context (read-only) to pre-sign; rotation re-validates under lock.
    const ctx = await this.repo.resolveFamilyForToken(currentHash);

    const newTokenId = randomUUID();
    const rawNew = this.refreshTokens.generateRawToken();
    const newHash = this.refreshTokens.hashToken(rawNew);

    let signed: { accessToken: string; jti: string; expiresIn: number } | null = null;
    if (ctx) {
      try {
        signed = await this.access.sign({
          storeCustomerId: ctx.storeCustomerId, sessionFamilyId: ctx.familyId,
          linkedProfileId: ctx.linkedProfileId, DilMartUserId: ctx.DilMartUserId, sessionVersion: ctx.sessionVersion,
        });
      } catch {
        throw FederatedErrors.unavailable(); // do NOT rotate if signing fails
      }
    }

    // If the token was unknown at pre-sign (ctx null), still call rotate with placeholders so the RPC is the
    // sole authority and returns the generic expired error (no oracle). A real rotation requires ctx + signed.
    const row = await this.repo.rotate({
      currentTokenHash: currentHash, newTokenId, newTokenHash: newHash, deviceHash,
      // B6: bind rotation to the exact family context we pre-signed the new access token for.
      expectedFamilyId: ctx?.familyId ?? newTokenId,
      expectedStoreCustomerId: ctx?.storeCustomerId ?? newTokenId,
      expectedLinkedProfileId: ctx?.linkedProfileId ?? newTokenId,
      expectedDilMartUserId: ctx?.DilMartUserId ?? newTokenId,
      expectedSessionVersion: ctx?.sessionVersion ?? -1,
      requestId,
    });
    if (row.status !== "OK" || !signed || !ctx) {
      // Discard the pre-signed access token + raw new refresh.
      throw mapRpcErrorCode(row.error_code);
    }
    // Defensive: EVERY committed context value must equal what we signed into the access token — not
    // session_version alone. Any divergence → fail closed, return no token (nothing is logged).
    if (
      row.family_id !== ctx.familyId ||
      row.store_customer_id !== ctx.storeCustomerId ||
      row.linked_profile_id !== ctx.linkedProfileId ||
      row.DilMart_user_id !== ctx.DilMartUserId ||
      row.session_version !== ctx.sessionVersion
    ) {
      throw FederatedErrors.sessionExpired();
    }
    // The committed refresh lifetime is authoritative — no invented 30-day fallback. Missing/null/zero/
    // negative/out-of-range is an internal contract failure (fail closed).
    const refreshExpiresIn = row.refresh_expires_in_seconds;
    if (typeof refreshExpiresIn !== "number" || !Number.isInteger(refreshExpiresIn) || refreshExpiresIn <= 0 || refreshExpiresIn > 2592000) {
      throw FederatedErrors.unavailable();
    }

    return {
      session: {
        accessToken: signed.accessToken,
        expiresIn: signed.expiresIn,
        refreshToken: rawNew,
        refreshExpiresIn,
      },
    };
  }

  /** Idempotent; possession of a valid refresh token identifies the session. Never reveals token existence. */
  async logout(body: { refreshToken?: unknown }, requestId = randomUUID()): Promise<{ status: "logged_out" }> {
    this.assertEnabled();
    const raw = this.bounded(body.refreshToken);
    if (raw) await this.repo.logout(this.refreshTokens.hashToken(raw), requestId);
    return { status: "logged_out" };
  }

  async logoutAll(body: { refreshToken?: unknown }, requestId = randomUUID()): Promise<{ status: "logged_out" }> {
    this.assertEnabled();
    const raw = this.bounded(body.refreshToken);
    if (raw) await this.repo.logoutAll(this.refreshTokens.hashToken(raw), requestId);
    return { status: "logged_out" };
  }

  /** Internal revoke foundation (not exposed as an endpoint in PR4). */
  async revokeForIdentity(DilMartUserId: string | null, linkedProfileId: string | null, reason: string, requestId = randomUUID()): Promise<number> {
    return this.repo.revokeForIdentity(DilMartUserId, linkedProfileId, reason, requestId);
  }
}
