import { describe, expect, it } from "vitest";
import {
  AuthStorageUnavailableError,
  StorageBootstrapError,
  isAuthStorageError,
  isDefinitiveAuthFailure,
  isTransientAuthFailure,
} from "./auth-errors";

describe("auth error classification", () => {
  it("treats a dead refresh token as definitive", () => {
    expect(isDefinitiveAuthFailure(new Error("Invalid Refresh Token: Refresh Token Not Found"))).toBe(true);
    expect(isDefinitiveAuthFailure({ message: "invalid_grant", status: 400 })).toBe(true);
    expect(isDefinitiveAuthFailure({ message: "Session from session_id claim in JWT does not exist", status: 401 })).toBe(
      true,
    );
  });

  it("treats connectivity failures as transient, never definitive", () => {
    const networkError = new TypeError("Failed to fetch");
    expect(isTransientAuthFailure(networkError)).toBe(true);
    expect(isDefinitiveAuthFailure(networkError)).toBe(false);

    const timeout = new Error("Request timeout after 20000ms");
    expect(isTransientAuthFailure(timeout)).toBe(true);
    expect(isDefinitiveAuthFailure(timeout)).toBe(false);
  });

  it("treats 5xx and rate limiting as transient", () => {
    expect(isTransientAuthFailure({ status: 503, message: "Service Unavailable" })).toBe(true);
    expect(isTransientAuthFailure({ status: 429, message: "Too Many Requests" })).toBe(true);
    expect(isDefinitiveAuthFailure({ status: 503, message: "Service Unavailable" })).toBe(false);
  });

  it("never classifies storage errors as auth failures", () => {
    const storageError = new AuthStorageUnavailableError();
    expect(isAuthStorageError(storageError)).toBe(true);
    expect(isDefinitiveAuthFailure(storageError)).toBe(false);
    expect(isTransientAuthFailure(storageError)).toBe(false);

    const bootstrapError = new StorageBootstrapError();
    expect(isAuthStorageError(bootstrapError)).toBe(true);
    expect(isDefinitiveAuthFailure(bootstrapError)).toBe(false);
  });

  it("returns false for a missing error", () => {
    expect(isDefinitiveAuthFailure(null)).toBe(false);
    expect(isTransientAuthFailure(undefined)).toBe(false);
  });
});
