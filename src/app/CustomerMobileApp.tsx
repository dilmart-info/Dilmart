import { HashRouter, Routes } from "react-router-dom";
import { AppProviders } from "@/app/AppProviders";
import { getCustomerMobileRouteElements } from "@/app/CustomerRoutes";
import { StoreDeepLinkCoordinator } from "@/lib/deep-link/StoreDeepLinkCoordinator";

/**
 * Native Capacitor customer app — HashRouter, customer routes only.
 * Forbidden backoffice paths resolve via getCustomerMobileRouteElements() → NotFound.
 * STORE-PR6: the deep-link coordinator (native cold/warm Universal-Link handling) is mounted inside the
 * router so it can navigate the validated internal target; it no-ops off-native.
 */
export default function CustomerMobileApp() {
  return (
    <HashRouter>
      <AppProviders>
        <StoreDeepLinkCoordinator />
        <Routes>{getCustomerMobileRouteElements()}</Routes>
      </AppProviders>
    </HashRouter>
  );
}
