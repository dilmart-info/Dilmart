/**
 * STORE-PR3 (DilMart-CUSTOMER-STORE-STORE-PR3) — Customer Handoff safe error contract.
 * Governing spec: DilMart-CUSTOMER-STORE-MASTER-001 §14.5.
 *
 * Only safe, structured errors leave the module: a stable `code`, a user-safe `message`,
 * a `requestId`, and a `retryable` hint. Never a stack, raw DB/Supabase message,
 * constraint name, key material, or identity-lookup detail.
 */

export type HandoffErrorCode =
  | "STORE_INTEGRATION_DISABLED"
  | "FEDERATED_AUTH_DISABLED"
  | "INVALID_TARGET"
  | "HANDOFF_RATE_LIMITED"
  | "STORE_UNAVAILABLE"
  | "HANDOFF_INVALID"
  | "HANDOFF_EXPIRED"
  | "HANDOFF_ALREADY_REDEEMED"
  | "HANDOFF_STATE_MISMATCH"
  | "IDENTITY_LINK_REQUIRED"
  | "IDENTITY_BLOCKED";

export interface HandoffErrorBody {
  code: HandoffErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
}

/** A structured, safe handoff error. The controller renders it to the §14.5 body. */
export class HandoffError extends Error {
  constructor(
    public readonly code: HandoffErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "HandoffError";
  }

  toBody(requestId: string): HandoffErrorBody {
    return { code: this.code, message: this.message, requestId, retryable: this.retryable };
  }
}

// Factory helpers — messages are deliberately generic (no identity/lookup detail).
export const HandoffErrors = {
  storeIntegrationDisabled: () =>
    new HandoffError("STORE_INTEGRATION_DISABLED", 503, "Store customer handoff is not enabled.", false),
  federatedAuthDisabled: () =>
    new HandoffError("FEDERATED_AUTH_DISABLED", 503, "Store federated session is not available yet.", false),
  invalidTarget: () => new HandoffError("INVALID_TARGET", 400, "The requested target is not allowed.", false),
  rateLimited: () => new HandoffError("HANDOFF_RATE_LIMITED", 429, "Too many handoff requests. Try again shortly.", true),
  storeUnavailable: () => new HandoffError("STORE_UNAVAILABLE", 503, "Store is temporarily unavailable.", true),
  handoffInvalid: () => new HandoffError("HANDOFF_INVALID", 400, "This handoff is invalid or has already been used.", false),
  handoffExpired: () => new HandoffError("HANDOFF_EXPIRED", 410, "This handoff has expired. Please try again from DilMart.", true),
  alreadyRedeemed: () =>
    new HandoffError("HANDOFF_ALREADY_REDEEMED", 409, "This handoff has already been used.", false),
  stateMismatch: () => new HandoffError("HANDOFF_STATE_MISMATCH", 400, "This handoff could not be verified.", false),
  identityLinkRequired: () =>
    new HandoffError("IDENTITY_LINK_REQUIRED", 409, "Additional verification is required to continue.", false),
  identityBlocked: () => new HandoffError("IDENTITY_BLOCKED", 409, "This account cannot be linked automatically.", false),
} as const;
