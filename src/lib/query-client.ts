import {
  QueryClient,
  dehydrate,
  hydrate,
  type DehydratedState,
  type Query,
  type QueryKey,
} from "@tanstack/react-query";

const MARKETPLACE_CACHE_KEY = "DilMart:rq:marketplace:v1";
const MARKETPLACE_STALE_TIME_MS = 10 * 60 * 1000;
const MARKETPLACE_GC_TIME_MS = 45 * 60 * 1000;

function isMarketplaceQueryKey(queryKey: QueryKey): boolean {
  const first = queryKey[0];
  return typeof first === "string" && first.startsWith("marketplace-");
}

function shouldPersistQuery(query: Query): boolean {
  return isMarketplaceQueryKey(query.queryKey) && query.state.status === "success";
}

function isAuthDeniedError(err: unknown): boolean {
  const s = String((err as Error)?.message ?? err ?? "");
  return /\b403\b/.test(s) || /\b401\b/.test(s) || /forbidden/i.test(s) || /unauthorized/i.test(s);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // staleTime as function is valid in react-query v5 (added in v5.6).
      staleTime: (query) => (isMarketplaceQueryKey(query.queryKey) ? MARKETPLACE_STALE_TIME_MS : 0),
      // gcTime only accepts a number in react-query v5; use the longer value as the global default.
      gcTime: MARKETPLACE_GC_TIME_MS,
      refetchOnWindowFocus: false,
      retry: (failureCount, err) => {
        if (isAuthDeniedError(err)) return false;
        return failureCount < 1;
      },
    },
  },
});

export function restoreMarketplaceQueryCache() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(MARKETPLACE_CACHE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as { state: DehydratedState; updatedAt: number };
    if (!payload?.state || typeof payload.updatedAt !== "number") return;
    // Discard cached data older than gcTime to prevent stale content after prolonged absence.
    if (Date.now() - payload.updatedAt > MARKETPLACE_GC_TIME_MS) {
      window.localStorage.removeItem(MARKETPLACE_CACHE_KEY);
      return;
    }
    hydrate(queryClient, payload.state);
  } catch {
    window.localStorage.removeItem(MARKETPLACE_CACHE_KEY);
  }
}

export function setupMarketplaceQueryPersistence() {
  if (typeof window === "undefined") return;
  return queryClient.getQueryCache().subscribe(() => {
    try {
      const state = dehydrate(queryClient, { shouldDehydrateQuery: shouldPersistQuery });
      window.localStorage.setItem(MARKETPLACE_CACHE_KEY, JSON.stringify({ state, updatedAt: Date.now() }));
    } catch {
      // Best-effort persistence: ignore quota/errors to avoid blocking UI startup.
    }
  });
}

