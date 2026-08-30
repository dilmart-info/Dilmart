// @vitest-environment jsdom
/**
 * §9.3 — the REAL provisional sign-in action, against the REAL session manager, with only the Supabase
 * SDK faked.
 *
 * This is the test the transaction work needed and did not have. Every earlier version stubbed the sign-in
 * action, so the thing that actually mattered — what the sign-in does to application auth state on its way
 * out — was defined by the stub rather than by the code. Running it on the application's Supabase client
 * meant the SDK persisted and published the provisional session before its promise resolved, so a customer
 * who had taken the tab in the meantime was already overwritten. Nothing checked afterwards could recover
 * that: asking "who is signed in now" returned the answer the stale operation had just written.
 *
 * Both clients here come from the same faked `createClient`, told apart by the configuration the isolated
 * exchange is required to use.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Session } from "@supabase/supabase-js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const B: Session = {
  access_token: "at-cust-B",
  refresh_token: "rt-cust-B",
  expires_at: Math.floor((Date.now() + 600_000) / 1000),
  user: { id: "cust-B", email: null, phone: null },
} as unknown as Session;

const P: Session = {
  access_token: "at-provisional-P",
  refresh_token: "rt-provisional-P",
  expires_at: Math.floor((Date.now() + 600_000) / 1000),
  user: { id: "provisional-P", email: "guest@provisional.local", phone: null },
} as unknown as Session;

const F = vi.hoisted(() => {
  const state: {
    globalSession: Session | null;
    globalSubscribers: Array<(event: string, session: Session | null) => void>;
    /** Every client built with `persistSession: false` — the isolated exchange, if one is used at all. */
    isolatedClients: number;
    releaseSignIn: (() => void) | null;
    deferSignIn: boolean;
    /** Which client the provisional credentials were exchanged through. */
    signedInVia: string[];
    /** Which clients were asked to sign out — the candidate's must never appear here. */
    signedOutVia: string[];
    /** Refresh tokens a sign-out has revoked; refreshing with one of these fails. */
    revokedRefreshTokens: Set<string>;
  } = {
    globalSession: null,
    globalSubscribers: [],
    isolatedClients: 0,
    releaseSignIn: null,
    deferSignIn: false,
    signedInVia: [],
    signedOutVia: [],
    revokedRefreshTokens: new Set<string>(),
  };

  function publishGlobal(event: string, session: Session | null) {
    state.globalSession = session;
    for (const s of [...state.globalSubscribers]) s(event, session);
  }

  function makeClient(label: "global" | "isolated") {
    return {
      auth: {
        getSession: async () => ({
          data: { session: label === "global" ? state.globalSession : null },
          error: null,
        }),
        refreshSession: async () => {
          if (label !== "global") return { data: { session: null }, error: null };
          const current = state.globalSession;
          const token = current?.refresh_token;
          if (!token || state.revokedRefreshTokens.has(token)) {
            // What a revoked candidate would actually do in production: install fine, then fail later.
            return { data: { session: null }, error: { message: "Invalid Refresh Token", status: 400 } };
          }
          const rotated = { ...current, access_token: `${current!.access_token}-rotated` } as Session;
          publishGlobal("TOKEN_REFRESHED", rotated);
          return { data: { session: rotated }, error: null };
        },
        signOut: vi.fn(async () => {
          state.signedOutVia.push(label);
          // A local-scope sign-out revokes the session's refresh token, so a revoked one can never be
          // refreshed again.
          const revoked = label === "global" ? state.globalSession?.refresh_token : P.refresh_token;
          if (revoked) state.revokedRefreshTokens.add(revoked);
          if (label === "global") publishGlobal("SIGNED_OUT", null);
          return { error: null };
        }),
        setSession: vi.fn(async (tokens: { access_token: string; refresh_token: string }) => {
          // Install exactly what was handed over — a fake that substituted a canned session would hide a
          // commit that installed the wrong tokens.
          const source = tokens.access_token === P.access_token ? P : B;
          const next = {
            ...source,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
          } as Session;
          if (label === "global") publishGlobal("SIGNED_IN", next);
          return { data: { session: next }, error: null };
        }),
        signInWithPassword: vi.fn(async () => {
          state.signedInVia.push(label);
          const complete = () => {
            // The SDK installs and publishes BEFORE resolving. For the global client that means the
            // application's session is already replaced; for an isolated, non-persisting client it is
            // confined to that client.
            if (label === "global") publishGlobal("SIGNED_IN", P);
            return { data: { session: P, user: P.user }, error: null };
          };
          if (state.deferSignIn) {
            return new Promise((resolve) => {
              state.releaseSignIn = () => resolve(complete());
            });
          }
          return complete();
        }),
        onAuthStateChange: (cb: (event: string, session: Session | null) => void) => {
          if (label === "global") state.globalSubscribers.push(cb);
          return { data: { subscription: { unsubscribe: vi.fn() } } };
        },
        startAutoRefresh: async () => undefined,
        stopAutoRefresh: async () => undefined,
      },
    };
  }

  const globalClient = makeClient("global");
  return { state, makeClient, publishGlobal, globalClient };
});
const globalClient = F.globalClient;

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: (_url: string, _key: string, options?: any) => {
      // The isolated exchange is REQUIRED to opt out of persistence; that is what identifies it.
      if (options?.auth?.persistSession === false) {
        F.state.isolatedClients += 1;
        return F.makeClient("isolated");
      }
      return F.globalClient;
    },
  };
});

