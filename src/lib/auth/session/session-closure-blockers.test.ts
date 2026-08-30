// @vitest-environment jsdom
/**
 * STORE-PR5 §23 — engine closure blockers surfaced in review.
 * A: establish must FAIL CLOSED if persisted Supabase auth state cannot be removed (single active source).
 * (B and C are covered in federated-session.test.ts at the adapter/API layer.)
 */
import { afterEach, describe, expect, it, vi } from "vitest";

// Force the persisted-Supabase-state deletion to fail (partial mock — keep every other real export so the
// Supabase client's storage wiring still loads).
vi.mock("../auth-storage", async (importActual) => ({
  ...(await importActual<typeof import("../auth-storage")>()),
  clearPersistedAuthSession: vi.fn(async () => { throw new Error("secure clear failed"); }),
}));

import { authSessionManager } from "../auth-session-manager";
import { FederatedSessionAdapter } from "./federated-session-adapter";
import { FederatedSessionApi } from "./federated-session-api";
import { FederatedSessionStorage } from "./federated-session-storage";
import type { FederatedRedeemResult } from "./app-session.types";

const REDEEM: FederatedRedeemResult = {
  status: "authenticated",
  session: { accessToken: "at", expiresIn: 600, refreshExpiresIn: 2592000 },
  customer: { id: "cust-x", linkedProfileId: "lp-x", origin: "DilMart" },
};

describe("BLOCKER A: single-active-source fails closed", () => {
  afterEach(() => authSessionManager.resetForTests());

  it("does NOT establish/switch when persisted Supabase state cannot be securely removed", async () => {
    authSessionManager.setClient({ auth: { signOut: vi.fn(async () => ({ error: null })) } } as any);
    const adapter = new FederatedSessionAdapter({ isNative: () => false, api: {} as FederatedSessionApi, storage: new FederatedSessionStorage({ isNative: () => false }) });
    const establishSpy = vi.spyOn(adapter, "establishFromRedeem");
    authSessionManager.setFederatedAdapter(adapter);

    await expect(authSessionManager.establishFederatedSessionFromRedeem(REDEEM)).rejects.toThrow(/secure clear failed/);
    expect(establishSpy).not.toHaveBeenCalled();          // federated identity NOT persisted
    expect(authSessionManager.getActiveSource()).toBe("supabase"); // source did NOT switch
  });
});
