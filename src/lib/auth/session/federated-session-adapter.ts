/**
 * STORE-PR5 §Phase G/H/I — federated session adapter: the single owner of the federated session lifecycle.
 *
 * In-memory state is the source of truth for the access token; the refresh credential lives in native secure
 * storage (native) or the HttpOnly cookie (web) — never in React/JS-reachable state. Refresh is single-flight;
 * a definitive rejection clears the session, a transient failure preserves it.
 */

import {
  FederatedStorageError,
  type FederatedRedeemResult,
  type NormalizedRefresh,
  type AccessTokenOutcome,
  type StoreAppSession,
} from "./app-session.types";
import { FederatedSessionApi } from "./federated-session-api";
import { federatedContextKey, requiresIdentityRevalidation } from "./federated-token-claims";
import { FederatedSessionStorage, type FederatedNativeRecord } from "./federated-session-storage";

/** Refresh proactively when the access token has this little life left. */
export const FEDERATED_REFRESH_THRESHOLD_MS = 60_000;

type FederatedMemory = {
  accessToken: string;
  accessExpiresAt: number;
  refreshToken: string | null; // native only; web keeps it in the cookie
  refreshExpiresAt: number;
  user: { id: string; email: string | null; phone: string | null };
  linkedProfileId: string;
  deviceId: string;
};

/**
 * §9.3 — lifecycle transitions the adapter publishes. The adapter never touches React Query or the
 * provider directly; it reports, the manager forwards source-neutrally, the provider reacts.
 */
/**
 * Monotonic epoch identifying WHICH federated identity/session context the adapter's memory belongs
 * to. Branded so a caller cannot fabricate one from a bare number: the only way to obtain an epoch is
 * from the adapter itself, which is what makes an unbound identity write fail to compile rather than
 * fail in production.
 */
export type IdentityEpoch = number & { readonly __identityEpochBrand: unique symbol };

export type FederatedLifecycleEvent =
  | { type: "federated_identity_revalidation_required"; epoch: IdentityEpoch }
  | { type: "federated_identity_resolved"; epoch: IdentityEpoch };

/**
 * Token for the /auth/context authority path plus the epoch it belongs to, captured as ONE snapshot.
 * Reading them separately would allow a transition between the two reads.
 */
export type IdentityResolutionCredential = { token: string | null; epoch: IdentityEpoch };

export type FederatedAdapterDeps = {
  api?: FederatedSessionApi;
  storage?: FederatedSessionStorage;
  isNative?: () => boolean;
  now?: () => number;
  onLifecycleEvent?: (event: FederatedLifecycleEvent) => void;
};

export class FederatedSessionAdapter {
  private readonly api: FederatedSessionApi;
  private readonly storage: FederatedSessionStorage;
  private readonly isNative: () => boolean;
  private readonly now: () => number;

  private mem: FederatedMemory | null = null;
  private inFlight: Promise<NormalizedRefresh> | null = null;
  private storageError: Error | null = null;
  /**
   * §9.3 THE BARRIER. Persistent, because a single refresh's return value cannot protect the requests
   * that come AFTER it: once a replacement token is adopted it is no longer "expiring", so a later
   * acquisition would hand it out as ordinary and execute as the other customer under the old UI. This
   * flag outlives the refresh that set it and is cleared ONLY by verified /auth/context resolution.
   */
  private identityResolutionPending = false;
  /**
   * THE IDENTITY EPOCH. Advances whenever ownership of the federated identity/session context is
   * replaced — a new redeem, a cross-context refresh, a cold bootstrap, a logout. Every asynchronous
   * identity result carries the epoch it started under, and a mismatch is rejected UNCONDITIONALLY,
   * whether the session is currently pending or already resolved. Gating that check on `pending` is
   * what let a late /auth/context overwrite a newer, already-resolved session.
   */
  private identityEpoch = 0 as IdentityEpoch;
  /** `customer|family` of the context being resolved; null means unknown/unprovable. */
  private pendingContextKey: string | null = null;
  private lifecycle: (event: FederatedLifecycleEvent) => void;

  constructor(deps: FederatedAdapterDeps = {}) {
    this.isNative = deps.isNative ?? (() => false);
    this.api = deps.api ?? new FederatedSessionApi({ isNative: this.isNative });
    this.storage = deps.storage ?? new FederatedSessionStorage({ isNative: this.isNative });
    this.now = deps.now ?? (() => Date.now());
    this.lifecycle = deps.onLifecycleEvent ?? (() => undefined);
  }

