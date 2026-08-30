import type { MarketplaceStorefrontProduct, MarketplaceStorefrontProductsResult } from "@/lib/marketplace-storefront.types";

/**
 * Home "اكتشف المزيد" progressive discovery feed — pure, deterministic helpers shared by
 * `HomeDiscoveryFeed.tsx` and its tests. No React, no network here.
 *
 * The feed reuses the canonical public listing (`GET /marketplace/products`) so it obeys the
 * exact same visibility/eligibility rules as `/products` — it never invents a second catalog.
 */

/** Initial batch AND every subsequent batch. Kept deliberately small so first paint stays light. */
export const HOME_DISCOVERY_PAGE_SIZE = 24;

/** Default ordering for the feed — mirrors the listing endpoint's own default (`created_at` desc). */
export const HOME_DISCOVERY_SORT = "newest" as const;

/**
 * Stable react-query key. Prefixed `marketplace-` on purpose: the app's QueryClient gives every
 * `marketplace-*` key a 10-min staleTime + 45-min gcTime + localStorage persistence, so returning
 * to Home mid-session shows the already-loaded pages WITHOUT refetching all of them. `filters` is a
 * plain serializable object (no functions, no timestamps) so identical filters reuse one cache entry.
 */
export function buildHomeDiscoveryQueryKey(filters: { sort: string } = { sort: HOME_DISCOVERY_SORT }) {
  return ["marketplace-home-discovery", filters] as const;
}

/** Next `offset` for `useInfiniteQuery`, or `undefined` when the last page reached the catalog end. */
export function getNextDiscoveryOffset(lastPage: MarketplaceStorefrontProductsResult): number | undefined {
  const next = lastPage.offset + lastPage.limit;
  return next < lastPage.total ? next : undefined;
}

function merchantIdOf(product: MarketplaceStorefrontProduct): string | null {
  return product.merchants?.id ?? null;
}

/**
 * Deterministic presentation-level diversification for ONE freshly-loaded page.
 *
 * Greedy reorder that avoids more than `maxRun` consecutive products from the same merchant when an
 * alternative exists in the page. It is scoped to a single page (never touches already-rendered
 * pages) so appending a new page can never reshuffle what the customer already saw — no layout jump,
 * no `Math.random`. `carryMerchantId` is the merchant of the previously-rendered tail product, so a
 * run can't straddle the page boundary either. Original relative order is the tie-break.
 */
export function diversifyByMerchant(
  items: MarketplaceStorefrontProduct[],
  carryMerchantId: string | null = null,
  maxRun = 2,
): MarketplaceStorefrontProduct[] {
  if (items.length <= 2) return items.slice();
  const remaining = items.slice();
  const result: MarketplaceStorefrontProduct[] = [];
  let lastMerchant = carryMerchantId;
  // Seed the run at the cap when there is a carry-in merchant, so the first pick avoids continuing
  // the previous page's trailing merchant if any alternative is available.
  let run = carryMerchantId != null ? maxRun : 0;

  while (remaining.length > 0) {
    let pickIndex = remaining.findIndex((p) => merchantIdOf(p) !== lastMerchant || run < maxRun);
    if (pickIndex === -1) pickIndex = 0; // only same-merchant items remain — accept the run
    const [picked] = remaining.splice(pickIndex, 1);
    const merchant = merchantIdOf(picked);
    if (merchant === lastMerchant) {
      run += 1;
    } else {
      lastMerchant = merchant;
      run = 1;
    }
    result.push(picked);
  }
  return result;
}

/**
 * Fold loaded pages into the final ordered, de-duplicated, merchant-diversified render list.
 *
 * - Drops any product whose id already appeared in a curated home section (`curatedProductIds`) or
 *   in an earlier discovery page — a product never shows twice on one homepage.
 * - Diversifies each page independently (append-stable) with a carry-in from the prior tail.
 * - Pure: same inputs → same output. If dedupe shrinks a page below the batch size that's fine; the
 *   feed does not loop-fetch to force an exact count.
 */
export function buildDiscoveryList(
  pages: MarketplaceStorefrontProductsResult[],
  curatedProductIds: Iterable<string> = [],
): MarketplaceStorefrontProduct[] {
  const seen = new Set<string>(curatedProductIds);
  const out: MarketplaceStorefrontProduct[] = [];
  let carryMerchantId: string | null = null;

  for (const page of pages) {
    const deduped: MarketplaceStorefrontProduct[] = [];
    for (const product of page.items) {
      if (!product?.id || seen.has(product.id)) continue;
      seen.add(product.id);
      deduped.push(product);
    }
    if (deduped.length === 0) continue;
    const arranged = diversifyByMerchant(deduped, carryMerchantId);
    out.push(...arranged);
    carryMerchantId = merchantIdOf(arranged[arranged.length - 1]);
  }
  return out;
}
