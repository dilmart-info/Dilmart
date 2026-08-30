/**
 * STORE-PR6 §9/§10/§22 — native cold-start + warm-start Universal/App Link coordinator.
 *
 * Ordering (§3): register EXACTLY ONE `appUrlOpen` listener FIRST, then read `App.getLaunchUrl()` — so a
 * warm event arriving while a cold handoff is still processing is captured, not dropped. Both feed ONE
 * serialized queue (§2): different handoffs run deterministically A→B, and B does not redeem/establish until
 * A's full critical section (redeem → establish → auth-ready → navigate) finishes. Same handoff coalesces to
 * one redeem via the controller's single-flight. Navigation waits for AuthProvider `authenticated_ready`
 * (§6), and a definitive storage failure never navigates. HashRouter-correct internal navigation; off-native
 * this component no-ops.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isNative } from "@/lib/capacitor";
import { HandoffScreen } from "./HandoffScreen";
import { getStoreHandoffController } from "./store-handoff-instance";
import { useAwaitAuthReady } from "./use-handoff-auth-ready";
import type { HandoffUxState } from "./store-deep-link.types";

type PluginListenerHandleLike = { remove: () => Promise<void> };

export function StoreDeepLinkCoordinator() {
  const navigate = useNavigate();
  const awaitAuthReady = useAwaitAuthReady();
  const [uxState, setUxState] = useState<HandoffUxState | null>(null);

  useEffect(() => {
    if (!isNative()) return;
    let handle: PluginListenerHandleLike | null = null;
    let cancelled = false;
    // Serialized queue: each incoming URL runs only after the previous one's critical section completes.
    let queue: Promise<void> = Promise.resolve();

    const process = async (url: string | null | undefined) => {
      if (cancelled || !url) return;
      setUxState("processing");
      const result = await getStoreHandoffController().handle(url); // redeem + establish (single-flight/dedup)
      if (cancelled) return;
      if (result.state === "success") {
        // §2/§6 — wait for the NEW federated identity to be verified-ready (bound to this handoff's customer).
        const ready = await awaitAuthReady(result.customerId, result.identityEpoch);
        if (cancelled) return;
        if (ready !== "ready") {
          // §1 — timeout / storage_error / offline / not-ready NEVER navigate. storage_error is definitive
          // (unavailable); timeout/offline are transient (retryable). No protected target is rendered.
          setUxState(ready === "storage_error" ? "unavailable" : "retryable_error");
          return;
        }
        setUxState(null);
        navigate(result.target, { replace: true }); // HashRouter-correct internal target
        return;
      }
      setUxState(result.state);
    };

    const enqueue = (url: string | null | undefined) => {
      queue = queue.catch(() => undefined).then(() => process(url));
    };

    void (async () => {
      const { App } = await import("@capacitor/app");
      // 1) Register the warm listener FIRST (captures events that arrive during cold processing).
      const registered = (await App.addListener("appUrlOpen", (event: { url: string }) => {
        enqueue(event.url);
      })) as unknown as PluginListenerHandleLike;
      if (cancelled) {
        void registered.remove();
        return;
      }
      handle = registered;
      // 2) THEN read the cold launch URL and enqueue it into the SAME serialized queue.
      try {
        const launch = await App.getLaunchUrl();
        if (launch?.url) enqueue(launch.url);
      } catch {
        /* no launch url */
      }
    })().catch(() => {
      /* no App plugin → no native deep-link entry on this platform */
    });

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [navigate, awaitAuthReady]);

  if (uxState && uxState !== "success") {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <HandoffScreen
          state={uxState}
          onContinue={() => {
            setUxState(null);
            navigate("/", { replace: true });
          }}
        />
      </div>
    );
  }
  return null;
}
