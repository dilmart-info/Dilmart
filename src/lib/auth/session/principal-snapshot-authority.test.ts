// @vitest-environment jsdom
/**
 * §9.3 — the AuthSessionManager-owned principal snapshot, and the transaction that guards the one auth
 * mutation a long-running operation is allowed to request.
 *
 * `checkout-principal-lifecycle-race.test.tsx` proves the end-to-end consequence: a stale guest checkout
 * cannot destroy a signed-in customer. This file pins the contract that makes that true, so the rules are
 * stated where they are implemented rather than only implied by a page test.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { AuthSessionManager, isStalePrincipalOperationError } from "../auth-session-manager";

/* eslint-disable @typescript-eslint/no-explicit-any */

const clearPersistedAuthSession = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../auth-storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth-storage")>()),
  clearPersistedAuthSession,
}));

const FED_B = {
  authSource: "DilMart_federated" as const,
  accessToken: "at-B",
  accessExpiresAt: Date.now() + 600_000,
  user: { id: "fed-cust-B", email: null, phone: null },
  federated: { linkedProfileId: "lp-B", refreshExpiresAt: Date.now() + 2_592_000_000 },
};

function supabaseSession(id: string, accessToken = `at-${id}`): Session {
  return {
    access_token: accessToken,
    refresh_token: `rt-${id}`,
    expires_at: Math.floor((Date.now() + 600_000) / 1000),
    user: { id, email: null, phone: null },
  } as unknown as Session;
}

function makeAdapter() {
  let session: typeof FED_B | null = null;
  let listener: ((e: unknown) => void) | null = null;
  const logout = vi.fn(async () => {
    session = null;
    listener?.({ type: "session_cleared" });
  });
  return {
    logout,
    /** Publish an identity the way a cross-tab cookie replacement does: synchronously, no awaits. */
    install: (next: typeof FED_B | null) => {
      session = next;
      listener?.({ type: "session_changed" });
    },
    setLifecycleListener: (l: (e: unknown) => void) => {
      listener = l;
    },
    getSession: () => session,
    bootstrap: async () => null,
    establishFromRedeem: async () => session,
    getIdentityEpoch: () => 1,
    isIdentityResolutionPending: () => false,
    getStorageError: () => null,
    logoutAll: vi.fn(async () => undefined),
    refreshSingleFlight: vi.fn(async () => ({ status: "refreshed", accessToken: "at-B" })),
    getValidAccessToken: async () => session?.accessToken ?? null,
    getValidAccessTokenOutcome: async () => ({ token: session?.accessToken ?? null }),
    getAccessTokenForIdentityResolution: async () => ({ token: session?.accessToken ?? null, epoch: 1 }),
    getOrCreateDeviceId: async () => "dev-test",
    applyVerifiedIdentity: () => true,
  };
}

let manager: AuthSessionManager;
let adapter: ReturnType<typeof makeAdapter>;
/** The real Supabase auth-state callback the manager installs — the production path for a session change. */
let emitAuthState: (event: string, session: Session | null) => void;
const signOut = vi.fn(async () => ({ error: null }));
/** What the GLOBAL Supabase client currently holds. Only a guarded commit may change it. */
let globalSession: Session | null = null;
const setSession = vi.fn(async (tokens: { access_token: string; refresh_token: string }) => {
  globalSession = supabaseSession(tokenOwner(tokens.access_token), tokens.access_token);
  // The real SDK publishes before its promise resolves.
  emitAuthState("SIGNED_IN", globalSession);
  return { data: { session: globalSession }, error: null };
});
/** Access tokens here are `at-<id>`, so the owner is recoverable for the fake install. */
function tokenOwner(accessToken: string) {
  return accessToken.replace(/^at-/, "");
}

