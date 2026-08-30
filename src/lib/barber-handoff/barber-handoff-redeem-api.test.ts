/**
 * Barber Handoff redeem HTTP client contract: request shape, credentials:include (web cookie),
 * status/error-code classification (retryable vs definitive), network resilience, and no
 * code/state logging. Mirrors ../deep-link/customer-handoff-redeem-api.test.ts.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { redeemBarberHandoff } from "./barber-handoff-redeem-api";

const CODE = "code-abc";
const STATE = "state-xyz";
const BASE = "http://api.test/api";

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}
const authBody = {
  status: "authenticated",
  barber: { linkedProfileId: "lp1", DilMartUserId: "u1", DilMartBarbershopId: "b1", role: "OWNER", displayName: "Ali", shopName: "Salon A" },
  target: "/store/acme",
};

afterEach(() => vi.restoreAllMocks());

describe("redeemBarberHandoff", () => {
  it("POSTs code/state to the redeem endpoint with credentials:include (no device field)", async () => {
    const fetchImpl = vi.fn(async () => res(200, authBody));
    const out = await redeemBarberHandoff(CODE, STATE, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "authenticated", result: authBody });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/integrations/DilMart/barber/handoff/redeem`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({ code: CODE, state: STATE });
  });

  it("200 authenticated but missing required barber fields → UNKNOWN error (never a half-session)", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "authenticated", barber: {} }));
    const out = await redeemBarberHandoff(CODE, STATE, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "error", code: "UNKNOWN", retryable: false });
  });

  const cases: Array<[number, string, boolean]> = [
    [410, "HANDOFF_EXPIRED", false],
    [409, "HANDOFF_ALREADY_REDEEMED", false],
    [400, "HANDOFF_STATE_MISMATCH", false],
    [400, "HANDOFF_INVALID", false],
    [429, "HANDOFF_RATE_LIMITED", true],
    [503, "STORE_UNAVAILABLE", true],
    [503, "STORE_INTEGRATION_DISABLED", false],
  ];
  for (const [status, code, retryable] of cases) {
    it(`${status} ${code} → error retryable=${retryable}`, async () => {
      const out = await redeemBarberHandoff(CODE, STATE, { baseUrl: BASE, fetchImpl: (async () => res(status, { code })) as unknown as typeof fetch });
      expect(out).toEqual({ kind: "error", code, retryable });
    });
  }

  it("network/timeout throw → transient STORE_UNAVAILABLE (retryable)", async () => {
    const out = await redeemBarberHandoff(CODE, STATE, {
      baseUrl: BASE,
      fetchImpl: (async () => {
        throw new Error("net");
      }) as unknown as typeof fetch,
    });
    expect(out).toEqual({ kind: "error", code: "STORE_UNAVAILABLE", retryable: true });
  });

  it("never logs the raw code/state", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m as "log").mockImplementation(() => {}));
    await redeemBarberHandoff(CODE, STATE, { baseUrl: BASE, fetchImpl: (async () => res(200, authBody)) as unknown as typeof fetch });
    await redeemBarberHandoff(CODE, STATE, {
      baseUrl: BASE,
      fetchImpl: (async () => {
        throw new Error("net");
      }) as unknown as typeof fetch,
    });
    const logged = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join(" ");
    expect(logged).not.toContain(CODE);
    expect(logged).not.toContain(STATE);
  });
});
