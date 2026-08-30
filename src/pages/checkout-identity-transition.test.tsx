// @vitest-environment jsdom
/**
 * §9.3 — component-local customer state must not survive an identity replacement.
 *
 * Clearing React Query is not the whole user-scoped surface. `/checkout` is a PUBLIC route, so nothing
 * unmounts it when the authenticated customer is replaced (another tab redeeming a handoff swaps the
 * shared web cookie), and its customer-derived form lives in `useState`. The hydration effects
 * deliberately fall back to the previous values — `profile.full_name || prev.name`,
 * `defaultAddress.area ?? prev.area` — and the saved-address effect returns early when the new customer
 * has none. So a customer with empty profile fields and no saved addresses would inherit the previous
 * customer's name, phone, governorate, area, landmark, notes and map coordinates, and submit them.
 */
import { describe, expect, it, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */
let mockAuth: any = {};
/**
 * Mirror AuthProvider's principal derivation: owner comes from the SESSION, and the transition version
 * advances on EVERY owner change (null -> owner included), which is what async continuity keys off.
 */
let principalVersion = 0;
let lastPrincipalOwner: string | null = null;
/**
 * Stand-in for the manager-owned authority. It advances the moment the principal changes — NOT when a
 * component re-renders — which is what `usePrincipalContinuity` reads through `getPrincipalSnapshot`.
 */
function advancePrincipal(owner: string | null) {
  if (owner !== lastPrincipalOwner) {
    lastPrincipalOwner = owner;
    principalVersion += 1;
  }
  return { owner, version: principalVersion };
}
function withPrincipal(auth: any) {
  const id = auth?.appSession?.user?.id ?? "";
  const owner = auth?.appSession && id ? `${auth.appSession.authSource}:${id}` : null;
  const snapshot = advancePrincipal(owner);
  return {
    ...auth,
    principalOwner: owner,
    principalTransitionVersion: snapshot.version,
    // Read live, so an operation resuming later sees the CURRENT authority rather than this render's copy.
    getPrincipalSnapshot: () => ({ owner: lastPrincipalOwner, version: principalVersion }),
  };
}
/** Mirrors the lifecycle owner: establishing a provisional customer moves the authority to them. */
function provisionalEstablishMock(id = "provisional-1") {
  return vi.fn(async () => ({
    session: { user: { id, email: null }, access_token: "pt" },
    principalSnapshot: advancePrincipal(`supabase:${id}`),
  }));
}
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));
vi.mock("@/lib/capacitor", () => ({ isNative: () => false, openExternal: vi.fn(), shouldOpenExternally: () => false }));
vi.mock("@/components/Header", () => ({ default: () => <header>h</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>f</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/growth-hooks", () => ({ trackGrowthHookEvent: vi.fn() }));
vi.mock("@/lib/whatsapp-assisted", () => ({ startTrackedWhatsAppIntent: vi.fn() }));
const navigateSpy = vi.hoisted(() => vi.fn());
const clearCart = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateSpy };
});
vi.mock("@/lib/cart-store", () => ({
  useCartStore: () => ({
    items: [{ product: { id: "p1", name: "Item", price: 1000, discount_price: null, merchant_id: "m1" }, quantity: 1 }],
    getSubtotal: () => 1000,
    getDiscountAmount: () => 0,
    coupon: null,
    applyCoupon: vi.fn(),
    removeCoupon: vi.fn(),
    clearCart,
    removeItem: vi.fn(),
    ensureIntegrity: () => ({ valid: true, merchantId: "m1" }),
  }),
}));

const A_PROFILE = {
  id: "cust-A",
  role: "customer",
  full_name: "Customer A",
  phone: "07700000001",
  address: "A-Area",
  points: 0,
};
/** Customer B has EMPTY profile fields and NO saved addresses — the case that inherits A's values. */
const B_PROFILE = { id: "cust-B", role: "customer", full_name: null, phone: null, address: null, points: 0 };

