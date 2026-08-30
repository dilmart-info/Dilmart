import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { SignInResult } from "@/lib/auth/auth-actions";

export type OtpChannel = "phone" | "email";
export type OtpStep = "identifier" | "code";

const RESEND_SECONDS = 60;

/**
 * The shared half of every OTP screen: step state, the resend countdown, single-flight
 * submission, and the auth-context refresh that has to happen after a session appears.
 *
 * Login, registration and password reset all differ only in which request/verify pair they
 * hand in, so they share this instead of each growing their own copy.
 */
export function useOtpFlow(options: {
  requestCode: (identifier: string, channel: OtpChannel) => Promise<void>;
  verifyCode: (identifier: string, channel: OtpChannel, code: string) => Promise<SignInResult>;
  onVerified: (result: SignInResult) => void | Promise<void>;
}) {
  const { requestCode, verifyCode, onVerified } = options;
  const queryClient = useQueryClient();

  const [step, setStep] = useState<OtpStep>("identifier");
  const [channel, setChannel] = useState<OtpChannel>("phone");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Guards a double click or an Enter keypress landing while a request is in flight.
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearInterval(timer.current);
    };
  }, []);

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
  const submitIdentifier = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    try {
      await requestCode(identifier, channel);
      setStep("code");
      setCode("");
      startResendCountdown();
      return true;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [channel, identifier, requestCode, startResendCountdown]);

  const resend = useCallback(async (): Promise<boolean> => {
    if (resendIn > 0 || inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    try {
      await requestCode(identifier, channel);
      startResendCountdown();
      return true;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [channel, identifier, requestCode, resendIn, startResendCountdown]);

  const submitCode = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    try {
      const result = await verifyCode(identifier, channel, code);

      // A fresh session means the cached auth context belongs to somebody else. Drop it
      // and fetch for the new user before anything renders, so no unauthenticated frame
      // is shown between verification and redirect.
      queryClient.removeQueries({ queryKey: ["auth-context"] });
      await queryClient.fetchQuery({
        queryKey: ["auth-context", result.session.user.id],
        queryFn: () => apiClient.getAuthContext(result.session.access_token),
        staleTime: 0,
      });
      await queryClient.invalidateQueries({ queryKey: ["auth-context"] });

      await onVerified(result);
      return true;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, [channel, code, identifier, onVerified, queryClient, verifyCode]);

  const changeIdentifier = useCallback(() => {
    setStep("identifier");
    setCode("");
    setResendIn(0);
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  return {
    step,
    channel,
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
  };
}
