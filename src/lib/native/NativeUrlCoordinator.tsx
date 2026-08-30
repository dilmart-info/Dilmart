import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { resolveInternalRouteFromUrl } from "./native-url-handler";

/**
 * Listens for native Capacitor `appUrlOpen` events and routes approved marketplace deep-links.
 */
export const NativeUrlCoordinator: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let isSubscribed = true;

    const listenerPromise = App.addListener("appUrlOpen", (data) => {
      if (!isSubscribed) return;
      const targetRoute = resolveInternalRouteFromUrl(data?.url);
      if (targetRoute) {
        navigate(targetRoute);
      }
    });

    return () => {
      isSubscribed = false;
      listenerPromise.then((handle) => handle.remove()).catch(() => {});
    };
  }, [navigate]);

  return <>{children}</>;
};