const B_ADDRESS = {
  id: "addr-B",
  is_default: true,
  recipient_name: "Customer B",
  recipient_phone: "07800000002",
  governorate_id: "gov-B",
  area: "B-Area",
  nearest_landmark: "B-Landmark",
  delivery_notes: "B-Notes",
  map_url: "https://maps.example/B",
};

const A_ADDRESS = {
  id: "addr-A",
  is_default: true,
  recipient_name: "Customer A",
  recipient_phone: "07700000001",
  governorate_id: "gov-A",
  area: "A-Area",
  nearest_landmark: "A-Landmark",
  delivery_notes: "A-Notes",
  map_url: "https://maps.example/A",
};

// `vi.mock` factories are hoisted above static imports, so the mocked module's dependencies must be
// created with `vi.hoisted` rather than as ordinary module-level consts.
const H = vi.hoisted(() => {
  const state: {
    savedAddresses: unknown[];
    profile: unknown;
    submitted: unknown[];
    deferSubmit: boolean;
    failSubmit: boolean;
    deferredOrderNumber: string;
    resolveSubmit: (() => void) | null;
    provisionalStarted: number;
    deferProvisional: boolean;
    resolveProvisional: (() => void) | null;
    deferAttemptLookup: boolean;
    rejectAttemptLookup: (() => void) | null;
  } = {
    savedAddresses: [],
    profile: null,
    submitted: [],
    deferSubmit: false,
    failSubmit: false,
    deferredOrderNumber: "A-ORDER-999",
    resolveSubmit: null,
    provisionalStarted: 0,
    deferProvisional: false,
    resolveProvisional: null,
    deferAttemptLookup: false,
    rejectAttemptLookup: null,
  };
  const api = {
    getShippingGovernorates: async () => [
      { id: "gov-A", name: "Gov A", delivery_price: 5000 },
      { id: "gov-B", name: "Gov B", delivery_price: 5000 },
    ],
    getRegions: async () => [],
    getCustomerAddresses: async () => state.savedAddresses,
    getCustomerOrders: async () => [],
    getCustomerOrderDetail: async () => ({}),
    loyaltyPreview: async () => ({ available_points: 0, redeemable_amount: 0 }),
    createProvisionalUser: async () => {
      state.provisionalStarted += 1;
      if (state.deferProvisional) {
        return new Promise((resolve) => {
          state.resolveProvisional = () => resolve({ email: "e", password: "p" });
        });
      }
      return { email: "e", password: "p" };
    },
    validateCoupon: async () => ({}),
    getCustomerProfile: async () => state.profile,
    getAuthContext: async () => ({ user: { id: "provisional-1" } }),
    getCheckoutAttempt: async () => {
      if (state.deferAttemptLookup) {
        return new Promise((_resolve, reject) => {
          state.rejectAttemptLookup = () => reject(new Error("attempt lookup failed"));
        });
      }
      return { status: "succeeded" };
    },
    checkoutSubmit: async (payload: unknown) => {
      state.submitted.push(payload);
      if (state.failSubmit) throw new Error("network down");
      if (state.deferSubmit) {
        return new Promise((resolve) => {
          state.resolveSubmit = () => resolve({ order_id: "o-A", order_number: state.deferredOrderNumber });
        });
      }
      return { order_id: "o1", order_number: "ORD-1" };
    },
  };
  return { state, api };
});
vi.mock("@/lib/api-client", () => ({
  apiClient: new Proxy(H.api, { get: (t: any, k: string) => t[k] ?? (async () => ({})) }),
}));

import Checkout from "./Checkout";

function authFor(id: string, profile: unknown) {
  return withPrincipal({
    user: { id, email: null, phone: null },
    profile,
    session: null,
    appSession: {
      authSource: "DilMart_federated",
      accessToken: "a",
      accessExpiresAt: Date.now() + 1e6,
      user: { id, email: null, phone: null },
    },
    authSource: "DilMart_federated",
    authStatus: "authenticated_ready",
    establishProvisionalSession: vi.fn(),
  });
}

