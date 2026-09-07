import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useOtpFlow, type OtpVerificationCompletion } from "./useOtpFlow";
import { apiClient } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAuthContext: vi.fn(),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useOtpFlow — Upgraded Context Contract & Reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    expires_in: 3600,
    token_type: "bearer",
    user: { id: "user-123", email: null, phone: "+9647701234567" },
  };

  const mockAuthContext = {
    user: { id: "user-123", email: null, phone: "+9647701234567" },
    profile: { id: "user-123", role: "customer", full_name: "علي كريم", email: null, phone: "07701234567", address: null, points: 0 },
    roles: ["customer"],
    activeRole: "customer",
    merchant: null,
  };

  it("fetches auth context and passes OtpVerificationCompletion to onVerified", async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const verifyCode = vi.fn().mockResolvedValue({
      session: mockSession,
      user: mockSession.user,
    });
    const onVerified = vi.fn();
    vi.mocked(apiClient.getAuthContext).mockResolvedValue(mockAuthContext as any);

    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["phone"],
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setIdentifier("07701234567");
    });

    await act(async () => {
      await result.current.submitIdentifier();
    });

    expect(result.current.step).toBe("code");

    act(() => {
      result.current.setCode("123456");
    });

    await act(async () => {
      const success = await result.current.submitCode();
      expect(success).toBe(true);
    });

    expect(verifyCode).toHaveBeenCalledWith("07701234567", "phone", "123456");
    expect(apiClient.getAuthContext).toHaveBeenCalledTimes(1);
    expect(apiClient.getAuthContext).toHaveBeenCalledWith("mock-access-token");
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(onVerified).toHaveBeenCalledWith({
      signInResult: { session: mockSession, user: mockSession.user },
      authContext: mockAuthContext,
    });
    expect(result.current.contextError).toBeNull();
  });

  it("retains session and exposes context-retry when getAuthContext fails after OTP verification", async () => {
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const verifyCode = vi.fn().mockResolvedValue({
      session: mockSession,
      user: mockSession.user,
    });
    const onVerified = vi.fn();
    vi.mocked(apiClient.getAuthContext).mockRejectedValueOnce(new Error("Network timeout loading profile"));

    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["phone"],
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setIdentifier("07701234567");
    });

    await act(async () => {
      await result.current.submitIdentifier();
    });

    act(() => {
      result.current.setCode("123456");
    });

    await act(async () => {
      const success = await result.current.submitCode();
      expect(success).toBe(false);
    });

    // Session is verified, but context failed: onVerified must NOT be called yet
    expect(verifyCode).toHaveBeenCalledTimes(1);
    expect(onVerified).not.toHaveBeenCalled();
    expect(result.current.contextError).not.toBeNull();
    expect(result.current.contextError?.signInResult.session.user.id).toBe("user-123");
    expect(result.current.contextError?.message).toContain("Network timeout");

    // Now retry context fetch: it must NOT call requestCode or verifyCode again
    vi.mocked(apiClient.getAuthContext).mockResolvedValueOnce(mockAuthContext as any);

    await act(async () => {
      const retrySuccess = await result.current.retryContextFetch();
      expect(retrySuccess).toBe(true);
    });

    expect(verifyCode).toHaveBeenCalledTimes(1); // STILL 1!
    expect(requestCode).toHaveBeenCalledTimes(1); // STILL 1!
    expect(apiClient.getAuthContext).toHaveBeenCalledTimes(2);
    expect(onVerified).toHaveBeenCalledTimes(1);
    expect(result.current.contextError).toBeNull();
  });

  it("guards against in-flight double submission", async () => {
    let resolveVerify: (val: any) => void;
    const verifyCode = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveVerify = resolve;
        })
    );
    const requestCode = vi.fn().mockResolvedValue(undefined);
    const onVerified = vi.fn();
    vi.mocked(apiClient.getAuthContext).mockResolvedValue(mockAuthContext as any);

    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["phone"],
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setIdentifier("07701234567");
    });
    await act(async () => {
      await result.current.submitIdentifier();
    });

    act(() => {
      result.current.setCode("123456");
    });

    // Fire first submit
    let firstCall: Promise<boolean>;
    act(() => {
      firstCall = result.current.submitCode();
    });

    expect(result.current.pending).toBe(true);

    // Fire concurrent duplicate submit
    let secondCallResult: boolean | undefined;
    act(() => {
      result.current.submitCode().then((res) => {
        secondCallResult = res;
      });
    });

    // Resolve the first call
    await act(async () => {
      resolveVerify!({ session: mockSession, user: mockSession.user });
      await firstCall;
    });

    expect(verifyCode).toHaveBeenCalledTimes(1);
    expect(secondCallResult).toBe(false);
  });
});
