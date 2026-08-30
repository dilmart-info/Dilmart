import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProviders } from "@/app/AppProviders";
import { getCustomerRouteElements } from "@/app/CustomerRoutes";
import { getWebBackofficeRouteElements } from "@/app/WebBackofficeRoutes";
import NotFound from "@/pages/NotFound";

/**
 * Full Web SPA: customer marketplace + admin/merchant/agent backoffice.
 * Uses BrowserRouter (real paths). Never used as Capacitor webDir entry.
 */
export default function WebApp() {
  return (
    <BrowserRouter>
      <AppProviders withCapacitorChrome>
        <Routes>
          {getCustomerRouteElements()}
          {getWebBackofficeRouteElements()}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppProviders>
    </BrowserRouter>
  );
}
