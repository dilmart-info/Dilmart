/**
 * STORE-PR6 §6/§7/§14/§29 — redeem HTTP client contract: request shape, credentials:include (web cookie),
 * status/error-code classification (retryable vs definitive), network resilience, and no code/state logging.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { redeemHandoff } from "./customer-handoff-redeem-api";

const PARAMS = { code: "code-abc", state: "state-xyz" };
const DEVICE = { platform: "web" as const, appVersion: "1.2.3", deviceId: "dev-1" };
const BASE = "http://api.test/api";

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) } as unknown as Response;
}
const authBody = { status: "authenticated", session: { accessToken: "at", expiresIn: 600, refreshExpiresIn: 100 }, customer: { id: "c", linkedProfileId: "lp", origin: "DilMart" }, target: "/product/x" };

afterEach(() => vi.restoreAllMocks());

describe("redeemHandoff", () => {
  it("POSTs code/state/device to the redeem endpoint with credentials:include", async () => {
    const fetchImpl = vi.fn(async () => res(200, authBody));
    const out = await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "authenticated", result: authBody });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE}/integrations/DilMart/customer/handoff/redeem`);
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    const sent = JSON.parse(init.body as string);
    expect(sent).toEqual({ code: "code-abc", state: "state-xyz", device: DEVICE });
  });

  it("200 authenticated but missing accessToken → UNKNOWN error (never a half-session)", async () => {
    const fetchImpl = vi.fn(async () => res(200, { status: "authenticated", session: {} }));
    const out = await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ kind: "error", code: "UNKNOWN", retryable: false });
  });

  it("identity_link_required (200 body OR 4xx code) → identity_link_required", async () => {
    const a = await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: (async () => res(200, { status: "identity_link_required" })) as unknown as typeof fetch });
    expect(a.kind).toBe("identity_link_required");
    const b = await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: (async () => res(409, { code: "IDENTITY_LINK_REQUIRED" })) as unknown as typeof fetch });
    expect(b.kind).toBe("identity_link_required");
  });

  const cases: Array<[number, string, boolean]> = [
    [410, "HANDOFF_EXPIRED", false],
    [409, "HANDOFF_ALREADY_REDEEMED", false],
    [400, "HANDOFF_STATE_MISMATCH", false],
    [400, "HANDOFF_INVALID", false],
    [403, "IDENTITY_BLOCKED", false],
    [429, "HANDOFF_RATE_LIMITED", true],
    [503, "STORE_UNAVAILABLE", true],
  ];
  for (const [status, code, retryable] of cases) {
    it(`${status} ${code} → error retryable=${retryable}`, async () => {
      const out = await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: (async () => res(status, { code })) as unknown as typeof fetch });
      expect(out).toEqual({ kind: "error", code, retryable });
    });
  }

  it("network/timeout throw → transient STORE_UNAVAILABLE (retryable), session preserved by caller", async () => {
    const out = await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: (async () => { throw new Error("net"); }) as unknown as typeof fetch });
    expect(out).toEqual({ kind: "error", code: "STORE_UNAVAILABLE", retryable: true });
  });

  it("§29 — never logs the raw code/state", async () => {
    const spies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m as "log").mockImplementation(() => {}));
    await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: (async () => res(200, authBody)) as unknown as typeof fetch });
    await redeemHandoff(PARAMS, DEVICE, { baseUrl: BASE, fetchImpl: (async () => { throw new Error("net"); }) as unknown as typeof fetch });
    const logged = spies.flatMap((s) => s.mock.calls).map((c) => JSON.stringify(c)).join(" ");
    expect(logged).not.toContain("code-abc");
    expect(logged).not.toContain("state-xyz");
  });
});