  /**
   * Wired by AuthSessionManager through its ONE adapter-attachment path, so a manager-owned adapter is
   * never left without a listener — including adapters injected by tests.
   */
  setLifecycleListener(listener: (event: FederatedLifecycleEvent) => void): void {
    this.lifecycle = listener;
  }

  isIdentityResolutionPending(): boolean {
    return this.identityResolutionPending;
  }

  getIdentityEpoch(): IdentityEpoch {
    return this.identityEpoch;
  }

  /** Ownership of the identity context changed: everything started under the old epoch is now stale. */
  private advanceEpoch(): void {
    this.identityEpoch = (this.identityEpoch + 1) as IdentityEpoch;
  }

  /**
   * Raise the barrier for `contextKey`, or move it to a NEW generation when it is already up for a
   * DIFFERENT context. One logical transition publishes exactly one event: a refresh that merely rotates
   * the token inside the context already being resolved changes nothing and stays silent.
   */
  private enterRevalidation(contextKey: string | null): void {
    const sameContextAlreadyPending =
      this.identityResolutionPending && contextKey !== null && contextKey === this.pendingContextKey;
    if (sameContextAlreadyPending) return;

    this.identityResolutionPending = true;
    this.pendingContextKey = contextKey;
    // Advancing invalidates any /auth/context already in flight for the previous epoch.
    this.advanceEpoch();
    this.lifecycle({ type: "federated_identity_revalidation_required", epoch: this.identityEpoch });
  }

  /** Leave the barrier. Only authoritative, generation-matched resolution may call this. */
  private markIdentityResolved(): void {
    if (!this.identityResolutionPending) return;
    this.identityResolutionPending = false;
    this.pendingContextKey = null;
    this.lifecycle({ type: "federated_identity_resolved", epoch: this.identityEpoch });
  }

  getStorageError(): Error | null {
    return this.storageError;
  }

  /** STORE-PR6 — expose the ONE app-scoped device id (PR5-owned secure storage). No second id system. */
  getOrCreateDeviceId(): Promise<string> {
    return this.storage.getOrCreateDeviceId();
  }

  hasSession(): boolean {
    return this.mem != null;
  }

  /**
   * The GENERIC session projection every consumer sees (React context, providers, pages).
   *
   * §9.3 — this is a token exit too, just a session-shaped one. While identity resolution is pending the
   * token in memory authorizes as a customer we have not verified, so the projection must not carry it:
   * quarantining only the token-returning functions left this path handing the same token out through a
   * different shape. `accessToken` stays a `string` (the contract is unchanged) and becomes `""`, which
   * every existing consumer already treats as "no usable token".
   *
   * The real token remains privately in `mem` and is reachable only through
   * getAccessTokenForIdentityResolution(), for /auth/context.
   */
  getSession(): StoreAppSession | null {
    if (!this.mem) return null;
    return {
      authSource: "DilMart_federated",
      accessToken: this.identityResolutionPending ? "" : this.mem.accessToken,
      accessExpiresAt: this.mem.accessExpiresAt,
      user: this.mem.user,
      federated: { linkedProfileId: this.mem.linkedProfileId, refreshExpiresAt: this.mem.refreshExpiresAt },
    };
  }

