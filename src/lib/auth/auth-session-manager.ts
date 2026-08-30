/**
 * Single owner of the Supabase session lifecycle.
 *
 * Everything that needs a token (API layer, providers, pages) goes through this
 * singleton so there is exactly one in-flight refresh at any moment and exactly
 * one place that decides whether a failure destroys the local session.
 *
 * Import direction: `client.ts` -> `auth-storage.ts`, and this module -> `client.ts`.
 * `auth-storage.ts` must never import `client.ts`, which keeps the graph acyclic.
 */

import type { AuthChangeEvent, Session, Subscription, SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearPersistedAuthSession } from "./auth-storage";
import { ensureAuthStorageReady, getAuthStorageBootstrapError, retryAuthStorageBootstrap } from "./auth-storage-bootstrap";
import { isAuthStorageError, isDefinitiveAuthFailure, isTransientAuthFailure } from "./auth-errors";
import {
  AUTH_REFRESH_OUTCOMES,
  AUTH_REFRESH_REASONS,
  type AuthRefreshOutcomeStatus,
  type AuthRefreshReason,
} from "./auth-events";
import {
  FederatedSessionAdapter,
  type FederatedLifecycleEvent,
  type IdentityEpoch,
  type IdentityResolutionCredential,
} from "./session/federated-session-adapter";
import { FederatedSessionApi } from "./session/federated-session-api";
import type { AccessTokenOutcome, AppAuthSource, FederatedRedeemResult, StoreAppSession } from "./session/app-session.types";

