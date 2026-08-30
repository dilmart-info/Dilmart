import { useEffect, useMemo, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import ProductCard from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient } from "@/lib/api-client";
import type { MarketplaceStorefrontProductsResult } from "@/lib/marketplace-storefront.types";
import {
  HOME_DISCOVERY_PAGE_SIZE,
  HOME_DISCOVERY_SORT,
  buildDiscoveryList,
  buildHomeDiscoveryQueryKey,
  getNextDiscoveryOffset,
} from "@/lib/home-discovery";

type HomeDiscoveryFeedProps = {
  /** Product ids already shown in curated home sections — deduped out of the feed so nothing repeats. */
  curatedProductIds?: string[];
};

/** Grid matches the store product grid: 2 cols mobile, 3 tablet, 4 desktop. */
const DISCOVERY_GRID_CLASS = "grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 lg:gap-5";

function DiscoveryGridSkeleton() {
  return (
    <div className={DISCOVERY_GRID_CLASS} aria-busy="true" aria-label="جاري التحميل">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl bg-muted/35" />
      ))}
    </div>
  );
}

/**
 * "اكتشف المزيد" — the continuous, progressively-loaded discovery feed at the bottom of Home.
 *
 * Reuses the canonical `GET /marketplace/products` listing (identical public visibility rules as
 * `/products`) via `useInfiniteQuery`, 24 products per batch. Auto-loads the next batch when a
 * sentinel scrolls into view, with an accessible "تحميل المزيد" button as a guaranteed fallback.
 * Failures never break the rest of Home: the first-page error is inline+retry, later-page errors keep
 * every already-loaded product and only show a retry at the bottom.
 */
