import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import {
  isScrollRestorationEligible,
  getScrollPosition,
  setScrollPosition,
} from "./route-scroll-rules";

/**
 * Coordinates route-aware scroll restoration for client-side navigation.
 *
 * Rules:
 * 1. Only saves and restores scroll positions for eligible listing routes (Home, Products, Categories, Wishlist, Stores, Brands, Offers).
 * 2. Never restores scroll on PDP (/product/*), auth, checkout, or backoffice.
 * 3. Handles asynchronous content arrival: when returning back to an eligible listing, if document height is not yet sufficient,
 *    it observes DOM size changes via ResizeObserver and polling up to 1.5 seconds.
 * 4. Cleans up all observers, animation frames, timers, and event listeners on unmount or route change.
 * 5. Isolates query parameters so different search or filter queries do not collide.
 */
export default function RouteScrollCoordinator() {
  const location = useLocation();
  const navType = useNavigationType(); // "POP" | "PUSH" | "REPLACE"

  const currentRouteKey = `${location.pathname}${location.search}`;
  const currentRouteKeyRef = useRef<string>(currentRouteKey);
  currentRouteKeyRef.current = currentRouteKey;

  // Active restoration tracking ref to clean up if route changes or unmounts
  const activeCleanupRef = useRef<(() => void) | null>(null);

  // 1. Save scroll position of the active eligible listing
  useEffect(() => {
    const handleScroll = () => {
      const activeKey = currentRouteKeyRef.current;
      const pathname = activeKey.split("?")[0];
      if (isScrollRestorationEligible(pathname)) {
        setScrollPosition(activeKey, window.scrollY);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  // 2. Handle route transition
  useEffect(() => {
    // Clean up any ongoing restoration attempt from previous route
    if (activeCleanupRef.current) {
      activeCleanupRef.current();
      activeCleanupRef.current = null;
    }

    const currentKey = `${location.pathname}${location.search}`;
    const pathname = location.pathname;

    if (navType === "POP" && isScrollRestorationEligible(pathname)) {
      const targetY = getScrollPosition(currentKey);

      if (typeof targetY === "number" && targetY > 0) {
        let isCancelled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let intervalId: ReturnType<typeof setInterval> | null = null;
        let rafId: number | null = null;
        let observer: ResizeObserver | null = null;
        let hasWindowResizeListener = false;

        const handleWindowResize = () => {
          attemptScroll();
        };

        const cleanup = () => {
          isCancelled = true;
          if (timeoutId !== null) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (intervalId !== null) {
            clearInterval(intervalId);
            intervalId = null;
          }
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          if (observer !== null) {
            observer.disconnect();
            observer = null;
          }
          if (hasWindowResizeListener) {
            window.removeEventListener("resize", handleWindowResize);
            hasWindowResizeListener = false;
          }
        };
        activeCleanupRef.current = cleanup;

        const attemptScroll = () => {
          if (isCancelled) return;

          const maxScroll = Math.max(
            0,
            document.documentElement.scrollHeight - window.innerHeight,
          );

          // If document is tall enough to reach at least 90% of targetY or within 50px
          if (maxScroll >= targetY - 50) {
            window.scrollTo({
              top: targetY,
              left: 0,
              behavior: "auto",
            });
            cleanup();
            if (activeCleanupRef.current === cleanup) {
              activeCleanupRef.current = null;
            }
          } else {
            // Scroll as far as currently possible while waiting for async content
            window.scrollTo({
              top: Math.min(targetY, maxScroll),
              left: 0,
              behavior: "auto",
            });
          }
        };

        // Try immediately via rAF
        rafId = requestAnimationFrame(() => {
          attemptScroll();

          if (!isCancelled) {
            // Setup ResizeObserver on document body to catch async content arrival
            if (typeof ResizeObserver !== "undefined") {
              observer = new ResizeObserver(() => {
                attemptScroll();
              });
              if (document.body) {
                observer.observe(document.body);
              }
            }

            // Window resize listener
            window.addEventListener("resize", handleWindowResize);
            hasWindowResizeListener = true;

            // Bounded polling every 50ms
            intervalId = setInterval(() => {
              attemptScroll();
            }, 50);

            // Hard timeout: stop trying after 1.5 seconds to prevent unbounded execution
            timeoutId = setTimeout(() => {
              cleanup();
              if (activeCleanupRef.current === cleanup) {
                activeCleanupRef.current = null;
              }
            }, 1500);
          }
        });
      }
    }

    return () => {
      if (activeCleanupRef.current) {
        activeCleanupRef.current();
        activeCleanupRef.current = null;
      }
    };
  }, [location.pathname, location.search, navType]);

  return null;
}
