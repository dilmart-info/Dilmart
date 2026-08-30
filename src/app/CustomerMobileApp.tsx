import { HashRouter, Routes } from "react-router-dom";
import { AppProviders } from "@/app/AppProviders";
import { getCustomerMobileRouteElements } from "@/app/CustomerRoutes";

/**
 * Native Capacitor customer app — HashRouter, customer routes only.
 * Forbidden backoffice paths resolve via getCustomerMobileRouteElements() → NotFound.
 */
export default function CustomerMobileApp() {
  return (
    <HashRouter>
      <AppProviders>
        <Routes>{getCustomerMobileRouteElements()}</Routes>
      </AppProviders>
    </HashRouter>
  );
}