beforeEach(() => {
  manager = new AuthSessionManager();
  adapter = makeAdapter();
  manager.setFederatedAdapter(adapter as any);
  signOut.mockClear();
  setSession.mockClear();
  globalSession = null;
  clearPersistedAuthSession.mockClear();
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
  // Subscribing is what production does; it is also how a Supabase session reaches the manager.
  manager.onAuthStateChange(() => undefined);
});

afterEach(() => {
  manager.resetForTests();
});

/** Put the manager in the federated source with no identity resolved yet — a genuine guest. */
async function armFederatedSource() {
  await manager.establishFederatedSessionFromRedeem({
    session: { accessToken: "at-none", expiresIn: 600, refreshToken: "rt", refreshExpiresIn: 2_592_000 },
  } as any);
}

/**
 * Complete a whole provisional transaction the way AuthProvider does. The candidate exchange is isolated,
 * so nothing is published between BEGIN and COMMIT — the commit itself performs the global install.
 */
async function establishProvisional(id: string) {
  const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
  const candidate = supabaseSession(id);
  return manager.commitProvisionalAuthentication(ticket, candidate);
}

describe("§9.3 the principal snapshot advances with the ACTUAL lifecycle", () => {
  it("starts with no owner", () => {
    expect(manager.getPrincipalSnapshot()).toEqual({ owner: null, version: 0 });
  });

  it("advances on null → owner, and the owner is source-qualified", async () => {
    const before = manager.getPrincipalSnapshot();
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));

    const after = manager.getPrincipalSnapshot();
    expect(after.owner).toBe("supabase:cust-A");
    expect(after.version).toBe(before.version + 1);
  });

  it("does NOT advance for token rotation — same customer, new access token", () => {
    emitAuthState("SIGNED_IN", supabaseSession("cust-A", "at-1"));
    const before = manager.getPrincipalSnapshot();

    emitAuthState("TOKEN_REFRESHED", supabaseSession("cust-A", "at-2-rotated"));

    expect(manager.getPrincipalSnapshot()).toEqual(before);
  });

  /**
   * Deriving the snapshot only when somebody reads it makes unobserved transitions vanish. `A → null → A`
   * would then look like no change at all, and an operation authorised for the FIRST session would still
   * pass its check inside the second one.
   */
  it("MANDATORY: A → null → A advances the version, with NO snapshot read in between", () => {
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));
    const atFirstA = manager.getPrincipalSnapshot();

    emitAuthState("SIGNED_OUT", null);
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));

    const atSecondA = manager.getPrincipalSnapshot();
    expect(atSecondA.owner).toBe("supabase:cust-A");
    expect(atSecondA.version).toBeGreaterThan(atFirstA.version);
  });

  it("MANDATORY: A → B → A advances the version for BOTH transitions, with NO snapshot read in between", () => {
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));
    const atFirstA = manager.getPrincipalSnapshot();

    emitAuthState("SIGNED_IN", supabaseSession("cust-B"));
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));

    const atSecondA = manager.getPrincipalSnapshot();
    expect(atSecondA.owner).toBe("supabase:cust-A");
    expect(atSecondA.version).toBeGreaterThanOrEqual(atFirstA.version + 2);
  });

  it("advances on owner → null", () => {
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));
    const atA = manager.getPrincipalSnapshot();

    emitAuthState("SIGNED_OUT", null);

    const signedOut = manager.getPrincipalSnapshot();
    expect(signedOut.owner).toBeNull();
    expect(signedOut.version).toBeGreaterThan(atA.version);
  });

  it("keeps a dormant Supabase event out of the principal while a federated identity is active", async () => {
    await armFederatedSource();
    adapter.install(FED_B);
    const federated = manager.getPrincipalSnapshot();
    expect(federated.owner).toBe(`DilMart_federated:${FED_B.user.id}`);

    emitAuthState("SIGNED_IN", supabaseSession("dormant-supabase-user"));

    // One active source, never two: the federated customer is still the principal.
    expect(manager.getPrincipalSnapshot().owner).toBe(`DilMart_federated:${FED_B.user.id}`);
  });

  it("reports the new owner BEFORE subscribers are notified", async () => {
    await armFederatedSource();
    const seen: Array<string | null> = [];
    manager.subscribe(() => seen.push(manager.getPrincipalSnapshot().owner));

    adapter.install(FED_B);

    // A subscriber that read a stale snapshot here would hand a stale answer to anything it re-rendered.
    expect(seen).toContain(`DilMart_federated:${FED_B.user.id}`);
  });

  it("syncs the authority BEFORE the Supabase auth-state callback runs", () => {
    const seen: Array<string | null> = [];
    manager.onAuthStateChange(() => seen.push(manager.getPrincipalSnapshot().owner));

    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));

    expect(seen).toContain("supabase:cust-A");
  });
});

