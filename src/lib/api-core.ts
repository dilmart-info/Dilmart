import { authSessionManager } from "@/lib/auth/auth-session-manager";
import { AUTH_REFRESH_OUTCOMES, AUTH_REFRESH_REASONS } from "@/lib/auth/auth-events";

export class ApiError extends Error {
  status: number;
  errorDetails?: string;
  /** STORE-PR5 §Phase 10 — safe, structured metadata only. NEVER carries Authorization / Cookie / tokens / bodies. */
  code?: string;
  requestId?: string;
  retryable?: boolean;

  constructor(
    message: string,
    status: number,
    errorDetails?: string,
    meta?: { code?: string; requestId?: string; retryable?: boolean },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorDetails = errorDetails;
    this.code = meta?.code;
    this.requestId = meta?.requestId;
    this.retryable = meta?.retryable;
  }
}

/**
 * §9.3 — the federated session changed identity context while this request was in flight (another tab of
 * the same browser profile replaced the shared __Host- refresh cookie).
 *
 * The request is ABORTED rather than replayed. Replaying is not safe at any HTTP method: a mutating
 * request would execute as the new customer, and a private GET would return the new customer's data to a
 * UI still rendering the previous one. `/auth/context` re-resolves the identity centrally; the caller may
 * re-initiate afterwards, which keeps the decision to re-issue with the code that knows whether the
 * operation is safe to repeat.
 */
export const AUTH_IDENTITY_TRANSITION_CODE = "AUTH_IDENTITY_TRANSITION";

export class AuthIdentityTransitionError extends Error {
  readonly code = AUTH_IDENTITY_TRANSITION_CODE;
  /** True when the request never left the client (token acquisition detected the transition first). */
  readonly requestSent: boolean;

  constructor(requestSent: boolean) {
    // Customer-facing: several call sites surface `error.message` directly in a toast (e.g. the account
    // address screens), so this must be a sentence a customer can act on, in the app's language — not an
    // internal English description. It states the outcome plainly: nothing was performed, try again.
    super("تم تغيير الحساب المسجَّل في نافذة أخرى. لم يتم تنفيذ العملية — يرجى المحاولة مرة أخرى.");
    this.name = "AuthIdentityTransitionError";
    this.requestSent = requestSent;
  }
}

/**
 * The shape this guard can honestly promise. `requestSent` is optional because the structural branch
 * matches an error that merely carries the code — e.g. one that crossed a serialization boundary — and
 * such a value has no `requestSent`. Narrowing those to the class would let a caller read `requestSent`
 * as a `boolean` when it is actually `undefined`; use `instanceof AuthIdentityTransitionError` when the
 * flag is genuinely needed.
 */
export type AuthIdentityTransitionLike = {
  code: typeof AUTH_IDENTITY_TRANSITION_CODE;
  requestSent?: boolean;
};

/**
 * Recognise the identity-transition abort without importing the class (avoids cycles, and survives an
 * error crossing a module/serialization boundary). Callers that would otherwise render a generic failure
 * can use this to stay quiet: the transition is transient and self-healing — /auth/context re-resolves
 * the identity, after which the caller may re-issue.
 */
export function isAuthIdentityTransitionError(error: unknown): error is AuthIdentityTransitionLike {
  return (
    error instanceof AuthIdentityTransitionError ||
    (typeof error === "object" && error !== null && (error as { code?: unknown }).code === AUTH_IDENTITY_TRANSITION_CODE)
  );
}

export type ApiMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RequestOptions = {
  /** Use immediately after sign-in when local session storage may not be readable yet. */
  accessToken?: string;
};

export const API_BASE_URL = import.meta.env.VITE_STORE_API_BASE_URL ?? "http://localhost:4000/api";
export const PUBLIC_GET_TIMEOUT_MS = 10_000;
export const PRIVATE_TIMEOUT_MS = 20_000;

export function isPublicMarketplaceGet(path: string, method: ApiMethod) {
  return method === "GET" && path.startsWith("/marketplace/");
}

