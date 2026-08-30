// @vitest-environment jsdom
/**
 * BarberWebSessionProvider — the frontend counterpart of the backend consumer. Proves: bootstrap
 * checks the backend once (unless native, which skips the network call entirely), authenticated
 * vs unauthenticated vs unavailable resolve correctly, refresh() re-checks and can transition an
 * authenticated session to unauthenticated (expiry/revocation — no stale identity survives), and
 * logout() clears local state via the dedicated logout endpoint.
 */
import { useState } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";

import type { BarberWebSessionCheckOutcome, BarberWebSessionLogoutOutcome } from "./barber-web-session-api";

let mockFetchOutcome: BarberWebSessionCheckOutcome;
let mockLogoutOutcome: BarberWebSessionLogoutOutcome = { kind: "confirmed" };
let mockNative = false;
const fetchBarberWebSession = vi.fn(async () => mockFetchOutcome);
const logoutBarberWebSession = vi.fn(async () => mockLogoutOutcome);

vi.mock("./barber-web-session-api", () => ({
  fetchBarberWebSession: (...args: unknown[]) => fetchBarberWebSession(...args),
  logoutBarberWebSession: (...args: unknown[]) => logoutBarberWebSession(...args),
}));
vi.mock("@/lib/capacitor", () => ({ isNative: () => mockNative }));

import { BarberWebSessionProvider, useBarberWebSession } from "./BarberWebSessionContext";

const IDENTITY = {
  linkedProfileId: "lp1",
  DilMartUserId: "u1",
  DilMartBarbershopId: "b1",
  role: "OWNER" as const,
  displayName: "Ali",
  shopName: null,
  phone: null,
  city: null,
  businessType: null,
};

function Probe() {
  const { state, logout } = useBarberWebSession();
  const [lastLogoutResult, setLastLogoutResult] = useState<string>("");
  return (
    <div>
      <span data-testid="status">{state.status}</span>
      {state.status === "authenticated" ? <span data-testid="name">{state.barber.displayName}</span> : null}
      <span data-testid="last-logout-result">{lastLogoutResult}</span>
      <button
        data-testid="logout"
        onClick={() => {
          void logout().then((confirmed) => setLastLogoutResult(String(confirmed)));
        }}
      >
        logout
      </button>
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockNative = false;
  mockFetchOutcome = { kind: "unauthenticated" };
  mockLogoutOutcome = { kind: "confirmed" };
});

