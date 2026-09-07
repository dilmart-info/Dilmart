import { describe, expect, it } from "vitest";
import {
  AuthStorageUnavailableError,
  StorageBootstrapError,
  isAuthStorageError,
  isDefinitiveAuthFailure,
  isTransientAuthFailure,
  classifyOtpError,
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

describe("classifyOtpError", () => {
  it("classifies HTTP 429 and rate limit messages as rate_limit", () => {
    expect(classifyOtpError({ status: 429, message: "Too Many Requests" })).toBe("rate_limit");
    expect(classifyOtpError(new Error("Too many requests, please wait before retrying"))).toBe("rate_limit");
    expect(classifyOtpError({ message: "rate_limit_exceeded" })).toBe("rate_limit");
    expect(classifyOtpError({ status: 429 })).toBe("rate_limit");
  });

  it("classifies connectivity and timeout failures as network", () => {
    expect(classifyOtpError(new Error("Request timeout after 15000ms"))).toBe("network");
    expect(classifyOtpError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyOtpError(new Error("network error"))).toBe("network");
    expect(classifyOtpError({ message: "econnreset" })).toBe("network");
  });

  it("classifies 5xx and server errors as provider_error", () => {
    expect(classifyOtpError({ status: 500, message: "Internal Server Error" })).toBe("provider_error");
    expect(classifyOtpError({ status: 502, message: "Bad Gateway" })).toBe("provider_error");
    expect(classifyOtpError(new Error("Meta provider upstream failure"))).toBe("provider_error");
  });

  it("classifies 401 and 403 as unauthorized", () => {
    expect(classifyOtpError({ status: 401, message: "Unauthorized" })).toBe("unauthorized");
    expect(classifyOtpError({ status: 403, message: "Forbidden" })).toBe("unauthorized");
    expect(classifyOtpError(new Error("unauthorized request"))).toBe("unauthorized");
  });

  it("classifies bad or expired OTP code as invalid_code", () => {
    expect(classifyOtpError(new Error("Token has expired or is invalid"))).toBe("invalid_code");
    expect(classifyOtpError(new Error("otp_expired"))).toBe("invalid_code");
    expect(classifyOtpError(new Error("رمز التحقق غير صحيح"))).toBe("invalid_code");
    expect(classifyOtpError(new Error("bad_code"))).toBe("invalid_code");
  });

  it("classifies invalid phone format as invalid_identifier", () => {
    expect(classifyOtpError(new Error("Invalid phone format"))).toBe("invalid_identifier");
    expect(classifyOtpError(new Error("البريد الإلكتروني غير صالح"))).toBe("invalid_identifier");
  });

  it("returns only the safe category literal and never leaks raw error text, tokens, or phone numbers", () => {
    const rawLeak = "Bearer secret-token-xyz-12345 phone:07701234567";
    const sensitiveError = new Error(`429 ${rawLeak}`);
    const category = classifyOtpError(sensitiveError);

    expect(category).toBe("rate_limit");
    expect(category).not.toContain("secret-token");
    expect(category).not.toContain("07701234567");
    expect(category).not.toContain("Bearer");

    const allowedCategories = [
      "rate_limit",
      "network",
      "invalid_code",
      "invalid_identifier",
      "provider_error",
      "unauthorized",
      "unknown",
    ];
    expect(allowedCategories).toContain(category);
  });
});

