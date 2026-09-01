import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { clearMerchantManifestLinks, initMerchantPwa } from "@/lib/merchant-push";

/**
 * Merchant-route-only PWA initializer.
 * Attaches merchant manifest + scoped service worker under /merchant.
 */
export function MerchantPwaBootstrap() {
  const location = useLocation();

  useEffect(() => {
    const onMerchant =
      location.pathname === "/merchant" || location.pathname.startsWith("/merchant/");
    if (!onMerchant) {
      clearMerchantManifestLinks();
      return;
    }
    void initMerchantPwa();
  }, [location.pathname]);

  return null;
}

export default MerchantPwaBootstrap;