vi.mock("./auth-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./auth-storage")>()),
  clearPersistedAuthSession: vi.fn(async () => undefined),
}));

import { establishProvisionalSession } from "./auth-actions";
import { authSessionManager } from "./auth-session-manager";

beforeEach(() => {
  authSessionManager.resetForTests();
  F.state.globalSession = null;
  F.state.globalSubscribers = [];
  F.state.isolatedClients = 0;
  F.state.releaseSignIn = null;
  F.state.deferSignIn = false;
  F.state.signedInVia = [];
  F.state.signedOutVia = [];
  F.state.revokedRefreshTokens = new Set<string>();
  // The global client is built once, so its spies carry across cases unless cleared.
  globalClient.auth.setSession.mockClear();
  globalClient.auth.signOut.mockClear();
  globalClient.auth.signInWithPassword.mockClear();

  // The manager subscribes exactly as the application does, and customer B is signed in.
  authSessionManager.onAuthStateChange(() => undefined);
  F.publishGlobal("SIGNED_IN", B);
});

afterEach(() => {
  authSessionManager.resetForTests();
});

describe("§9.3 the provisional sign-in must not mutate application auth state", () => {
  it("MANDATORY: exchanging provisional credentials leaves customer B signed in", async () => {
    expect(authSessionManager.getPrincipalSnapshot().owner).toBe("supabase:cust-B");
    const before = authSessionManager.getPrincipalSnapshot();

    const result = await establishProvisionalSession("guest@provisional.local", "pw");

    // The candidate came back as a value...
    expect(result.session.user?.id).toBe("provisional-P");
    // ...through an isolated client, not the application's.
    expect(F.state.signedInVia).toEqual(["isolated"]);
    expect(globalClient.auth.signInWithPassword).not.toHaveBeenCalled();
    // ...and B is untouched: same global session, same authoritative principal.
    expect(F.state.globalSession?.user?.id).toBe("cust-B");
    expect(authSessionManager.getPrincipalSnapshot()).toEqual(before);
    expect(authSessionManager.getAppSession()?.user.id).toBe("cust-B");
  });

  /**
   * The production ordering that defeated every previous guard: BEGIN passes, B arrives, and only THEN
   * does the stale sign-in finish. If that sign-in installs its own result, the check at commit time is
   * reading state the stale operation itself just wrote.
   */
  it("MANDATORY: a provisional sign-in that finishes after customer B arrives cannot replace B", async () => {
    const guestBefore = authSessionManager.getPrincipalSnapshot();
    const ticket = await authSessionManager.beginProvisionalAuthentication(guestBefore);

    // The credential exchange is held open.
    F.state.deferSignIn = true;
    const pending = establishProvisionalSession("guest@provisional.local", "pw");
    await new Promise((r) => setTimeout(r, 0));

    // An unrelated customer takes the tab, through the real global auth-state path.
    F.publishGlobal("SIGNED_IN", { ...B, user: { ...(B.user as any), id: "supa-cust-B2" } } as Session);
    expect(authSessionManager.getPrincipalSnapshot().owner).toBe("supabase:supa-cust-B2");

    // Now the stale exchange completes.
    F.state.releaseSignIn!();
    const result = await pending;

    // It changed nothing on its way out — the newcomer is still signed in.
    expect(F.state.globalSession?.user?.id).toBe("supa-cust-B2");
    expect(authSessionManager.getAppSession()?.user.id).toBe("supa-cust-B2");

    // And the guarded commit refuses to install the stale candidate.
    await expect(
      authSessionManager.commitProvisionalAuthentication(ticket, result.session),
    ).rejects.toThrow();

    expect(F.state.globalSession?.user?.id).toBe("supa-cust-B2");
    expect(authSessionManager.getAppSession()?.user.id).toBe("supa-cust-B2");
    expect(authSessionManager.getActiveSource()).toBe("supabase");
  });

  /**
   * A candidate has to survive the exchange intact. Signing it out to "clean up" revokes its refresh
   * token, which produces the worst kind of bug: the session installs, works for as long as its access
   * token lasts, and then dies — far from anything that would point at the cause. Isolation is the
   * client's configuration and dropping it, never tearing the session down.
   */
  it("MANDATORY: the candidate's own tokens survive the exchange and are what the commit installs", async () => {
    F.publishGlobal("SIGNED_OUT", null);
    const guest = authSessionManager.getPrincipalSnapshot();
    const ticket = await authSessionManager.beginProvisionalAuthentication(guest);

    const result = await establishProvisionalSession("guest@provisional.local", "pw");

    // The exchange did not revoke anything, and returned the credentials untouched.
    expect(F.state.signedOutVia).toEqual([]);
    expect(F.state.revokedRefreshTokens.size).toBe(0);
    expect(result.session.access_token).toBe("at-provisional-P");
    expect(result.session.refresh_token).toBe("rt-provisional-P");

    await authSessionManager.commitProvisionalAuthentication(ticket, result.session);

    // Exactly those credentials became the global session.
    expect(F.state.globalSession?.user?.id).toBe("provisional-P");
    expect(F.state.globalSession?.access_token).toBe("at-provisional-P");
    expect(F.state.globalSession?.refresh_token).toBe("rt-provisional-P");
    expect(authSessionManager.getLastKnownSession()?.refresh_token).toBe("rt-provisional-P");

    // And the committed refresh token still works — the property a revoked candidate would have lost.
    const outcome = await authSessionManager.refreshSessionSingleFlight("app_resume");
    expect(outcome.status).toBe("refreshed");
    expect(authSessionManager.getAppSession()?.user.id).toBe("provisional-P");
  });

  it("MANDATORY: the guarded commit is what installs the provisional customer globally", async () => {
    // Start from a genuine guest.
    F.publishGlobal("SIGNED_OUT", null);
    const guest = authSessionManager.getPrincipalSnapshot();
    expect(guest.owner).toBeNull();

    const ticket = await authSessionManager.beginProvisionalAuthentication(guest);
    const result = await establishProvisionalSession("guest@provisional.local", "pw");

    // Still nobody signed in: the exchange installed nothing.
    expect(F.state.globalSession).toBeNull();
    expect(authSessionManager.getPrincipalSnapshot().owner).toBeNull();

    const committed = await authSessionManager.commitProvisionalAuthentication(ticket, result.session);

    // The commit performed the one global installation, and states the snapshot to adopt.
    expect(globalClient.auth.setSession).toHaveBeenCalledTimes(1);
    expect(F.state.globalSession?.user?.id).toBe("provisional-P");
    expect(committed.principalSnapshot.owner).toBe("supabase:provisional-P");
    expect(committed.principalSnapshot).toEqual(authSessionManager.getPrincipalSnapshot());
  });

  /**
   * Supabase may refresh or normalize a session while installing it, so what comes back is not always
   * what was handed over. Returning only a principal snapshot left the caller republishing the candidate
   * it still held — putting superseded credentials into React state, and from there into /auth/context,
   * the checkout submit, and the next refresh, while the global client held newer ones.
   */
  it("MANDATORY: the whole provisional flow ends on the tokens the client installed, not the candidate", async () => {
    F.publishGlobal("SIGNED_OUT", null);
    const ticket = await authSessionManager.beginProvisionalAuthentication(
      authSessionManager.getPrincipalSnapshot(),
    );
    const candidate = await establishProvisionalSession("guest@provisional.local", "pw");
    expect(candidate.session.access_token).toBe("at-provisional-P");

    // The global client hands back a refreshed session for the same customer.
    const refreshed = {
      access_token: "at-provisional-P-new",
      refresh_token: "rt-provisional-P-new",
      expires_at: Math.floor((Date.now() + 600_000) / 1000),
      user: P.user,
    } as Session;
    globalClient.auth.setSession.mockImplementationOnce(async () => {
      F.publishGlobal("SIGNED_IN", refreshed);
      return { data: { session: refreshed }, error: null };
    });

    const committed = await authSessionManager.commitProvisionalAuthentication(ticket, candidate.session);

    // The manager, the global client and the value handed back to the caller all agree on the NEW tokens.
    expect(committed.session.access_token).toBe("at-provisional-P-new");
    expect(committed.session.refresh_token).toBe("rt-provisional-P-new");
    expect(authSessionManager.getLastKnownSession()?.access_token).toBe("at-provisional-P-new");
    expect(authSessionManager.getAppSession()?.accessToken).toBe("at-provisional-P-new");
    expect(F.state.globalSession?.access_token).toBe("at-provisional-P-new");
  });
});
