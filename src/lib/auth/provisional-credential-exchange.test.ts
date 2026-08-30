// @vitest-environment jsdom
/**
 * §9.3 — obtaining provisional credentials must have NO effect on whoever is signed in.
 *
 * This is the property that makes the guarded commit meaningful. When the provisional sign-in ran on the
 * application's Supabase client, the SDK persisted and published the new session before its promise
 * resolved, so the previous customer was already gone by the time anything could ask whether the result
 * was still wanted. No check placed after that point can help; the exchange itself has to be inert.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AuthSessionManager } from "./auth-session-manager";
import {
  exchangeProvisionalCredentials,
  setProvisionalExchangeClientForTests,
} from "./provisional-credential-exchange";

/* eslint-disable @typescript-eslint/no-explicit-any */

vi.mock("./auth-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth-storage")>()),
  clearPersistedAuthSession: vi.fn(async () => undefined),
}));

const CANDIDATE = {
  access_token: "at-provisional-P",
  refresh_token: "rt-provisional-P",
  expires_at: Math.floor((Date.now() + 600_000) / 1000),
  user: { id: "provisional-P", email: "guest@provisional.local", phone: null },
} as unknown as Session;

const B = {
  access_token: "at-cust-B",
  refresh_token: "rt-cust-B",
  expires_at: Math.floor((Date.now() + 600_000) / 1000),
  user: { id: "cust-B", email: null, phone: null },
} as unknown as Session;

/**
 * The isolated exchange client. It has its OWN auth surface: signing in here must not reach the
 * application's client, its storage, or its subscribers.
 */
function makeExchangeClient() {
  const signInWithPassword = vi.fn(async () => ({ data: { session: CANDIDATE }, error: null }));
  const signOut = vi.fn(async () => ({ error: null }));
  return { auth: { signInWithPassword, signOut } };
}

let manager: AuthSessionManager;
let exchange: ReturnType<typeof makeExchangeClient>;
/** Everything the GLOBAL application client is asked to do. Any entry here during an exchange is a bug. */
const globalWrites: string[] = [];
let globalSession: Session | null;
let globalEvents: Array<{ event: string; userId: string | null }>;

beforeEach(() => {
  exchange = makeExchangeClient();
  setProvisionalExchangeClientForTests(exchange as any);

  globalWrites.length = 0;
  globalSession = B;
  globalEvents = [];

  manager = new AuthSessionManager();
  manager.setClient({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: globalSession }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: globalSession }, error: null })),
      signOut: vi.fn(async () => {
        globalWrites.push("signOut");
        return { error: null };
      }),
      setSession: vi.fn(async () => {
        globalWrites.push("setSession");
        return { data: { session: globalSession }, error: null };
      }),
      onAuthStateChange: vi.fn((cb: (event: string, session: Session | null) => void) => {
        // Wire B in as the current global identity, exactly as production would.
        queueMicrotask(() => cb("INITIAL_SESSION", B));
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      startAutoRefresh: vi.fn(async () => undefined),
      stopAutoRefresh: vi.fn(async () => undefined),
    },
  } as any);
  manager.onAuthStateChange((event, session) =>
    globalEvents.push({ event, userId: session?.user?.id ?? null }),
  );
});

afterEach(() => {
  setProvisionalExchangeClientForTests(null);
  manager.resetForTests();
});

describe("§9.3 the provisional credential exchange is inert", () => {
  it("MANDATORY: exchanging credentials while customer B is signed in leaves B completely alone", async () => {
    // B is the established global identity.
    await new Promise((r) => queueMicrotask(() => r(null)));
    expect(manager.getPrincipalSnapshot().owner).toBe("supabase:cust-B");
    const beforeExchange = manager.getPrincipalSnapshot();
    globalEvents.length = 0;

    const candidate = await exchangeProvisionalCredentials("guest@provisional.local", "pw");

    // The candidate exists only as a returned value.
    expect(candidate.user?.id).toBe("provisional-P");
    expect(candidate.access_token).toBe(CANDIDATE.access_token);
    expect(candidate.refresh_token).toBe(CANDIDATE.refresh_token);
    // It was obtained through the isolated client, never the application's, and was not revoked there.
    expect(exchange.auth.signOut).not.toHaveBeenCalled();
    expect(exchange.auth.signInWithPassword).toHaveBeenCalledTimes(1);
    // Nothing was written to the global client, nothing was published to its subscribers, and the
    // authoritative principal did not move.
    expect(globalWrites).toEqual([]);
    expect(globalEvents.map((e) => e.userId)).not.toContain("provisional-P");
    expect(manager.getPrincipalSnapshot()).toEqual(beforeExchange);
    expect(manager.getAppSession()?.user.id).toBe("cust-B");
  });

  it("MANDATORY: discarding the candidate requires nothing, and B is still signed in", async () => {
    await new Promise((r) => queueMicrotask(() => r(null)));
    const before = manager.getPrincipalSnapshot();

    const candidate = await exchangeProvisionalCredentials("guest@provisional.local", "pw");
    void candidate; // rejected by the guarded commit; simply dropped

    expect(globalWrites).toEqual([]);
    expect(manager.getPrincipalSnapshot()).toEqual(before);
    expect(manager.getAppSession()?.user.id).toBe("cust-B");
  });

  /**
   * The candidate must still be usable after the exchange. `signOut({ scope: "local" })` terminates the
   * Supabase Auth session and revokes its refresh token, so a candidate that had been signed out would
   * install cleanly, work until its access token expired, and then be unable to refresh — a session that
   * fails hours later, for reasons invisible at the point of the mistake. Isolation here comes from the
   * client's configuration and from discarding it, never from tearing the session down.
   */
  it("MANDATORY: does not sign out or revoke the candidate before it can be committed", async () => {
    const candidate = await exchangeProvisionalCredentials("guest@provisional.local", "pw");

    expect(exchange.auth.signOut).not.toHaveBeenCalled();
    // Returned intact, tokens and all — exactly what the guarded commit will install.
    expect(candidate.access_token).toBe(CANDIDATE.access_token);
    expect(candidate.refresh_token).toBe(CANDIDATE.refresh_token);
    expect(candidate.user?.id).toBe("provisional-P");
  });

  it("fails closed when the exchange returns an unusable session", async () => {
    exchange.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: "at", user: null } },
      error: null,
    } as any);

    await expect(exchangeProvisionalCredentials("guest@provisional.local", "pw")).rejects.toThrow();
    expect(globalWrites).toEqual([]);
  });
});
