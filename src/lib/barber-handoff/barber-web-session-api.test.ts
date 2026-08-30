/**
 * Barber B2B web-session HTTP client contract: GET check + POST logout, credentials:include,
 * safe classification of authenticated/unauthenticated/unavailable, no throw on network failure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchBarberWebSession, logoutBarberWebSession } from "./barber-web-session-api";

const BASE = "http://api.test/api";

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}

const barberIdentity = {
  linkedProfileId: "lp1",
  DilMartUserId: "u1",
  DilMartBarbershopId: "b1",
  role: "OWNER",
  displayName: "Ali",
  shopName: null,
  phone: "+9647700000000",
  city: "Baghdad",
  businessType: "salon",
};

afterEach(() => vi.restoreAllMocks());

describe("fetchBarberWebSession", () => {
  it("GETs the session endpoint with credentials:include", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "unauthenticated" }));
    await fetchBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/integrations/DilMart/barber/web-session`);
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("include");
  });

  it("200 authenticated with a well-formed barber -> kind=authenticated", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "authenticated", barber: barberIdentity }));
    const out = await fetchBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "authenticated", barber: barberIdentity });
  });

  it("200 authenticated but malformed barber -> kind=unauthenticated (never a half-identity)", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "authenticated", barber: { linkedProfileId: "lp1" } }));
    const out = await fetchBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "unauthenticated" });
  });

  it("200 unauthenticated body -> kind=unauthenticated", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "unauthenticated" }));
    const out = await fetchBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "unauthenticated" });
  });

  it("503 (e.g. STORE_INTEGRATION_DISABLED) -> kind=unavailable, never authenticated/unauthenticated", async () => {
    const fetchImpl = vi.fn(async () => res(503, { code: "STORE_INTEGRATION_DISABLED" }));
    const out = await fetchBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "unavailable" });
  });

  it("network/timeout throw -> kind=unavailable, never throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const out = await fetchBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "unavailable" });
  });

  it("malformed JSON body -> kind=unavailable, never throws", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, text: async () => "not-json{{{" }) as unknown as Response);
    const out = await fetchBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "unavailable" });
  });
});

describe("logoutBarberWebSession", () => {
  it("POSTs to the logout endpoint with credentials:include", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "unauthenticated" }));
    await logoutBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/integrations/DilMart/barber/web-session/logout`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
  });

  it("200 response -> kind=confirmed (the backend actually revoked the session)", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "unauthenticated" }));
    const out = await logoutBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "confirmed" });
  });

  it("non-2xx response -> kind=unavailable (must NOT be treated as a successful logout)", async () => {
    const fetchImpl = vi.fn(async () => res(503, { code: "STORE_UNAVAILABLE" }));
    const out = await logoutBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "unavailable" });
  });

  it("network failure -> kind=unavailable, never throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(logoutBarberWebSession({ baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch })).resolves.toEqual({ kind: "unavailable" });
  });
});
