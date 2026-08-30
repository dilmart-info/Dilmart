// @vitest-environment jsdom
/**
 * §9.3 — restoring a superseding Supabase identity must not resurrect it after a federated handoff.
 *
 * `restoreSupersedingIdentity` undoes a provisional installation that lost a race by putting the winner
 * back through `auth.setSession`. That call takes real time, and a federated handoff can take ownership of
 * the app inside that window. Publishing the restored Supabase session afterwards installs a SECOND,
 * dormant identity behind the federated one — which then reappears at the next bootstrap or logout.
 *
 * The whole point of the fix is that finishing last does not make you the owner. Every timing here is
 * controlled by an explicit deferred promise; nothing sleeps.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AuthSessionManager } from "../auth-session-manager";

/* eslint-disable @typescript-eslint/no-explicit-any */

const clearPersistedAuthSession = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../auth-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth-storage")>()),
  clearPersistedAuthSession,
}));

/** The federated customer C that takes the app while the Supabase restoration is in flight. */
const FED_C = {
  authSource: "DilMart_federated" as const,
  accessToken: "at-fed-C",
  accessExpiresAt: Date.now() + 600_000,
  user: { id: "fed-cust-C", email: null, phone: null },
  federated: { linkedProfileId: "lp-C", refreshExpiresAt: Date.now() + 2_592_000_000 },
};

function supabaseSession(id: string, accessToken = `at-${id}`): Session {
  return {
    access_token: accessToken,
    refresh_token: `rt-${id}`,
    expires_at: Math.floor((Date.now() + 600_000) / 1000),
    user: { id, email: null, phone: null },
  } as unknown as Session;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function makeAdapter() {
  let session: typeof FED_C | null = null;
  let listener: ((e: unknown) => void) | null = null;
  return {
    install: (next: typeof FED_C | null) => {
      session = next;
      listener?.({ type: "session_changed" });
    },
    setLifecycleListener: (l: (e: unknown) => void) => {
      listener = l;
    },
    getSession: () => session,
    bootstrap: async () => null,
    establishFromRedeem: async () => {
      session = FED_C;
      return FED_C;
    },
    getIdentityEpoch: () => 1,
    isIdentityResolutionPending: () => false,
    getStorageError: () => null,
    logout: vi.fn(async () => undefined),
    logoutAll: vi.fn(async () => undefined),
    refreshSingleFlight: vi.fn(async () => ({ status: "refreshed", accessToken: FED_C.accessToken })),
    getValidAccessToken: async () => session?.accessToken ?? null,
    getValidAccessTokenOutcome: async () => ({ token: session?.accessToken ?? null }),
    getAccessTokenForIdentityResolution: async () => ({ token: session?.accessToken ?? null, epoch: 1 }),
    getOrCreateDeviceId: async () => "dev-test",
    applyVerifiedIdentity: () => true,
  };
}

let manager: AuthSessionManager;
let adapter: ReturnType<typeof makeAdapter>;
let emitAuthState: (event: string, session: Session | null) => void;

/** What the GLOBAL Supabase client currently holds. */
let globalSession: Session | null = null;
const signOut = vi.fn(async () => {
  globalSession = null;
  return { error: null };
});

/** When set, the NEXT setSession for this access token blocks until its deferred is resolved. */
let holdSetSessionFor: { token: string; gate: ReturnType<typeof deferred<void>> } | null = null;

const setSession = vi.fn(async (tokens: { access_token: string; refresh_token: string }) => {
  if (holdSetSessionFor && holdSetSessionFor.token === tokens.access_token) {
    const gate = holdSetSessionFor.gate;
    holdSetSessionFor = null;
    await gate.promise;
  }
  globalSession = supabaseSession(tokens.access_token.replace(/^at-/, ""), tokens.access_token);
  // The real SDK publishes before its promise resolves.
  emitAuthState("SIGNED_IN", globalSession);
  return { data: { session: globalSession }, error: null };
});

beforeEach(() => {
  manager = new AuthSessionManager();
  adapter = makeAdapter();
  manager.setFederatedAdapter(adapter as any);
  signOut.mockClear();
  setSession.mockClear();
  clearPersistedAuthSession.mockClear();
  globalSession = null;
  holdSetSessionFor = null;
  manager.setClient({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: globalSession }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: globalSession }, error: null })),
      signOut,
      setSession,
      onAuthStateChange: vi.fn((cb: (event: string, session: Session | null) => void) => {
        emitAuthState = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
      startAutoRefresh: vi.fn(async () => undefined),
      stopAutoRefresh: vi.fn(async () => undefined),
    },
  } as any);
  manager.onAuthStateChange(() => undefined);
});