  /**
   * §8/establish — adopt a redeem result. Validates shape/expiries/ids, ensures a device id, persists the
   * native secure record (web relies on the server-set cookie), and discards the web raw refresh token.
   */
  async establishFromRedeem(result: FederatedRedeemResult): Promise<StoreAppSession> {
    const s = result?.session;
    if (!result || result.status !== "authenticated" || !s) throw new Error("federated_redeem_invalid_result");
    if (typeof s.accessToken !== "string" || !s.accessToken.trim()) throw new Error("federated_redeem_missing_access_token");
    if (typeof s.expiresIn !== "number" || s.expiresIn <= 0) throw new Error("federated_redeem_invalid_access_expiry");
    if (typeof s.refreshExpiresIn !== "number" || s.refreshExpiresIn <= 0) throw new Error("federated_redeem_invalid_refresh_expiry");
    if (!result.customer?.id) throw new Error("federated_redeem_missing_customer_id");
    if (!result.customer?.linkedProfileId) throw new Error("federated_redeem_missing_linked_profile");
    const native = this.isNative();
    if (native && (typeof s.refreshToken !== "string" || !s.refreshToken.trim())) {
      throw new Error("federated_redeem_missing_refresh_token"); // native must carry the token to persist
    }

    const deviceId = await this.storage.getOrCreateDeviceId();
    const now = this.now();
    this.mem = {
      accessToken: s.accessToken,
      accessExpiresAt: now + s.expiresIn * 1000,
      refreshToken: native ? (s.refreshToken as string) : null,
      refreshExpiresAt: now + s.refreshExpiresIn * 1000,
      user: { id: result.customer.id, email: null, phone: null },
      linkedProfileId: result.customer.linkedProfileId,
      deviceId,
    };

    if (native) await this.persistNative();
    // A redeem REPLACES the identity context, so the epoch advances even though the result is
    // authoritative and immediately resolved. Without this, a /auth/context started for the previous
    // session would still match on epoch and overwrite this freshly redeemed customer.
    this.advanceEpoch();
    // The redeem response carries the authoritative Store customer, so this identity is RESOLVED: it did
    // not come from an unverified token claim. Clears any barrier left by a previous session in this tab.
    this.identityResolutionPending = false;
    this.pendingContextKey = null;
    // Web: the raw refresh token (if the caller passed one) is intentionally NOT stored — the cookie owns it.
    return this.getSession() as StoreAppSession;
  }

  /**
   * §Phase N bootstrap — restore after a cold start / reload.
   *  - native: read the encrypted record into memory (then refresh if expiring);
   *  - web: no JS state survives a reload, so attempt a cookie refresh (no body token).
   * Returns the restored session or null (safe unauthenticated). Storage failure → storage_error.
   */
  async bootstrap(): Promise<StoreAppSession | null> {
    if (this.isNative()) {
      let record: FederatedNativeRecord | null;
      try {
        record = await this.storage.load();
      } catch (error) {
        this.storageError = error instanceof Error ? error : new FederatedStorageError(String(error));
        throw this.storageError;
      }
      if (!record) return null;
      this.mem = {
        accessToken: record.accessToken,
        accessExpiresAt: record.accessExpiresAt,
        refreshToken: record.refreshToken,
        refreshExpiresAt: record.refreshExpiresAt,
        user: { id: record.customer.id, email: record.customer.email, phone: record.customer.phone },
        linkedProfileId: record.customer.linkedProfileId,
        deviceId: record.deviceId,
      };
      if (this.isExpiringSoon()) {
        const r = await this.refreshSingleFlight();
        if (r.status === "definitive_failure" || r.status === "no_session") return null;
      }
      return this.getSession();
    }

    // Web: try to mint an access token from the HttpOnly cookie.
    const r = await this.refreshSingleFlight();
    return r.status === "refreshed" ? this.getSession() : null;
  }

  isExpiringSoon(thresholdMs = FEDERATED_REFRESH_THRESHOLD_MS): boolean {
    if (!this.mem) return false;
    return this.mem.accessExpiresAt - this.now() <= thresholdMs;
  }

  /**
   * §9.3 — token acquisition that can express an identity transition.
   *
   * Acquiring a token is itself a refresh entry point: an expiring token refreshed here can come back
   * belonging to a different session family. Callers that will ACT on the token (api-core, the
   * /auth/context query) must use this form and honour `requiresIdentityRevalidation`; the token is
   * still returned so the backend-authoritative revalidation path can use it, but nothing else may.
   */
  async getValidAccessTokenOutcome(): Promise<AccessTokenOutcome> {
    // §9.3 QUARANTINE. Checked FIRST and on every call, not just the one that detected the transition.
    // The replacement token is already in memory and is no longer expiring, so without this a later
    // request would receive it as an ordinary token and execute as the other customer.
    if (this.identityResolutionPending) return { token: null, requiresIdentityRevalidation: true };

    // Web with no in-memory session yet: a cookie refresh can still produce a token. There is no prior
    // resolved identity to contradict, so this can never be a transition.
    if (!this.mem && !this.isNative()) {
      const r = await this.refreshSingleFlight();
      // A cold bootstrap raises the barrier (token valid, customer unverified), so this token is
      // quarantined too — only the identity-resolution path may present it.
      if (this.identityResolutionPending) return { token: null, requiresIdentityRevalidation: true };
      return { token: r.status === "refreshed" ? r.accessToken : null, requiresIdentityRevalidation: false };
    }
    if (!this.mem) return { token: null, requiresIdentityRevalidation: false };
    if (!this.isExpiringSoon()) return { token: this.mem.accessToken, requiresIdentityRevalidation: false };

    const r = await this.refreshSingleFlight();
    if (r.status === "refreshed") {
      // The refresh we just awaited may have raised the barrier. The token that TRIGGERED the transition
      // is quarantined exactly like every later one — returning it here would defeat the whole point.
      if (this.identityResolutionPending) return { token: null, requiresIdentityRevalidation: true };
      return { token: r.accessToken, requiresIdentityRevalidation: false };
    }
    // offline: the current token may still be accepted, and it still belongs to the held identity.
    if (r.status === "transient_failure") {
      // Re-check: a concurrent operation may have raised the barrier while this refresh was awaited.
      if (this.identityResolutionPending) return { token: null, requiresIdentityRevalidation: true };
      return { token: this.mem?.accessToken ?? null, requiresIdentityRevalidation: false };
    }
    return { token: null, requiresIdentityRevalidation: false };
  }

