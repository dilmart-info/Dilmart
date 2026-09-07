import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { SignInResult } from "@/lib/auth/auth-actions";
import type { AuthContextResponse } from "@/lib/auth-context-contract";

export type OtpChannel = "phone" | "email";
export type OtpStep = "identifier" | "code";

export interface OtpVerificationCompletion {
  signInResult: SignInResult;
  authContext: AuthContextResponse;
}

export interface OtpContextLoadError {
  signInResult: SignInResult;
  message: string;
}

const RESEND_SECONDS = 60;

/**
 * The shared half of every OTP screen: step state, the resend countdown, single-flight
 * submission, canonical auth-context fetch, and deterministic completion handoff.
 *
 * Guaranteed Invariants:
 *  - The channel exposed to UI === channel sent to requestCode === channel sent to verifyCode.
 *  - Allowed channels are enforced so hook state never drifts to a forbidden channel.
 *  - Verification fetches canonical auth context exactly once and hands it directly to onVerified.
 *  - If context fetch fails after session issuance, session is retained and a context-only retry is provided.
 */
export function useOtpFlow(options: {
  requestCode: (identifier: string, channel: OtpChannel) => Promise<void>;
  verifyCode: (identifier: string, channel: OtpChannel, code: string) => Promise<SignInResult>;
  onVerified: (completion: OtpVerificationCompletion) => void | Promise<void>;
  allowedChannels?: OtpChannel[];
  initialChannel?: OtpChannel;
}) {
  const { requestCode, verifyCode, onVerified, allowedChannels, initialChannel } = options;
  const queryClient = useQueryClient();

  const defaultInitial = useMemo<OtpChannel>(() => {
    if (initialChannel && (!allowedChannels || allowedChannels.includes(initialChannel))) {
      return initialChannel;
    }
    if (allowedChannels && allowedChannels.length > 0) {
      return allowedChannels[0];
    }
    return "phone";
  }, [allowedChannels, initialChannel]);

  const [step, setStep] = useState<OtpStep>("identifier");
  const [channelState, setChannelState] = useState<OtpChannel>(defaultInitial);
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [contextError, setContextError] = useState<OtpContextLoadError | null>(null);

  // Computes the effective channel by enforcing allowedChannels constraints
  const effectiveChannel: OtpChannel = useMemo(() => {
    if (!allowedChannels || allowedChannels.length === 0) {
      return channelState;
    }
    return allowedChannels.includes(channelState) ? channelState : allowedChannels[0];
  }, [allowedChannels, channelState]);

  // Tracks the exact channel that successfully sent the code so verification matches it
  const lastSentChannel = useRef<OtpChannel | null>(null);

  // Guards a double click or an Enter keypress landing while a request is in flight.
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, []);

  const setChannel = useCallback(
    (nextChannel: OtpChannel) => {
      if (allowedChannels && allowedChannels.length > 0 && !allowedChannels.includes(nextChannel)) {
        return;
      }
      setChannelState(nextChannel);
    },
    [allowedChannels]
  );

  const startResendCountdown = useCallback((seconds = RESEND_SECONDS) => {
    setResendIn(seconds);
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = window.setInterval(() => {
      setResendIn((previous) => {
        if (previous <= 1) {
          if (timer.current !== null) window.clearInterval(timer.current);
          timer.current = null;
          return 0;
        }
        return previous - 1;
      });
    }, 1000);
  }, []);

  /** Resolves true only when the code was actually accepted for sending. */
  const submitIdentifier = useCallback(
    async (targetChannel?: OtpChannel): Promise<boolean> => {
      if (inFlight.current) return false;
      const chosenChannel =
        targetChannel && (!allowedChannels || allowedChannels.includes(targetChannel))
          ? targetChannel
          : effectiveChannel;

      inFlight.current = true;
      setPending(true);
      try {
        await requestCode(identifier, chosenChannel);
        lastSentChannel.current = chosenChannel;
        setStep("code");
        setCode("");
        setContextError(null);
        startResendCountdown();
        return true;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [allowedChannels, effectiveChannel, identifier, requestCode, startResendCountdown]
  );

  const resend = useCallback(async (): Promise<boolean> => {
    if (resendIn > 0 || inFlight.current) return false;
    const chosenChannel = lastSentChannel.current ?? effectiveChannel;
    inFlight.current = true;
    setPending(true);
    try {
      await requestCode(identifier, chosenChannel);
      startResendCountdown();
      return true;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [effectiveChannel, identifier, requestCode, resendIn, startResendCountdown]);

  const submitCode = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    const chosenChannel = lastSentChannel.current ?? effectiveChannel;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await verifyCode(identifier, chosenChannel, code);

      // A fresh session means the cached auth context belongs to somebody else. Drop it
      // and fetch for the new user before anything renders, so no unauthenticated frame
      // is shown between verification and redirect.
      queryClient.removeQueries({ queryKey: ["auth-context"] });
      let authContext: AuthContextResponse;
      try {
        authContext = await queryClient.fetchQuery({
          queryKey: ["auth-context", result.session.user.id],
          queryFn: () => apiClient.getAuthContext(result.session.access_token),
          staleTime: 0,
        });
        await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
        setContextError(null);
      } catch (err: any) {
        const message = err?.message || "تعذر تحميل بيانات الحساب بعد التحقق من الرمز";
        setContextError({ signInResult: result, message });
        return false;
      }

      await onVerified({ signInResult: result, authContext });
      return true;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [code, effectiveChannel, identifier, onVerified, queryClient, verifyCode]);

  /** Retries context fetch only when context loading previously failed after valid session */
  const retryContextFetch = useCallback(async (): Promise<boolean> => {
    if (!contextError || inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    try {
      const { signInResult } = contextError;
      queryClient.removeQueries({ queryKey: ["auth-context"] });
      const authContext = await queryClient.fetchQuery({
        queryKey: ["auth-context", signInResult.session.user.id],
        queryFn: () => apiClient.getAuthContext(signInResult.session.access_token),
        staleTime: 0,
      });
      await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
      setContextError(null);
      await onVerified({ signInResult, authContext });
      return true;
    } catch (err: any) {
      const message = err?.message || "تعذر تحميل بيانات الحساب";
      setContextError((prev) => (prev ? { ...prev, message } : null));
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [contextError, onVerified, queryClient]);

  const changeIdentifier = useCallback(() => {
    setStep("identifier");
    setCode("");
    setResendIn(0);
    setContextError(null);
    lastSentChannel.current = null;
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  return {
    step,
    channel: effectiveChannel,
    setChannel,
    identifier,
    setIdentifier,
    code,
    setCode,
    pending,
    resendIn,
    submitIdentifier,
    submitCode,
    resend,
    changeIdentifier,
    contextError,
    retryContextFetch,
  };
}