afterEach(() => {
  manager.resetForTests();
});

describe("§9.3 a superseding restoration cannot resurrect Supabase behind a federated owner", () => {
  it("keeps the federated identity that arrived while the restoration was in flight", async () => {
    // 1. A provisional guest sign-in begins on the Supabase source.
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    const candidate = supabaseSession("provisional-P");

    // 2. Supabase customer B takes the tab while the candidate is being installed, so B is recorded as
    //    the superseding winner and the commit loses.
    const commitGate = deferred<void>();
    holdSetSessionFor = { token: candidate.access_token, gate: commitGate };
    const commit = manager.commitProvisionalAuthentication(ticket, candidate).catch((error) => error);
    await Promise.resolve();
    emitAuthState("SIGNED_IN", supabaseSession("cust-B"));

    // 3. The losing commit now restores B — hold that restoration inside auth.setSession(B).
    const restoreGate = deferred<void>();
    holdSetSessionFor = { token: "at-cust-B", gate: restoreGate };
    commitGate.resolve();

    // The commit cannot settle yet: its own recovery is parked inside the gated setSession(B). Awaiting
    // it here would deadlock the test, which is precisely the window the race lives in.
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(setSession).toHaveBeenCalledWith({ access_token: "at-cust-B", refresh_token: "rt-cust-B" });

    // 4. Federated handoff C completes and becomes the current identity, mid-restoration.
    await manager.establishFederatedSessionFromRedeem({
      session: {
        accessToken: FED_C.accessToken,
        expiresIn: 600,
        refreshToken: "rt-fed-C",
        refreshExpiresIn: 2_592_000,
      },
    } as any);
    expect(manager.getActiveSource()).toBe("DilMart_federated");

    // 5. Only now does the restoration's setSession(B) resolve, letting the losing commit finish last.
    restoreGate.resolve();
    expect(await commit).toBeInstanceOf(Error);
    await new Promise<void>((r) => setTimeout(r, 0));

    // 6. C still owns the app; B must not have been published behind it.
    expect(manager.getActiveSource()).toBe("DilMart_federated");
    expect(manager.getPrincipalSnapshot().owner).toBe(`DilMart_federated:${FED_C.user.id}`);

    const appSession = manager.getAppSession();
    expect(appSession?.authSource).toBe("DilMart_federated");
    expect(appSession?.user?.id).toBe(FED_C.user.id);

    // No dormant Supabase identity is left anywhere it could be resurrected from: the manager does not
    // hold B (asserted above via the app session and principal), and the global Supabase client no
    // longer holds it either, so a later bootstrap or logout has nothing to find.
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(globalSession).toBeNull();
  });

  it("still restores the superseding identity when nothing takes over", async () => {
    // The uncontested path must keep working — the guard must not fire on this restoration's own
    // Supabase auth event, which is why it compares the active source rather than the lifecycle serial.
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    const candidate = supabaseSession("provisional-P");

    const commitGate = deferred<void>();
    holdSetSessionFor = { token: candidate.access_token, gate: commitGate };
    const commit = manager.commitProvisionalAuthentication(ticket, candidate).catch((error) => error);
    await Promise.resolve();
    emitAuthState("SIGNED_IN", supabaseSession("cust-B"));
    commitGate.resolve();

    expect(await commit).toBeInstanceOf(Error);
    await new Promise<void>((r) => setTimeout(r, 0));

    expect(manager.getActiveSource()).toBe("supabase");
    expect(manager.getPrincipalSnapshot().owner).toBe("supabase:cust-B");
    expect(manager.getAppSession()?.user?.id).toBe("cust-B");
  });
});