export default function HomeDiscoveryFeed({ curatedProductIds = [] }: HomeDiscoveryFeedProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // React state (`isFetchingNextPage`) only updates on the next render, so a burst of synchronous
  // intersection callbacks within the same tick (fast scroll) would all read the same stale
  // "not fetching" value and could all call fetchNextPage(). This plain ref is set the instant a
  // fetch starts, closing that window regardless of render timing.
  const isFetchingNextRef = useRef(false);

  const {
    data,
    isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: buildHomeDiscoveryQueryKey({ sort: HOME_DISCOVERY_SORT }),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiClient.getMarketplaceProducts({
        offset: pageParam as number,
        limit: HOME_DISCOVERY_PAGE_SIZE,
        sort: HOME_DISCOVERY_SORT,
      }),
    getNextPageParam: (lastPage: MarketplaceStorefrontProductsResult) => getNextDiscoveryOffset(lastPage),
  });

  // Curated ids can be a fresh array each render; memoize the render list on stable inputs only.
  const curatedKey = curatedProductIds.join(",");
  const products = useMemo(
    () => buildDiscoveryList(data?.pages ?? [], curatedProductIds),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- curatedKey is the stable projection of curatedProductIds
    [data?.pages, curatedKey],
  );

  // Explicit state derivation (see home-discovery.ts + this component's own doc comment for the
  // dead-end bug this replaced): pagination reachability must depend on whether the SERVER has more
  // pages (`hasNextPage`, computed from raw totals — unaffected by dedupe), never on whether
  // dedupe/curated-filtering happened to leave zero VISIBLE products on the pages fetched so far.
  const hasAnyProducts = products.length > 0;
  // True once at least one page has ever resolved successfully — even if every item on it was
  // deduped away. This is what distinguishes "first request itself failed" from "a later page
  // failed after some page (possibly all-deduped) already succeeded".
  const hasLoadedAnyPage = (data?.pages.length ?? 0) > 0;

  const isInitialLoading = isLoading;
  const showFirstPageError = isError && !hasLoadedAnyPage;
  // Any failure once at least one page has ever loaded — regardless of whether that page produced
  // visible cards — is a "next page" failure: earlier successful pages (however few cards they
  // rendered) must stay on screen, and retry must re-fetch only the failed page, not restart.
  const showNextPageError = isError && hasLoadedAnyPage && !isFetchingNextPage;
  const showPaginationControls = hasNextPage && !showFirstPageError;
  const showLoadMoreButton = showPaginationControls && !isFetchingNextPage && !showNextPageError;
  // Clean terminal state — catalog genuinely exhausted (server has no more pages), whether that's
  // because everything was shown, everything was deduped away, or the catalog was empty to start.
  const isTerminal = hasLoadedAnyPage && !hasNextPage && !isFetchingNextPage && !showNextPageError;

  // Single guarded entry point for requesting the next page — used by both the auto-load observer
  // and the manual button, so "only one fetchNextPage at a time" holds regardless of trigger source.
  // Guards on the ref FIRST (set synchronously, no render lag) so a burst of calls within the same
  // tick (fast scroll, or a double-click) can't dispatch more than one overlapping request.
  const requestNextPage = () => {
    if (isFetchingNextRef.current || isFetchingNextPage || showNextPageError) return;
    isFetchingNextRef.current = true;
    fetchNextPage().finally(() => {
      isFetchingNextRef.current = false;
    });
  };

  // The "إعادة المحاولة" retry button's whole purpose is to re-fire the page that just failed, so
  // it deliberately does NOT gate on `showNextPageError` (only the same in-flight guard) — otherwise
  // the button that recovers from the error would refuse to do anything while the error is showing.
  const retryNextPage = () => {
    if (isFetchingNextRef.current || isFetchingNextPage) return;
    isFetchingNextRef.current = true;
    fetchNextPage().finally(() => {
      isFetchingNextRef.current = false;
    });
  };

  // Auto-load: observe a sentinel near the end of the loaded feed, reachable whenever the server has
  // another page — independent of how many VISIBLE cards are on screen, so a page that fully deduped
  // away can never strand pagination (see module doc).
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (!showPaginationControls) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) requestNextPage();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
    // `requestNextPage` is a plain function recreated every render; it closes only over
    // `fetchNextPage`/`isFetchingNextPage`/`showNextPageError`/the ref, all already listed below —
    // the effect re-subscribes exactly when any of those actually change, so omitting the function
    // itself from the array doesn't miss a real dependency.
  }, [showPaginationControls, isFetchingNextPage, showNextPageError, fetchNextPage]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="container py-6 md:py-10" dir="rtl" aria-labelledby="home-discovery-heading">
      <div className="mb-5">
        <h2 id="home-discovery-heading" className="flex items-center gap-2 text-right font-display text-2xl font-semibold md:text-3xl">
          <span>اكتشف المزيد</span>
          <Sparkles size={20} className="text-DilMart-store-gold-bright" strokeWidth={1.75} />
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">منتجات أكثر تستحق الاكتشاف</p>
      </div>

      {isInitialLoading ? (
        <DiscoveryGridSkeleton />
      ) : showFirstPageError ? (
        <div
          role="alert"
          className="rounded-2xl border border-dashed border-destructive/30 bg-card/30 px-6 py-14 text-center"
        >
          <p className="text-sm text-muted-foreground">تعذر تحميل المزيد من المنتجات</p>
          <Button type="button" onClick={() => refetch()} className="mt-6 rounded-full px-8">
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <>
          {hasAnyProducts && (
            <div className={DISCOVERY_GRID_CLASS} style={{ contentVisibility: "auto" }}>
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {isFetchingNextPage && (
            <div className={hasAnyProducts ? "mt-6" : undefined} aria-live="polite">
              <div className={DISCOVERY_GRID_CLASS} aria-busy="true" aria-label="جاري تحميل المزيد">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[3/4] w-full rounded-xl bg-muted/35" />
                ))}
              </div>
            </div>
          )}

          {showNextPageError && (
            <div role="alert" className={hasAnyProducts ? "mt-8 text-center" : "text-center"}>
              <p className="text-sm text-muted-foreground">تعذر تحميل المزيد من المنتجات</p>
              <Button type="button" variant="outline" onClick={retryNextPage} className="mt-4 rounded-full px-8">
                إعادة المحاولة
              </Button>
            </div>
          )}

          {showLoadMoreButton && (
            <div className={hasAnyProducts ? "mt-8 flex justify-center" : "flex justify-center"}>
              <Button type="button" variant="outline" onClick={requestNextPage} className="rounded-full px-10">
                تحميل المزيد
              </Button>
            </div>
          )}

          {isTerminal && (
            <p className={hasAnyProducts ? "mt-10 text-center text-sm text-muted-foreground" : "text-center text-sm text-muted-foreground"}>
              {hasAnyProducts ? "وصلت إلى نهاية المنتجات المتاحة" : "لا توجد منتجات إضافية للاكتشاف حالياً"}
            </p>
          )}

          {/* Auto-load sentinel — kept out of the tab order; the button above is the a11y path.
              Mounted whenever the server has another page, independent of visible card count, so
              pagination is never stranded by an all-deduped page. */}
          {showPaginationControls && <div ref={sentinelRef} aria-hidden className="h-px w-full" />}
        </>
      )}
    </section>
  );
}
