/**
 * Wraps the app with Capacitor-specific behavior:
 * - Offline detection for the full-screen overlay (Network plugin)
 * - External link interception (Browser plugin)
 * - Android back button handling
 *
 * Auth lifecycle is NOT handled here. AuthProvider owns the single
 * `appStateChange` listener and the auth-side `networkStatusChange` handling;
 * duplicating them here would double-trigger token refreshes.
 */

import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { isNative, shouldOpenExternally, openExternal } from "@/lib/capacitor";
import OfflineScreen from "./OfflineScreen";

interface Props {
  children: React.ReactNode;
}

const CapacitorAppWrapper = ({ children }: Props) => {
  const [offline, setOffline] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleRetry = useCallback(() => {
    setOffline(false);
    window.location.reload();
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | null = null;

    let cancelled = false;

    const setupNetwork = async () => {
      const { Network } = await import("@capacitor/network");
      const s = await Network.getStatus();
      if (cancelled) return;
      setOffline(!s.connected);
      const registered = await Network.addListener("networkStatusChange", (st) => setOffline(!st.connected));
      if (cancelled) {
        void registered.remove();
        return;
      }
      handle = registered;
    };
    void setupNetwork();
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, []);

  useEffect(() => {
    if (!isNative()) return;

    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest("a[href]");
      if (!target) return;
      const a = target as HTMLAnchorElement;
      const href = a.getAttribute("href");
      if (!href) return;
      if (shouldOpenExternally(href)) {
        e.preventDefault();
        e.stopPropagation();
        openExternal(href);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  useEffect(() => {
    if (!isNative()) return;
    let handle: { remove: () => Promise<void> } | null = null;

    const setupBack = async () => {
      const { App } = await import("@capacitor/app");
      handle = await App.addListener("backButton", () => {
        if (location.pathname === "/" || !document.referrer) {
          App.exitApp();
        } else {
          navigate(-1);
        }
      });
    };
    setupBack();
    return () => {
      void handle?.remove();
    };
  }, [navigate, location.pathname]);

  return (
    <>
      {children}
      {offline && <OfflineScreen onRetry={handleRetry} />}
    </>
  );
};

export default CapacitorAppWrapper;
