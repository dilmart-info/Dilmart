import { HashRouter, Routes } from "react-router-dom";
import { AppProviders } from "@/app/AppProviders";
import { getCustomerMobileRouteElements } from "@/app/CustomerRoutes";
import { NativeUrlCoordinator } from "@/lib/native/NativeUrlCoordinator";

/**
 * Native Capacitor customer app — HashRouter, customer routes only.
 * Forbidden backoffice paths resolve via getCustomerMobileRouteElements() → NotFound.
 */
export default function CustomerMobileApp() {
  return (
    <HashRouter>
      <NativeUrlCoordinator>
        <AppProviders>
          <Routes>{getCustomerMobileRouteElements()}</Routes>
        </AppProviders>
      </NativeUrlCoordinator>
    </HashRouter>
  );
}

