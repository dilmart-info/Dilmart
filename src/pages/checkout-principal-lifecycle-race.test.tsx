// @vitest-environment jsdom
/**
 * §9.3 — principal continuity must be authoritative at the SESSION LIFECYCLE OWNER, not at a React render.
 *
 * The component-level suite (`checkout-identity-transition.test.tsx`) mocks `useAuth` and re-renders the
 * new customer before resuming the stale operation. That proves the component guard works *after* React
 * has caught up. It cannot prove the property that actually matters here, because a promise continuation
 * is a microtask and a React commit is not: an identity can be installed in AuthSessionManager and the
 * stale continuation can resume *before* any component re-renders.
 *
 * So this file uses the REAL AuthProvider and the REAL AuthSessionManager, with only the network edges
 * faked, and drives the real `/checkout` guest flow. Every assertion is about what the lifecycle owner
 * actually holds, never about what has been rendered.
 */
import { describe, expect, it, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("@/lib/capacitor", () => ({ isNative: () => false, openExternal: vi.fn(), shouldOpenExternally: () => false }));
vi.mock("@/components/Header", () => ({ default: () => <header>h</header> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer>f</footer> }));
vi.mock("@/components/WhatsAppButton", () => ({ default: () => null }));
vi.mock("sonner", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn() } }));
vi.mock("@/lib/growth-hooks", () => ({ trackGrowthHookEvent: vi.fn() }));
vi.mock("@/lib/whatsapp-assisted", () => ({ startTrackedWhatsAppIntent: vi.fn() }));
// The manager deletes persisted Supabase auth state when adopting a federated identity; that is storage,
// not lifecycle, and it is proven elsewhere.
vi.mock("@/lib/auth/auth-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/auth-storage")>()),
  clearPersistedAuthSession: vi.fn(async () => undefined),
}));
vi.mock("@/lib/auth/auth-storage-bootstrap", () => ({
  ensureAuthStorageReady: vi.fn(async () => undefined),
  getAuthStorageBootstrapError: () => null,
  retryAuthStorageBootstrap: vi.fn(async () => undefined),
}));

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

const PROVISIONAL_ID = "provisional-P";

const H = vi.hoisted(() => {
  const state: {
    submitted: unknown[];
    provisionalStarted: number;
    deferProvisional: boolean;
    resolveProvisional: (() => void) | null;
    deferContext: boolean;
    /** Every access token the auth-context call was made with, in order. */
    contextTokens: Array<string | null>;
    resolveContext: (() => void) | null;
    deferSubmit: boolean;
    resolveSubmit: (() => void) | null;
  } = {
    submitted: [],
    provisionalStarted: 0,
    deferProvisional: false,
    resolveProvisional: null,
    deferContext: false,
    contextTokens: [],
    resolveContext: null,
    deferSubmit: false,
    resolveSubmit: null,
  };
  const api = {
    getShippingGovernorates: async () => [{ id: "gov-A", name: "Gov A", delivery_price: 5000 }],
    getRegions: async () => [],
    getCustomerAddresses: async () => [],
    getCustomerOrders: async () => [],
    getCustomerOrderDetail: async () => ({}),
    getCustomerProfile: async () => null,
    loyaltyPreview: async () => ({ available_points: 0, redeemable_amount: 0 }),
    validateCoupon: async () => ({}),
    getCheckoutAttempt: async () => ({ status: "succeeded" }),
    createProvisionalUser: () => {
      state.provisionalStarted += 1;
      if (state.deferProvisional) {
        return new Promise((resolve) => {
          state.resolveProvisional = () => resolve({ email: "guest@provisional.local", password: "pw" });
        });
      }
      return Promise.resolve({ email: "guest@provisional.local", password: "pw" });
    },
    getAuthContext: (accessToken?: string) => {
      state.contextTokens.push(accessToken ?? null);
      if (state.deferContext) {
        return new Promise((resolve) => {
          state.resolveContext = () =>
            resolve({
              user: { id: PROVISIONAL_ID, email: null, phone: null },
              profile: null,
              roles: ["customer"],
              activeRole: "customer",
              merchant: null,
              authSource: "supabase",
              capabilities: {},
            });
        });
      }
      return Promise.resolve({
        user: { id: PROVISIONAL_ID, email: null, phone: null },
        profile: null,
        roles: ["customer"],
        activeRole: "customer",
        merchant: null,
        authSource: "supabase",
        capabilities: {},
      });
    },
    checkoutSubmit: (payload: unknown) => {
      state.submitted.push(payload);
      if (state.deferSubmit) {
        return new Promise((resolve) => {
          state.resolveSubmit = () => resolve({ order_id: "o-P", order_number: "ORD-P" });
        });
      }
      return Promise.resolve({ order_id: "o-P", order_number: "ORD-P" });
    },
  };
  return { state, api };
});
vi.mock("@/lib/api-client", () => ({
  apiClient: new Proxy(H.api, { get: (t: any, k: string) => t[k] ?? (async () => ({})) }),
}));