/** Native-runtime check, isolated so tests can inject it without loading Capacitor. */
function defaultIsNativeRuntime(): boolean {
  try {
    // Lazy, guarded: in jsdom/unit tests this resolves to false.
    const cap = (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return cap?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

/**
 * §9.3 — the AUTHORITATIVE identity of whoever owns customer-scoped work, owned by the lifecycle owner
 * rather than by React.
 *
 * `owner` is the normalized principal, `"<activeSource>:<userId>"`, or null when nobody is signed in
 * (including a federated session whose identity is still quarantined behind the resolution barrier).
 * `version` is a strict serial that advances on EVERY change of `owner` — `null → A`, `A → B`, `A → null`,
 * `supabase:A → DilMart_federated:A`, and `resolved → unresolved` all count. It does NOT advance for token
 * rotation, or for a same-customer new federated family, because neither changes `owner`.
 *
 * This must not be recomputed from a React render. An async continuation can resume between the moment the
 * manager installs a new identity and the moment React commits it, so a render-derived version reports the
 * PREVIOUS principal as current for that whole window — which is exactly when a stale operation is most
 * dangerous.
 */
export type AuthPrincipalSnapshot = {
  owner: string | null;
  version: number;
};

/**
 * A claim on the ONE provisional authentication transaction the manager will honour.
 *
 * Handed out by `beginProvisionalAuthentication` and spent by `commitProvisionalAuthentication`. It is an
 * object identity, so it cannot be forged or replayed: a caller either holds the live transaction or it
 * does not. Anything that could change who is signed in invalidates it, which is what makes the whole
 * sign-in — not merely its first instruction — the unit that either happens for this principal or not at
 * all.
 */
export class ProvisionalAuthTicket {
  /** Manager-internal. Callers receive instances; they never construct them. */
  constructor(readonly expected: AuthPrincipalSnapshot) {}
}

/**
 * The normalized principal for a source-neutral session: `"<authSource>:<userId>"`, or null when nobody is
 * signed in — which includes a federated session whose identity is still quarantined behind the resolution
 * barrier.
 *
 * Exported because more than one place has to answer "did the owner change", and two nearly-identical
 * derivations is how one of them ends up subtly wrong.
 */
export function principalOwnerOf(session: StoreAppSession | null): string | null {
  const id = session?.user?.id;
  return session && id ? `${session.authSource}:${id}` : null;
}

/**
 * What a successful provisional commit produced.
 *
 * `session` is the session the GLOBAL client actually installed, which is not always the candidate that
 * was handed over: Supabase may refresh or normalize it during `setSession`. Returning the snapshot alone
 * left callers republishing the candidate they still held, so React state and every request built from it
 * used credentials the client had already replaced.
 */
export type ProvisionalCommitResult = {
  session: Session;
  principalSnapshot: AuthPrincipalSnapshot;
};

export const STALE_PRINCIPAL_OPERATION_CODE = "stale_principal_operation";

/**
 * Thrown when an operation asks the lifecycle owner to mutate the session on behalf of a principal that is
 * no longer current. Never surface the raw message to a customer.
 */
export class StalePrincipalOperationError extends Error {
  readonly code = STALE_PRINCIPAL_OPERATION_CODE;
  constructor() {
    super("Stale principal operation: the active identity changed before this request reached the session lifecycle.");
    this.name = "StalePrincipalOperationError";
  }
}

export function isStalePrincipalOperationError(error: unknown): boolean {
  return (
    error instanceof StalePrincipalOperationError ||
    (typeof error === "object" && error !== null && (error as { code?: string }).code === STALE_PRINCIPAL_OPERATION_CODE)
  );
}

/** Refresh proactively when the access token has this little life left. */
export const TOKEN_REFRESH_THRESHOLD_MS = 60_000;

export type RefreshOutcome = {
  status: AuthRefreshOutcomeStatus;
  session: Session | null;
  reason: AuthRefreshReason;
  error: unknown;
  /**
   * Federated web only. A `refreshed` outcome whose token could NOT be PROVEN to continue the identity
   * previously held (another tab of the same browser profile replaced the shared __Host- refresh cookie).
   * The federated adapter has already dropped the stale identity and subscribers have been notified —
   * the token MUST NOT be consumed by generic API traffic until /auth/context re-resolves it.
   */
  requiresIdentityRevalidation?: boolean;
};

type MinimalAuthClient = Pick<
  SupabaseClient["auth"],
  "getSession" | "refreshSession" | "signOut" | "setSession" | "onAuthStateChange" | "startAutoRefresh" | "stopAutoRefresh"
>;

function outcome(
  status: AuthRefreshOutcomeStatus,
  reason: AuthRefreshReason,
  session: Session | null = null,
  error: unknown = null,
): RefreshOutcome {
  return { status, session, reason, error };
}

export class AuthSessionManager {
  private client: { auth: MinimalAuthClient } = supabase as unknown as { auth: MinimalAuthClient };
  private inFlightRefresh: Promise<RefreshOutcome> | null = null;
  private storageError: Error | null = null;
  private lastKnownSession: Session | null = null;

  // STORE-PR5 §Phase F/I — source-neutral facade. Default source is Supabase, so every pre-PR5 code path
  // and test is byte-for-byte unchanged; the federated branch only activates once a federated session is
  // established. There is exactly ONE active source at a time (single-active-source invariant).
  private activeSource: AppAuthSource = "supabase";
  private federated: FederatedSessionAdapter;
  private readonly listeners = new Set<() => void>();
  // The authoritative principal. Recomputed from ACTUAL lifecycle state on every read and before every
  // notification, so it can never lag the identity the manager is really holding.
  private principal: AuthPrincipalSnapshot = { owner: null, version: 0 };
  /**
   * The in-flight provisional authentication, if any. At most one: a second `begin` invalidates the first,
   * and so does any other operation capable of changing who is signed in — including one that has only
   * STARTED and has not installed its identity yet. Two identity-producing transactions must never both
   * believe they are authoritative.
   */
  private provisionalTransaction:
    | {
        ticket: ProvisionalAuthTicket;
        invalidated: boolean;
        /** The lifecycle revision this transaction opened at. Binds it to HISTORY, not to a final owner. */
        revisionAtBegin: number;
        /**
         * While installing, the id of the candidate being installed. An auth event carrying THIS identity
         * is the transaction's own commit; an event carrying anyone else's is a competitor arriving
         * mid-install, and the install window must not launder it into looking like ours.
         */
        installing: string | null;
        /**
         * The Supabase identity that actually superseded this transaction, if one was observed.
         *
         * Deliberately a wrapper rather than a bare `Session | null`, because those are three different
         * facts and only two of them fit in one nullable field: nobody was observed, somebody signed in,
         * or somebody signed out. Collapsing the first two is what let a generic invalidation snapshot
         * `lastKnownSession` — which, mid-install, is the CANDIDATE — and record the loser as the winner.
         */
        superseding: { session: Session | null } | null;
      }
    | null = null;
  /**
   * Monotonic count of identity-producing lifecycle events.
   *
   * The principal snapshot answers "who is signed in now"; this answers "did anything happen". They are
   * not interchangeable. `A → B → A` ends on the owner it started with, so owner equality would erase the
   * fact that somebody else held the session in between — and a transaction authorised under the first A
   * would still look current. A transaction is bound to this revision, so intervening history can never be
   * cancelled out by a coincidental return to the same owner.
   */
  private lifecycleRevision = 0;
  private nativeRuntime: () => boolean = defaultIsNativeRuntime;

  constructor() {
    // Attach through the single path so even the default adapter has its lifecycle listener wired.
    this.federated = new FederatedSessionAdapter({ api: new FederatedSessionApi() });
    this.attachFederatedAdapter(this.federated);
  }

  /** Test seam — force native/web branch selection in bootstrapAppSession. */
  setNativeRuntimeForTests(fn: () => boolean): void {
    this.nativeRuntime = fn;
  }

  /** Test seam — production code uses the module-level Supabase client. */
  setClient(client: { auth: MinimalAuthClient }): void {
    this.client = client;
  }

  /**
   * §9.3 — the ONE place a manager-owned federated adapter is attached. Every construction path routes
   * through here (constructor bootstrap, setFederatedAdapter, resetForTests) so an adapter can never end
   * up owned by the manager but without a lifecycle listener. A production-only wiring that tests bypass
   * would make the barrier untested exactly where it matters.
   */
  private attachFederatedAdapter(adapter: FederatedSessionAdapter): void {
    this.federated = adapter;
    adapter.setLifecycleListener((event) => this.onFederatedLifecycle(event));
  }

  /**
   * Forward the adapter's lifecycle transition to subscribers as a source-neutral session change. The
   * adapter reports; the manager publishes; AuthProvider reacts. The adapter never touches React state.
   */
  private onFederatedLifecycle(_event: FederatedLifecycleEvent): void {
    // Another tab replaced or dropped the shared federated identity. Any provisional sign-in already in
    // flight was authorised for the identity that just went away.
    this.invalidateProvisionalTransaction();
    this.notify();
  }

  /** Test seam — inject a federated adapter with fake api/storage. Wired identically to production. */
  setFederatedAdapter(adapter: FederatedSessionAdapter): void {
    this.attachFederatedAdapter(adapter);
  }

  getActiveSource(): AppAuthSource {
    return this.activeSource;
  }

  /** Source-neutral change notifications (source switch, federated establish/logout). */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The normalized principal implied by the CURRENT lifecycle state. Derived from the same source-neutral
   * session consumers see, so a quarantined federated identity (no resolved user) is correctly `null`.
   */
  private derivePrincipalOwner(): string | null {
    return principalOwnerOf(this.getAppSession());
  }

  /**
   * The ONE place `lastKnownSession` is written.
   *
   * Deriving the snapshot lazily on read is not sufficient on its own: a transition nobody happens to
   * observe is a transition that never gets counted. `supabase:A → null → supabase:A` would then collapse
   * into no change at all, and an operation from the FIRST session would still look current in the second.
   * Syncing on every write means every real transition is counted when it happens.
   */
  private setSupabaseSession(next: Session | null): void {
    this.lastKnownSession = next;
    this.syncPrincipalSnapshot();
  }

  /** Advance the serial if — and only if — the actual owner changed. Cheap, idempotent, never decreases. */
  private syncPrincipalSnapshot(): void {
    const owner = this.derivePrincipalOwner();
    if (owner !== this.principal.owner) {
      this.principal = { owner, version: this.principal.version + 1 };
    }
  }

  /**
   * The authoritative principal right now. Recomputes before returning, so callers never observe a value
   * that is stale with respect to the lifecycle — including between a mutation and its notification.
   */
  getPrincipalSnapshot(): AuthPrincipalSnapshot {
    this.syncPrincipalSnapshot();
    return this.principal;
  }

  /**
   * Fail closed unless the caller's principal is still exactly current. Deliberately SYNCHRONOUS: callers
   * must invoke it with no await between the check and the mutation it protects.
   */
  private assertCurrentPrincipal(expected: AuthPrincipalSnapshot): void {
    const current = this.getPrincipalSnapshot();
    if (current.owner !== expected.owner || current.version !== expected.version) {
      throw new StalePrincipalOperationError();
    }
  }

  /**
   * Void any in-flight provisional transaction.
   *
   * Called at the ENTRY of every operation that can change who is signed in, before that operation's own
   * awaits. Waiting until such an operation finishes would leave a window in which it is under way and
   * still invisible, and a provisional result landing inside that window would look perfectly current.
   */
  private invalidateProvisionalTransaction(): void {
    this.lifecycleRevision += 1;
    if (this.provisionalTransaction) this.provisionalTransaction.invalidated = true;
    // Deliberately does NOT record a winner. Knowing that something happened is not knowing who won, and
    // guessing from `lastKnownSession` here is wrong precisely when it matters: during the install that
    // value is the candidate itself, so the transaction would have named its own loser as the winner and
    // then "restored" it over the customer who actually arrived. Only an observed auth event names one.
  }

  /** Record the identity that actually took the session from an in-flight provisional transaction. */
  private recordSupersedingSession(session: Session | null): void {
    const transaction = this.provisionalTransaction;
    if (!transaction) return;
    // Latest observation wins: if two competitors arrive, the one holding the session at the end is the
    // one to preserve.
    transaction.superseding = { session };
  }

  /**
   * A Supabase auth-state event reached the manager. It either belongs to the live transaction's own
   * commit — the one identity change it is entitled to make — or it is somebody else arriving, in which
   * case the transaction is over. Without that distinction the transaction would either invalidate itself
   * on its own installation, or trust every event and be superseded silently.
   */
  private noteSupabaseAuthEvent(session: Session | null): void {
    const transaction = this.provisionalTransaction;
    const eventUserId = session?.user?.id ?? null;
    if (transaction?.installing && eventUserId !== null && eventUserId === transaction.installing) {
      // Our own installation. Move the transaction's revision along with it so the event it caused does
      // not read as history that happened to it.
      this.lifecycleRevision += 1;
      transaction.revisionAtBegin = this.lifecycleRevision;
      return;
    }
    // A real competitor. This event carries the session that took over, which is the only trustworthy
    // source for who to preserve — including when it arrives DURING our install, after our own event.
    this.invalidateProvisionalTransaction();
    this.recordSupersedingSession(session);
  }

  private notify(): void {
    // Resolve the new principal BEFORE any observer runs, so no subscriber can read a snapshot that
    // disagrees with the session it is being notified about.
    this.syncPrincipalSnapshot();
    for (const l of this.listeners) {
      try {
        l();
      } catch {
        /* a listener error must not break the lifecycle */
      }
    }
  }

  private get auth(): MinimalAuthClient {
    return this.client.auth;
  }

  getStorageError(): Error | null {
    return this.storageError ?? getAuthStorageBootstrapError();
  }

  getLastKnownSession(): Session | null {
    return this.lastKnownSession;
  }

  /**
   * Waits for encrypted storage to be ready, then loads the persisted session.
   * Never signs the user out: an expired access token is a refresh problem, and
   * a storage failure is surfaced as `storage_error` for the UI to handle.
   */
  async bootstrapSession(): Promise<Session | null> {
    try {
      await ensureAuthStorageReady();
      this.storageError = null;
    } catch (error) {
      this.storageError = error instanceof Error ? error : new Error(String(error));
      throw this.storageError;
    }

    try {
      const { data, error } = await this.auth.getSession();
      if (error) throw error;
      this.setSupabaseSession(data.session ?? null);
      return this.lastKnownSession;
    } catch (error) {
      if (isAuthStorageError(error)) {
        this.storageError = error;
        throw error;
      }
      // Transient read failures must not clear anything.
      return this.lastKnownSession;
    }
  }

  /** Re-runs the native bootstrap after a `storage_error`. */
  async retryStorageBootstrap(): Promise<void> {
    await retryAuthStorageBootstrap();
    this.storageError = null;
  }

  async getSession(): Promise<Session | null> {
    try {
      const { data } = await this.auth.getSession();
      this.setSupabaseSession(data.session ?? null);
      return this.lastKnownSession;
    } catch (error) {
      if (isAuthStorageError(error)) this.storageError = error;
      return this.lastKnownSession;
    }
  }

  /**
   * Returns an access token guaranteed to be valid for at least
   * `TOKEN_REFRESH_THRESHOLD_MS`, refreshing through the single-flight path when
   * needed. Returns null when there is no usable session.
   */
  /**
   * §9.3 — token acquisition that can express an identity transition. Callers that will ACT on the
   * token must use this and honour `requiresIdentityRevalidation`; `getValidAccessToken()` below cannot
   * express it and therefore withholds a token that is pending revalidation.
   */
  async getValidAccessTokenOutcome(): Promise<AccessTokenOutcome> {
    if (this.activeSource === "DilMart_federated") {
      return this.federated.getValidAccessTokenOutcome();
    }
    return { token: await this.getValidAccessToken(), requiresIdentityRevalidation: false };
  }

  /**
   * §9.3 — token for GET /auth/context ONLY, the authority that resolves a pending federated identity.
   * Generic callers must use getValidAccessTokenOutcome(), which quarantines a pending token.
   */
  async getAccessTokenForIdentityResolution(): Promise<IdentityResolutionCredential> {
    if (this.activeSource === "DilMart_federated") {
      return this.federated.getAccessTokenForIdentityResolution();
    }
    // Supabase source: no federated epoch is in play, but the shape must still carry one.
    return { token: await this.getValidAccessToken(), epoch: this.federated.getIdentityEpoch() };
  }

  /**
   * Barrier state for the provider: whether a federated identity is unresolved, and which generation is
   * being resolved. The generation is a safe integer — never a token, never PII — so it is fine to put
   * in a React Query key, which is what makes an older generation's query non-authoritative.
   */
  getFederatedIdentityResolution(): { pending: boolean; epoch: IdentityEpoch } {
    if (this.activeSource !== "DilMart_federated") {
      return { pending: false, epoch: this.federated.getIdentityEpoch() };
    }
    return {
      pending: this.federated.isIdentityResolutionPending(),
      epoch: this.federated.getIdentityEpoch(),
    };
  }

  async getValidAccessToken(): Promise<string | null> {
    if (this.activeSource === "DilMart_federated") {
      return this.federated.getValidAccessToken();
    }

    const session = await this.getSession();
    if (!session?.access_token) return null;

    if (!this.isExpiringSoon(session)) return session.access_token;

    const result = await this.refreshSessionSingleFlight(AUTH_REFRESH_REASONS.tokenExpiring);
    if (result.status === AUTH_REFRESH_OUTCOMES.refreshed) {
      return result.session?.access_token ?? null;
    }
    if (result.status === AUTH_REFRESH_OUTCOMES.transientFailure) {
      // Offline/flaky network: the current token may still be accepted.
      return session.access_token;
    }
    return null;
  }

  isExpiringSoon(session: Session | null, thresholdMs = TOKEN_REFRESH_THRESHOLD_MS): boolean {
    if (!session) return false;
    if (!session.expires_at) return false;
    return session.expires_at * 1000 - Date.now() <= thresholdMs;
  }

  /** Coalesces concurrent refresh attempts into one network round-trip. */
  refreshSessionSingleFlight(reason: AuthRefreshReason = AUTH_REFRESH_REASONS.manual): Promise<RefreshOutcome> {
    if (this.activeSource === "DilMart_federated") {
      // The federated adapter owns its OWN single-flight; map its normalized outcome to RefreshOutcome so
      // api-core (which reads outcome.status + outcome.session?.access_token) stays source-agnostic.
      return this.federated.refreshSingleFlight().then((r) => {
        const needsRevalidation = r.requiresIdentityRevalidation === true;
        // NOTE: deliberately no notify() here. The adapter publishes the transition itself the moment it
        // enters the barrier, which covers the refresh entry points that never reach this wrapper (token
        // acquisition being the one that made this necessary). Publishing again here would double-fire a
        // single logical state change.
        return {
          ...outcome(
            r.status as AuthRefreshOutcomeStatus,
            reason,
            r.accessToken ? ({ access_token: r.accessToken } as unknown as Session) : null,
            r.error ?? null,
          ),
          requiresIdentityRevalidation: needsRevalidation,
        };
      });
    }
    if (this.inFlightRefresh) return this.inFlightRefresh;

    const pending = this.performRefresh(reason).finally(() => {
      this.inFlightRefresh = null;
    });
    this.inFlightRefresh = pending;
    return pending;
  }

  private async performRefresh(reason: AuthRefreshReason): Promise<RefreshOutcome> {
    try {
      const { data, error } = await this.auth.refreshSession();

      if (error) return this.classifyRefreshFailure(error, reason);
      if (!data?.session) {
        await this.logoutCurrentDevice();
        return outcome(AUTH_REFRESH_OUTCOMES.noSession, reason);
      }

      this.setSupabaseSession(data.session);
      return outcome(AUTH_REFRESH_OUTCOMES.refreshed, reason, data.session);
    } catch (error) {
      return this.classifyRefreshFailure(error, reason);
    }
  }

  private async classifyRefreshFailure(error: unknown, reason: AuthRefreshReason): Promise<RefreshOutcome> {
    if (isAuthStorageError(error)) {
      this.storageError = error instanceof Error ? error : new Error(String(error));
      return outcome(AUTH_REFRESH_OUTCOMES.storageError, reason, this.lastKnownSession, error);
    }

    if (isTransientAuthFailure(error)) {
      // Keep the session. The user is offline or the endpoint is degraded.
      return outcome(AUTH_REFRESH_OUTCOMES.transientFailure, reason, this.lastKnownSession, error);
    }

    if (isDefinitiveAuthFailure(error)) {
      await this.logoutCurrentDevice();
      return outcome(AUTH_REFRESH_OUTCOMES.definitiveFailure, reason, null, error);
    }

    // Unclassifiable: bias toward preserving the session.
    return outcome(AUTH_REFRESH_OUTCOMES.transientFailure, reason, this.lastKnownSession, error);
  }

  /** Signs out on this device only; other devices keep their sessions. */
  async logoutCurrentDevice(): Promise<void> {
    if (this.activeSource === "DilMart_federated") {
      // Federated revoke + secure clear; local clear failure surfaces as storage_error (adapter throws).
      await this.federated.logout();
      this.activeSource = "supabase";
      this.notify();
      return;
    }
    try {
      await this.auth.signOut({ scope: "local" });
    } catch {
      // Network/revoke failures must not block local secure clear.
    }
    // Secure clear failures propagate — callers must not toast "logged out".
    await this.clearLocalAuthState();
  }

  /**
   * §Phase M — logout across all devices. Federated → revoke the whole session family (logout-all) + clear
   * local secure state. Supabase → global sign-out (revokes other devices too).
   */
  async logoutAllDevices(): Promise<void> {
    if (this.activeSource === "DilMart_federated") {
      await this.federated.logoutAll();
      this.activeSource = "supabase";
      this.notify();
      return;
    }
    try {
      await this.auth.signOut({ scope: "global" });
    } catch {
      /* revoke failure must not block local clear */
    }
    await this.clearLocalAuthState();
  }

  /** The active source's normalized session (source-neutral view for providers/consumers). */
  getAppSession(): StoreAppSession | null {
    if (this.activeSource === "DilMart_federated") return this.federated.getSession();
    const s = this.lastKnownSession;
    if (!s?.access_token) return null;
    return {
      authSource: "supabase",
      accessToken: s.access_token,
      accessExpiresAt: (s.expires_at ?? 0) * 1000,
      user: { id: s.user?.id ?? "", email: s.user?.email ?? null, phone: s.user?.phone ?? null },
    };
  }

  /**
   * STORE-PR5 §8 / §Phase F — the PR6 integration point. Adopt a federated redeem result as the ONE active
   * identity:
   *  1) best-effort Supabase local sign-out + clear persisted Supabase state (no two dormant identities);
   *  2) establish the federated session (native → secure storage; web → server-set HttpOnly cookie);
   *  3) active source = DilMart_federated; notify subscribers.
   * The caller (AuthProvider) then clears user-scoped caches, fetches /auth/context, and publishes ready.
   */
  async establishFederatedSessionFromRedeem(
    result: FederatedRedeemResult,
  ): Promise<{ session: StoreAppSession; identityEpoch: IdentityEpoch }> {
    // Void any provisional transaction NOW, at entry — not when this finishes. A handoff that has started
    // but not yet installed its identity is still a source change in progress, and a provisional result
    // landing inside that window must not be able to claim it is current.
    this.invalidateProvisionalTransaction();

    // 1) leave Supabase cleanly. The network revoke is best-effort, BUT deletion of persisted Supabase auth
    //    state is NOT optional: if it cannot be securely removed we fail closed (storage_error) and do NOT
    //    establish/persist the federated identity — never two dormant identities at once.
    try {
      await this.auth.signOut({ scope: "local" });
    } catch {
      /* network revoke failure is tolerated; the persisted-state deletion below is the invariant */
    }
    await clearPersistedAuthSession(); // throws (storage_error) → federated identity is NOT established
    this.setSupabaseSession(null);

    // 2) establish federated (throws storage_error on a native secure-write failure — no silent fallback).
    const session = await this.federated.establishFromRedeem(result);
    // Captured with NO intervening await, so nothing can advance the epoch between the establish
    // and this read. Reading the customer and the epoch as two separate async snapshots would
    // reintroduce exactly the race this value exists to close.
    const identityEpoch = this.federated.getIdentityEpoch();

    // 3) flip the active source and announce the change.
    this.activeSource = "DilMart_federated";
    this.notify();
    return { session, identityEpoch };
  }

  /** Restore the federated identity's user fields after /auth/context resolves (web bootstrap). */
  /**
   * Apply a backend-verified federated identity. Returns false when REJECTED as stale — the caller
   * started its /auth/context request for an older resolution generation and the session has since moved
   * on, so the result must not be applied and must not close the current barrier.
   */
  applyFederatedIdentity(
    user: { id: string; email: string | null; phone: string | null },
    linkedProfileId: string | undefined,
    expectedEpoch: IdentityEpoch,
  ): boolean {
    return this.federated.applyVerifiedIdentity(user, linkedProfileId, expectedEpoch);
  }

  /**
   * STORE-PR6 — the ONE app-scoped, non-advertising installation/device id, owned by PR5 secure storage.
   * The deep-link redeem client reuses it; no second device-id system is created.
   */
  getOrCreateDeviceId(): Promise<string> {
    return this.federated.getOrCreateDeviceId();
  }

  /**
   * STORE-PR5 §5 — single-active-source guard for the Supabase direction. EVERY action that can produce a
   * Supabase session (password sign-in/up, OTP verify, provisional) MUST call this first. When a federated
   * session is active it: best-effort revokes the federated family, securely clears federated local state,
   * and ONLY on a successful clear flips the active source to Supabase. A secure-clear failure throws
   * (storage_error) and the source stays federated — so a Supabase identity is never created alongside a
   * still-persisted federated one.
   */
  async prepareForSupabaseAuthentication(): Promise<void> {
    // A UI sign-in is starting. Whatever a background provisional transaction was authorised for, it is
    // not this.
    this.invalidateProvisionalTransaction();
    if (this.activeSource !== "DilMart_federated") return;
    await this.federated.logout(); // api.logout best-effort + secure clearLocal (throws storage_error on failure)
    this.activeSource = "supabase";
    this.notify();
  }

  /**
   * §9.3 — BEGIN the provisional (guest checkout) authentication transaction.
   *
   * Checking the caller's principal only at entry is not enough, and that was a real vulnerability. For an
   * ordinary guest the active source is already Supabase, so the entry check passed and returned
   * immediately — after which a sign-in lasting seconds ran completely unguarded, and its result was
   * adopted unconditionally. An unrelated customer arriving in that window was simply replaced.
   *
   * So the transaction, not its first instruction, is the unit that succeeds or fails. This call verifies
   * the caller's snapshot synchronously (no await between the check and the federated revocation it may
   * perform), then opens a transaction that ANY subsequent identity-producing operation voids. The result
   * can only be installed through `commitProvisionalAuthentication`, which fails closed.
   */
  async beginProvisionalAuthentication(expected: AuthPrincipalSnapshot): Promise<ProvisionalAuthTicket> {
    this.assertCurrentPrincipal(expected);
    // A second guest submit supersedes the first; only one provisional transaction is ever live.
    this.invalidateProvisionalTransaction();

    if (this.activeSource === "DilMart_federated") {
      // This revocation is the transaction's OWN mutation, so the ticket is opened after it — otherwise the
      // adapter's own lifecycle event would immediately invalidate the transaction that caused it.
      await this.federated.logout();
      this.activeSource = "supabase";
      this.notify();
    }

    const ticket = new ProvisionalAuthTicket(expected);
    this.provisionalTransaction = {
      ticket,
      invalidated: false,
      revisionAtBegin: this.lifecycleRevision,
      installing: null,
      superseding: null,
    };
    return ticket;
  }

  /**
   * COMMIT the provisional transaction, installing its session as the active identity and returning the
   * authoritative principal for the caller to adopt.
   *
   * This is the FIRST and only thing that makes a candidate authoritative. The credential exchange that
   * produced it is isolated and installs nothing, so there is no earlier point at which the application's
   * session could already have been replaced.
   *
   * Fails closed. The transaction must still be the live one, the lifecycle must not have moved since it
   * began, and the active source must still be Supabase.
   *
   * A rejected commit installs nothing, and needs no cleanup: the candidate came from an isolated,
   * non-persisting exchange, so it was never in the application's auth state to begin with.
   */
  async commitProvisionalAuthentication(
    ticket: ProvisionalAuthTicket,
    candidate: Session | null,
  ): Promise<ProvisionalCommitResult> {
    const transaction = this.provisionalTransaction;

    // Bound to lifecycle HISTORY, not to the current owner. Checking the owner alone would accept a
    // transaction that had been superseded and then coincidentally returned to the same customer.
    const stale =
      !transaction ||
      transaction.ticket !== ticket ||
      transaction.invalidated ||
      transaction.revisionAtBegin !== this.lifecycleRevision ||
      !candidate?.access_token ||
      !candidate.refresh_token ||
      this.activeSource !== "supabase";

    if (stale) {
      if (transaction?.ticket === ticket) this.provisionalTransaction = null;
      throw new StalePrincipalOperationError();
    }

    // From here the candidate is being INSTALLED. The transaction stays authoritative across the await:
    // an unrelated identity arriving mid-install is recorded, and it wins.
    transaction.installing = candidate.user?.id ?? null;
    let installed: Session | null = null;
    let installError: unknown = null;
    try {
      // Supabase reports invalid or revoked credentials through the RETURNED error, not by throwing.
      // Awaiting without reading it would let a failed installation fall through and publish an
      // authenticated principal the global client never actually holds — a session that works nowhere and
      // dies on the first refresh or reload.
      const outcome = await this.auth.setSession({
        access_token: candidate.access_token,
        refresh_token: candidate.refresh_token,
      });
      installed = outcome?.data?.session ?? null;
      installError = outcome?.error ?? null;
    } catch (error) {
      installError = error;
    } finally {
      transaction.installing = null;
    }

    if (installError || !installed?.access_token || !installed.user?.id) {
      this.provisionalTransaction = null;
      await this.recoverFromRejectedInstall(transaction, candidate);
      throw installError instanceof Error
        ? installError
        : new Error("تعذر تهيئة الجلسة. حاول مرة أخرى.");
    }

    if (transaction.invalidated) {
      // Somebody arrived while the install was in flight. Finishing last does not make this candidate the
      // winner — put the identity that superseded it back, and fail closed.
      this.provisionalTransaction = null;
      await this.recoverFromRejectedInstall(transaction, candidate);
      throw new StalePrincipalOperationError();
    }

    this.provisionalTransaction = null;
    // The session the global client actually installed is the authoritative one; the candidate object is
    // only what we asked for. It is returned as well as published, so no caller is left holding the
    // superseded credentials.
    this.setSupabaseSession(installed);
    this.notify();
    return { session: installed, principalSnapshot: this.getPrincipalSnapshot() };
  }

  /**
   * Undo a provisional installation that was refused or lost, without harming whoever legitimately holds
   * the session now.
   */
  private async recoverFromRejectedInstall(
    transaction: { superseding: { session: Session | null } | null },
    candidate: Session,
  ): Promise<void> {
    if (transaction.superseding) {
      await this.restoreSupersedingIdentity(transaction.superseding.session);
      return;
    }
    // No competitor was observed. Only clear if the rejected candidate is what the manager is holding —
    // otherwise there is nothing of ours to remove and clearing would hit somebody else.
    if (this.lastKnownSession?.user?.id === candidate.user?.id) {
      await this.restoreSupersedingIdentity(null);
    }
  }

  /**
   * Undo a provisional installation that lost a race, leaving the winner exactly as they were.
   *
   * A federated winner needs no Supabase session restored — one active source, never two — so the Supabase
   * side is simply cleared without touching their source or their identity.
   */
  private async restoreSupersedingIdentity(winner: Session | null): Promise<void> {
    if (winner?.access_token && winner.refresh_token) {
      // Captured BEFORE the await. Restoring a Supabase winner takes real time, and a federated handoff
      // can take ownership of the app inside that window. `activeSource` is the existing authority for
      // who owns the session — this reuses it rather than introducing a second one.
      //
      // Deliberately NOT `lifecycleRevision`: this restoration's own `setSession` publishes a Supabase
      // auth event, and by this point the transaction is already cleared, so `noteSupabaseAuthEvent`
      // treats that event as a competitor and advances the serial. A revision comparison would therefore
      // fail on the ordinary, uncontested restoration — the case that must keep working.
      const sourceAtRestoreStart = this.activeSource;
      try {
        // Same rule as the commit path, and for the same reason: Supabase reports failures through the
        // returned error rather than by throwing. Publishing the REQUESTED winner because `setSession`
        // resolved would announce an identity the global client may not hold — the exact false-principal
        // problem this restoration exists to prevent, just pointed at the other customer.
        const outcome = await this.auth.setSession({
          access_token: winner.access_token,
          refresh_token: winner.refresh_token,
        });
        const restored = outcome?.data?.session ?? null;

        if (this.activeSource !== sourceAtRestoreStart) {
          // A federated identity took the app while this restoration was in flight. The Supabase winner
          // is no longer the owner of anything: publishing it now would install a dormant second identity
          // that reappears at the next bootstrap or logout. Remove what `setSession` just wrote and leave
          // the current owner untouched — no source flip, and no notify, because the authoritative
          // transition was already published by whoever took ownership.
          await this.discardDormantSupabaseSession();
          return;
        }

        if (
          !outcome?.error &&
          restored?.access_token &&
          restored.refresh_token &&
          restored.user?.id
        ) {
          // Publish what was installed, never what was asked for.
          this.setSupabaseSession(restored);
          this.notify();
          return;
        }
      } catch {
        /* fall through to the fail-closed clear below rather than leaving the loser installed */
      }

      if (this.activeSource !== sourceAtRestoreStart) {
        // Same reasoning as above for the failure path: never clear a source that is not ours to clear.
        await this.discardDormantSupabaseSession();
        return;
      }
    }
    try {
      await this.auth.signOut({ scope: "local" });
    } catch {
      /* best effort */
    }
    this.setSupabaseSession(null);
    this.notify();
  }

  /**
   * Remove a Supabase session that was installed for an identity which no longer owns the app, without
   * touching the owner that superseded it. Federated identity lives in the adapter and its own storage,
   * so a local Supabase sign-out cannot disturb it — `establishFederatedSessionFromRedeem` relies on the
   * same property when it clears Supabase before establishing federated.
   */
  private async discardDormantSupabaseSession(): Promise<void> {
    try {
      await this.auth.signOut({ scope: "local" });
    } catch {
      /* best effort — the manager-side drop below is the invariant */
    }
    // Drops the manager's own reference. The principal snapshot recomputes from the CURRENT source, so
    // the federated owner stays the principal and no notify is required for a change nobody can observe.
    this.setSupabaseSession(null);
  }

  /** Release a transaction whose sign-in failed outright, so it cannot block or outlive the attempt. */
  abortProvisionalAuthentication(ticket: ProvisionalAuthTicket): void {
    if (this.provisionalTransaction?.ticket === ticket) this.provisionalTransaction = null;
  }

  /**
   * §Phase J bootstrap — restore the ONE active source deterministically:
   *  - native: a federated secure record wins (a federated user has no Supabase secure blob), else Supabase;
   *  - web: a Supabase session wins, else attempt a federated cookie refresh.
   * Returns the normalized session or null. Never mislabels a transient error as a confirmed logout.
   */
  async bootstrapAppSession(): Promise<StoreAppSession | null> {
    this.invalidateProvisionalTransaction();
    const native = this.nativeRuntime();
    if (native) {
      const fed = await this.federated.bootstrap();
      if (fed) {
        this.activeSource = "DilMart_federated";
        this.notify();
        return fed;
      }
      this.activeSource = "supabase";
      await this.bootstrapSession();
      return this.getAppSession();
    }
    // web
    const supa = await this.bootstrapSession();
    if (supa?.access_token) {
      this.activeSource = "supabase";
      return this.getAppSession();
    }
    const fed = await this.federated.bootstrap();
    if (fed) {
      this.activeSource = "DilMart_federated";
      this.notify();
      return fed;
    }
    this.activeSource = "supabase";
    return null;
  }

  /**
   * Removes only the auth session entries. Never `SecureStorage.clear()` and
   * never `localStorage.clear()`.
   *
   * Throws when encrypted storage cannot remove the auth key so the UI can
   * surface `storage_error` instead of a silent success.
   */
  async clearLocalAuthState(): Promise<void> {
    this.invalidateProvisionalTransaction();
    this.setSupabaseSession(null);
    this.inFlightRefresh = null;
    await clearPersistedAuthSession();
  }

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): Subscription {
    const {
      data: { subscription },
    } = this.auth.onAuthStateChange((event, session) => {
      // Sync the authority FIRST. An observer that re-renders from this callback would otherwise read a
      // principal snapshot that disagrees with the very event it is handling. The snapshot still derives
      // from the ACTIVE source, so a dormant Supabase event while a federated identity is active does not
      // become the normalized principal.
      this.setSupabaseSession(session ?? null);
      // An unrelated customer signing in is exactly the event a provisional transaction must not survive.
      // The stale sign-in's own event used to be indistinguishable from a legitimate one, which is how a
      // superseded provisional result could still look like the current identity at commit time.
      this.noteSupabaseAuthEvent(session ?? null);
      callback(event, session ?? null);
    });
    return subscription;
  }

  async startAutoRefresh(): Promise<void> {
    // §4 — the Supabase refresh ticker must NOT run for a federated identity; the federated adapter owns its
    // own refresh lifecycle (resume/reconnect/focus drive it via refreshSessionSingleFlight).
    if (this.activeSource === "DilMart_federated") return;
    try {
      await this.auth.startAutoRefresh();
    } catch {
      // Auto-refresh is an optimisation; explicit refreshes still work.
    }
  }

  async stopAutoRefresh(): Promise<void> {
    try {
      await this.auth.stopAutoRefresh();
    } catch {
      // Ignore: stopping a non-started ticker is harmless.
    }
  }

  /** Test seam — resets singleton state between cases. */
  resetForTests(): void {
    this.client = supabase as unknown as { auth: MinimalAuthClient };
    this.inFlightRefresh = null;
    this.storageError = null;
    this.lastKnownSession = null;
    this.activeSource = "supabase";
    this.attachFederatedAdapter(new FederatedSessionAdapter({ api: new FederatedSessionApi() }));
    this.nativeRuntime = defaultIsNativeRuntime;
    this.principal = { owner: null, version: 0 };
    this.provisionalTransaction = null;
    this.lifecycleRevision = 0;
    this.listeners.clear();
  }
}

export const authSessionManager = new AuthSessionManager();

/**
 * STORE-PR5 §Phase F/8 — the exported PR6 integration point. STORE-PR6 (deep links) calls this after it
 * receives/redeems a handoff. It contains NO URL parsing / appUrlOpen / Universal-Link logic (that is PR6).
 */
export async function establishFederatedSessionFromRedeem(
  result: FederatedRedeemResult,
): Promise<{ session: StoreAppSession; identityEpoch: IdentityEpoch }> {
  return authSessionManager.establishFederatedSessionFromRedeem(result);
}