// Radix Select uses Pointer Events APIs jsdom does not implement. Stubbing them lets the guest
// governorate picker actually open, so these tests drive the REAL form rather than a shortcut.
beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false) as never;
  Element.prototype.setPointerCapture = vi.fn() as never;
  Element.prototype.releasePointerCapture = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn() as never;
});

/** Fill a COMPLETE guest delivery form through the rendered controls. */
async function fillGuestForm() {
  const setInput = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) throw new Error(`guest form is missing #${id}`);
    fireEvent.change(el, { target: { value } });
  };
  setInput("name", "Guest Person");
  setInput("phone", "07900000003");

  const trigger = document.querySelector('[role="combobox"]') as HTMLElement | null;
  if (!trigger) throw new Error("guest form is missing the governorate picker");
  // Keyboard, not pointer: Radix opens on ArrowDown, and jsdom's pointer emulation is unreliable.
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  // Radix also renders a hidden native <select> for form compat, so match the listbox item only.
  const matches = await screen.findAllByText(/Gov A/);
  const option = matches.find((el) => !el.closest("select"));
  if (!option) throw new Error("governorate option Gov A did not render");
  fireEvent.click(option);

  await waitFor(() => expect(document.getElementById("area")).toBeTruthy());
  setInput("area", "Guest-Area");
}

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

/** Read every customer-derived input the form owns, by its current DOM value. */
function formValues() {
  const values: string[] = [];
  document.querySelectorAll("input, textarea").forEach((el) => {
    const v = (el as HTMLInputElement | HTMLTextAreaElement).value;
    if (v) values.push(v);
  });
  return values;
}

beforeEach(() => {
  H.state.savedAddresses = [];
  H.state.profile = null;
  H.state.submitted = [];
  H.state.deferSubmit = false;
  H.state.failSubmit = false;
  principalVersion = 0;
  lastPrincipalOwner = null;
  H.state.resolveSubmit = null;
  H.state.provisionalStarted = 0;
  H.state.deferProvisional = false;
  H.state.resolveProvisional = null;
  H.state.deferAttemptLookup = false;
  H.state.rejectAttemptLookup = null;
  clearCart.mockClear();
  navigateSpy.mockClear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe("§9.3 Checkout — customer-derived local state across an identity replacement", () => {
  it("MANDATORY: none of customer A's data survives into customer B's checkout", async () => {
    // ── Customer A, with a populated profile and a default saved address.
    H.state.savedAddresses = [A_ADDRESS];
    mockAuth = authFor("cust-A", A_PROFILE);
    const { rerender } = renderCheckout();

    await waitFor(() => expect(formValues().join("|")).toContain("Customer A"));
    const asA = formValues().join("|");
    expect(asA).toContain("Customer A");
    expect(asA).toContain("07700000001");
    expect(asA).toContain("A-Area");

    // ── Another tab redeemed customer B. This route is public, so Checkout stays mounted. B has empty
    // profile fields and NO saved addresses — exactly the shape that used to inherit A's values.
    H.state.savedAddresses = [];
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.queryByDisplayValue("Customer A")).toBeNull());

    // No field of A's may remain anywhere in the form — this is what B would otherwise submit.
    const asB = formValues().join("|");
    for (const leaked of ["Customer A", "07700000001", "A-Area", "A-Landmark", "A-Notes", "maps.example/A"]) {
      expect(asB).not.toContain(leaked);
    }
  });
});

// ── the principal boundary itself ───────────────────────────────────────────
import { renderHook } from "@testing-library/react";
import { useResetOnPrincipalReplaced } from "@/lib/auth/use-customer-principal";

