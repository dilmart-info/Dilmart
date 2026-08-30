/**
 * Capacitor / native customer entry — customer surface only.
 * Built via vite.mobile.config.ts → dist-mobile.
 * Must never import WebApp or WebBackofficeRoutes.
 */
import { createRoot } from "react-dom/client";
import CustomerMobileApp from "./app/CustomerMobileApp";
import "./index.css";
import { Capacitor } from "@capacitor/core";
import { restoreMarketplaceQueryCache, setupMarketplaceQueryPersistence } from "./lib/query-client";
import { AppErrorBoundary } from "./components/AppErrorBoundary";

restoreMarketplaceQueryCache();
setupMarketplaceQueryPersistence();

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  const key = "DilMart:vite-preload-reload-attempted";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }
});

const root = createRoot(document.getElementById("root")!);
root.render(
  <AppErrorBoundary>
    <CustomerMobileApp />
  </AppErrorBoundary>,
);

if (Capacitor.isNativePlatform()) {
  import("@capacitor/splash-screen").then(({ SplashScreen }) => {
    requestAnimationFrame(() => {
      setTimeout(() => SplashScreen.hide({ fadeOutDuration: 300 }), 100);
    });
  });
}
