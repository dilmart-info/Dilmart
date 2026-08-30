/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Federated session issuer boundary.
 *
 * PR3/PR4 hard boundary. PR3 implements the atomic one-time consume but MUST NOT mint a real
 * federated Store session. The public redeem success path requires a concrete FederatedSessionIssuer
 * provider — which **STORE-PR4** installs. In PR3 no provider is bound, so:
 *   - the public redeem endpoint fails closed (FEDERATED_AUTH_DISABLED) BEFORE consuming a handoff, and
 *   - the module fails application startup if STORE_FEDERATED_AUTH_ENABLED=true without an issuer.
 *
 * There is intentionally NO implementation of this interface in PR3.
 */
export const FEDERATED_SESSION_ISSUER = Symbol("FEDERATED_SESSION_ISSUER");

/**
 * The issuer owns the ENTIRE redeem-and-issue operation atomically (task B1): lock + validate + consume the
 * handoff exactly once, create the session family, insert the refresh-token hash, write the successful-redeem
 * audit, commit, and return the session — OR roll back everything (no lost one-time code). The Store does NOT
 * consume the code before calling the issuer. STORE-PR3 provides no issuer, so the endpoint stays disabled.
 */
export interface RedeemAndIssueInput {
  codeHash: string;
  stateHash: string;
  device?: { platform?: string; appVersion?: string; deviceId?: string };
  requestId: string;
}

/** Public session shape (master §8.8) — no internal ids (sessionFamilyId etc.) are exposed. */
export interface FederatedSession {
  accessToken: string;
  expiresIn: number;
  refreshToken: string;
  refreshExpiresIn: number;
}

/** Master §8.8 successful redeem response (STORE-PR4 fills this; PR3 provides no issuer). */
export interface RedeemAndIssueResult {
  status: "authenticated";
  session: FederatedSession;
  customer: { id: string; displayName: string | null; linkedProfileId: string; origin: "DilMart" };
  target: string;
}

export interface FederatedSessionIssuer {
  redeemAndIssue(input: RedeemAndIssueInput): Promise<RedeemAndIssueResult>;
}
