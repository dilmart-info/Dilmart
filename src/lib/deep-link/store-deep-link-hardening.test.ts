/**
 * STORE-PR6 §23/§26/§29/§31 — hardening: independent handoffs, establishment delegation to the PR5 owner,
 * no code/state/token persistence in the deep-link layer, and Barber isolation.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { StoreHandoffController } from "./store-handoff-controller";

const OK1 = "https://store.DilMart.org/open?code=aaa&state=bbb";
const OK2 = "https://store.DilMart.org/open?code=ccc&state=ddd";
const auth = (target: string) => ({ kind: "authenticated" as const, result: { status: "authenticated", session: { accessToken: "at", expiresIn: 600, refreshExpiresIn: 100 }, customer: { id: "c", linkedProfileId: "lp", origin: "DilMart" }, target } });

describe("§23/§26 existing-session + independence", () => {
  it("delegates establishment to the PR5 session owner (which performs the single-active-source switch)", async () => {
    const establishSession = vi.fn(async () => ({ identityEpoch: 0 }));
    const c = new StoreHandoffController({ redeem: async () => auth("/cart"), establishSession, getDevice: async () => ({ platform: "web", deviceId: "d" }) });
    await c.handle(OK1);
    // The handoff hands the redeem result to PR5; the Supabase→federated / federated→federated switch and
    // user-scoped cache handling are PR5-owned (proven in the PR5 suites).
    expect(establishSession).toHaveBeenCalledTimes(1);
    expect((establishSession.mock.calls[0][0] as { customer: { id: string } }).customer.id).toBe("c");
  });

  it("two DIFFERENT handoffs each redeem + establish independently (no cross-dedup)", async () => {
    const redeem = vi.fn(async (p: { code: string }) => auth(p.code === "aaa" ? "/cart" : "/wishlist"));
    const establishSession = vi.fn(async () => ({ identityEpoch: 0 }));
    const c = new StoreHandoffController({ redeem, establishSession, getDevice: async () => ({ platform: "web", deviceId: "d" }) });
    const r1 = await c.handle(OK1);
    const r2 = await c.handle(OK2);
    expect(r1).toEqual({ state: "success", target: "/cart", customerId: "c", identityEpoch: 0 });
    expect(r2).toEqual({ state: "success", target: "/wishlist", customerId: "c", identityEpoch: 0 });
    expect(redeem).toHaveBeenCalledTimes(2);
    expect(establishSession).toHaveBeenCalledTimes(2);
  });
});

describe("§29 no code/state/token persistence in the deep-link layer", () => {
  const files = readdirSync("src/lib/deep-link").filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"));
  it("scans every deep-link module + OpenHandoff for forbidden storage/logging of secrets", () => {
    const sources = [...files.map((f) => `src/lib/deep-link/${f}`), "src/pages/OpenHandoff.tsx"];
    for (const path of sources) {
      const src = readFileSync(path, "utf8");
      // No JS persistence of anything (the cookie/secure-storage is PR5-owned; the coordinator never writes).
      expect(src, `${path} must not write localStorage`).not.toMatch(/localStorage\.setItem/);
      expect(src, `${path} must not write sessionStorage`).not.toMatch(/sessionStorage\.setItem/);
      expect(src, `${path} must not write IndexedDB`).not.toMatch(/indexedDB/);
      // No analytics/error sink of the raw handoff params.
      expect(src, `${path} must not send to Sentry`).not.toMatch(/Sentry|captureException|captureMessage/);
    }
  });
});

describe("§31 Barber isolation", () => {
  it("no Barber/store-integration/b2b/cart-session module imports the deep-link layer", () => {
    // Backend Barber session exchange + marketplace X-Store-Session live under store-integration; none may
    // import the customer deep-link coordinator.
    const roots = ["backend/src/modules/store-integration"];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      let entries: string[] = [];
      try {
        entries = readdirSync(dir, { withFileTypes: true }).map((d) => (d.isDirectory() ? `DIR:${d.name}` : d.name));
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.startsWith("DIR:")) walk(`${dir}/${e.slice(4)}`);
        else if (/\.ts$/.test(e)) {
          const src = readFileSync(`${dir}/${e}`, "utf8");
          if (/deep-link|StoreDeepLinkCoordinator|store-handoff/.test(src)) offenders.push(`${dir}/${e}`);
        }
      }
    };
    roots.forEach(walk);
    expect(offenders).toEqual([]);
  });
});
