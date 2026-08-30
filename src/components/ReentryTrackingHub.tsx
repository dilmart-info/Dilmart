import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { captureReentrySource, trackReentryLinkOpened } from "@/lib/growth-hooks";

/** M2.9 foundation-only re-entry tracking. Non-blocking and attribution-light. */
export default function ReentryTrackingHub() {
  const location = useLocation();

  useEffect(() => {
    captureReentrySource({
      path: location.pathname,
      search: location.search,
      referrer: document.referrer || undefined,
    });
  }, [location.pathname, location.search]);

  useEffect(() => {
    trackReentryLinkOpened(location.pathname, "router_navigation");
  }, [location.pathname]);

  return null;
}
