// @vitest-environment jsdom
/**
 * §9.3 — private customer queries must be PRINCIPAL-scoped.
 *
 * `/track-order` is a public route, so nothing unmounts it when the authenticated customer changes. Its
 * authenticated tracker fetched orders under `["customer-orders-track"]` and details under
 * `["customer-order-detail-track", orderId]` — no auth source, no customer id — with a 30s staleTime,
 * and neither prefix was in USER_SCOPED_QUERY_KEYS. So the entries survived an identity transition and
 * the next customer to mount the tracker reused them, rendering the previous customer's orders.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* eslint-disable @typescript-eslint/no-explicit-any */
let mockAuth: any = {};
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/capacitor", () => ({ isNative: () => false, openExternal: vi.fn(), shouldOpenExternally: () => false }));
vi.mock("@/components/Header", () => ({ default: () => <header>h</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>f</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/growth-hooks", () => ({ trackGrowthHookEvent: vi.fn() }));
vi.mock("@/lib/whatsapp-assisted", () => ({ startTrackedWhatsAppIntent: vi.fn() }));

const H = vi.hoisted(() => {
  const state: { orders: any[]; detail: any; keys: unknown[][] } = { orders: [], detail: null, keys: [] };
  const api = {
    getCustomerOrders: async () => state.orders,
    getCustomerOrderDetail: async () => state.detail,
    getShippingGovernorates: async () => [],
    getRegions: async () => [],
  };
  return { state, api };
});
vi.mock("@/lib/api-client", () => ({
  apiClient: new Proxy(H.api, { get: (t: any, k: string) => t[k] ?? (async () => ({})) }),
}));

import TrackOrder from "./TrackOrder";

const A_ORDER = { id: "order-A", order_number: "AAA-111", status: "processing", created_at: "2026-01-01T00:00:00Z", total: 1000 };
const B_ORDER = { id: "order-B", order_number: "BBB-222", status: "processing", created_at: "2026-01-02T00:00:00Z", total: 2000 };

function authFor(id: string) {
  return {
    user: { id, email: null, phone: null },
    profile: null,
    session: null,
    appSession: {
      authSource: "DilMart_federated",
      accessToken: "a",
      accessExpiresAt: Date.now() + 1e6,
      user: { id, email: null, phone: null },
    },
    authSource: "DilMart_federated",
    authStatus: "authenticated_ready",
  };
}

/** One QueryClient shared across the transition — the cache is what carries the leak. */
let queryClient: QueryClient;

function renderTracker() {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/track-order"]}>
        <TrackOrder />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  H.state.orders = [];
  H.state.detail = null;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.clearAllMocks();
});

describe("§9.3 TrackOrder — private caches across an identity replacement", () => {
  it("MANDATORY: customer B never reads customer A's cached orders", async () => {
    // Seed the cache exactly as customer A left it, under the UNSCOPED key the old code used. This is
    // deterministic: if the key is unscoped, B's observer hits these fresh entries directly. Driving it
    // through a live A session first left the outcome dependent on refetch timing, and that version
    // passed both before and after the fix — which is no evidence at all.
    queryClient.setQueryData(["customer-orders-track"], [A_ORDER]);
    queryClient.setQueryData(["customer-order-detail-track", A_ORDER.id], { ...A_ORDER, items: [] });

    H.state.orders = [B_ORDER];
    H.state.detail = { ...B_ORDER, items: [] };
    mockAuth = authFor("cust-B");
    renderTracker();

    // B's own order arrives; A's must never have been rendered.
    await waitFor(() => expect(screen.queryByText(/BBB-222/)).not.toBeNull());
    expect(screen.queryByText(/AAA-111/)).toBeNull();

    // And A's seeded entries were never adopted as B's data.
    const bOrders = queryClient.getQueryData(["customer-orders-track", "DilMart_federated", "cust-B"]);
    expect(JSON.stringify(bOrders ?? [])).not.toContain("AAA-111");
  });

  it("the private query identities carry the auth source and the customer id", async () => {
    H.state.orders = [A_ORDER];
    H.state.detail = { ...A_ORDER, items: [] };
    mockAuth = authFor("cust-A");
    renderTracker();
    await waitFor(() => expect(screen.queryByText(/AAA-111/)).not.toBeNull());

    const trackKeys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
      .filter((k) => String(k[0]).startsWith("customer-order"));

    expect(trackKeys.length).toBeGreaterThan(0);
    for (const key of trackKeys) {
      const flat = key.map((part) => String(part));
      expect(flat).toContain("DilMart_federated"); // auth source
      expect(flat).toContain("cust-A"); // customer id
    }
  });
});
