import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import HomeDiscoveryFeed from "./HomeDiscoveryFeed";
import { HOME_DISCOVERY_PAGE_SIZE } from "@/lib/home-discovery";

// Mock ProductCard to a light stub — this suite is about feed orchestration, not card internals.
vi.mock("@/components/ProductCard", () => ({
  default: ({ product }: { product: { id: string; name?: string } }) => (
    <div data-testid="product-card" data-product-id={product.id}>
      {product.name ?? product.id}
    </div>
  ),
}));

const getMarketplaceProducts = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getMarketplaceProducts: (...args: unknown[]) => getMarketplaceProducts(...args),
  },
}));

// Controllable IntersectionObserver — the last-created instance's callback can be fired manually.
let lastObserver: { trigger: () => void; disconnect: () => void } | null = null;
class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    lastObserver = {
      trigger: () => this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
      disconnect: () => {},
    };
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

function makeProduct(id: string, merchantId = "m1", name?: string) {
  return { id, name: name ?? id, merchants: { id: merchantId, slug: merchantId, display_name: merchantId } };
}

function makePage(ids: string[], offset: number, total: number) {
  return { items: ids.map((id) => makeProduct(id)), offset, limit: HOME_DISCOVERY_PAGE_SIZE, total };
}

function renderFeed(curatedProductIds: string[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HomeDiscoveryFeed curatedProductIds={curatedProductIds} />
    </QueryClientProvider>,
  );
}

function cardIds(): string[] {
  return screen.getAllByTestId("product-card").map((el) => el.getAttribute("data-product-id") as string);
}

beforeEach(() => {
  lastObserver = null;
  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver as unknown as typeof IntersectionObserver);
});

afterEach(() => {
  cleanup();
  // mockReset (not clear) clears the queued once-implementations (mockResolvedValueOnce /
  // mockRejectedValueOnce) so an unconsumed value from one test cannot leak into the next.
  getMarketplaceProducts.mockReset();
  vi.unstubAllGlobals();
});

describe("HomeDiscoveryFeed", () => {
  it("renders the section heading and first page grid", async () => {
    getMarketplaceProducts.mockResolvedValueOnce(makePage(["a", "b", "c"], 0, 3));
    renderFeed();
    expect(screen.getByRole("heading", { name: "اكتشف المزيد" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByTestId("product-card")).toHaveLength(3));
    expect(cardIds()).toEqual(["a", "b", "c"]);
  });

  it("shows the end-of-feed state when there is no next page", async () => {
    getMarketplaceProducts.mockResolvedValueOnce(makePage(["a", "b"], 0, 2));
    renderFeed();
    await screen.findByText("وصلت إلى نهاية المنتجات المتاحة");
    expect(screen.queryByRole("button", { name: "تحميل المزيد" })).not.toBeInTheDocument();
  });

  it("offers an accessible Load More button that appends the next page without erasing the first", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["a", "b"], 0, 50))
      .mockResolvedValueOnce(makePage(["c", "d"], HOME_DISCOVERY_PAGE_SIZE, 50));
    renderFeed();
    await waitFor(() => expect(cardIds()).toEqual(["a", "b"]));

    const loadMore = screen.getByRole("button", { name: "تحميل المزيد" });
    expect(loadMore.tagName).toBe("BUTTON");
    fireEvent.click(loadMore);

    await waitFor(() => expect(cardIds()).toEqual(["a", "b", "c", "d"]));
  });

  it("auto-loads the next page when the sentinel intersects", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["a", "b"], 0, 50))
      .mockResolvedValueOnce(makePage(["c", "d"], HOME_DISCOVERY_PAGE_SIZE, 50));
    renderFeed();
    await waitFor(() => expect(cardIds()).toEqual(["a", "b"]));

    expect(lastObserver).not.toBeNull();
    lastObserver!.trigger();

    await waitFor(() => expect(cardIds()).toEqual(["a", "b", "c", "d"]));
  });

  it("does not render duplicate product ids across accumulated pages", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["a", "b"], 0, 50))
      .mockResolvedValueOnce(makePage(["b", "c"], HOME_DISCOVERY_PAGE_SIZE, 50)); // 'b' repeats
    renderFeed();
    await waitFor(() => expect(cardIds()).toEqual(["a", "b"]));
    fireEvent.click(screen.getByRole("button", { name: "تحميل المزيد" }));
    await waitFor(() => expect(cardIds()).toEqual(["a", "b", "c"]));
    expect(new Set(cardIds()).size).toBe(cardIds().length);
  });

  it("dedupes the feed against curated home product ids", async () => {
    getMarketplaceProducts.mockResolvedValueOnce(makePage(["curated-1", "a", "b"], 0, 3));
    renderFeed(["curated-1"]);
    await waitFor(() => expect(cardIds()).toEqual(["a", "b"]));
  });

  it("shows a bottom loading state while fetching the next page", async () => {
    let resolveSecond: (v: unknown) => void = () => {};
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["a", "b"], 0, 50))
      .mockImplementationOnce(() => new Promise((res) => { resolveSecond = res; }));
    renderFeed();
    await waitFor(() => expect(cardIds()).toEqual(["a", "b"]));

    fireEvent.click(screen.getByRole("button", { name: "تحميل المزيد" }));
    await screen.findByLabelText("جاري تحميل المزيد");

    resolveSecond(makePage(["c", "d"], HOME_DISCOVERY_PAGE_SIZE, 50));
    await waitFor(() => expect(cardIds()).toEqual(["a", "b", "c", "d"]));
  });

  it("keeps earlier products and offers retry when a later page fails", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["a", "b"], 0, 50))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makePage(["c", "d"], HOME_DISCOVERY_PAGE_SIZE, 50));
    renderFeed();
    await waitFor(() => expect(cardIds()).toEqual(["a", "b"]));

    fireEvent.click(screen.getByRole("button", { name: "تحميل المزيد" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل المزيد من المنتجات");
    // Earlier products are NOT erased.
    expect(cardIds()).toEqual(["a", "b"]);

    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(cardIds()).toEqual(["a", "b", "c", "d"]));
  });

  it("shows a first-page error with retry that recovers", async () => {
    getMarketplaceProducts
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makePage(["a", "b"], 0, 2));
    renderFeed();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل المزيد من المنتجات");
    expect(screen.queryAllByTestId("product-card")).toHaveLength(0);

    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(cardIds()).toEqual(["a", "b"]));
  });
});

