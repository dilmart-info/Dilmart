// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Checkout from "./Checkout";
import { useCartStore } from "@/lib/cart-store";
import { apiClient } from "@/lib/api-client";

let mockAuth: any = {};
const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/components/Header", () => ({ default: () => <header data-testid="header">Header</header>, }));
vi.mock("@/components/Footer", () => ({ default: () => <footer data-testid="footer">Footer</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("@/lib/growth-hooks", () => ({ trackGrowthHookEvent: vi.fn() }));
vi.mock("@/lib/whatsapp-assisted", () => ({ startTrackedWhatsAppIntent: vi.fn() }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});

const H = vi.hoisted(() => {
  const state: {
    governorates: Array<{ id: string; name: string; delivery_price: number | null }>;
    savedAddresses: any[];
    submitted: any[];
    failSubmit: boolean;
  } = {
    governorates: [
      { id: "gov-baghdad", name: "بغداد", delivery_price: 5000 },
      { id: "gov-basra", name: "البصرة", delivery_price: 6000 },
      { id: "gov-unavail", name: "محافظة غير مغطاة", delivery_price: null },
    ],
    savedAddresses: [],
    submitted: [],
    failSubmit: false,
  };

  const api = {
    getShippingGovernorates: async () => state.governorates,
    getRegions: async () => [],
    getCustomerAddresses: async () => state.savedAddresses,
    getCustomerOrders: async () => [],
    getCustomerOrderDetail: async () => ({}),
    loyaltyPreview: async () => ({ available_points: 100, redeemable_amount: 1000 }),
    createProvisionalUser: async () => ({ email: "prov@test.com", password: "p" }),
    validateCoupon: async () => ({ valid: true, id: "c1", code: "SAVE20", discount_type: "percentage", value: 20 }),
    getCustomerProfile: async () => null,
    getAuthContext: async () => ({ user: { id: "u-1" } }),
    getCheckoutAttempt: async () => ({ status: "pending" }),
    checkoutSubmit: async (payload: any) => {
      state.submitted.push(payload);
      if (state.failSubmit) throw new Error("Connection failed");
      return { order_id: "ord-123", order_number: "DIL-9999" };
    },
  };
  return { state, api };
});

vi.mock("@/lib/api-client", () => ({
  apiClient: new Proxy(H.api, { get: (t: any, k: string) => t[k] ?? (async () => ({})) }),
}));

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false) as never;
  Element.prototype.setPointerCapture = vi.fn() as never;
  Element.prototype.releasePointerCapture = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn() as never;
});

