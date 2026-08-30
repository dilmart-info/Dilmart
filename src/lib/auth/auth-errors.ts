/**
 * Auth error taxonomy.
 *
 * The single most important distinction in the session lifecycle is:
 * a *definitive* failure means the refresh token is dead and the local session
 * must be destroyed; a *transient* failure means the device could not reach
 * Supabase and the session MUST be preserved.
 */

/** Secure storage plugin is unusable (locked keystore, missing plugin, OS error). */
export class AuthStorageUnavailableError extends Error {
  readonly cause?: unknown;

  constructor(message = "Secure auth storage is unavailable on this device.", cause?: unknown) {
    super(message);
    this.name = "AuthStorageUnavailableError";
    this.cause = cause;
  }
}

/** One-time install/migration bootstrap failed. Legacy data is intentionally preserved. */
export class StorageBootstrapError extends Error {
  readonly cause?: unknown;

  constructor(message = "Auth storage bootstrap failed.", cause?: unknown) {
    super(message);
    this.name = "StorageBootstrapError";
    this.cause = cause;
  }
}

/** Arabic (RTL) copy surfaced when auth storage cannot be initialised. */
export const AUTH_STORAGE_ERROR_TITLE_AR = "تعذّر الوصول إلى التخزين الآمن";
export const AUTH_STORAGE_ERROR_MESSAGE_AR =
  "لم نتمكن من فتح مخزن الجلسة المشفّر على جهازك. تأكد من فتح قفل الجهاز ثم أعد المحاولة.";
export const AUTH_STORAGE_ERROR_RETRY_AR = "إعادة المحاولة";

export function isAuthStorageError(error: unknown): error is AuthStorageUnavailableError | StorageBootstrapError {
  return error instanceof AuthStorageUnavailableError || error instanceof StorageBootstrapError;
}

function errorText(error: unknown): string {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  const candidate = error as { message?: unknown; error?: unknown; code?: unknown; name?: unknown };
  return [candidate.name, candidate.code, candidate.error, candidate.message]
    .filter((part) => typeof part === "string")
    .join(" ");
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { status?: unknown; statusCode?: unknown };
  const raw = candidate.status ?? candidate.statusCode;
  return typeof raw === "number" ? raw : null;
}

/**
 * Definitive: the refresh token itself is rejected/absent. Recovery is impossible
 * without re-authentication, so the local session must be cleared.
 */
export function isDefinitiveAuthFailure(error: unknown): boolean {
  if (!error) return false;
  if (isAuthStorageError(error)) return false;
  if (isTransientAuthFailure(error)) return false;

  const text = errorText(error).toLowerCase();
  const status = errorStatus(error);

  const definitivePatterns = [
    "refresh_token_not_found",
    "refresh token not found",
    "invalid refresh token",
    "refresh_token_already_used",
    "already used",
    "invalid_grant",
    "session_not_found",
    "session not found",
    "session expired",
    "user_not_found",
    "user not found",
    "user_banned",
    "token is expired",
    "jwt expired",
    "bad_jwt",
    "no_session",
  ];

  if (definitivePatterns.some((pattern) => text.includes(pattern))) return true;

  // Supabase auth surfaces dead refresh tokens as 400/401 from the token endpoint.
  return status === 400 || status === 401 || status === 403;
}

/**
 * Transient: network/connectivity/server-side hiccup. The session stays intact and
 * the app should retry later instead of logging the user out.
 */
export function isTransientAuthFailure(error: unknown): boolean {
  if (!error) return false;
  if (isAuthStorageError(error)) return false;

  const text = errorText(error).toLowerCase();
  const status = errorStatus(error);

  if (status !== null && (status === 408 || status === 429 || status >= 500)) return true;

  const transientPatterns = [
    "failed to fetch",
    "networkerror",
    "network error",
    "network request failed",
    "fetch failed",
    "load failed",
    "aborterror",
    "the operation was aborted",
    "request timeout",
    "timeout",
    "offline",
    "econnreset",
    "econnrefused",
    "enotfound",
    "etimedout",
    "socket hang up",
    "service unavailable",
    "gateway",
  ];

  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;

  return transientPatterns.some((pattern) => text.includes(pattern));
}