describe("§9.3 the provisional authentication TRANSACTION", () => {
  it("MANDATORY: a commit is refused when an unrelated customer arrived after BEGIN", async () => {
    const guestSnapshot = manager.getPrincipalSnapshot();
    const ticket = await manager.beginProvisionalAuthentication(guestSnapshot);

    // Begin has already passed. The sign-in is still in flight when B takes the tab.
    await armFederatedSource();
    adapter.install(FED_B);
    expect(manager.getPrincipalSnapshot().owner).toBe(`DilMart_federated:${FED_B.user.id}`);

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toSatisfy(isStalePrincipalOperationError);

    // B is untouched: still federated, still the principal, never logged out.
    expect(adapter.logout).not.toHaveBeenCalled();
    expect(manager.getActiveSource()).toBe("DilMart_federated");
    expect(manager.getAppSession()?.user.id).toBe(FED_B.user.id);
  });

  it("MANDATORY: a commit is refused when a handoff has STARTED but not yet installed its identity", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());

    // The handoff begins and is still mid-flight — its identity is not the principal yet, so the snapshot
    // alone would still look unchanged. An operation must not be able to slip in through that window.
    const handoff = manager.establishFederatedSessionFromRedeem({
      session: { accessToken: "at-B", expiresIn: 600, refreshToken: "rt", refreshExpiresIn: 2_592_000 },
    } as any);

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toSatisfy(isStalePrincipalOperationError);
    await handoff;
  });

  it("refuses a stale expected snapshot at BEGIN and does not revoke the active identity", async () => {
    await armFederatedSource();
    const guestSnapshot = manager.getPrincipalSnapshot();

    adapter.install(FED_B);

    await expect(manager.beginProvisionalAuthentication(guestSnapshot)).rejects.toSatisfy(
      isStalePrincipalOperationError,
    );
    expect(adapter.logout).not.toHaveBeenCalled();
    expect(manager.getAppSession()?.user.id).toBe(FED_B.user.id);
  });

  it("refuses a snapshot whose owner matches but whose version does not", async () => {
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));
    const current = manager.getPrincipalSnapshot();

    await expect(
      manager.beginProvisionalAuthentication({ owner: current.owner, version: current.version - 1 }),
    ).rejects.toSatisfy(isStalePrincipalOperationError);
  });

  it("MANDATORY: a normal guest transaction commits exactly once and returns the adoption snapshot", async () => {
    const before = manager.getPrincipalSnapshot();
    const ticket = await manager.beginProvisionalAuthentication(before);

    const candidate = supabaseSession("provisional-P");
    // Before the commit the candidate is not the global session — it is only a value.
    expect(globalSession).toBeNull();

    const committed = await manager.commitProvisionalAuthentication(ticket, candidate);
    const adopted = committed.principalSnapshot;

    expect(adopted.owner).toBe("supabase:provisional-P");
    expect(adopted.version).toBeGreaterThan(before.version);
    expect(adopted).toEqual(manager.getPrincipalSnapshot());
    // The commit hands back what it installed, so no caller is left holding the candidate.
    expect(committed.session.user?.id).toBe("provisional-P");
    // The commit — and nothing earlier — installed it globally.
    expect(setSession).toHaveBeenCalledTimes(1);
    expect(globalSession?.user?.id).toBe("provisional-P");

    // Spent: the same ticket cannot install anything a second time.
    await expect(manager.commitProvisionalAuthentication(ticket, candidate)).rejects.toThrow();
  });

  it("leaves the federated source when the guest was mid-handoff, and commits normally", async () => {
    await armFederatedSource();
    adapter.install(FED_B);

    const committed = await establishProvisional("provisional-P");

    expect(adapter.logout).toHaveBeenCalledTimes(1);
    expect(manager.getActiveSource()).toBe("supabase");
    expect(committed.principalSnapshot.owner).toBe("supabase:provisional-P");
  });

  it("a second guest submit supersedes the first, so only one transaction can commit", async () => {
    const first = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    const second = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());

    await expect(manager.commitProvisionalAuthentication(first, supabaseSession("P1"))).rejects.toThrow();

    const committed = await manager.commitProvisionalAuthentication(second, supabaseSession("P2"));
    expect(committed.principalSnapshot.owner).toBe("supabase:P2");
  });

  /**
   * THE PRODUCTION ORDERING. Not "B arrives, then commit" — that was always caught. The real sequence is
   * that the stale sign-in finishes AFTER B and, when it ran on the application's own Supabase client,
   * published `SIGNED_IN P` on its way out. Every check that looked at who is signed in NOW then saw P and
   * agreed that P was current. The identity being asked about was the answer the stale operation had just
   * written.
   */
  it("MANDATORY: an unrelated Supabase customer B is not replaced by a provisional sign-in that finishes after them", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());

    // Customer B takes the tab while the provisional exchange is still in flight.
    const b = supabaseSession("supa-cust-B");
    globalSession = b;
    emitAuthState("SIGNED_IN", b);
    expect(manager.getPrincipalSnapshot().owner).toBe("supabase:supa-cust-B");

    // The old exchange now returns its candidate. It publishes nothing — that is the point.
    const candidate = supabaseSession("provisional-P");
    expect(manager.getAppSession()?.user.id).toBe("supa-cust-B");

    await expect(manager.commitProvisionalAuthentication(ticket, candidate)).rejects.toSatisfy(
      isStalePrincipalOperationError,
    );

    // B is untouched in every sense that matters.
    expect(setSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(globalSession?.user?.id).toBe("supa-cust-B");
    expect(manager.getActiveSource()).toBe("supabase");
    expect(manager.getAppSession()?.user.id).toBe("supa-cust-B");
  });

  /**
   * Owner equality at the end must never erase what happened in between. `S0 → B → S0` finishes on the
   * owner the transaction began with, so any check based on the current owner alone would wave it through.
   */
  it("MANDATORY: a transaction superseded and then returned to its ORIGINAL owner is still refused", async () => {
    const a = supabaseSession("cust-A");
    globalSession = a;
    emitAuthState("SIGNED_IN", a);

    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    const startedUnder = manager.getPrincipalSnapshot().owner;

    emitAuthState("SIGNED_IN", supabaseSession("cust-B"));
    emitAuthState("SIGNED_IN", supabaseSession("cust-A"));
    expect(manager.getPrincipalSnapshot().owner).toBe(startedUnder); // same owner as at BEGIN

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toSatisfy(isStalePrincipalOperationError);
    expect(setSession).not.toHaveBeenCalled();
  });

  it("MANDATORY: an identity arriving DURING the install wins, and the loser is not left installed", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());

    const b = supabaseSession("supa-cust-B");
    setSession.mockImplementationOnce(async () => {
      // B lands while the install is in flight. Finishing last must not make the candidate the winner.
      globalSession = b;
      emitAuthState("SIGNED_IN", b);
      return { data: { session: b }, error: null };
    });

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toSatisfy(isStalePrincipalOperationError);

    expect(manager.getAppSession()?.user.id).toBe("supa-cust-B");
    expect(manager.getActiveSource()).toBe("supabase");
  });

  it("an aborted transaction cannot be committed later", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    manager.abortProvisionalAuthentication(ticket);

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toThrow();
  });
});