  /**
   * Compatibility form. It CANNOT express an identity transition, so it deliberately withholds a
   * replacement token that is pending revalidation rather than handing it to a generic caller —
   * returning it here is exactly how a request ends up executing as customer B under customer A's UI.
   */
  async getValidAccessToken(): Promise<string | null> {
    const outcome = await this.getValidAccessTokenOutcome();
    return outcome.requiresIdentityRevalidation ? null : outcome.token;
  }

  /**
   * §9.3 — the ONE consumer allowed past the quarantine: GET /auth/context, the backend authority that
   * resolves who the current token belongs to.
   *
   * Deliberately a narrow, purpose-named method rather than a generic escape hatch (no
   * `getToken({ ignoreBarrier: true })`) — an option flag would inevitably be reused by ordinary callers
   * and reopen the hole. It does NOT clear the barrier; only applyVerifiedIdentity(), after the backend has
   * verified the identity, may do that. Without this path the barrier would deadlock: generic access is
   * blocked, so nothing could ever fetch the context that unblocks it.
   */
  async getAccessTokenForIdentityResolution(): Promise<IdentityResolutionCredential> {
    // The generation is captured AFTER any refresh below, so the caller always carries the epoch the
    // token actually belongs to — that pairing is what makes a late response detectable as stale.
    const snapshot = (token: string | null): IdentityResolutionCredential => ({
      token,
      epoch: this.identityEpoch,
    });

    if (this.mem) {
      if (!this.isExpiringSoon()) return snapshot(this.mem.accessToken);
      const r = await this.refreshSingleFlight();
      // Read the token from private memory, NOT from the refresh outcome: the outcome withholds it while
      // the barrier is up, and this path is precisely the one permitted past that.
      if (r.status === "refreshed" || r.status === "transient_failure") return snapshot(this.mem?.accessToken ?? null);
      return snapshot(null);
    }
    if (this.isNative()) return snapshot(null);
    // Cold web bootstrap: mint from the HttpOnly cookie so the context query has something to present.
    const r = await this.refreshSingleFlight();
    return snapshot(r.status === "refreshed" ? this.mem?.accessToken ?? null : null);
  }

  /** Exactly one in-flight refresh; concurrent callers await the same promise. */
  refreshSingleFlight(): Promise<NormalizedRefresh> {
    if (this.inFlight) return this.inFlight;
    const pending = this.performRefresh().finally(() => {
      this.inFlight = null;
    });
    this.inFlight = pending;
    return pending;
  }

