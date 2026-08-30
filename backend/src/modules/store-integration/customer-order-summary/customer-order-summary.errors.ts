/**
 * STORE-PR6A — Customer Order Summary safe error contract (spec §33.6, §14.5).
 *
 * Only safe, structured errors leave the module: a stable `code`, a user-safe `message`, a `requestId`, and a
 * `retryable` hint. Never a stack, raw DB/Supabase message, key material, Authorization header, raw assertion,
 * or Store customer id. Deliberately minimal (no large new taxonomy).
 */

export type OrderSummaryErrorCode =
  | "STORE_INTEGRATION_DISABLED"
  | "UNAUTHORIZED"
  | "STORE_UNAVAILABLE";

export interface OrderSummaryErrorBody {
  code: OrderSummaryErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
}

export class OrderSummaryError extends Error {
  constructor(
    public readonly code: OrderSummaryErrorCode,
    public readonly httpStatus: number,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OrderSummaryError";
  }

  toBody(requestId: string): OrderSummaryErrorBody {
    return { code: this.code, message: this.message, requestId, retryable: this.retryable };
  }
}

export const OrderSummaryErrors = {
  disabled: () =>
    new OrderSummaryError("STORE_INTEGRATION_DISABLED", 503, "Store customer order summary is not enabled.", false),
  unauthorized: () =>
    new OrderSummaryError("UNAUTHORIZED", 401, "Order summary request could not be authorized.", false),
  storeUnavailable: () =>
    new OrderSummaryError("STORE_UNAVAILABLE", 503, "Store is temporarily unavailable.", true),
} as const;