/** Ownership is derived from the SESSION, so drive the hook the way the provider actually does. */
function sessionAuth(authSource: string | null, customerId: string | null) {
  if (!authSource) return withPrincipal({ appSession: null, user: null });
  return withPrincipal({
    appSession: {
      authSource,
      accessToken: "a",
      accessExpiresAt: Date.now() + 1e6,
      user: { id: customerId ?? "", email: null, phone: null },
    },
    // The CONTEXT user is deliberately varied independently below: it must not drive ownership.
    user: customerId ? { id: customerId } : null,
  });
}

describe("§9.3 principal-owned state boundary", () => {
  it("follows the approved transition matrix", () => {
    const reset = vi.fn();

    // guest → federated:A — the guest-to-provisional checkout flow keeps what the guest typed.
    mockAuth = sessionAuth(null, null);
    const { rerender } = renderHook(() => useResetOnPrincipalReplaced(reset));
    mockAuth = sessionAuth("DilMart_federated", "cust-A");
    rerender();
    expect(reset).not.toHaveBeenCalled();

    // federated:A → federated:A — token rotation. Still their checkout.
    rerender();
    expect(reset).not.toHaveBeenCalled();

    // federated:A → federated:B — a different person must not inherit A's data.
    mockAuth = sessionAuth("DilMart_federated", "cust-B");
    rerender();
    expect(reset).toHaveBeenCalledTimes(1);

    // federated:B → null — private data must not remain exposed once the owner is gone.
    mockAuth = sessionAuth(null, null);
    rerender();
    expect(reset).toHaveBeenCalledTimes(2);

    // null → supabase:A, then supabase:A → federated:A — a source change is a principal replacement.
    mockAuth = sessionAuth("supabase", "cust-A");
    rerender();
    expect(reset).toHaveBeenCalledTimes(2); // null → owner preserves
    mockAuth = sessionAuth("DilMart_federated", "cust-A");
    rerender();
    expect(reset).toHaveBeenCalledTimes(3);
  });

  it("MANDATORY: a same-customer NEW FAMILY redeem preserves the form, even as the context user blinks", () => {
    const reset = vi.fn();

    // Customer A, fully resolved.
    mockAuth = sessionAuth("DilMart_federated", "cust-A");
    const { rerender } = renderHook(() => useResetOnPrincipalReplaced(reset));

    // A redeems a NEW session family. establishFromRedeem installs A directly, so the SESSION owner never
    // changes — but the auth-context query is re-keyed by the new epoch, so the CONTEXT user blinks to
    // null and back. Keying ownership on the context user read this as A → null → A and wiped the form.
    mockAuth = withPrincipal({ ...sessionAuth("DilMart_federated", "cust-A"), user: null });
    rerender();
    expect(reset).not.toHaveBeenCalled();

    mockAuth = sessionAuth("DilMart_federated", "cust-A"); // context resolves the same customer
    rerender();
    expect(reset).not.toHaveBeenCalled();
  });

  it("an unresolved federated identity is NOT an owner, so A → unresolved → B resets", () => {
    const reset = vi.fn();
    mockAuth = sessionAuth("DilMart_federated", "cust-A");
    const { rerender } = renderHook(() => useResetOnPrincipalReplaced(reset));

    // A cross-identity refresh blanks appSession.user.id by design: the adapter drops an identity it
    // cannot prove. That is "no owner", so A's data is dropped on the way through.
    mockAuth = sessionAuth("DilMart_federated", "");
    rerender();
    expect(reset).toHaveBeenCalledTimes(1);

    mockAuth = sessionAuth("DilMart_federated", "cust-B");
    rerender();
    expect(reset).toHaveBeenCalledTimes(1); // null → B preserves; A's data already went
  });
});

// ── the actual invariant: what B SUBMITS ────────────────────────────────────
/** Every value that belongs to customer A and must never reach customer B's order. */
const A_VALUES = ["Customer A", "07700000001", "A-Area", "A-Landmark", "A-Notes", "https://maps.example/A", "gov-A"];

function deepStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepStrings(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => deepStrings(v, out));
  return out;
}