  private async performRefresh(): Promise<NormalizedRefresh> {
    const native = this.isNative();
    const refreshToken = native ? this.mem?.refreshToken ?? undefined : undefined;
    if (native && !refreshToken) return { status: "no_session", accessToken: null };

    // The redeem bound this family to the app-scoped device id, and the rotation RPC requires the SAME
    // id. On web no JS memory survives a reload — and the web bootstrap seeds `deviceId: ""` — so fall
    // back to the one PR5-owned persistent store. `peek` (never `getOrCreate`) so a visitor who has not
    // redeemed a handoff is never assigned an identifier here.
    let deviceId = this.mem?.deviceId || undefined;
    if (!deviceId) {
      deviceId = (await this.storage.peekDeviceId()) ?? undefined;
    }

    const res = await this.api.refresh(refreshToken, deviceId);
    if (res.ok === false) {
      if (res.kind === "definitive") {
        // Definitive server rejection. A FAILED secure local clear must surface as storage_error (not a raw
        // rejected promise) so the lifecycle stays normalized and the UI never shows a false "logged out".
        try {
          await this.clearLocal();
        } catch (error) {
          this.storageError = error instanceof Error ? error : new FederatedStorageError(String(error));
          return { status: "storage_error", accessToken: null, error };
        }
        return { status: "definitive_failure", accessToken: null };
      }
      // forbidden (403) / transient (5xx / network / timeout): preserve the session — never clear.
      // Exit-level quarantine. A transient failure normally returns the CURRENT token so an offline
      // caller can keep using it — but if the barrier is up that token is unresolved, so it must not
      // leave the adapter. Hardened here rather than relying on no consumer acting on it: "nothing reads
      // it today" is precisely the reasoning that let earlier exits leak.
      if (this.identityResolutionPending) {
        return { status: "transient_failure", accessToken: null, requiresIdentityRevalidation: true };
      }
      return { status: "transient_failure", accessToken: this.mem?.accessToken ?? null };
    }

    const now = this.now();
    const s = res.data.session;
    let needsRevalidation = false;
    if (!this.mem) {
      // Web bootstrap path: we refreshed from a cookie with no prior memory. Seed a minimal session; the
      // caller fetches /auth/context next to fill user identity.
      this.mem = {
        accessToken: s.accessToken,
        accessExpiresAt: now + s.expiresIn * 1000,
        refreshToken: null,
        refreshExpiresAt: now + s.refreshExpiresIn * 1000,
        user: { id: "", email: null, phone: null },
        linkedProfileId: "",
        // Keep the resolved id so later rotations in this page life stay bound without re-reading storage.
        deviceId: deviceId ?? "",
      };
      // A cold web bootstrap has a valid token but NO verified customer. Generic traffic must not use it
      // until /auth/context says who it belongs to — same barrier as a cross-identity transition.
      if (!native) this.enterRevalidation(federatedContextKey(s.accessToken));
    } else {
      // §9.3 cross-identity guard. On web the refresh credential is a __Host- cookie scoped to the API
      // host and SHARED by every tab of the browser profile, and all tabs share the one persisted device
      // id. If another tab redeems a handoff for a different customer, this tab's next refresh succeeds
      // against THAT cookie and mints a token for the other identity. Adopting it under the identity
      // still sitting in memory would leave the UI (and every user-scoped React Query cache) showing
      // customer A while the access token authorizes as customer B. So: only carry the retained identity
      // forward when the new token PROVES it is the same customer and the same session family; otherwise
      // drop it to the unresolved state the web bootstrap already uses and let /auth/context — the
      // backend authority — re-resolve who this is.
      //
      // Native is exempt by construction: its refresh token lives in this app's OS-encrypted storage and
      // is never shared with another session, so there is no cross-identity vector to guard against.
      if (!native) {
        if (this.identityResolutionPending) {
          // ALREADY unresolved. `mem.user.id` is blank here BY DESIGN — we blanked it — so it must never
          // be used to decide whether the barrier still applies; keying off it made the barrier disarm
          // itself exactly when it was up. Only the token's identity CONTEXT matters now: the same
          // context keeps the current generation (an ordinary rotation), a different one starts a new
          // generation and thereby invalidates any /auth/context already in flight.
          this.enterRevalidation(federatedContextKey(s.accessToken));
        } else {
          needsRevalidation = requiresIdentityRevalidation(
            { accessToken: this.mem.accessToken, storeCustomerId: this.mem.user.id },
            s.accessToken,
          );
        }
      }

      this.mem.accessToken = s.accessToken;
      this.mem.accessExpiresAt = now + s.expiresIn * 1000;
      this.mem.refreshExpiresAt = now + s.refreshExpiresIn * 1000;
      if (native && typeof s.refreshToken === "string" && s.refreshToken.trim()) {
        this.mem.refreshToken = s.refreshToken; // rotation
      }

      if (needsRevalidation) {
        // Never present the previous user alongside the new token. Blanking these puts the adapter in the
        // same "identity not yet resolved" state as a fresh web bootstrap, which re-keys the caller's
        // ["auth-context", authSource, user.id] query and forces a backend-authoritative refetch.
        this.mem.user = { id: "", email: null, phone: null };
        this.mem.linkedProfileId = "";
        this.enterRevalidation(federatedContextKey(s.accessToken));
      }
    }

    if (native) {
      try {
        await this.persistNative();
      } catch (error) {
        this.storageError = error instanceof Error ? error : new FederatedStorageError(String(error));
        return { status: "storage_error", accessToken: null, error };
      }
    }
    // §9.3 THE EXIT. The externally visible result reports the CURRENT BARRIER STATE, not merely whether
    // THIS refresh created the transition. A refresh completing while the barrier was already up used to
    // report false, which let api-core replay the request under the other customer's token. The token is
    // withheld here too, so even a consumer that ignores the flag cannot act on it.
    const barrierUp = this.identityResolutionPending;
    return {
      status: "refreshed",
      accessToken: barrierUp ? null : s.accessToken,
      requiresIdentityRevalidation: barrierUp,
    };
  }

