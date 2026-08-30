/**
 * Multi-consumer contract for the active-store selection.
 *
 * The app mounts many INDEPENDENT `useCurrentMerchant()` consumers at once (MerchantLayout,
 * usePendingOrders inside it, and every merchant page). Switching the store from one of them must
 * be observed immediately by all the others in the same tab — per-instance React state cannot
 * satisfy that, so these tests pin the shared-source behaviour.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { AuthContextMerchant } from "@/lib/auth-context-contract";

const mockAuth: {
  context: { merchant_memberships?: AuthContextMerchant[]; merchant?: AuthContextMerchant | null } | null;
  loading: boolean;
} = { context: null, loading: false };
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));

import { useCurrentMerchant } from "./use-current-merchant";
import { usePendingOrders } from "./use-pending-orders";
import { ACTIVE_MERCHANT_STORAGE_KEY, resetMerchantSelectionPreferenceForTests } from "@/lib/merchant-selection";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function member(id: string, status: AuthContextMerchant["status"]): AuthContextMerchant {
  return { id, role: "owner", status, display_name: `Store ${id.slice(0, 1)}`, slug: id.slice(0, 4) };
}

function setAuth(memberships: AuthContextMerchant[], loading = false) {
  mockAuth.context = { merchant_memberships: memberships };
  mockAuth.loading = loading;
}

type Api = ReturnType<typeof useCurrentMerchant>;

/** Independent consumer — mirrors a merchant page calling the hook on its own. */
function Consumer({ label, onApi }: { label: string; onApi?: (api: Api) => void }) {
  const api = useCurrentMerchant();
  useEffect(() => {
    onApi?.(api);
  });
  return <span data-testid={`merchant-${label}`}>{api.data?.merchant_id ?? "none"}</span>;
}

beforeEach(() => {
  window.localStorage.clear();
  resetMerchantSelectionPreferenceForTests();
  mockAuth.context = null;
  mockAuth.loading = false;
  vi.restoreAllMocks();
});

function renderTree(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) };
}

