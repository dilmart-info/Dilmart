/**
 * STORE-PR4 — Safe structured federated-session error contract (spec §14.5, §16).
 * No SQLSTATE / DB message / stack / token hash / internal UUID leaks. No account-enumeration oracle.
 */
export type FederatedErrorCode =
  | "FEDERATED_AUTH_DISABLED"
  | "HANDOFF_INVALID"
  | "HANDOFF_EXPIRED"
  | "HANDOFF_ALREADY_REDEEMED"
  | "HANDOFF_STATE_MISMATCH"
  | "HANDOFF_CONTEXT_MISMATCH"
  | "IDENTITY_LINK_REQUIRED"
  | "IDENTITY_BLOCKED"
  | "FEDERATED_SESSION_EXPIRED"
  | "FEDERATED_REFRESH_REUSE_DETECTED"
  | "FEDERATED_REFRESH_RATE_LIMITED"
  | "STORE_UNAVAILABLE";

export interface FederatedErrorBody {
  code: FederatedErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
}

export class FederatedError extends Error {
  constructor(
    public readonly code: FederatedErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "FederatedError";
  }
  toBody(requestId: string): FederatedErrorBody {
    return { code: this.code, message: this.message, requestId, retryable: this.retryable };
  }
}

export const FederatedErrors = {
  disabled: () => new FederatedError("FEDERATED_AUTH_DISABLED", 503, "Federated Store session is not enabled.", false),
  handoffInvalid: () => new FederatedError("HANDOFF_INVALID", 400, "This handoff is invalid or already used.", false),
  handoffExpired: () => new FederatedError("HANDOFF_EXPIRED", 410, "This handoff has expired. Please try again from DilMart.", true),
  alreadyRedeemed: () => new FederatedError("HANDOFF_ALREADY_REDEEMED", 409, "This handoff has already been used.", false),
  stateMismatch: () => new FederatedError("HANDOFF_STATE_MISMATCH", 400, "This handoff could not be verified.", false),
  contextMismatch: () => new FederatedError("HANDOFF_CONTEXT_MISMATCH", 409, "This handoff could not be verified.", false),
  linkRequired: () => new FederatedError("IDENTITY_LINK_REQUIRED", 409, "Additional verification is required to continue.", false),
  blocked: () => new FederatedError("IDENTITY_BLOCKED", 409, "This account cannot be linked automatically.", false),
  sessionExpired: () => new FederatedError("FEDERATED_SESSION_EXPIRED", 401, "Your session has expired. Please sign in again from DilMart.", false),
  reuseDetected: () => new FederatedError("FEDERATED_REFRESH_REUSE_DETECTED", 401, "Your session was ended for security reasons.", false),
  rateLimited: () => new FederatedError("FEDERATED_REFRESH_RATE_LIMITED", 429, "Too many refresh attempts. Try again shortly.", true),
  unavailable: () => new FederatedError("STORE_UNAVAILABLE", 503, "Store is temporarily unavailable.", true),
} as const;

/** Maps a DB RPC error_code to the safe HTTP error. Unknown/expired/revoked never distinguish. */
export function mapRpcErrorCode(code: string | null | undefined): FederatedError {
  switch (code) {
    case "HANDOFF_STATE_MISMATCH": return FederatedErrors.stateMismatch();
    case "HANDOFF_CONTEXT_MISMATCH": return FederatedErrors.contextMismatch();
    case "HANDOFF_EXPIRED": return FederatedErrors.handoffExpired();
    case "HANDOFF_ALREADY_REDEEMED": return FederatedErrors.alreadyRedeemed();
    case "IDENTITY_LINK_REQUIRED": return FederatedErrors.linkRequired();
    case "IDENTITY_BLOCKED": return FederatedErrors.blocked();
    case "FEDERATED_SESSION_EXPIRED": return FederatedErrors.sessionExpired();
    case "FEDERATED_REFRESH_REUSE_DETECTED": return FederatedErrors.reuseDetected();
    case "FEDERATED_REFRESH_RATE_LIMITED": return FederatedErrors.rateLimited();
    default: return FederatedErrors.handoffInvalid();
  }
}
