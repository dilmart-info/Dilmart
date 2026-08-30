import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTH_REFRESH_OUTCOMES } from "./auth-events";

const getValidAccessToken = vi.fn(async () => "stale-token" as string | null);
const refreshSessionSingleFlight = vi.fn(async () => ({
  status: AUTH_REFRESH_OUTCOMES.refreshed as string,
  session: { access_token: "fresh-token" } as { access_token: string } | null,
  reason: "api_unauthorized",
  error: null,
}));
const logoutCurrentDevice = vi.fn(async () => undefined);
/** §9.3 — token acquisition can now report an identity transition; default is the ordinary path. */
const getValidAccessTokenOutcome = vi.fn(async () => ({
  token: await getValidAccessToken(),
  requiresIdentityRevalidation: false,
}));

vi.mock("@/lib/auth/auth-session-manager", () => ({
  // Pure helper, mirrored from the real module: mocks must not invent a second owner derivation.
  principalOwnerOf: (session: { authSource?: string; user?: { id?: string } } | null) =>
    session && session.user?.id ? `${session.authSource}:${session.user.id}` : null,
  authSessionManager: {
    getValidAccessToken: () => getValidAccessToken(),
    getValidAccessTokenOutcome: () => getValidAccessTokenOutcome(),
    refreshSessionSingleFlight: () => refreshSessionSingleFlight(),
    logoutCurrentDevice: () => logoutCurrentDevice(),
  },
}));

const { ApiError, AuthIdentityTransitionError, isAuthIdentityTransitionError, request } = await import("@/lib/api-core");

function jsonResponse(status: number, body: unknown = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function authHeaderOf(call: unknown[]): string | undefined {
  const init = call[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe("api request auth handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidAccessToken.mockResolvedValue("stale-token");
    getValidAccessTokenOutcome.mockResolvedValue({ token: "stale-token", requiresIdentityRevalidation: false });
    refreshSessionSingleFlight.mockResolvedValue({
      status: AUTH_REFRESH_OUTCOMES.refreshed,
      session: { access_token: "fresh-token" },
      reason: "api_unauthorized",
      error: null,
    });
  });

  it("attaches the manager-provided token to private requests", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await request("/orders", "GET");

    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe("Bearer stale-token");
    vi.unstubAllGlobals();
  });

  it("refreshes once and retries once on 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: "Unauthorized" }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/orders", "GET")).resolves.toEqual({ ok: true });

    expect(refreshSessionSingleFlight).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(fetchMock.mock.calls[1])).toBe("Bearer fresh-token");
    vi.unstubAllGlobals();
  });

  it("never retries more than once even if the retry also returns 401", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { message: "Unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/orders", "GET")).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshSessionSingleFlight).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("does not retry when the refresh itself fails", async () => {
    refreshSessionSingleFlight.mockResolvedValue({
      status: AUTH_REFRESH_OUTCOMES.transientFailure,
      session: null,
      reason: "api_unauthorized",
      error: null,
    });
    const fetchMock = vi.fn(async () => jsonResponse(401, { message: "Unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/orders", "GET")).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("throws an ApiError on 403 without refreshing or logging out", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(403, { message: "Forbidden" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/admin/orders", "GET")).rejects.toMatchObject({ name: "ApiError", status: 403 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshSessionSingleFlight).not.toHaveBeenCalled();
    expect(logoutCurrentDevice).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("honours an explicit accessToken override and never swaps it", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401, { message: "Unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(request("/orders", "GET", undefined, { accessToken: "caller-token" })).rejects.toBeInstanceOf(
      ApiError,
    );

    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(refreshSessionSingleFlight).not.toHaveBeenCalled();
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe("Bearer caller-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("sends public marketplace GETs without a token or refresh", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { items: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await request("/marketplace/products", "GET");

    expect(getValidAccessToken).not.toHaveBeenCalled();
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

// ── §9.3 cross-identity: a replacement token must never replay a request ─────
/**
 * The web __Host- refresh cookie is shared by every tab of the browser profile. A refresh triggered by a
 * 401 can therefore succeed against a DIFFERENT session family. Replaying under it is unsafe at every
 * method: a mutating request would execute as the other customer, and a private GET would hand their
 * data back to a UI still rendering the previous one.
 */
describe("api request — federated identity transition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidAccessToken.mockResolvedValue("stale-token");
    getValidAccessTokenOutcome.mockResolvedValue({ token: "stale-token", requiresIdentityRevalidation: false });
  });

  function transitionOnRefresh() {
    refreshSessionSingleFlight.mockResolvedValue({
      status: AUTH_REFRESH_OUTCOMES.refreshed,
      session: { access_token: "customer-B-token" },
      reason: "api_unauthorized",
      error: null,
      requiresIdentityRevalidation: true,
    } as never);
  }

  it.each(["POST", "PUT", "PATCH", "DELETE"] as const)(
    "%s is NOT replayed when the refresh lands on a different identity",
    async (method) => {
      const fetchMock = vi.fn(async () => jsonResponse(401));
      vi.stubGlobal("fetch", fetchMock);
      transitionOnRefresh();

      await expect(request("/customer/orders", method, { qty: 1 })).rejects.toBeInstanceOf(AuthIdentityTransitionError);

      // Exactly one attempt — the original. Never a second send under customer B's token.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(authHeaderOf(fetchMock.mock.calls[0] as unknown[])).toBe("Bearer stale-token");
      expect(fetchMock.mock.calls.some((c) => authHeaderOf(c as unknown[]) === "Bearer customer-B-token")).toBe(false);
    },
  );

  it("a private GET is not replayed either — B's data must not reach A's UI", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401));
    vi.stubGlobal("fetch", fetchMock);
    transitionOnRefresh();

    await expect(request("/customer/orders", "GET")).rejects.toBeInstanceOf(AuthIdentityTransitionError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts BEFORE sending when token acquisition itself changes identity", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200));
    vi.stubGlobal("fetch", fetchMock);
    getValidAccessTokenOutcome.mockResolvedValue({ token: "customer-B-token", requiresIdentityRevalidation: true });

    const err = await request("/customer/orders", "POST", { qty: 1 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AuthIdentityTransitionError);
    expect((err as InstanceType<typeof AuthIdentityTransitionError>).requestSent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled(); // never left the client
  });

  it("still replays normally when the refreshed token continues the same identity", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401)).mockResolvedValueOnce(jsonResponse(401));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    refreshSessionSingleFlight.mockResolvedValue({
      status: AUTH_REFRESH_OUTCOMES.refreshed,
      session: { access_token: "fresh-token" },
      reason: "api_unauthorized",
      error: null,
      requiresIdentityRevalidation: false,
    } as never);

    await request("/customer/orders", "GET");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(fetchMock.mock.calls[1] as unknown[])).toBe("Bearer fresh-token");
  });

  it("is customer-safe when a generic toast surfaces error.message, and is recognisable without the class", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401));
    vi.stubGlobal("fetch", fetchMock);
    transitionOnRefresh();

    const err = await request("/customer/addresses", "POST", { line1: "x" }).catch((e: unknown) => e);

    // Several customer screens do `toast.error(error.message || "...")`, so the message itself must be
    // presentable — not an internal English description leaking into an Arabic RTL UI.
    const message = (err as Error).message;
    expect(message).not.toMatch(/[A-Za-z]{4,}/);
    expect(message.length).toBeGreaterThan(0);

    // Recognisable both ways, so callers can stay silent for a transient, self-healing state.
    expect(isAuthIdentityTransitionError(err)).toBe(true);
    expect(isAuthIdentityTransitionError({ code: "AUTH_IDENTITY_TRANSITION" })).toBe(true);
    expect(isAuthIdentityTransitionError(new Error("other"))).toBe(false);
    expect((err as InstanceType<typeof AuthIdentityTransitionError>).code).toBe("AUTH_IDENTITY_TRANSITION");

    // The guard must only promise what it can prove: a code-only value carries no requestSent, so the
    // predicate narrows to the optional shape. `requestSent` as a definite boolean needs `instanceof`.
    const codeOnly: unknown = { code: "AUTH_IDENTITY_TRANSITION" };
    if (isAuthIdentityTransitionError(codeOnly)) {
      expect(codeOnly.requestSent).toBeUndefined();
    }
    expect(err instanceof AuthIdentityTransitionError).toBe(true);
  });
});