/** The provisional Supabase sign-in action. The real one talks to Supabase; the lifecycle is what matters. */
const provisionalSignIn = vi.hoisted(() => vi.fn());
let deferProvisionalSignIn = false;
let releaseProvisionalSignIn: (() => void) | null = null;
vi.mock("@/lib/auth/auth-actions", async () => {
  const noop = vi.fn(async () => ({}) as any);
  return {
    establishProvisionalSession: (...args: unknown[]) => provisionalSignIn(...args),
    signInWithPassword: noop,
    signUpWithPassword: noop,
    resendSignupEmail: noop,
    requestEmailOtp: noop,
    verifyEmailOtp: noop,
    requestPhoneOtp: noop,
    verifyPhoneOtp: noop,
    requestEmailPasswordRecovery: noop,
    verifyEmailRecoveryOtp: noop,
    updatePasswordInSession: noop,
    startPhoneChange: noop,
    verifyPhoneChange: noop,
    getVerifiedAuthPhone: noop,
  };
});

import Checkout from "./Checkout";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { authSessionManager } from "@/lib/auth/auth-session-manager";
import { useAuth } from "@/hooks/use-auth";

// ── the federated customer B who must survive a stale guest operation ────────
const B = {
  authSource: "DilMart_federated" as const,
  accessToken: "at-B",
  accessExpiresAt: Date.now() + 600_000,
  user: { id: "fed-cust-B", email: null, phone: null },
  federated: { linkedProfileId: "lp-B", refreshExpiresAt: Date.now() + 2_592_000_000 },
};

/**
 * Duck-typed federated adapter. `logout()` is the destructive call under test: the whole point of the
 * lifecycle precondition is that a stale guest operation can never reach it.
 */
function makeFederatedAdapter() {
  let session: typeof B | null = null;
  let lifecycleListener: ((event: unknown) => void) | null = null;
  const logout = vi.fn(async () => {
    session = null;
    lifecycleListener?.({ type: "session_cleared" });
  });
  return {
    logout,
    /**
     * Publish an identity change the way the real adapter does when another tab of the same browser
     * profile replaces the shared refresh cookie: SYNCHRONOUSLY, with no await anywhere. That is what
     * makes the race deterministic — React cannot possibly have rendered in between.
     */
    installIdentitySynchronously: (next: typeof B | null) => {
      session = next;
      lifecycleListener?.({ type: "session_changed" });
    },
    setLifecycleListener: (l: (event: unknown) => void) => {
      lifecycleListener = l;
    },
    getSession: () => session,
    bootstrap: async () => null,
    // Adopting the federated SOURCE and resolving an identity into it are separate steps, exactly as in
    // production: the redeem flips the source, and the identity arrives when the adapter publishes it.
    establishFromRedeem: async () => session,
    getIdentityEpoch: () => 1,
    isIdentityResolutionPending: () => false,
    getStorageError: () => null,
    logoutAll: vi.fn(async () => undefined),
    refreshSingleFlight: vi.fn(async () => ({ status: "refreshed", accessToken: B.accessToken })),
    getValidAccessToken: async () => (session ? session.accessToken : null),
    getValidAccessTokenOutcome: async () => ({ token: session ? session.accessToken : null }),
    getAccessTokenForIdentityResolution: async () => ({ token: session?.accessToken ?? null, epoch: 1 }),
    getOrCreateDeviceId: async () => "dev-test",
    applyVerifiedIdentity: () => true,
  };
}
let federatedAdapter: ReturnType<typeof makeFederatedAdapter>;