describe("BarberWebSessionProvider", () => {
  it("starts in loading, then resolves to unauthenticated when no cookie", async () => {
    mockFetchOutcome = { kind: "unauthenticated" };
    render(
      <BarberWebSessionProvider>
        <Probe />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(fetchBarberWebSession).toHaveBeenCalledTimes(1);
  });

  it("resolves to authenticated with the safe identity when a valid cookie exists", async () => {
    mockFetchOutcome = { kind: "authenticated", barber: IDENTITY };
    render(
      <BarberWebSessionProvider>
        <Probe />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    expect(screen.getByTestId("name").textContent).toBe("Ali");
  });

  it("resolves to unavailable on backend/network failure (never silently 'unauthenticated')", async () => {
    mockFetchOutcome = { kind: "unavailable" };
    render(
      <BarberWebSessionProvider>
        <Probe />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unavailable"));
  });

  it("native platform: never calls the backend, resolves synchronously to unauthenticated", async () => {
    mockNative = true;
    render(
      <BarberWebSessionProvider>
        <Probe />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(fetchBarberWebSession).not.toHaveBeenCalled();
  });

  it("logout() confirmed by the backend -> clears local state to unauthenticated, resolves true", async () => {
    mockFetchOutcome = { kind: "authenticated", barber: IDENTITY };
    mockLogoutOutcome = { kind: "confirmed" };
    render(
      <BarberWebSessionProvider>
        <Probe />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    screen.getByTestId("logout").click();
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(logoutBarberWebSession).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("last-logout-result").textContent).toBe("true"));
  });

  it("logout() NOT confirmed by the backend (network/non-2xx) -> does not falsely clear state, resolves false, re-checks instead", async () => {
    mockFetchOutcome = { kind: "authenticated", barber: IDENTITY };
    mockLogoutOutcome = { kind: "unavailable" };
    render(
      <BarberWebSessionProvider>
        <Probe />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    screen.getByTestId("logout").click();
    await waitFor(() => expect(screen.getByTestId("last-logout-result").textContent).toBe("false"));
    // The session was never actually revoked server-side (per mockLogoutOutcome), and the
    // re-check (fetchBarberWebSession) still reports authenticated — state must reflect that
    // reality rather than a false "logged out".
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(fetchBarberWebSession).toHaveBeenCalledTimes(2); // initial bootstrap + post-logout-failure re-check
  });

  it("logout() NOT confirmed, but the session had already expired/been revoked server-side -> re-check correctly clears to unauthenticated (no stale identity)", async () => {
    mockFetchOutcome = { kind: "authenticated", barber: IDENTITY };
    mockLogoutOutcome = { kind: "unavailable" };
    render(
      <BarberWebSessionProvider>
        <Probe />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));
    // The logout POST itself failed on the wire (mockLogoutOutcome: unavailable), but the session
    // had, independently, already expired/been revoked — the re-check must reflect THAT reality.
    mockFetchOutcome = { kind: "unauthenticated" };
    screen.getByTestId("logout").click();
    await waitFor(() => expect(screen.getByTestId("last-logout-result").textContent).toBe("false"));
    expect(screen.getByTestId("status").textContent).toBe("unauthenticated");
    expect(screen.queryByTestId("name")).toBeNull();
  });

  it("a later refresh (e.g. session expired/revoked) transitions authenticated -> unauthenticated, no stale identity", async () => {
    mockFetchOutcome = { kind: "authenticated", barber: IDENTITY };
    let capturedRefresh: (() => Promise<unknown>) | null = null;
    function Capture() {
      const ctx = useBarberWebSession();
      capturedRefresh = ctx.refresh;
      return <Probe />;
    }
    render(
      <BarberWebSessionProvider>
        <Capture />
      </BarberWebSessionProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    mockFetchOutcome = { kind: "unauthenticated" };
    await act(async () => {
      await capturedRefresh!();
    });

    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("unauthenticated"));
    expect(screen.queryByTestId("name")).toBeNull();
  });

  it("race regression: a forced post-redeem refresh is NOT clobbered by a stale pre-cookie bootstrap request resolving afterward", async () => {
    // Controllable per-call deferreds so this test can order the two requests' resolutions itself
    // instead of relying on real network timing.
    type Deferred = { promise: Promise<BarberWebSessionCheckOutcome>; resolve: (v: BarberWebSessionCheckOutcome) => void };
    function makeDeferred(): Deferred {
      let resolve!: (v: BarberWebSessionCheckOutcome) => void;
      const promise = new Promise<BarberWebSessionCheckOutcome>((res) => {
        resolve = res;
      });
      return { promise, resolve };
    }
    const requests: Deferred[] = [];
    fetchBarberWebSession.mockImplementation(() => {
      const d = makeDeferred();
      requests.push(d);
      return d.promise;
    });

    let capturedRefresh: ((options?: { force?: boolean }) => Promise<unknown>) | null = null;
    function Capture() {
      const ctx = useBarberWebSession();
      capturedRefresh = ctx.refresh;
      return <Probe />;
    }

    render(
      <BarberWebSessionProvider>
        <Capture />
      </BarberWebSessionProvider>,
    );

    // 1. Bootstrap session request starts and remains pending (sent before any cookie exists).
    await waitFor(() => expect(requests.length).toBe(1));
    expect(screen.getByTestId("status").textContent).toBe("loading");

    // 2. Redeem "succeeds" / cookie conceptually changes -> OpenBarberHandoff calls a FORCED
    //    fresh refresh, which must start a SECOND request rather than reusing the pending first.
    let forcedResultPromise!: Promise<unknown>;
    await act(async () => {
      forcedResultPromise = capturedRefresh!({ force: true });
    });
    await waitFor(() => expect(requests.length).toBe(2));

    // 3. The second (fresh, post-cookie) request resolves authenticated.
    await act(async () => {
      requests[1].resolve({ kind: "authenticated", barber: IDENTITY });
    });
    const forcedResult = await forcedResultPromise;
    expect(forcedResult).toEqual({ status: "authenticated", barber: IDENTITY });
    await waitFor(() => expect(screen.getByTestId("status").textContent).toBe("authenticated"));

    // 4. The first, stale (pre-cookie) request FINALLY resolves unauthenticated, afterward.
    //    Final provider state MUST remain authenticated — the stale result must not win.
    await act(async () => {
      requests[0].resolve({ kind: "unauthenticated" });
    });
    expect(screen.getByTestId("status").textContent).toBe("authenticated");
    expect(screen.getByTestId("name").textContent).toBe("Ali");

    // Exactly two session-check requests total — no extra, no missing.
    expect(requests.length).toBe(2);
    expect(fetchBarberWebSession).toHaveBeenCalledTimes(2);
  });
});