  /** Set the identity fields after /auth/context resolves (web bootstrap fills these). */
  /**
   * Apply a backend-verified identity. Returns false when the write is REJECTED as stale.
   *
   * §9.3 — while the barrier is up the write must carry the generation its /auth/context request was
   * started for. A response for customer B that lands after the session already moved on to C would
   * otherwise install B's identity over C's token and clear the barrier, producing UI=B while API=C. A
   * stale result must never mutate identity and never close a newer barrier.
   */
  applyVerifiedIdentity(
    user: { id: string; email: string | null; phone: string | null },
    linkedProfileId: string | undefined,
    expectedEpoch: IdentityEpoch,
  ): boolean {
    // UNCONDITIONAL and FIRST. Not gated on `identityResolutionPending`: a redeem can replace the
    // session with an already-RESOLVED one, and a late response from the previous context must be
    // rejected then too. Gating this on `pending` is exactly how a stale write reached a newer session.
    if (expectedEpoch !== this.identityEpoch) return false; // STALE
    if (!this.mem) return false;
    this.mem.user = user;
    if (linkedProfileId) this.mem.linkedProfileId = linkedProfileId;
    // The ONLY normal way out of the barrier: a current-epoch, backend-verified identity. Never because
    // a token stopped expiring, a later refresh succeeded, or `sub` happened to match.
    if (user.id) this.markIdentityResolved();
    return true;
  }

  /** §Phase M — current-device logout: revoke then clear local secure state (local clear MUST succeed). */
  async logout(): Promise<void> {
    const token = this.isNative() ? this.mem?.refreshToken ?? undefined : undefined;
    try {
      await this.api.logout(token); // network/revoke failure must not block local clear
    } catch {
      /* ignore transient revoke failure */
    }
    await this.clearLocal(); // throws FederatedStorageError on secure-clear failure → surfaces storage_error
  }

  async logoutAll(): Promise<void> {
    const token = this.isNative() ? this.mem?.refreshToken ?? undefined : undefined;
    try {
      await this.api.logoutAll(token);
    } catch {
      /* ignore */
    }
    await this.clearLocal();
  }

  private async clearLocal(): Promise<void> {
    this.mem = null;
    this.inFlight = null;
    // The session is gone, so there is nothing to revalidate. Reset the flag directly rather than via
    // markIdentityResolved(): "resolved" would be a lie, and logout already publishes its own change.
    // Advancing (never rewinding) invalidates anything still in flight for the destroyed session.
    this.advanceEpoch();
    this.identityResolutionPending = false;
    this.pendingContextKey = null;
    await this.storage.clear(); // native: targeted remove + verify; web: no-op
  }

  private async persistNative(): Promise<void> {
    if (!this.mem) return;
    const record: FederatedNativeRecord = {
      version: 1,
      authSource: "DilMart_federated",
      accessToken: this.mem.accessToken,
      accessExpiresAt: this.mem.accessExpiresAt,
      refreshToken: this.mem.refreshToken ?? "",
      refreshExpiresAt: this.mem.refreshExpiresAt,
      customer: {
        id: this.mem.user.id,
        email: this.mem.user.email,
        phone: this.mem.user.phone,
        linkedProfileId: this.mem.linkedProfileId,
      },
      deviceId: this.mem.deviceId,
    };
    await this.storage.persist(record);
  }

  /** Test seam. */
  resetForTests(): void {
    this.mem = null;
    this.inFlight = null;
    this.storageError = null;
  }
}
