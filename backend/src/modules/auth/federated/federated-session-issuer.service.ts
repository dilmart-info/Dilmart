/**
 * STORE-PR4 — Concrete FederatedSessionIssuer (spec §8.7–§8.10, §9). Installed into the PR3
 * CustomerHandoffModule via the FEDERATED_SESSION_ISSUER token. Owns the full redeem→session operation:
 *
 *   1. read-only inspect the handoff to route LINKED vs non-LINKED and get the identity context;
 *   2. for LINKED: pre-sign the 600s access token + generate the raw refresh token BEFORE the DB call;
 *   3. call ONE atomic RPC that consumes the handoff + creates the family + first refresh hash + audits;
 *   4. return the raw tokens ONLY after commit; if signing OR the RPC fails, no token is returned and the
 *      handoff stays unredeemed.
 *   • for LINK_REQUIRED/BLOCKED: consume via the existing safe PR3 non-session path; never a session.
 *
 * Throws PR3 HandoffError so the existing redeem controller renders the §14.5 body.
 */
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { FederatedAuthConfig } from "./federated-auth.config";
import { FederatedAccessTokenService } from "./federated-access-token.service";
import { FederatedRefreshTokenService } from "./federated-refresh-token.service";
import { FederatedSessionRepository } from "./federated-session-repository";
import {
  FederatedSessionIssuer,
  RedeemAndIssueInput,
  RedeemAndIssueResult,
} from "../../store-integration/customer-handoff/federated-session-issuer";
import { HandoffError, HandoffErrors } from "../../store-integration/customer-handoff/customer-handoff.errors";

@Injectable()
export class FederatedSessionIssuerService implements FederatedSessionIssuer {
  constructor(
    private readonly config: FederatedAuthConfig,
    private readonly access: FederatedAccessTokenService,
    private readonly refresh: FederatedRefreshTokenService,
    private readonly repo: FederatedSessionRepository,
  ) {}

  async redeemAndIssue(input: RedeemAndIssueInput): Promise<RedeemAndIssueResult> {
    if (!this.config.enabled) throw HandoffErrors.federatedAuthDisabled();

    const { codeHash, stateHash, device, requestId } = input;

    // 1) Route.
    const insp = await this.repo.inspectHandoffOutcome(codeHash);
    if (insp.identityOutcome !== "LINKED") {
      // Non-LINKED (or not found): consume via the existing safe non-session path; never a session.
      const row = await this.repo.consumeNonSession(codeHash, stateHash);
      if (row.outcome_status === "LINK_REQUIRED") throw HandoffErrors.identityLinkRequired();
      if (row.outcome_status === "BLOCKED") throw HandoffErrors.identityBlocked();
      throw this.mapHandoffError(row.error_code);
    }

    if (!insp.storeCustomerId || !insp.linkedProfileId || !insp.DilMartUserId) {
      throw HandoffErrors.handoffInvalid();
    }

    // 2) Pre-sign + generate the raw refresh token BEFORE the consuming transaction.
    const familyId = randomUUID();
    const refreshTokenId = randomUUID();
    const rawRefresh = this.refresh.generateRawToken();
    const refreshHash = this.refresh.hashToken(rawRefresh);
    const deviceHash = this.refresh.hashDevice(device?.deviceId);

    let signed: { accessToken: string; jti: string; expiresIn: number };
    try {
      signed = await this.access.sign({
        storeCustomerId: insp.storeCustomerId,
        sessionFamilyId: familyId,
        linkedProfileId: insp.linkedProfileId,
        DilMartUserId: insp.DilMartUserId,
        sessionVersion: 1,
      });
    } catch {
      // Signing failed → do NOT call the consuming RPC. The handoff is untouched.
      throw HandoffErrors.storeUnavailable();
    }

    // 3) Atomic consume + session creation. B6: pass the exact identity context we pre-signed for; the RPC
    //    re-checks it under lock and refuses to consume the handoff on any mismatch.
    let row;
    try {
      row = await this.repo.redeemAndCreate({
        codeHash, stateHash, familyId, refreshTokenId, refreshTokenHash: refreshHash, accessJti: signed.jti,
        deviceHash,
        expectedHandoffId: insp.handoffId!, expectedStoreCustomerId: insp.storeCustomerId,
        expectedLinkedProfileId: insp.linkedProfileId, expectedDilMartUserId: insp.DilMartUserId,
        expectedTargetPath: insp.targetPath!,
        requestId,
      });
    } catch {
      throw HandoffErrors.storeUnavailable();
    }

    if (row.status !== "OK") {
      // Discard the pre-signed access token + raw refresh (never returned).
      throw this.mapHandoffError(row.error_code);
    }
    // Defensive: EVERY committed identity value must match the claims we signed into the access token.
    if (
      row.store_customer_id !== insp.storeCustomerId ||
      row.linked_profile_id !== insp.linkedProfileId ||
      row.DilMart_user_id !== insp.DilMartUserId ||
      row.target_path !== insp.targetPath ||
      row.session_version !== 1
    ) {
      throw HandoffErrors.storeUnavailable();
    }

    // The committed refresh lifetime is authoritative — there is NO invented 30-day fallback. A missing,
    // null, zero, negative or out-of-range value is an internal contract failure (fail closed).
    const refreshExpiresIn = row.refresh_expires_in_seconds;
    if (typeof refreshExpiresIn !== "number" || !Number.isInteger(refreshExpiresIn) || refreshExpiresIn <= 0 || refreshExpiresIn > 2592000) {
      throw HandoffErrors.storeUnavailable();
    }

    // 4) Return the raw tokens only after commit (master §8.8). refreshExpiresIn is the committed DB lifetime.
    return {
      status: "authenticated",
      session: {
        accessToken: signed.accessToken,
        expiresIn: signed.expiresIn, // 600
        refreshToken: rawRefresh,
        refreshExpiresIn,
      },
      customer: {
        id: row.store_customer_id!,
        displayName: row.display_name ?? null,
        linkedProfileId: row.linked_profile_id!,
        origin: "DilMart",
      },
      target: row.target_path!,
    };
  }

  private mapHandoffError(code: string | null | undefined): HandoffError {
    switch (code) {
      case "HANDOFF_STATE_MISMATCH": return HandoffErrors.stateMismatch();
      case "HANDOFF_CONTEXT_MISMATCH": return HandoffErrors.handoffInvalid();
      case "HANDOFF_EXPIRED": return HandoffErrors.handoffExpired();
      case "HANDOFF_ALREADY_REDEEMED": return HandoffErrors.alreadyRedeemed();
      case "IDENTITY_LINK_REQUIRED": return HandoffErrors.identityLinkRequired();
      case "IDENTITY_BLOCKED": return HandoffErrors.identityBlocked();
      default: return HandoffErrors.handoffInvalid();
    }
  }
}