describe("§9.3 the global installation must actually succeed", () => {
  /**
   * Supabase reports invalid or revoked credentials through the RETURNED error rather than by throwing.
   * Awaiting `setSession` without reading that error let a failed installation fall through and publish an
   * authenticated principal the global client never held — checkout would then proceed as a customer who
   * exists nowhere, failing on the first refresh or reload.
   */
  it("MANDATORY: a setSession error fails closed and never publishes the candidate", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    setSession.mockImplementationOnce(async () => ({
      data: { session: null },
      error: { message: "Invalid Refresh Token", status: 400, name: "AuthApiError" },
    }));
    const published: Array<string | null> = [];
    manager.subscribe(() => published.push(manager.getPrincipalSnapshot().owner));

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toThrow();

    expect(manager.getPrincipalSnapshot().owner).not.toBe("supabase:provisional-P");
    expect(manager.getAppSession()?.user.id).not.toBe("provisional-P");
    expect(published).not.toContain("supabase:provisional-P");
    expect(globalSession?.user?.id).not.toBe("provisional-P");
  });

  it("MANDATORY: a setSession result with no session fails closed the same way", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    setSession.mockImplementationOnce(async () => ({ data: { session: null }, error: null }));

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toThrow();
    expect(manager.getPrincipalSnapshot().owner).not.toBe("supabase:provisional-P");
  });

  it("adopts the session the global client actually installed, not the candidate object", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    const serverIssued = supabaseSession("provisional-P", "at-server-issued");
    setSession.mockImplementationOnce(async () => {
      globalSession = serverIssued;
      emitAuthState("SIGNED_IN", serverIssued);
      return { data: { session: serverIssued }, error: null };
    });

    await manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P"));

    expect(manager.getLastKnownSession()?.access_token).toBe("at-server-issued");
  });

  /**
   * The competitor arrives AFTER the candidate's own SIGNED_IN event, while the install promise is still
   * pending. Recording the winner from `lastKnownSession` at invalidation time picked up the candidate
   * itself, so the transaction "restored" the loser over the customer who had actually taken the session.
   */
  it("MANDATORY: a competitor arriving after the candidate's own event is the one preserved", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    const competitor = supabaseSession("supa-cust-B");

    setSession.mockImplementationOnce(async () => {
      const candidate = supabaseSession("provisional-P");
      // 1. our own installation publishes first
      globalSession = candidate;
      emitAuthState("SIGNED_IN", candidate);
      // 2. an unrelated Supabase authentication STARTS — the real entry-point invalidation, which
      //    knows something happened but not yet who wins
      void manager.prepareForSupabaseAuthentication();
      // 3. and then actually lands
      globalSession = competitor;
      emitAuthState("SIGNED_IN", competitor);
      return { data: { session: candidate }, error: null };
    });

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toSatisfy(isStalePrincipalOperationError);

    expect(manager.getAppSession()?.user.id).toBe("supa-cust-B");
    expect(manager.getPrincipalSnapshot().owner).toBe("supabase:supa-cust-B");
    expect(manager.getActiveSource()).toBe("supabase");
    expect(globalSession?.user?.id).toBe("supa-cust-B");
  });
});

