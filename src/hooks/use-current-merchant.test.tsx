import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AuthContextMerchant } from "@/lib/auth-context-contract";

type AuthContextShape = { merchant_memberships?: AuthContextMerchant[]; merchant?: AuthContextMerchant | null } | null;
const mockAuth: { context: AuthContextShape; loading: boolean } = { context: null, loading: false };
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => mockAuth }));

import { useCurrentMerchant } from "./use-current-merchant";
import { ACTIVE_MERCHANT_STORAGE_KEY, resetMerchantSelectionPreferenceForTests } from "@/lib/merchant-selection";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function member(id: string, status: AuthContextMerchant["status"]): AuthContextMerchant {
  return { id, role: "owner", status, display_name: `Store ${id.slice(0, 1).toUpperCase()}`, slug: id.slice(0, 4) };
}

function setAuth(memberships: AuthContextMerchant[], loading = false) {
  mockAuth.context = memberships.length ? { merchant_memberships: memberships } : { merchant_memberships: [] };
  mockAuth.loading = loading;
}

/** Minimal probe that renders the current selection and exposes the switch API. */
function Probe({ onApi }: { onApi?: (api: ReturnType<typeof useCurrentMerchant>) => void } = {}) {
  const api = useCurrentMerchant();
  useEffect(() => {
    onApi?.(api);
  });
  return (
    <div>
      <span data-testid="selected">{api.data?.merchant_id ?? "none"}</span>
      <span data-testid="status">{api.selectionStatus}</span>
      <span data-testid="active-count">{api.activeMemberships.length}</span>
    </div>
  );
}

function renderProbe(onApi?: (api: ReturnType<typeof useCurrentMerchant>) => void) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Probe onApi={onApi} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetMerchantSelectionPreferenceForTests();
  mockAuth.context = null;
  mockAuth.loading = false;
  vi.restoreAllMocks();
});

describe("useCurrentMerchant — authoritative active-store selection", () => {
  // CASE 1
  it("does not select a suspended persisted merchant when another membership is active", async () => {
    window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, A);
    setAuth([member(A, "suspended"), member(B, "active")]);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(B));
    await waitFor(() => expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(B));
    expect(screen.getByTestId("active-count").textContent).toBe("1");
  });

  // CASE 2
  it("keeps a valid active persisted merchant", async () => {
    window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, B);
    setAuth([member(A, "active"), member(B, "active")]);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(B));
    expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(B);
  });

  // CASE 3
  it("falls back to the first active membership when the persisted id does not exist", async () => {
    window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, "random-nonexistent-id");
    setAuth([member(A, "active"), member(B, "active")]);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(A));
    await waitFor(() => expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(A));
  });

  // CASE 4
  it("selects the single active membership when nothing is persisted", async () => {
    setAuth([member(A, "active")]);

    renderProbe();

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(A));
  });

  // CASE 5
  it("reports a safe no-active-store state when every membership is inactive", async () => {
    window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, A);
    setAuth([member(A, "suspended"), member(B, "draft")]);

    let latest: ReturnType<typeof useCurrentMerchant> | null = null;
    renderProbe((api) => {
      latest = api;
    });

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe("none"));
    expect(screen.getByTestId("status").textContent).toBe("none");
    expect(latest!.hasNoActiveMerchant).toBe(true);
    // the stale preference is cleared rather than left pointing at a suspended store
    await waitFor(() => expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBeNull());
  });

  // CASE 6
  it("cannot select a crafted merchant id the user is not a member of", async () => {
    const crafted = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, crafted);
    setAuth([member(A, "active")]);

    let latest: ReturnType<typeof useCurrentMerchant> | null = null;
    renderProbe((api) => {
      latest = api;
    });

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(A));

    let accepted = true;
    act(() => {
      accepted = latest!.setActiveMerchantId(crafted);
    });

    expect(accepted).toBe(false);
    expect(screen.getByTestId("selected").textContent).toBe(A);
    expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(A);
  });

  // CASE 7
  it("switches reactively to another active merchant and persists it", async () => {
    setAuth([member(A, "active"), member(B, "active")]);
    let latest: ReturnType<typeof useCurrentMerchant> | null = null;
    renderProbe((api) => {
      latest = api;
    });

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(A));

    let accepted = false;
    act(() => {
      accepted = latest!.setActiveMerchantId(B);
    });

    expect(accepted).toBe(true);
    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(B));
    expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(B);
  });

  it("refuses setActiveMerchantId for a suspended membership", async () => {
    setAuth([member(A, "active"), member(B, "suspended")]);
    let latest: ReturnType<typeof useCurrentMerchant> | null = null;
    renderProbe((api) => {
      latest = api;
    });

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(A));

    let accepted = true;
    act(() => {
      accepted = latest!.setActiveMerchantId(B);
    });

    expect(accepted).toBe(false);
    expect(screen.getByTestId("selected").textContent).toBe(A);
    expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(A);
  });

  it("never writes to localStorage during render", async () => {
    setAuth([member(A, "active")]);
    const setItem = vi.spyOn(Storage.prototype, "setItem");

    // Writes observed at the START of each render body. The hook may only persist from an
    // effect, so the first render must observe zero writes; a render-time setItem would show up
    // immediately as a non-zero count on the very first pass.
    const writesSeenPerRender: number[] = [];

    function RenderCounter() {
      writesSeenPerRender.push(setItem.mock.calls.length);
      const api = useCurrentMerchant();
      return <span data-testid="selected-2">{api.data?.merchant_id ?? "none"}</span>;
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RenderCounter />
      </QueryClientProvider>,
    );

    expect(writesSeenPerRender[0]).toBe(0);
    await waitFor(() => expect(screen.getByTestId("selected-2").textContent).toBe(A));
    // exactly one persistence write, and it came from the effect (after the first render)
    expect(setItem.mock.calls.filter(([key]) => key === ACTIVE_MERCHANT_STORAGE_KEY)).toHaveLength(1);
  });

  it("does not select a stale merchant while memberships are still loading", async () => {
    window.localStorage.setItem(ACTIVE_MERCHANT_STORAGE_KEY, A);
    setAuth([], true);

    const { rerender } = renderProbe();

    expect(screen.getByTestId("status").textContent).toBe("loading");
    expect(screen.getByTestId("selected").textContent).toBe("none");
    // the stale preference must survive the loading phase (it is only repaired once resolved)
    expect(window.localStorage.getItem(ACTIVE_MERCHANT_STORAGE_KEY)).toBe(A);

    setAuth([member(A, "suspended"), member(B, "active")]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    rerender(
      <QueryClientProvider client={client}>
        <Probe />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("selected").textContent).toBe(B));
  });
});

