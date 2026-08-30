/**
 * STORE-PR6 §12/§13 — the WEB /open landing. The browser arrives at
 * https://store.DilMart.org/open?code=…&state=… ; this page captures the params, IMMEDIATELY scrubs them
 * from the visible URL, redeems with platform="web" (cookie mode, PR5-owned), establishes the PR5 federated
 * session, and navigates to the validated target with replace semantics. code/state never reach storage,
 * analytics, logs, or React Query keys.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HandoffScreen } from "@/lib/deep-link/HandoffScreen";
import { getStoreHandoffController } from "@/lib/deep-link/store-handoff-instance";
import { parseHandoffQuery } from "@/lib/deep-link/store-open-url";
import { useAwaitAuthReady } from "@/lib/deep-link/use-handoff-auth-ready";
import type { HandoffUxState } from "@/lib/deep-link/store-deep-link.types";

export default function OpenHandoff() {
  const navigate = useNavigate();
  const awaitAuthReady = useAwaitAuthReady();
  const [state, setState] = useState<HandoffUxState>("processing");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // handle exactly once per mount
    ranRef.current = true;

    // Pass the RAW search string (not URLSearchParams) so malformed percent-encoding is caught (§4).
    const search = typeof window !== "undefined" ? window.location.search : "";
    // Scrub the one-time parameters from the visible address bar BEFORE anything else.
    try {
      window.history.replaceState(null, "", "/open");
    } catch {
      /* ignore */
    }

    const parsed = parseHandoffQuery(search);
    if (!parsed.ok) {
      setState("invalid");
      return;
    }

    let cancelled = false;
    void getStoreHandoffController()
      .handleParams(parsed.params)
      .then(async (result) => {
        if (cancelled) return;
        if (result.state !== "success") {
          setState(result.state);
          return;
        }
        // §2/§6 — the PR5 session is established; wait for the NEW federated identity to be verified-ready
        // (bound to this handoff's customer) BEFORE navigating.
        const ready = await awaitAuthReady(result.customerId, result.identityEpoch);
        if (cancelled) return;
        if (ready !== "ready") {
          // §1 — timeout / storage_error / offline / not-ready NEVER navigate. storage_error is definitive
          // (unavailable); timeout/offline are transient (retryable). No protected target is rendered.
          setState(ready === "storage_error" ? "unavailable" : "retryable_error");
          return;
        }
        navigate(result.target, { replace: true });
      })
      .catch(() => {
        if (!cancelled) setState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, awaitAuthReady]);

  return <HandoffScreen state={state} onContinue={() => navigate("/", { replace: true })} />;
}