describe("§9.3 restoring the winner must actually restore them", () => {
  /**
   * Set up the race the restoration exists for: customer B legitimately takes the session while the
   * provisional candidate is being installed, so the candidate loses and B has to be put back.
   *
   * `onRestore` decides what the global client reports when asked to reinstall B — which is the whole
   * point. Announcing B because `setSession` RESOLVED, rather than because it installed anything, is the
   * same false-principal bug as in the commit path, aimed at the other customer.
   */
  async function loseToCompetitor(
    competitor: Session,
    onRestore: () => { data: { session: Session | null }; error: unknown },
  ) {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());
    let installCall = true;
    setSession.mockImplementation(async () => {
      if (installCall) {
        installCall = false;
        const candidate = supabaseSession("provisional-P");
        globalSession = candidate;
        emitAuthState("SIGNED_IN", candidate);
        globalSession = competitor;
        emitAuthState("SIGNED_IN", competitor); // B takes the session mid-install
        return { data: { session: candidate }, error: null };
      }
      return onRestore(); // the restoration attempt
    });

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toSatisfy(isStalePrincipalOperationError);
  }

  it("MANDATORY: a restore that returns an error does not publish the requested winner", async () => {
    const b = supabaseSession("supa-cust-B");
    await loseToCompetitor(b, () => ({
      data: { session: null },
      error: { message: "Invalid Refresh Token", status: 400, name: "AuthApiError" },
    }));

    // B was REQUESTED, not installed. Announcing them would be a principal the client does not hold.
    expect(manager.getPrincipalSnapshot().owner).not.toBe("supabase:supa-cust-B");
    expect(manager.getAppSession()?.user.id).not.toBe("supa-cust-B");
    // And the loser is certainly not left authoritative either — fail closed.
    expect(manager.getPrincipalSnapshot().owner).not.toBe("supabase:provisional-P");
    expect(manager.getAppSession()).toBeNull();
    expect(signOut).toHaveBeenCalled();
  });

  it("MANDATORY: a restore that returns no session fails closed the same way", async () => {
    const b = supabaseSession("supa-cust-B");
    await loseToCompetitor(b, () => ({ data: { session: null }, error: null }));

    expect(manager.getPrincipalSnapshot().owner).not.toBe("supabase:supa-cust-B");
    expect(manager.getPrincipalSnapshot().owner).not.toBe("supabase:provisional-P");
    expect(manager.getAppSession()).toBeNull();
  });

  it("MANDATORY: a successful restore publishes the tokens the client returned, not the ones requested", async () => {
    const requested = supabaseSession("supa-cust-B", "at-B-requested");
    const installedByClient = {
      ...supabaseSession("supa-cust-B", "at-B-installed"),
      refresh_token: "rt-B-installed",
    } as Session;

    await loseToCompetitor(requested, () => {
      globalSession = installedByClient;
      return { data: { session: installedByClient }, error: null };
    });

    expect(manager.getAppSession()?.user.id).toBe("supa-cust-B");
    expect(manager.getLastKnownSession()?.access_token).toBe("at-B-installed");
    expect(manager.getLastKnownSession()?.refresh_token).toBe("rt-B-installed");
  });
});

describe("§9.3 a REFUSED candidate needs no global cleanup", () => {
  it("MANDATORY: rejecting a candidate leaves the federated customer who won completely untouched", async () => {
    const ticket = await manager.beginProvisionalAuthentication(manager.getPrincipalSnapshot());

    await armFederatedSource();
    adapter.install(FED_B);
    adapter.logout.mockClear();
    clearPersistedAuthSession.mockClear(); // arming the federated source clears Supabase state legitimately

    await expect(
      manager.commitProvisionalAuthentication(ticket, supabaseSession("provisional-P")),
    ).rejects.toSatisfy(isStalePrincipalOperationError);

    // Nothing was installed, so nothing had to be undone: no global write, no revocation, no source change.
    expect(setSession).not.toHaveBeenCalled();
    expect(adapter.logout).not.toHaveBeenCalled();
    expect(clearPersistedAuthSession).not.toHaveBeenCalled();
    expect(manager.getActiveSource()).toBe("DilMart_federated");
    expect(manager.getAppSession()?.user.id).toBe(FED_B.user.id);
  });
});