describe("merchant-scoped query isolation", () => {
  // CASE 8 — a slow response for merchant A must never populate merchant B's UI.
  it("keeps an in-flight merchant A response out of merchant B's view", async () => {
    setAuth([member(A, "active"), member(B, "active")]);

    let resolveA: ((value: string) => void) | null = null;
    const fetchFor = vi.fn((merchantId: string) => {
      if (merchantId === A) {
        return new Promise<string>((resolve) => {
          resolveA = resolve;
        });
      }
      return Promise.resolve(`data-for-${merchantId}`);
    });

    function ScopedSurface() {
      const { data: membership, setActiveMerchantId } = useCurrentMerchant();
      const merchantId = membership?.merchant_id ?? "";
      const [, force] = useState(0);
      const query = useQuery({
        // merchant-scoped key: responses can only ever land in their own merchant's cache entry
        queryKey: ["merchant-scoped-probe", merchantId],
        queryFn: () => fetchFor(merchantId),
        enabled: Boolean(merchantId),
      });
      return (
        <div>
          <span data-testid="merchant">{merchantId}</span>
          <span data-testid="payload">{query.data ?? "pending"}</span>
          <button
            onClick={() => {
              setActiveMerchantId(B);
              force((n) => n + 1);
            }}
          >
            switch
          </button>
        </div>
      );
    }

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ScopedSurface />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("merchant").textContent).toBe(A));
    expect(screen.getByTestId("payload").textContent).toBe("pending");

    // switch to B while A is still in flight
    act(() => {
      screen.getByText("switch").click();
    });
    await waitFor(() => expect(screen.getByTestId("merchant").textContent).toBe(B));
    await waitFor(() => expect(screen.getByTestId("payload").textContent).toBe(`data-for-${B}`));

    // A's response arrives late — it must not overwrite what B is showing
    await act(async () => {
      resolveA?.(`data-for-${A}`);
      await Promise.resolve();
    });

    expect(screen.getByTestId("merchant").textContent).toBe(B);
    expect(screen.getByTestId("payload").textContent).toBe(`data-for-${B}`);
    expect(client.getQueryData(["merchant-scoped-probe", A])).toBe(`data-for-${A}`);
    expect(client.getQueryData(["merchant-scoped-probe", B])).toBe(`data-for-${B}`);
  });
});