/** An unrelated customer who can be installed with NO await at all — see the context-fetch race below. */
const B_SUPABASE = {
  access_token: "at-B2",
  expires_at: Math.floor((Date.now() + 600_000) / 1000),
  user: { id: "supa-cust-B2", email: null, phone: null },
};

/**
 * Minimal Supabase auth client. It must REMEMBER the session the provisional sign-in created: the manager
 * re-reads `getSession()` on several paths and writes the answer back into its own state, so a fake that
 * always answered `null` would silently delete the provisional identity mid-flow.
 */
let currentSupabaseSession: any = null;
let supabaseAuthStateCallback: ((event: string, session: any) => void) | null = null;
const setSessionSpy = vi.fn(async (tokens: { access_token: string; refresh_token: string }) => {
  const session = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Math.floor((Date.now() + 600_000) / 1000),
    user: { id: PROVISIONAL_ID, email: "guest@provisional.local", phone: null },
  };
  currentSupabaseSession = session;
  // The real SDK publishes before its promise resolves.
  supabaseAuthStateCallback?.("SIGNED_IN", session);
  return { data: { session }, error: null };
});
function makeSupabaseAuth() {
  return {
    getSession: vi.fn(async () => ({ data: { session: currentSupabaseSession }, error: null })),
    refreshSession: vi.fn(async () => ({ data: { session: currentSupabaseSession }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    // The authoritative install. Only AuthSessionManager.commitProvisionalAuthentication reaches this.
    setSession: setSessionSpy,
    onAuthStateChange: vi.fn((cb: (event: string, session: any) => void) => {
      supabaseAuthStateCallback = cb;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    }),
    startAutoRefresh: vi.fn(async () => undefined),
    stopAutoRefresh: vi.fn(async () => undefined),
  };
}

/** Renders the principal the PROVIDER has committed, so a test can assert React has NOT caught up yet. */
function RenderedPrincipalProbe() {
  const { principalOwner } = useAuth();
  return <div data-testid="rendered-principal">{principalOwner ?? "none"}</div>;
}

function renderCheckout() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/checkout"]}>
        <AuthProvider>
          <RenderedPrincipalProbe />
          <Checkout />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Fill a COMPLETE guest delivery form through the rendered controls. */
async function fillGuestForm() {
  const setInput = (id: string, value: string) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) throw new Error(`guest form is missing #${id}`);
    fireEvent.change(el, { target: { value } });
  };
  setInput("name", "Guest Person");
  setInput("phone", "07900000009");

  const trigger = document.querySelector('[role="combobox"]') as HTMLElement | null;
  if (!trigger) throw new Error("guest form is missing the governorate picker");
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  const matches = await screen.findAllByText(/Gov A/);
  const option = matches.find((el) => !el.closest("select"));
  if (!option) throw new Error("governorate option Gov A did not render");
  fireEvent.click(option);

  await waitFor(() => expect(document.getElementById("area")).toBeTruthy());
  setInput("area", "Guest-Area");
}

/**
 * Install customer B in the ACTUAL session lifecycle, synchronously and outside `act()`.
 *
 * That is the whole point: the manager's state changes and its subscribers are notified in this call,
 * while React's resulting re-render is merely SCHEDULED. Any promise continuation that resumes before
 * that render still sees the previous principal in every rendered value — which is precisely the window
 * a real cross-tab handoff opens.
 */
function installFederatedBWithoutRender() {
  federatedAdapter.installIdentitySynchronously(B);
}

/**
 * Make the federated source active while it still holds NO identity — the state a web visitor is in
 * before any handoff resolves. They remain a genuine guest (no session, no owner), but the adapter can
 * now publish an identity into this source synchronously, as a cross-tab cookie replacement does.
 *
 * Done after the provider's own bootstrap has settled, because bootstrap deliberately selects the source
 * itself and would otherwise overwrite this.
 */
async function armFederatedSource() {
  await act(async () => {
    await authSessionManager.establishFederatedSessionFromRedeem({
      session: { accessToken: "at-none", expiresIn: 600, refreshToken: "rt", refreshExpiresIn: 2_592_000 },
    } as any);
  });
  expect(authSessionManager.getAppSession()).toBeNull();
}

/**
 * Change the Supabase identity through the manager's own `onAuthStateChange` wrapper — the production
 * path — synchronously and with no await. Used to replace or sign out the active customer at an exact
 * point in another operation's await chain.
 */
function setSupabaseIdentitySynchronously(session: any) {
  currentSupabaseSession = session;
  supabaseAuthStateCallback?.(session ? "SIGNED_IN" : "SIGNED_OUT", session);
}

/**
 * Drain MICROTASKS only, never a timer.
 *
 * Every faked network call here settles on a microtask, so a parked operation runs to completion. React's
 * scheduler, by contrast, dispatches through a MessageChannel task, so it CANNOT run during this drain.
 * That is what pins the window this whole file is about: the lifecycle has moved on, the operation is
 * resuming, and not one component has re-rendered. A settle based on timers would let React commit first
 * and would quietly test the render-time guard instead.
 */
async function drainMicrotasksOnly(ticks = 200) {
  for (let i = 0; i < ticks; i += 1) await Promise.resolve();
}

beforeAll(() => {
  Element.prototype.hasPointerCapture = vi.fn(() => false) as never;
  Element.prototype.setPointerCapture = vi.fn() as never;
  Element.prototype.releasePointerCapture = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn() as never;
});

beforeEach(() => {
  authSessionManager.resetForTests();
  federatedAdapter = makeFederatedAdapter();
  authSessionManager.setFederatedAdapter(federatedAdapter as any);
  authSessionManager.setClient({ auth: makeSupabaseAuth() } as any);
  authSessionManager.setNativeRuntimeForTests(() => false);

  H.state.submitted = [];
  H.state.provisionalStarted = 0;
  H.state.deferProvisional = false;
  H.state.resolveProvisional = null;
  H.state.deferContext = false;
  H.state.contextTokens = [];
  H.state.resolveContext = null;
  H.state.deferSubmit = false;
  H.state.resolveSubmit = null;
  currentSupabaseSession = null;
  supabaseAuthStateCallback = null;
  releaseProvisionalSignIn = null;
  deferProvisionalSignIn = false;
  provisionalSignIn.mockReset();
  setSessionSpy.mockClear();
  provisionalSignIn.mockImplementation(() => {
    // The isolated credential exchange returns a CANDIDATE. It deliberately publishes nothing and
    // installs nothing: the guarded commit is the only thing allowed to make it authoritative.
    const complete = () => ({
      session: {
        access_token: "at-provisional",
        refresh_token: "rt-provisional",
        expires_at: Math.floor((Date.now() + 600_000) / 1000),
        user: { id: PROVISIONAL_ID, email: "guest@provisional.local", phone: null },
      },
    });
    if (deferProvisionalSignIn) {
      return new Promise((resolve) => {
        releaseProvisionalSignIn = () => resolve(complete());
      });
    }
    return Promise.resolve(complete());
  });
  navigateSpy.mockReset();
  clearCart.mockReset();
  sessionStorage.clear();
});

afterEach(() => {
  authSessionManager.resetForTests();
});

describe("§9.3 the principal precondition lives with the session lifecycle, not with React", () => {
  it("MANDATORY: a stale guest operation is rejected when the manager already holds B and React has NOT rendered it", async () => {
    renderCheckout();
    await fillGuestForm();
    await armFederatedSource();

    // The guest submits. Provisioning is held open, so the operation is parked mid-flight with the
    // principal it started under.
    H.state.deferProvisional = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.provisionalStarted).toBe(1));

    // THE RACE, in one synchronous block so the ordering is a fact rather than a hope:
    //   1. resolve the guest's pending call — its continuation is now QUEUED as a microtask;
    //   2. install customer B in the real lifecycle — the manager changes now, React's re-render is only
    //      SCHEDULED, and its work was queued after the continuation's.
    // The continuation therefore runs while the manager holds B and every rendered value still says guest,
    // which is exactly what a cross-tab handoff produces.
    H.state.resolveProvisional!();
    installFederatedBWithoutRender();

    expect(authSessionManager.getAppSession()?.user.id).toBe(B.user.id); // the manager already holds B
    expect(screen.getByTestId("rendered-principal").textContent).toBe("none"); // React has NOT caught up

    await drainMicrotasksOnly();

    // B must survive intact: not revoked, not replaced, and no order placed on their behalf.
    expect(federatedAdapter.logout).not.toHaveBeenCalled();
    expect(provisionalSignIn).not.toHaveBeenCalled();
    expect(authSessionManager.getActiveSource()).toBe("DilMart_federated");
    expect(authSessionManager.getAppSession()?.user.id).toBe(B.user.id);
    expect(H.state.submitted).toHaveLength(0);

    // And it stays true once everything settles.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(federatedAdapter.logout).not.toHaveBeenCalled();
    expect(H.state.submitted).toHaveLength(0);
  });

  it("MANDATORY: an adopted provisional operation stops after its own principal logs out", async () => {
    renderCheckout();
    await fillGuestForm();

    // The guest becomes provisional customer P and P's order request is held open.
    H.state.deferSubmit = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));
    expect(authSessionManager.getAppSession()?.user.id).toBe(PROVISIONAL_ID);

    navigateSpy.mockReset();
    clearCart.mockReset();

    // P's response is released, then P signs out — both with no await, so the continuation resumes with
    // the lifecycle already empty and nothing re-rendered.
    H.state.resolveSubmit!();
    setSupabaseIdentitySynchronously(null);
    expect(authSessionManager.getAppSession()).toBeNull();

    await drainMicrotasksOnly();

    // Nobody owns this tab now, so nothing may be committed: a signed-out visitor must not be shown P's
    // order number, and P's cart must not be silently emptied.
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();
  });

  /**
   * The precondition at BEGIN is not the whole story. For an ordinary guest the active source is already
   * Supabase, so BEGIN returns immediately — and everything dangerous happens afterwards, while the
   * Supabase sign-in is in flight. If the result is installed unconditionally when it lands, an unrelated
   * customer who arrived in that window is simply replaced by a guest who stopped being current long ago.
   */
  it("MANDATORY: customer B arriving AFTER begin is not replaced when the provisional sign-in returns", async () => {
    renderCheckout();
    await fillGuestForm();

    // The guest submits and the provisional Supabase sign-in is held open. The transaction has already
    // begun and its precondition has already passed.
    deferProvisionalSignIn = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(releaseProvisionalSignIn).not.toBeNull());
    expect(federatedAdapter.logout).not.toHaveBeenCalled();

    // An unrelated federated customer B takes the tab while that sign-in is still running.
    await act(async () => {
      federatedAdapter.installIdentitySynchronously(B);
      await authSessionManager.establishFederatedSessionFromRedeem({
        session: { accessToken: B.accessToken, expiresIn: 600, refreshToken: "rt", refreshExpiresIn: 2_592_000 },
      } as any);
    });
    expect(authSessionManager.getAppSession()?.user.id).toBe(B.user.id);

    // The provisional sign-in now succeeds — too late to matter.
    releaseProvisionalSignIn!();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // B survives completely: same source, same identity, never revoked. P was never adopted, and the
    // stale checkout stopped instead of ordering.
    expect(authSessionManager.getActiveSource()).toBe("DilMart_federated");
    expect(authSessionManager.getAppSession()?.user.id).toBe(B.user.id);
    expect(federatedAdapter.logout).not.toHaveBeenCalled();
    expect(H.state.submitted).toHaveLength(0);
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  /**
   * THE PRODUCTION ORDERING for a Supabase competitor.
   *
   * "B arrives, then commit" was always caught. The sequence that was not is the stale sign-in finishing
   * AFTER B: running on the application's own Supabase client, it published `SIGNED_IN P` on its way out,
   * so every check that asked who is signed in now saw P and agreed P was current. The question was being
   * answered by the very operation being questioned.
   */
  it("MANDATORY: an unrelated SUPABASE customer B survives a provisional sign-in that finishes after them", async () => {
    renderCheckout();
    await fillGuestForm();

    // The guest submits; the provisional credential exchange is held open.
    deferProvisionalSignIn = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(releaseProvisionalSignIn).not.toBeNull());

    // An unrelated Supabase customer B takes the tab, through the real auth-state subscription.
    const B_SUPA = {
      access_token: "at-supa-B",
      refresh_token: "rt-supa-B",
      expires_at: Math.floor((Date.now() + 600_000) / 1000),
      user: { id: "supa-cust-B", email: null, phone: null },
    };
    await act(async () => {
      setSupabaseIdentitySynchronously(B_SUPA);
    });
    expect(authSessionManager.getAppSession()?.user.id).toBe("supa-cust-B");

    // The old exchange now returns its candidate — publishing nothing, because it is isolated.
    releaseProvisionalSignIn!();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // B is still the signed-in customer, globally and authoritatively. P was never installed.
    expect(setSessionSpy).not.toHaveBeenCalled();
    expect(currentSupabaseSession?.user?.id).toBe("supa-cust-B");
    expect(authSessionManager.getActiveSource()).toBe("supabase");
    expect(authSessionManager.getAppSession()?.user.id).toBe("supa-cust-B");

    // And the stale checkout stopped rather than ordering as B or adopting P.
    expect(H.state.submitted).toHaveLength(0);
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(clearCart).not.toHaveBeenCalled();
  });

  /**
   * Supabase can refresh or normalize a session while installing it. If the provider republishes the
   * CANDIDATE it still holds rather than what was installed, React state — and everything built from it —
   * carries credentials the global client has already replaced: the /auth/context call, the checkout
   * submit, and the next refresh all run on a superseded access token.
   */
  it("MANDATORY: everything after the commit uses the installed token, not the candidate", async () => {
    setSessionSpy.mockImplementationOnce(async () => {
      const rotated = {
        access_token: "at-provisional-rotated",
        refresh_token: "rt-provisional-rotated",
        expires_at: Math.floor((Date.now() + 600_000) / 1000),
        user: { id: PROVISIONAL_ID, email: "guest@provisional.local", phone: null },
      };
      currentSupabaseSession = rotated;
      supabaseAuthStateCallback?.("SIGNED_IN", rotated);
      return { data: { session: rotated }, error: null };
    });

    renderCheckout();
    await fillGuestForm();
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));

    // The context call that follows the commit used the INSTALLED token.
    expect(H.state.contextTokens).toContain("at-provisional-rotated");
    expect(H.state.contextTokens).not.toContain("at-provisional");
    // And the lifecycle agrees.
    expect(authSessionManager.getAppSession()?.accessToken).toBe("at-provisional-rotated");
    expect(currentSupabaseSession?.access_token).toBe("at-provisional-rotated");
  });

  it("MANDATORY: the guarded commit is what installs the provisional customer globally", async () => {
    renderCheckout();
    await fillGuestForm();

    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.submitted).toHaveLength(1));

    // The commit — not the credential exchange — performed the one global installation.
    expect(setSessionSpy).toHaveBeenCalledTimes(1);
    expect(authSessionManager.getPrincipalSnapshot().owner).toBe(`supabase:${PROVISIONAL_ID}`);
  });

  /**
   * The screen can show one customer while the lifecycle already holds another — that gap is the whole
   * reason this file exists. A submit fired inside it would take the form customer A is looking at and
   * send it on a request the API layer authenticates as B.
   */
  it("MANDATORY: a submit is refused while the screen shows A but the lifecycle already holds B", async () => {
    renderCheckout();
    await fillGuestForm();
    await armFederatedSource();

    // The lifecycle moves to B synchronously. React has not re-rendered, so the form on screen is still
    // the guest's.
    installFederatedBWithoutRender();
    expect(authSessionManager.getAppSession()?.user.id).toBe(B.user.id);
    expect(screen.getByTestId("rendered-principal").textContent).toBe("none");

    fireEvent.submit(document.querySelector("form")!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    // Nothing was sent, no attempt was minted for either principal, and B is untouched.
    expect(H.state.submitted).toHaveLength(0);
    expect(H.state.provisionalStarted).toBe(0);
    // Asserting the whole store is empty, rather than one hardcoded key: sessionStorage is cleared in
    // beforeEach and nothing in this test writes it, so a checkout attempt minted under ANY key fails
    // this. Naming the key here duplicated a private constant from Checkout.tsx, which would have kept
    // passing if production renamed it — a check that can no longer fail is not a check.
    expect(sessionStorage.length).toBe(0);
    expect(federatedAdapter.logout).not.toHaveBeenCalled();
    expect(authSessionManager.getAppSession()?.user.id).toBe(B.user.id);
  });

  /**
   * A refused transaction is not always a changed principal. A handoff that starts during the credential
   * exchange and then fails invalidates the transaction while leaving the principal exactly as it was, so
   * every stale-exit guard passes and the submit returns — with the busy flag still set. The guest path
   * has no owner change to trigger a reset, so the button stays disabled until a reload.
   */
  it("MANDATORY: a refused provisional transaction hands the page back instead of wedging it", async () => {
    renderCheckout();
    await fillGuestForm();

    const submitButton = () =>
      Array.from(document.querySelectorAll("button")).find((b) => b.getAttribute("type") === "submit")!;

    deferProvisionalSignIn = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(releaseProvisionalSignIn).not.toBeNull());
    await waitFor(() => expect(submitButton().hasAttribute("disabled")).toBe(true));

    // A handoff starts — invalidating the transaction — and then fails without installing anything.
    await act(async () => {
      federatedAdapter.installIdentitySynchronously(null);
    });
    expect(authSessionManager.getAppSession()).toBeNull(); // the principal never actually changed

    releaseProvisionalSignIn!();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });

    expect(H.state.submitted).toHaveLength(0);
    expect(submitButton().hasAttribute("disabled")).toBe(false);
  });

  /**
   * NOTE ON WHAT THIS PROVES. Unlike the two races above, this one is NOT a regression proof: it passes
   * both with and without the explicit post-context-fetch continuity check.
   *
   * The reason is worth recording. When the principal changes, AuthProvider drops the `["auth-context"]`
   * queries, and the in-flight `fetchQuery` this operation is awaiting is never settled afterwards — so
   * the operation stops by hanging rather than by deciding to stop. That is fail-safe, but only by
   * accident: it depends on cache-eviction behaviour in a third-party library, it leaves the submit
   * button spinning, and it would silently stop protecting anything if that behaviour changed. The
   * explicit check after the context fetch is the deterministic backstop, and this test pins the
   * customer-visible outcome either way.
   */
  it("MANDATORY: a provisional operation whose principal is replaced during the context fetch never submits", async () => {
    renderCheckout();
    await fillGuestForm();

    // Provisional P is created, then its /auth/context request is held open.
    H.state.deferContext = true;
    fireEvent.submit(document.querySelector("form")!);
    await waitFor(() => expect(H.state.resolveContext).not.toBeNull());
    expect(H.state.submitted).toHaveLength(0);

    // Same queue-then-mutate ordering as the first race: P's context call is resolved (continuation
    // queued), then an unrelated customer B is installed in the lifecycle with NO await, so the
    // continuation resumes before anything has re-rendered.
    H.state.resolveContext!();
    setSupabaseIdentitySynchronously(B_SUPABASE);

    expect(authSessionManager.getAppSession()?.user.id).toBe(B_SUPABASE.user.id);
    expect(screen.getByTestId("rendered-principal").textContent).not.toBe(`supabase:${B_SUPABASE.user.id}`);

    await drainMicrotasksOnly();

    // The operation must stop rather than send the guest's delivery details on a request the API layer
    // would now authenticate as B.
    expect(H.state.submitted).toHaveLength(0);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(H.state.submitted).toHaveLength(0);
    expect(authSessionManager.getAppSession()?.user.id).toBe(B_SUPABASE.user.id);
  });
});
