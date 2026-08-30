/**
 * Barber Handoff safe error contract. Only a stable `code`, a user-safe `message`, a `requestId`,
 * and a `retryable` hint ever leave this module — never a stack, raw DB message, or identity detail.
 */

export type BarberHandoffErrorCode =
  | "STORE_INTEGRATION_DISABLED"
  | "INVALID_TARGET"
  | "HANDOFF_RATE_LIMITED"
  | "STORE_UNAVAILABLE"
  | "HANDOFF_INVALID"
  | "HANDOFF_EXPIRED"
  | "HANDOFF_ALREADY_REDEEMED"
  | "HANDOFF_STATE_MISMATCH";

export interface BarberHandoffErrorBody {
  code: BarberHandoffErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
}

export class BarberHandoffError extends Error {
  constructor(
    public readonly code: BarberHandoffErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "BarberHandoffError";
  }

  toBody(requestId: string): BarberHandoffErrorBody {
    return { code: this.code, message: this.message, requestId, retryable: this.retryable };
  }
}

export const BarberHandoffErrors = {
  storeIntegrationDisabled: () =>
    new BarberHandoffError("STORE_INTEGRATION_DISABLED", 503, "Barber web handoff is not enabled.", false),
  invalidTarget: () => new BarberHandoffError("INVALID_TARGET", 400, "The requested target is not allowed.", false),
  rateLimited: () => new BarberHandoffError("HANDOFF_RATE_LIMITED", 429, "Too many handoff requests. Try again shortly.", true),
  storeUnavailable: () => new BarberHandoffError("STORE_UNAVAILABLE", 503, "Store is temporarily unavailable.", true),
  handoffInvalid: () => new BarberHandoffError("HANDOFF_INVALID", 400, "This handoff is invalid or has already been used.", false),
  handoffExpired: () => new BarberHandoffError("HANDOFF_EXPIRED", 410, "This handoff has expired. Please try again from DilMart.", true),
  stateMismatch: () => new BarberHandoffError("HANDOFF_STATE_MISMATCH", 400, "This handoff could not be verified.", false),
} as const;