describe("§9.3 Checkout — the submitted payload", () => {
  it("MANDATORY: B's checkoutSubmit payload is B's data and contains NONE of A's", async () => {
    H.state.savedAddresses = [A_ADDRESS];
    mockAuth = authFor("cust-A", A_PROFILE);
    const { rerender } = renderCheckout();
    await waitFor(() => expect(formValues().join("|")).toContain("A-Landmark"));

    // Customer B takes over the same mounted route, with their OWN saved address so every required
    // field hydrates legitimately as B.
    H.state.savedAddresses = [B_ADDRESS];
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(formValues().join("|")).toContain("B-Landmark"));
    expect(screen.queryByDisplayValue("Customer A")).toBeNull();

    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);

    // The submission must ACTUALLY have happened — a test that never reaches checkoutSubmit proves
    // nothing, and an empty `submitted` array would satisfy any "contains none of A" assertion.
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));

    const payload = H.state.submitted[0] as Record<string, unknown>;
    expect(payload.customer_name).toBe("Customer B");
    expect(payload.customer_phone).toBe("07800000002");
    expect(payload.governorate_id).toBe("gov-B");
    expect(payload.area).toBe("B-Area");

    // And nothing of A's anywhere in it.
    const submittedStrings = deepStrings(payload);
    for (const leaked of A_VALUES) {
      expect(submittedStrings.some((v) => v.includes(leaked))).toBe(false);
    }
  });

  it("MANDATORY: a guest who becomes provisionally authenticated keeps the form they typed", async () => {
    // No authenticated customer: a guest filling in the delivery form.
    mockAuth = withPrincipal({ user: null, profile: null, session: null, appSession: null, authSource: null, authStatus: "unauthenticated", establishProvisionalSession: vi.fn() });
    const { rerender } = renderCheckout();

    const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
    if (inputs[0]) fireEvent.change(inputs[0], { target: { value: "Guest Person" } });
    if (inputs[1]) fireEvent.change(inputs[1], { target: { value: "07900000003" } });
    expect(formValues().join("|")).toContain("Guest Person");

    // Checkout creates a provisional customer underneath them — the principal appears for the first time.
    mockAuth = withPrincipal({
      user: { id: "provisional-1", email: null, phone: null },
      profile: null,
      session: { access_token: "a" },
      appSession: { authSource: "supabase", accessToken: "a", accessExpiresAt: Date.now() + 1e6, user: { id: "provisional-1", email: null, phone: null } },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      establishProvisionalSession: vi.fn(),
    });
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // guest → authenticated is NOT a replacement: what the guest typed must survive.
    await waitFor(() => expect(formValues().join("|")).toContain("Guest Person"));
    expect(formValues().join("|")).toContain("07900000003");
  });
});

// ── async work must stay bound to the principal that started it ─────────────
/**
 * The render-phase reset protects state held AT the moment the owner changes. It cannot help work that
 * already left the browser under customer A and lands after the tab belongs to B: those continuations
 * write into B's mounted component. Each such operation captures a continuity generation when it starts
 * and re-checks it before every commit.
 */