describe("shared same-tab merchant selection", () => {
  // A — two independent consumers
  it("propagates a switch from one consumer to every other mounted consumer", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    let first: Api | null = null;

    renderTree(
      <>
        <Consumer
          label="one"
          onApi={(api) => {
            first = api;
          }}
        />
        <Consumer label="two" />
        <Consumer label="three" />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));
    expect(screen.getByTestId("merchant-two").textContent).toBe(A);

    let accepted = false;
    act(() => {
      accepted = first!.setActiveMerchantId(B);
    });

    expect(accepted).toBe(true);
    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(B));
    // No remount: the other instances must already see B.
    expect(screen.getByTestId("merchant-two").textContent).toBe(B);
    expect(screen.getByTestId("merchant-three").textContent).toBe(B);
    expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(B);
  });

  // B — layout parent + independent page child
  it("propagates a layout-level switch to an independently mounted page consumer", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    let layoutApi: Api | null = null;

    function Layout({ children }: { children: React.ReactNode }) {
      const api = useCurrentMerchant();
      layoutApi = api;
      return (
        <div>
          <span data-testid="merchant-layout">{api.data?.merchant_id ?? "none"}</span>
          {children}
        </div>
      );
    }

    function Page() {
      const { data: membership } = useCurrentMerchant();
      const merchantId = membership?.merchant_id ?? "";
      // exactly what merchant pages do: build their own scope from their own hook instance
      return <span data-testid="merchant-page">{merchantId || "none"}</span>;
    }

    renderTree(
      <Layout>
        <Page />
      </Layout>,
    );

    await waitFor(() => expect(screen.getByTestId("merchant-page").textContent).toBe(A));

    act(() => {
      layoutApi!.setActiveMerchantId(B);
    });

    await waitFor(() => expect(screen.getByTestId("merchant-layout").textContent).toBe(B));
    expect(screen.getByTestId("merchant-page").textContent).toBe(B);
  });

  // C — usePendingOrders (its own hook instance) must follow the switch
  it("moves the pending-orders query key to the newly selected merchant", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    let layoutApi: Api | null = null;

    function LayoutWithPendingOrders() {
      const api = useCurrentMerchant();
      layoutApi = api;
      const { merchantId } = usePendingOrders();
      return <span data-testid="pending-merchant">{merchantId ?? "none"}</span>;
    }

    const { client } = renderTree(<LayoutWithPendingOrders />);

    await waitFor(() => expect(screen.getByTestId("pending-merchant").textContent).toBe(A));

    act(() => {
      layoutApi!.setActiveMerchantId(B);
    });

    await waitFor(() => expect(screen.getByTestId("pending-merchant").textContent).toBe(B));
    const keys = client.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual(["pending-merchant-orders", B]);
  });

  // D — in-flight A response must not render under B
  it("keeps a late merchant A response out of merchant B's surface after a shared switch", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    let resolveA: ((value: string) => void) | null = null;
    let switcherApi: Api | null = null;

    function Switcher() {
      const api = useCurrentMerchant();
      switcherApi = api;
      return null;
    }

    function ScopedPage() {
      const { data: membership } = useCurrentMerchant();
      const merchantId = membership?.merchant_id ?? "";
      const query = useQuery({
        queryKey: ["shared-scoped-probe", merchantId],
        queryFn: () =>
          merchantId === A
            ? new Promise<string>((resolve) => {
                resolveA = resolve;
              })
            : Promise.resolve(`data-${merchantId}`),
        enabled: Boolean(merchantId),
      });
      return (
        <div>
          <span data-testid="scoped-merchant">{merchantId || "none"}</span>
          <span data-testid="scoped-payload">{query.data ?? "pending"}</span>
        </div>
      );
    }

    const { client } = renderTree(
      <>
        <Switcher />
        <ScopedPage />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("scoped-merchant").textContent).toBe(A));
    expect(screen.getByTestId("scoped-payload").textContent).toBe("pending");

    act(() => {
      switcherApi!.setActiveMerchantId(B);
    });

    await waitFor(() => expect(screen.getByTestId("scoped-merchant").textContent).toBe(B));
    await waitFor(() => expect(screen.getByTestId("scoped-payload").textContent).toBe(`data-${B}`));

    await act(async () => {
      resolveA?.(`data-${A}`);
      await Promise.resolve();
    });

    expect(screen.getByTestId("scoped-merchant").textContent).toBe(B);
    expect(screen.getByTestId("scoped-payload").textContent).toBe(`data-${B}`);
    expect(client.getQueryData(["shared-scoped-probe", A])).toBe(`data-${A}`);
  });

  // E — authoritative suspension of the selected store
  it("converges every consumer to the active fallback when the selected store is suspended", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    let firstApi: Api | null = null;

    const { rerender, client } = renderTree(
      <>
        <Consumer
          label="one"
          onApi={(api) => {
            firstApi = api;
          }}
        />
        <Consumer label="two" />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));
    act(() => {
      firstApi!.setActiveMerchantId(B);
    });
    await waitFor(() => expect(screen.getByTestId("merchant-two").textContent).toBe(B));

    // authoritative refresh: B is suspended, A is still active
    setAuth([member(A, "active"), member(B, "suspended")]);
    rerender(
      <QueryClientProvider client={client}>
        <>
          <Consumer label="one" />
          <Consumer label="two" />
        </>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));
    expect(screen.getByTestId("merchant-two").textContent).toBe(A);
    await waitFor(() => expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(A));
  });

  // F — no active membership at all
  it("converges every consumer to no-active-store and clears persistence", async () => {
    setAuth([member(A, "active")]);
    const { rerender, client } = renderTree(
      <>
        <Consumer label="one" />
        <Consumer label="two" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));

    setAuth([member(A, "suspended")]);
    rerender(
      <QueryClientProvider client={client}>
        <>
          <Consumer label="one" />
          <Consumer label="two" />
        </>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe("none"));
    expect(screen.getByTestId("merchant-two").textContent).toBe("none");
    await waitFor(() => expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBeNull());
  });

  // G — invalid explicit switch
  it("refuses a suspended/non-member target and leaves every consumer untouched", async () => {
    setAuth([member(A, "active"), member(B, "suspended")]);
    let firstApi: Api | null = null;

    renderTree(
      <>
        <Consumer
          label="one"
          onApi={(api) => {
            firstApi = api;
          }}
        />
        <Consumer label="two" />
      </>,
    );

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));

    let suspendedAccepted = true;
    let nonMemberAccepted = true;
    act(() => {
      suspendedAccepted = firstApi!.setActiveMerchantId(B);
      nonMemberAccepted = firstApi!.setActiveMerchantId(C);
    });

    expect(suspendedAccepted).toBe(false);
    expect(nonMemberAccepted).toBe(false);
    expect(screen.getByTestId("merchant-one").textContent).toBe(A);
    expect(screen.getByTestId("merchant-two").textContent).toBe(A);
    expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(A);
  });

  // H — persistence failure must not break reactivity
  it("still switches every consumer when localStorage writes throw", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    let firstApi: Api | null = null;

    renderTree(
      <>
        <Consumer
          label="one"
          onApi={(api) => {
            firstApi = api;
          }}
        />
        <Consumer label="two" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    act(() => {
      firstApi!.setActiveMerchantId(B);
    });

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(B));
    expect(screen.getByTestId("merchant-two").textContent).toBe(B);
  });

  // J — cross-tab storage event
  it("reconciles an external-tab preference change through authoritative membership validation", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    renderTree(
      <>
        <Consumer label="one" />
        <Consumer label="two" />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));

    // another tab selected B
    act(() => {
      window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, B);
      window.dispatchEvent(
        new StorageEvent("storage", { key: ACTIVE_MERCHANT_STORAGE_KEY, newValue: B, storageArea: window.localStorage }),
      );
    });

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(B));
    expect(screen.getByTestId("merchant-two").textContent).toBe(B);

    // another tab wrote a merchant this user cannot select — authoritative validation still wins
    act(() => {
      window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, C);
      window.dispatchEvent(
        new StorageEvent("storage", { key: ACTIVE_MERCHANT_STORAGE_KEY, newValue: C, storageArea: window.localStorage }),
      );
    });

    await waitFor(() => expect(screen.getByTestId("merchant-one").textContent).toBe(A));
    expect(screen.getByTestId("merchant-two").textContent).toBe(A);
  });

  it("does not use a QueryClient-scoped side channel for selection", () => {
    // Guard against a future fix that leaks selection into the query cache instead of the
    // shared preference store.
    function Probe() {
      const client = useQueryClient();
      const api = useCurrentMerchant();
      const keys = client.getQueryCache().getAll().map((q) => JSON.stringify(q.queryKey));
      return (
        <span data-testid="cache-keys">{keys.filter((k) => k.includes("active-merchant")).length}</span>
      );
    }
    setAuth([member(A, "active")]);
    renderTree(<Probe />);
    expect(screen.getByTestId("cache-keys").textContent).toBe("0");
  });
});
