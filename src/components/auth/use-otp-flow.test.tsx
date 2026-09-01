import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOtpFlow, type OtpChannel } from "./useOtpFlow";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  },
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useOtpFlow — OTP Channel Contract & Invariants", () => {
  const requestCode = vi.fn();
  const verifyCode = vi.fn();
  const onVerified = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    requestCode.mockResolvedValue(undefined);
    verifyCode.mockResolvedValue({
      session: { access_token: "test-token", user: { id: "user-123" } },
      user: { id: "user-123" },
    });
    mockGetAuthContext.mockResolvedValue({ activeRole: "customer" });
  });

  it("enforces email-only when allowedChannels = ['email'] and sends email OTP", async () => {
    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["email"],
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.channel).toBe("email");

    act(() => {
      result.current.setIdentifier("test@example.com");
    });

    await act(async () => {
      const ok = await result.current.submitIdentifier();
      expect(ok).toBe(true);
    });

    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(requestCode).toHaveBeenCalledWith("test@example.com", "email");
  });

  it("enforces phone-only when allowedChannels = ['phone'] and sends phone OTP", async () => {
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

    expect(result.current.channel).toBe("phone");

    act(() => {
      result.current.setIdentifier("+9647701234567");
    });

    await act(async () => {
      const ok = await result.current.submitIdentifier();
      expect(ok).toBe(true);
    });

    expect(requestCode).toHaveBeenCalledTimes(1);
    expect(requestCode).toHaveBeenCalledWith("+9647701234567", "phone");
  });

  it("allows switching channel when both are allowed and respects selected channel", async () => {
    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["phone", "email"],
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.channel).toBe("phone");

    act(() => {
      result.current.setChannel("email");
      result.current.setIdentifier("user@dilmart.com");
    });

    expect(result.current.channel).toBe("email");

    await act(async () => {
      await result.current.submitIdentifier();
    });

    expect(requestCode).toHaveBeenCalledWith("user@dilmart.com", "email");
  });

  it("cannot retain a forbidden phone channel when allowedChannels transitions to ['email']", async () => {
    let allowed: OtpChannel[] = ["phone", "email"];

    const { result, rerender } = renderHook(
      ({ channels }: { channels: OtpChannel[] }) =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: channels,
        }),
      {
        wrapper: createWrapper(),
        initialProps: { channels: allowed },
      }
    );

    expect(result.current.channel).toBe("phone");

    // Simulate switching from Login to Register where phone registration is disabled
    allowed = ["email"];
    rerender({ channels: allowed });

    // Effective channel must immediately be email
    expect(result.current.channel).toBe("email");

    act(() => {
      result.current.setIdentifier("registered@dilmart.com");
    });

    await act(async () => {
      await result.current.submitIdentifier();
    });

    // Verification: never sends phone
    expect(requestCode).toHaveBeenCalledWith("registered@dilmart.com", "email");
  });

  it("verifyCode uses the exact channel that actually sent the code even if channel state changed", async () => {
    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["phone", "email"],
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setChannel("phone");
      result.current.setIdentifier("+9647701234567");
    });

    await act(async () => {
      await result.current.submitIdentifier();
    });

    expect(requestCode).toHaveBeenCalledWith("+9647701234567", "phone");
    expect(result.current.step).toBe("code");

    // Enter code and submit
    act(() => {
      result.current.setCode("123456");
    });

    await act(async () => {
      await result.current.submitCode();
    });

    expect(verifyCode).toHaveBeenCalledWith("+9647701234567", "phone", "123456");
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it("resend uses the same effective channel that originally sent the code", async () => {
    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["email"],
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setIdentifier("resend@example.com");
    });

    await act(async () => {
      await result.current.submitIdentifier();
    });

    expect(requestCode).toHaveBeenCalledWith("resend@example.com", "email");

    await act(async () => {
      await result.current.resend();
    });

    expect(requestCode).toHaveBeenLastCalledWith("resend@example.com", "email");
  });

  it("propagates error when requestCode rejects and does not advance step", async () => {
    requestCode.mockRejectedValueOnce(new Error("Network failure"));

    const { result } = renderHook(
      () =>
        useOtpFlow({
          requestCode,
          verifyCode,
          onVerified,
          allowedChannels: ["email"],
        }),
      { wrapper: createWrapper() }
    );

    act(() => {
      result.current.setIdentifier("error@example.com");
    });

    await expect(
      act(async () => {
        await result.current.submitIdentifier();
      })
    ).rejects.toThrow("Network failure");

    expect(result.current.step).toBe("identifier");
  });
});