describe("§9.3 Checkout — async operations are principal-bound", () => {
  async function fillRequired(name: string, phone: string, area: string) {
    const inputs = Array.from(document.querySelectorAll("input")) as HTMLInputElement[];
    if (inputs[0]) fireEvent.change(inputs[0], { target: { value: name } });
    if (inputs[1]) fireEvent.change(inputs[1], { target: { value: phone } });
    const areaInput = inputs.find((i) => i !== inputs[0] && i !== inputs[1]);
    if (areaInput) fireEvent.change(areaInput, { target: { value: area } });
  }

  it("MANDATORY: a stale A checkout result is not applied to B", async () => {
    H.state.savedAddresses = [A_ADDRESS];
    mockAuth = authFor("cust-A", A_PROFILE);
    const { rerender } = renderCheckout();
    // Wait for an ADDRESS-only field: the profile fills name/phone/area sooner, and submitting before
    // the address has hydrated governorate_id fails required-field validation — which would make this
    // test pass without ever issuing a request.
    await waitFor(() => expect(formValues().join("|")).toContain("A-Landmark"));

    // A submits; the request leaves and is held open.
    H.state.deferSubmit = true;
    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);
    // Prove the request actually left as A before going any further.
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));

    // Customer B takes over the tab while A's request is still in flight.
    H.state.savedAddresses = [B_ADDRESS];
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(formValues().join("|")).toContain("B-Landmark"));

    clearCart.mockClear();
    navigateSpy.mockClear();

    // A's completion finally arrives — under B's mounted UI.
    H.state.resolveSubmit?.();
    await new Promise((r) => setTimeout(r, 80));

    // B must not be sent to A's order, and B's cart must not be cleared by A's completion.
    const navigatedTo = navigateSpy.mock.calls.map((c) => String(c[0])).join("|");
    expect(navigatedTo).not.toContain("A-ORDER-999");
    expect(clearCart).not.toHaveBeenCalled();
  });

  it("MANDATORY: a stale A geolocation callback does not reach B's submitted order", async () => {
    let successCb: ((p: unknown) => void) | null = null;
    const getCurrentPosition = vi.fn((ok: (p: unknown) => void) => {
      successCb = ok;
    });
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });

    H.state.savedAddresses = [A_ADDRESS];
    mockAuth = authFor("cust-A", A_PROFILE);
    const { rerender } = renderCheckout();
    await waitFor(() => expect(formValues().join("|")).toContain("A-Landmark"));

    // A starts a location request; the callback is deliberately not invoked yet.
    const locationButton = Array.from(document.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("موقعي"),
    );
    expect(locationButton).toBeTruthy();
    if (locationButton) fireEvent.click(locationButton);
    expect(getCurrentPosition).toHaveBeenCalled();

    // Customer B takes over.
    H.state.savedAddresses = [B_ADDRESS];
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(formValues().join("|")).toContain("B-Landmark"));

    // A's position finally resolves. Coordinates are NOT rendered as input values, so the only
    // meaningful observation is what B would actually send.
    successCb?.({ coords: { latitude: 33.3152, longitude: 44.3661 } });
    await new Promise((r) => setTimeout(r, 50));

    H.state.submitted.length = 0;
    const form = document.querySelector("form");
    if (form) fireEvent.submit(form);
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));

    const payload = H.state.submitted[0] as Record<string, unknown>;
    expect(payload.latitude).toBeNull();
    expect(payload.longitude).toBeNull();
    expect(payload.map_url).not.toContain("33.3152");
    vi.unstubAllGlobals();
  });

  it("MANDATORY: B never reuses A's checkout attempt id", async () => {
    H.state.savedAddresses = [A_ADDRESS];
    mockAuth = authFor("cust-A", A_PROFILE);
    const { rerender } = renderCheckout();
    await waitFor(() => expect(formValues().join("|")).toContain("A-Landmark"));

    // A's submit FAILS, so A's attempt id deliberately survives in storage for an idempotent retry.
    // That is the case where B could inherit it — a successful submit would have cleared it.
    H.state.failSubmit = true;
    const formA = document.querySelector("form");
    if (formA) fireEvent.submit(formA);
    await waitFor(() => expect(H.state.submitted.length).toBeGreaterThan(0));
    const attemptA = (H.state.submitted[0] as { checkout_attempt_id?: string })?.checkout_attempt_id;
    expect(attemptA).toBeTruthy();

    // Customer B takes over WITH THEIR OWN saved address, so B's required fields hydrate legitimately.
    // A's attempt is owned by A and the backend would 403 B for presenting it.
    H.state.savedAddresses = [B_ADDRESS];
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.queryByDisplayValue("Customer A")).toBeNull());

    await waitFor(() => expect(formValues().join("|")).toContain("B-Landmark"));
    // No principal-authority reset here. It would fabricate a state production cannot reach — the
    // authority reporting nobody while the screen renders customer B — and Checkout now refuses to submit
    // in exactly that mismatch. B still cannot reuse A's attempt, because attempt storage is owner-scoped.
    H.state.failSubmit = false;
    H.state.submitted.length = 0;
    const formB = document.querySelector("form");
    if (formB) fireEvent.submit(formB);
    await waitFor(() => expect(H.state.submitted.length).toBeGreaterThan(0));

    const attemptB = (H.state.submitted[0] as { checkout_attempt_id?: string })?.checkout_attempt_id;
    expect(attemptB).toBeTruthy();
    expect(attemptB).not.toBe(attemptA);
  });
});