function renderCheckout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/checkout"]}>
        <Checkout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Phase 2C — Checkout Page Flow & Visual Invariants", () => {
  beforeEach(() => {
    useCartStore.getState().clearCart();
    H.state.submitted = [];
    H.state.failSubmit = false;
    H.state.savedAddresses = [];
    navigateSpy.mockClear();
    sessionStorage.clear();
    mockAuth = {
      user: null,
      profile: null,
      authStatus: "unauthenticated",
      authSource: null,
      establishProvisionalSession: vi.fn(async () => ({
        session: { user: { id: "prov-user-1", email: "prov@provisional.dilmart.com" }, access_token: "token" },
        principalSnapshot: { owner: "supabase:prov-user-1", version: 1 },
      })),
      principalOwner: null,
      principalTransitionVersion: 0,
      getPrincipalSnapshot: () => ({ owner: null, version: 0 }),
    };
  });

  it("renders empty cart state when cart has no items", () => {
    renderCheckout();
    expect(screen.getByText("السلة فارغة")).toBeTruthy();
    expect(screen.getByText("تصفح المنتجات الآن")).toBeTruthy();
  });

  it("renders checkout form with DILMART identity and guest notice when unauthenticated", async () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "سماعات بلوتوث",
      slug: "bluetooth-headset",
      price: 25000,
      discount_price: null,
      stock: 5,
      merchant_id: "m1",
    });

    renderCheckout();

    expect(screen.getByText("إتمام الطلب والدفع")).toBeTruthy();
    expect(screen.getByText("معلومات التوصيل والمستلم")).toBeTruthy();
    expect(
      screen.getByText("سننشئ لك حساب متابعة تلقائياً باستخدام بيانات الطلب لتتمكن من متابعة طلبك لاحقاً."),
    ).toBeTruthy();
    expect(screen.getByText("طريقة الدفع")).toBeTruthy();
    expect(screen.getByText("مساعدة عبر واتساب")).toBeTruthy();
    expect(screen.queryByText(/Tracked/i)).toBeNull();
  });

  it("does not display client-generated earned-points claim or Jenni internal string", async () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "شاحن لاسلكي",
      slug: "wireless-charger",
      price: 40000,
      discount_price: null,
      stock: 5,
      merchant_id: "m1",
    });

    renderCheckout();

    // No client-calculated "مكافأة الطلب"
    expect(screen.queryByText(/مكافأة الطلب/)).toBeNull();
    // No internal vendor "Jenni"
    expect(screen.queryByText(/Jenni/i)).toBeNull();
  });

  it("hydrates saved addresses for authenticated users and allows switching to new address", async () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "سماعات",
      slug: "earphones",
      price: 15000,
      discount_price: null,
      stock: 5,
      merchant_id: "m1",
    });

    H.state.savedAddresses = [
      {
        id: "addr-1",
        label: "home",
        is_default: true,
        recipient_name: "علي كريم",
        recipient_phone: "07712345678",
        governorate_id: "gov-baghdad",
        area: "الكرادة",
        nearest_landmark: "قرب ساحة الواثق",
        delivery_notes: "اتصل قبل الوصول",
        map_url: "https://maps.example/1",
      },
    ];

    mockAuth = {
      user: { id: "user-1", email: "ali@example.com" },
      profile: { full_name: "علي كريم", phone: "07712345678" },
      authStatus: "authenticated_ready",
      authSource: "DilMart_federated",
      principalOwner: "DilMart_federated:user-1",
      principalTransitionVersion: 1,
      getPrincipalSnapshot: () => ({ owner: "DilMart_federated:user-1", version: 1 }),
    };

    renderCheckout();

    await waitFor(() => {
      expect((document.getElementById("name") as HTMLInputElement).value).toBe("علي كريم");
      expect((document.getElementById("phone") as HTMLInputElement).value).toBe("07712345678");
      expect((document.getElementById("area") as HTMLInputElement).value).toBe("الكرادة");
    });
  });

  it("submits checkout successfully for authenticated customer with hydrated address", async () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "منتج للاختبار",
      slug: "test-product",
      price: 20000,
      discount_price: null,
      stock: 5,
      merchant_id: "m1",
    });

    H.state.savedAddresses = [
      {
        id: "addr-1",
        label: "home",
        is_default: true,
        recipient_name: "محمد جاسم",
        recipient_phone: "07700000000",
        governorate_id: "gov-baghdad",
        area: "المنصور",
        nearest_landmark: "قرب المول",
        delivery_notes: "اتصال",
        map_url: "https://maps.example/1",
      },
    ];

    mockAuth = {
      user: { id: "user-1", email: "m@example.com" },
      profile: { full_name: "محمد جاسم", phone: "07700000000" },
      authStatus: "authenticated_ready",
      authSource: "DilMart_federated",
      principalOwner: "DilMart_federated:user-1",
      principalTransitionVersion: 1,
      getPrincipalSnapshot: () => ({ owner: "DilMart_federated:user-1", version: 1 }),
    };

    renderCheckout();

    await waitFor(() => {
      expect((document.getElementById("name") as HTMLInputElement).value).toBe("محمد جاسم");
      expect((document.getElementById("phone") as HTMLInputElement).value).toBe("07700000000");
      expect((document.getElementById("area") as HTMLInputElement).value).toBe("المنصور");
      // Verify governorates query loaded and delivery price is present in totals
      expect(screen.queryByText("غير متاح حالياً")).toBeNull();
    });

    const form = document.querySelector("form");
    expect(form).toBeTruthy();
    fireEvent.submit(form!);

    await waitFor(() => {
      expect(H.state.submitted.length).toBe(1);
      expect(navigateSpy).toHaveBeenCalledWith("/thank-you?order=DIL-9999");
      expect(useCartStore.getState().items).toHaveLength(0);
    });
  });

  it("preserves cart and form when checkout submit genuinely fails", async () => {
    useCartStore.getState().addItem({
      id: "p1",
      name: "منتج للاختبار",
      slug: "test-product",
      price: 20000,
      discount_price: null,
      stock: 5,
      merchant_id: "m1",
    });

    H.state.failSubmit = true;
    H.state.savedAddresses = [
      {
        id: "addr-1",
        label: "home",
        is_default: true,
        recipient_name: "حيدر أحمد",
        recipient_phone: "07800000000",
        governorate_id: "gov-baghdad",
        area: "حي الجامعة",
        nearest_landmark: "",
        delivery_notes: "",
        map_url: "",
      },
    ];

    mockAuth = {
      user: { id: "user-2", email: "h@example.com" },
      profile: { full_name: "حيدر أحمد", phone: "07800000000" },
      authStatus: "authenticated_ready",
      authSource: "DilMart_federated",
      principalOwner: "DilMart_federated:user-2",
      principalTransitionVersion: 1,
      getPrincipalSnapshot: () => ({ owner: "DilMart_federated:user-2", version: 1 }),
    };

    renderCheckout();

    await waitFor(() => {
      expect((document.getElementById("name") as HTMLInputElement).value).toBe("حيدر أحمد");
    });

    const form = document.querySelector("form");
    fireEvent.submit(form!);

    await waitFor(() => {
      // Cart is still intact
      expect(useCartStore.getState().items).toHaveLength(1);
      // Form fields are preserved
      expect((document.getElementById("name") as HTMLInputElement).value).toBe("حيدر أحمد");
    });
  });
});