/**
 * Regression suite for DilMart-STORE-HOME-DISCOVERY-FIX-044: a page whose items are ALL already
 * curated/duplicates deduped away to zero VISIBLE cards, while the server still reports more pages
 * (`hasNextPage=true`). The dead-end bug: pagination controls (sentinel + "تحميل المزيد") lived only
 * inside the "hasAnyProducts" branch, so once a page fully deduped away there was no way to ever
 * reach the next page — later eligible products became permanently unreachable.
 */
describe("HomeDiscoveryFeed — pagination survives an all-deduped page", () => {
  it("stays pagination-capable when page 1 fully dedupes: Load More is available with zero cards", async () => {
    // All 24 curated ids for page 1; server total (48) says a second page exists.
    getMarketplaceProducts.mockResolvedValueOnce(makePage(["curated-1", "curated-2"], 0, 48));
    renderFeed(["curated-1", "curated-2"]);

    await waitFor(() => expect(getMarketplaceProducts).toHaveBeenCalledTimes(1));
    expect(screen.queryAllByTestId("product-card")).toHaveLength(0);
    // No false "end of catalog" / "empty" claim while the server still has more pages.
    expect(screen.queryByText("وصلت إلى نهاية المنتجات المتاحة")).not.toBeInTheDocument();
    expect(screen.queryByText("لا توجد منتجات إضافية للاكتشاف حالياً")).not.toBeInTheDocument();

    const loadMore = await screen.findByRole("button", { name: "تحميل المزيد" });
    expect(loadMore.tagName).toBe("BUTTON");
  });

  it("auto-load reaches offset=24 and renders it once page 1 fully deduped", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["curated-1"], 0, 48))
      .mockResolvedValueOnce(makePage(["x", "y"], HOME_DISCOVERY_PAGE_SIZE, 48));
    renderFeed(["curated-1"]);
    // Wait for the fully-settled zero-cards-but-paginatable render (guarantees the sentinel's
    // effect has run and constructed the mock IntersectionObserver), not just the mock call count.
    await screen.findByRole("button", { name: "تحميل المزيد" });
    expect(screen.queryAllByTestId("product-card")).toHaveLength(0);

    expect(lastObserver).not.toBeNull();
    lastObserver!.trigger();

    await waitFor(() => expect(cardIds()).toEqual(["x", "y"]));
    expect(getMarketplaceProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: HOME_DISCOVERY_PAGE_SIZE }),
    );
  });

  it("manual Load More reaches the next page after an all-deduped first page", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["curated-1"], 0, 48))
      .mockResolvedValueOnce(makePage(["x", "y"], HOME_DISCOVERY_PAGE_SIZE, 48));
    renderFeed(["curated-1"]);
    const loadMore = await screen.findByRole("button", { name: "تحميل المزيد" });

    fireEvent.click(loadMore);

    await waitFor(() => expect(cardIds()).toEqual(["x", "y"]));
  });

  it("keeps a retry control visible when the page after an all-deduped page fails", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["curated-1"], 0, 48))
      .mockRejectedValueOnce(new Error("network"));
    renderFeed(["curated-1"]);
    const loadMore = await screen.findByRole("button", { name: "تحميل المزيد" });
    fireEvent.click(loadMore);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل المزيد من المنتجات");
    expect(within(alert).getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
    // Still no false claims while an eligible next page might exist.
    expect(screen.queryByText("لا توجد منتجات إضافية للاكتشاف حالياً")).not.toBeInTheDocument();
  });

  it("progresses through two consecutive all-deduped pages to a third page with eligible products, one request at a time", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["curated-1"], 0, 72)) // page 1 — fully deduped
      .mockResolvedValueOnce(makePage(["curated-2"], HOME_DISCOVERY_PAGE_SIZE, 72)) // page 2 — fully deduped
      .mockResolvedValueOnce(makePage(["x", "y"], HOME_DISCOVERY_PAGE_SIZE * 2, 72)); // page 3 — eligible
    renderFeed(["curated-1", "curated-2"]);

    // Each `findByRole` wait guarantees the component (and its sentinel effect) has fully
    // resettled after the previous fetch before the next trigger fires — no premature/overlapping
    // requests, exactly one request per user-driven intersection event.
    await screen.findByRole("button", { name: "تحميل المزيد" });
    expect(screen.queryAllByTestId("product-card")).toHaveLength(0);
    expect(getMarketplaceProducts).toHaveBeenCalledTimes(1);

    lastObserver!.trigger();
    await waitFor(() => expect(getMarketplaceProducts).toHaveBeenCalledTimes(2));
    await screen.findByRole("button", { name: "تحميل المزيد" });
    expect(screen.queryAllByTestId("product-card")).toHaveLength(0); // still nothing visible

    lastObserver!.trigger();
    await waitFor(() => expect(cardIds()).toEqual(["x", "y"]));
    expect(getMarketplaceProducts).toHaveBeenCalledTimes(3); // exactly one request per trigger
  });

  it("shows a clean terminal state (no spinner, no Load More) when the whole catalog dedupes away", async () => {
    getMarketplaceProducts.mockResolvedValueOnce(makePage(["curated-1", "curated-2"], 0, 2)); // total=2, no next page
    renderFeed(["curated-1", "curated-2"]);

    await screen.findByText("لا توجد منتجات إضافية للاكتشاف حالياً");
    expect(screen.queryByRole("button", { name: "تحميل المزيد" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("جاري تحميل المزيد")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders no duplicate ids once recovered from an error that followed an all-deduped page", async () => {
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["curated-1"], 0, 48))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(makePage(["x", "y"], HOME_DISCOVERY_PAGE_SIZE, 48));
    renderFeed(["curated-1"]);
    fireEvent.click(await screen.findByRole("button", { name: "تحميل المزيد" }));

    const alert = await screen.findByRole("alert");
    fireEvent.click(within(alert).getByRole("button", { name: "إعادة المحاولة" }));

    await waitFor(() => expect(cardIds()).toEqual(["x", "y"]));
    expect(new Set(cardIds()).size).toBe(cardIds().length);
  });

  it("guards against concurrent next-page requests from a burst of intersection events", async () => {
    let resolveSecond: (v: unknown) => void = () => {};
    getMarketplaceProducts
      .mockResolvedValueOnce(makePage(["curated-1"], 0, 48))
      .mockImplementationOnce(() => new Promise((res) => { resolveSecond = res; }));
    renderFeed(["curated-1"]);
    await screen.findByRole("button", { name: "تحميل المزيد" });
    expect(getMarketplaceProducts).toHaveBeenCalledTimes(1);

    // Rapid repeated intersection firing (e.g. fast scroll) while the next page is in flight.
    lastObserver!.trigger();
    lastObserver!.trigger();
    lastObserver!.trigger();
    await waitFor(() => expect(getMarketplaceProducts).toHaveBeenCalledTimes(2));

    resolveSecond(makePage(["x", "y"], HOME_DISCOVERY_PAGE_SIZE, 48));
    await waitFor(() => expect(cardIds()).toEqual(["x", "y"]));
    expect(getMarketplaceProducts).toHaveBeenCalledTimes(2); // never more than one request per page
  });
});