/**
 * `null → owner` is safe as a UI RESET policy: a guest's own provisional upgrade should keep the form
 * they just typed. It is NOT safe for ASYNC CONTINUITY. A guest submit already in flight when an
 * unrelated customer signs in is not that guest's upgrade, and establishProvisionalSession() calls
 * prepareForSupabaseAuthentication(), which logs out the active federated identity — so a stale guest
 * operation could destroy customer B's session outright.
 */
describe("§9.3 a stale guest operation vs an unrelated principal", () => {
  function guestAuth(establish: ReturnType<typeof vi.fn>) {
    return withPrincipal({
      user: null,
      profile: null,
      session: null,
      appSession: null,
      authSource: null,
      authStatus: "unauthenticated",
      establishProvisionalSession: establish,
    });
  }

  const provisionalEstablish = () => provisionalEstablishMock();

  it("MANDATORY: a stale guest submit never establishes a session or orders as customer B", async () => {
    const establish = provisionalEstablish();
    mockAuth = guestAuth(establish);
    const { rerender } = renderCheckout();
    await fillGuestForm();

    // Guest submits. Provisioning is held open so the transition lands mid-operation.
    H.state.deferProvisional = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.provisionalStarted).toBe(1));
    expect(establish).not.toHaveBeenCalled();

    // An UNRELATED customer B signs in while the guest's provisioning is still in flight.
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    H.state.submitted.length = 0;

    // The stale guest operation finally resumes.
    H.state.resolveProvisional!();
    await new Promise((r) => setTimeout(r, 120));

    // It must neither mutate the session nor place an order under B.
    expect(establish).not.toHaveBeenCalled();
    expect(H.state.submitted).toHaveLength(0);
  });

  it("MANDATORY: the real guest → provisional → submit flow persists its attempt under the PROVISIONAL owner", async () => {
    const establish = provisionalEstablish();
    mockAuth = guestAuth(establish);
    renderCheckout();
    await fillGuestForm();

    fireEvent.submit(document.querySelector("form")!);

    // The production path really ran end to end: provisional user created, session established, order sent.
    await waitFor(() => expect(H.state.provisionalStarted).toBe(1));
    await waitFor(() => expect(establish).toHaveBeenCalled());
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));

    // The caller hands the lifecycle owner the authoritative snapshot its operation began under, so the
    // owner can verify it against its own state instead of trusting this component's earlier check.
    const expectedArg = (establish.mock.calls[0] as unknown[])[2] as { owner: string | null; version: number };
    expect(expectedArg).toMatchObject({ owner: null, version: expect.any(Number) });

    // The attempt is owned by the principal that actually SENT it — not the `null` the guest closure
    // captured before the upgrade, which would break owner-scoped idempotent retry.
    const sent = H.state.submitted[0] as { checkout_attempt_id?: string };
    expect(sent.checkout_attempt_id).toBeTruthy();
  });

  it("MANDATORY: a provisional retry after a lost response reuses the SAME attempt id", async () => {
    const establish = provisionalEstablish();
    mockAuth = guestAuth(establish);
    const { rerender } = renderCheckout();
    await fillGuestForm();

    // First submit: the response is lost (network failure after the server may have accepted it).
    H.state.failSubmit = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));
    const firstAttempt = (H.state.submitted[0] as { checkout_attempt_id?: string }).checkout_attempt_id;
    expect(firstAttempt).toBeTruthy();

    // The provisional session from the first attempt is now the live principal.
    mockAuth = withPrincipal({
      user: { id: "provisional-1", email: null, phone: null },
      profile: null,
      session: null,
      appSession: {
        authSource: "supabase",
        accessToken: "pt",
        accessExpiresAt: Date.now() + 1e6,
        user: { id: "provisional-1", email: null, phone: null },
      },
      authSource: "supabase",
      authStatus: "authenticated_ready",
      establishProvisionalSession: establish,
    });

    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    // null -> its own provisional upgrade PRESERVES the form, so the retry is the same purchase.
    await waitFor(() => expect(formValues().join("|")).toContain("Guest-Area"));

    // The SAME customer retries. Reading a differently-owned attempt would mint a new id and let the
    // backend create a second order for one purchase.
    H.state.failSubmit = false;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted).toHaveLength(2));
    expect((H.state.submitted[1] as { checkout_attempt_id?: string }).checkout_attempt_id).toBe(
      firstAttempt,
    );
  });
});