/** Extract a human-readable message from Nest/Express JSON error bodies. */
export function parseApiErrorMessage(errorText: string, status?: number): string {
  const trimmed = errorText.trim();
  if (!trimmed) {
    return status ? `API request failed: ${status}` : "API request failed";
  }

  try {
    const parsed = JSON.parse(trimmed) as { message?: unknown };
    const nested = parsed?.message;
    if (typeof nested === "string") return nested;
    if (Array.isArray(nested)) return nested.map(String).join(", ");
    if (nested && typeof nested === "object") return JSON.stringify(nested);
  } catch {
    // Not JSON — return raw body below.
  }

  return trimmed;
}

/** One refresh + one retry per request. Never loop on 401. */
const MAX_AUTH_RETRIES = 1;

export async function request<T>(path: string, method: ApiMethod, body?: unknown, options?: RequestOptions): Promise<T> {
  const publicGet = isPublicMarketplaceGet(path, method);
  const timeoutMs = publicGet ? PUBLIC_GET_TIMEOUT_MS : PRIVATE_TIMEOUT_MS;
  const overrideToken = String(options?.accessToken ?? "").trim();

  let accessToken = "";
  if (!publicGet) {
    if (overrideToken) {
      accessToken = overrideToken; // a caller-supplied token is honoured as-is and never swapped
    } else {
      // §9.3 — acquiring a token is itself a refresh entry point. If it came back belonging to a
      // different session family, abort BEFORE the request is ever sent rather than issuing it under an
      // identity the UI has not resolved yet.
      const acquired = await authSessionManager.getValidAccessTokenOutcome();
      if (acquired.requiresIdentityRevalidation) throw new AuthIdentityTransitionError(false);
      accessToken = acquired.token ?? "";
    }
  }

  const send = async (token: string): Promise<Response> => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        // STORE-PR5 §Phase 10 — send the federated __Host- cookie on web; harmless for Bearer/native.
        credentials: "include",
        signal: controller.signal,
      });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(`Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  let response = await send(accessToken);
  let authRetries = 0;

  // An expired access token on a private request gets exactly one single-flight
  // refresh + one replay. A caller-supplied token is honoured as-is and never
  // silently swapped. 403 is an authorization verdict, not a stale token — it is
  // surfaced untouched and must never trigger a logout.
  while (!publicGet && !overrideToken && response.status === 401 && authRetries < MAX_AUTH_RETRIES) {
    authRetries += 1;
    const outcome = await authSessionManager.refreshSessionSingleFlight(AUTH_REFRESH_REASONS.apiUnauthorized);
    // §9.3 — the refresh succeeded, but against a session family we cannot prove continues this one.
    // NEVER replay under it. A POST/PUT/PATCH/DELETE would execute as the other customer, and even a
    // private GET would hand their data to a UI still showing the previous identity. The manager has
    // already published the transition; abort and let /auth/context resolve it.
    if (outcome.requiresIdentityRevalidation) throw new AuthIdentityTransitionError(true);
    if (outcome.status !== AUTH_REFRESH_OUTCOMES.refreshed) break;
    const refreshedToken = outcome.session?.access_token ?? "";
    if (!refreshedToken) break;
    response = await send(refreshedToken);
  }

  if (!response.ok) {
    const errorText = await response.text();
    const status = response.status;
    let message = `API request failed with status ${status}`;
    let errorDetails: string | undefined;
    const meta: { code?: string; requestId?: string; retryable?: boolean } = {};

    try {
      const parsed = JSON.parse(errorText.trim());
      if (typeof parsed.message === "string") {
        message = parsed.message;
      } else if (Array.isArray(parsed.message)) {
        message = parsed.message.join(", ");
      }
      if (typeof parsed.error === "string") {
        errorDetails = parsed.error;
      }
      // Safe structured metadata only (the backend §14.5 error contract). Never headers/tokens/bodies.
      if (typeof parsed.code === "string") meta.code = parsed.code;
      if (typeof parsed.requestId === "string") meta.requestId = parsed.requestId;
      if (typeof parsed.retryable === "boolean") meta.retryable = parsed.retryable;
    } catch {
      if (errorText.trim()) {
        message = errorText.trim();
      }
    }

    throw new ApiError(message, status, errorDetails, meta);
  }
  const text = await response.text();
  if (!text) {
    return null as T;
  }
  return JSON.parse(text) as T;
}