// ── §9.3 the mandatory three-request sequence ───────────────────────────────
/**
 * The barrier is persistent, so api-core must fail closed on EVERY request while it is up — not only on
 * the one that detected the transition. This drives the exact sequence: transition, blocked follow-up,
 * then normal service once /auth/context has resolved the new identity.
 */
describe("api request — three-request identity transition sequence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getValidAccessToken.mockResolvedValue("stale-token");
    getValidAccessTokenOutcome.mockResolvedValue({ token: "stale-token", requiresIdentityRevalidation: false });
  });

  it("request 1 aborts, request 2 is ALSO blocked before send, request 3 succeeds as verified B", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(401));
    vi.stubGlobal("fetch", fetchMock);

    // ── Request 1: 401 → refresh lands on another family → abort, no replay.
    refreshSessionSingleFlight.mockResolvedValue({
      status: AUTH_REFRESH_OUTCOMES.refreshed,
      session: { access_token: "customer-B-token" },
      reason: "api_unauthorized",
      error: null,
      requiresIdentityRevalidation: true,
    } as never);

    await expect(request("/customer/orders", "POST", { qty: 1 })).rejects.toBeInstanceOf(AuthIdentityTransitionError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // the original only — never replayed as B

    // ── Request 2: the barrier is still up, so acquisition is quarantined. This is the case a
    // flag-only design misses: B's token is no longer expiring, so it would have been handed over.
    fetchMock.mockClear();
    getValidAccessTokenOutcome.mockResolvedValue({ token: null, requiresIdentityRevalidation: true });

    const err2 = await request("/customer/orders", "GET").catch((e: unknown) => e);
    expect(err2).toBeInstanceOf(AuthIdentityTransitionError);
    expect((err2 as InstanceType<typeof AuthIdentityTransitionError>).requestSent).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled(); // never left the client

    // ── Request 3: /auth/context resolved B, the barrier is down, service resumes as verified B.
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    getValidAccessTokenOutcome.mockResolvedValue({ token: "customer-B-token", requiresIdentityRevalidation: false });

    await request("/customer/orders", "GET");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authHeaderOf(fetchMock.mock.calls[0] as unknown[])).toBe("Bearer customer-B-token");
  });
});