describe("§9.3 overlapping submits across a principal change", () => {
  it("MANDATORY: customer A's stale finally does not clear customer B's in-flight busy state", async () => {
    H.state.savedAddresses = [A_ADDRESS];
    mockAuth = authFor("cust-A", A_PROFILE);
    const { rerender } = renderCheckout();
    await waitFor(() => expect(formValues().join("|")).toContain("A-Landmark"));

    // A submits; the request is held open.
    H.state.deferSubmit = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));
    const resolveA = H.state.resolveSubmit!;
    H.state.resolveSubmit = null;

    // Customer B takes over and starts their OWN submit, which is also held open.
    H.state.savedAddresses = [B_ADDRESS];
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(formValues().join("|")).toContain("B-Landmark"));
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted).toHaveLength(2));

    const submitButton = () =>
      Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("type") === "submit")!;
    await waitFor(() => expect(submitButton().hasAttribute("disabled")).toBe(true));

    // A's request now completes. Its `finally` runs against a component owned by B, whose own request
    // is still running — clearing the busy flag here would re-enable submit and allow a double order.
    resolveA();
    await new Promise((r) => setTimeout(r, 120));

    expect(submitButton().hasAttribute("disabled")).toBe(true);
    expect(H.state.submitted).toHaveLength(2);
  });
});

describe("§9.3 stale recovery paths", () => {
  it("MANDATORY: a REJECTED attempt lookup does not surface A's error toast under B", async () => {
    H.state.savedAddresses = [A_ADDRESS];
    mockAuth = authFor("cust-A", A_PROFILE);
    const { rerender } = renderCheckout();
    await waitFor(() => expect(formValues().join("|")).toContain("A-Landmark"));

    // A's submit fails, so recovery starts — and the recovery lookup itself is held open.
    H.state.failSubmit = true;
    H.state.deferAttemptLookup = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted.length).toBeGreaterThan(0));
    await waitFor(() => expect(H.state.rejectAttemptLookup).not.toBeNull());

    // Customer B takes over while the recovery lookup is still in flight.
    H.state.savedAddresses = [B_ADDRESS];
    mockAuth = authFor("cust-B", B_PROFILE);
    rerender(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={["/checkout"]}>
          <Checkout />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(formValues().join("|")).toContain("B-Landmark"));
    vi.mocked(toast.error).mockClear();

    // The lookup REJECTS. The inner catch swallowed it and fell straight through to A's toast.
    H.state.rejectAttemptLookup!();
    await new Promise((r) => setTimeout(r, 120));

    expect(vi.mocked(toast.error)).not.toHaveBeenCalled();
  });
});
