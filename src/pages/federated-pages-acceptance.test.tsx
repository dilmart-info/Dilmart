// @vitest-environment jsdom
/**
 * STORE-PR5 §3/§4/§5 — real customer-page acceptance under a federated identity (Supabase session null).
 * Proves Profile / Addresses / Orders render and fetch under a federated appSession, with source-aware
 * query keys — no raw Supabase session required, no /auth redirect.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let mockAuth: any = {};
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/capacitor", () => ({ isNative: () => false, openExternal: vi.fn(), shouldOpenExternally: () => false }));
vi.mock("@/components/Header", () => ({ default: () => <header>h</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>f</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/components/AccountRecommendations", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/growth-hooks", () => ({ trackGrowthHookEvent: vi.fn() }));
vi.mock("@/lib/whatsapp-assisted", () => ({ startTrackedWhatsAppIntent: vi.fn() }));
vi.mock("@/lib/cart-store", () => ({
  useCartStore: () => ({
    items: [{ product: { id: "p1", name: "Item", price: 1000, discount_price: null }, quantity: 1 }],
    getSubtotal: () => 1000, getDiscountAmount: () => 0, coupon: null,
    applyCoupon: vi.fn(), removeCoupon: vi.fn(), clearCart: vi.fn(), removeItem: vi.fn(),
    ensureIntegrity: () => ({ valid: true }),
  }),
}));

const api = {
  getMyOrders: vi.fn(async () => []),
  updateMyProfile: vi.fn(async () => ({})),
  getCustomerAddresses: vi.fn(async () => []),
  getShippingGovernorates: vi.fn(async () => []),
  getRegions: vi.fn(async () => []),
  getCustomerOrders: vi.fn(async () => []),
  getCustomerOrderDetail: vi.fn(async () => ({})),
  previewCustomerReorder: vi.fn(async () => ({})),
  getCustomerProfile: vi.fn(async () => ({})),
  loyaltyPreview: vi.fn(async () => ({ available_points: 0, redeemable_amount: 0 })),
  createProvisionalUser: vi.fn(async () => ({ email: "e", password: "p" })),
  getAuthContext: vi.fn(async () => ({})),
};
vi.mock("@/lib/api-client", () => ({ apiClient: new Proxy(api, { get: (t, k) => (t as any)[k] ?? vi.fn(async () => ({})) }) }));

const FED = { authSource: "DilMart_federated", accessToken: "a", accessExpiresAt: Date.now() + 1e6, user: { id: "fed-cust-1", email: null, phone: null } };
function federatedAuth(over: any = {}) {
  return {
    user: { id: "fed-cust-1", email: null, phone: null },
    profile: { id: "fed-cust-1", role: "customer", full_name: "Fed", phone: null, address: null, points: 0 },
    session: null,
    appSession: FED,
    authSource: "DilMart_federated",
    authStatus: "authenticated_ready",
    capabilities: { customerCommerce: true, phoneIdentity: false, accountClaim: false, passwordManagement: false, federatedLogoutAll: true },
    isOffline: false,
    loading: false,
    contextLoading: false,
    storageError: null,
    isAdmin: false, isMerchantUser: false, isMerchantApplicant: false, isAgent: false,
    logoutCurrentDevice: vi.fn(async () => undefined),
    logoutAllDevices: vi.fn(async () => undefined),
    establishProvisionalSession: vi.fn(async () => ({ session: { user: { id: "x", email: null } } })),
    retryStorageBootstrap: vi.fn(),
    refetch: vi.fn(),
    ...over,
  };
}

function renderPage(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/x"]}>
        <Routes>
          <Route path="/x" element={<>{node}</>} />
          <Route path="/auth" element={<div data-testid="auth">AUTH</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { qc, ...utils };
}
const keyExists = (qc: QueryClient, parts: string[]) =>
  qc.getQueryCache().getAll().some((q) => parts.every((p) => JSON.stringify(q.queryKey).includes(p)));

beforeEach(() => { Object.values(api).forEach((f) => (f as any).mockClear?.()); mockAuth = federatedAuth(); });

describe("federated Profile", () => {
  it("renders customer identity, does NOT redirect to /auth", async () => {
    const Profile = (await import("@/pages/Profile")).default;
    renderPage(<Profile />);
    await waitFor(() => expect(screen.queryByText("جاري التحميل...")).toBeNull());
    expect(screen.queryByTestId("auth")).toBeNull();      // federated session accepted, no login redirect
    expect(screen.getAllByText("حسابي").length).toBeGreaterThan(0); // account surface rendered
    // (current-device logout + capability-gated "logout all devices" live inside the account tab; their
    // presence/gating is unit-covered by the Profile code + CustomerCapabilityGuard tests.)
  });

  it("offline federated → offline shell, no /auth redirect", async () => {
    mockAuth = federatedAuth({ authStatus: "authenticated_offline", isOffline: true });
    const Profile = (await import("@/pages/Profile")).default;
    renderPage(<Profile />);
    expect(screen.getByTestId("profile-offline-shell")).toBeTruthy();
    expect(screen.queryByTestId("auth")).toBeNull();
  });
});

describe("federated Addresses", () => {
  it("fetches customer addresses under a source-aware key", async () => {
    const Addresses = (await import("@/pages/account/Addresses")).default;
    const { qc } = renderPage(<Addresses />);
    await waitFor(() => expect(api.getCustomerAddresses).toHaveBeenCalled());
    expect(keyExists(qc, ["customer-addresses", "DilMart_federated", "fed-cust-1"])).toBe(true);
  });
});

describe("federated Orders", () => {
  it("fetches customer orders under a source-aware key", async () => {
    const Orders = (await import("@/pages/account/Orders")).default;
    const { qc } = renderPage(<Orders />);
    await waitFor(() => expect(api.getCustomerOrders).toHaveBeenCalled());
    expect(keyExists(qc, ["customer-orders", "DilMart_federated", "fed-cust-1"])).toBe(true);
  });
});

describe("federated Checkout", () => {
  it("treats the federated customer as authenticated: uses customer APIs, NEVER provisional", async () => {
    const Checkout = (await import("@/pages/Checkout")).default;
    renderPage(<Checkout />);
    // Federated customer profile/addresses are loaded (authenticated path)...
    await waitFor(() => expect(api.getCustomerProfile).toHaveBeenCalled());
    // ...and no provisional account is ever created for an already-authenticated federated identity.
    expect(api.createProvisionalUser).not.toHaveBeenCalled();
    expect((mockAuth.establishProvisionalSession as any) === undefined || (mockAuth.establishProvisionalSession as any).mock.calls.length === 0).toBe(true);
    expect(screen.queryByTestId("auth")).toBeNull();
  });
});
