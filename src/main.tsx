/**
 * Web entry — full marketplace + backoffice.
 * Capacitor must NOT use this entry; see main.mobile.tsx / vite.mobile.config.ts.
 */
import { createRoot } from "react-dom/client";
import WebApp from "./app/WebApp";
import "./index.css";
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
    <WebApp />
  </AppErrorBoundary>,
);
