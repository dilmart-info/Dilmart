import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import type { AuthContextResponse } from "@/lib/auth-context-contract";
import { isAgent, isMerchantApplicant, isMerchantUser, isPlatformAdmin } from "@/lib/authz";
import { apiClient } from "@/lib/api-client";
import { isNative } from "@/lib/capacitor";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./AuthContext";
import { authSessionManager, principalOwnerOf, type AuthPrincipalSnapshot } from "./auth-session-manager";
import type { StoreAppSession } from "./session/app-session.types";
import {
  establishProvisionalSession as establishProvisionalSessionAction,
  resendSignupEmail as resendSignupEmailAction,
  signInWithPassword as signInWithPasswordAction,
  signUpWithPassword as signUpWithPasswordAction,
  requestEmailOtp as requestEmailOtpAction,
  verifyEmailOtp as verifyEmailOtpAction,
  requestPhoneOtp as requestPhoneOtpAction,
  startPhoneChange as startPhoneChangeAction,
  verifyPhoneChange as verifyPhoneChangeAction,
  getVerifiedAuthPhone as getVerifiedAuthPhoneAction,
  verifyPhoneOtp as verifyPhoneOtpAction,
  requestEmailPasswordRecovery as requestEmailPasswordRecoveryAction,
  verifyEmailRecoveryOtp as verifyEmailRecoveryOtpAction,
  updatePasswordInSession as updatePasswordInSessionAction,
  type PasswordCredentials,
} from "./auth-actions";
import { AUTH_REFRESH_OUTCOMES, AUTH_REFRESH_REASONS, USER_SCOPED_QUERY_KEYS, type AuthRefreshReason } from "./auth-events";
import { isAuthStorageError } from "./auth-errors";

/**
 * UI-only safety valve. If secure bootstrap is slow we show a delayed hint,
 * but we deliberately do NOT flip `sessionBootstrapping` to false — that used
 * to classify users as unauthenticated on slow cold starts.
 */
const BOOTSTRAP_UI_TIMEOUT_MS = 8000;

type PluginListenerHandleLike = { remove: () => Promise<void> };

function clearUserScopedQueries(queryClient: QueryClient) {
  for (const key of USER_SCOPED_QUERY_KEYS) {
    queryClient.removeQueries({ queryKey: [key] });
  }
}

/**
 * §9.3 — a refreshed federated token resolved to a different (or unprovable) identity. The auth-context
 * cache is keyed by the OLD user id, so removing the user-scoped queries is not enough on its own: the
 * stale ["auth-context", source, previousUserId] entry has to go too, or a later render that momentarily
 * re-reads the old key would serve the previous customer's roles.
 */
function dropUserScopedState(queryClient: QueryClient) {
  clearUserScopedQueries(queryClient);
  queryClient.removeQueries({ queryKey: ["auth-context"] });
}

/** Normalize a raw Supabase session into the source-neutral shape (federated uses manager.getAppSession()). */
function supabaseToAppSession(s: Session | null): StoreAppSession | null {
  if (!s?.access_token) return null;
  return {
    authSource: "supabase",
    accessToken: s.access_token,
    accessExpiresAt: (s.expires_at ?? 0) * 1000,
    user: { id: s.user?.id ?? "", email: s.user?.email ?? null, phone: (s.user as { phone?: string | null })?.phone ?? null },
  };
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const candidate = error as { status?: unknown };
  return typeof candidate.status === "number" ? candidate.status : undefined;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  // STORE-PR5 §Phase J — the source-neutral session drives all auth state; `session` (Supabase) is kept for
  // back-compat and is null for a federated identity.
  const [appSession, setAppSession] = useState<StoreAppSession | null>(null);
  const [sessionBootstrapping, setSessionBootstrapping] = useState(true);
  const [bootstrapDelayed, setBootstrapDelayed] = useState(false);
  const [storageError, setStorageError] = useState<Error | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  /**
   * §9.3 — mirrored barrier state. `generation` is a plain integer, never a token and never PII, so it is
   * safe in a query key; putting it there is what makes an older generation's in-flight resolution
   * non-authoritative rather than merely ignored.
   */
  const isFederated = appSession?.authSource === "DilMart_federated";
  // §9.3 — the ONE principal-transition source. Derived from the session (never from
  // /auth/context, which blinks to null while re-keying by epoch) and owned here so a stale
  // operation cannot be judged current by its own component's private copy.
  const principalOwner = principalOwnerOf(appSession);
  const [principalTransition, setPrincipalTransition] = useState<{ owner: string | null; version: number }>(
    () => ({ owner: principalOwner, version: 0 }),
  );
  if (principalOwner !== principalTransition.owner) {
    // Advances on EVERY transition, null → owner included. Computed during render so an async
    // continuation resuming after the change cannot observe the previous value.
    setPrincipalTransition({ owner: principalOwner, version: principalTransition.version + 1 });
  }
  const [identityResolution, setIdentityResolution] = useState<ReturnType<typeof authSessionManager.getFederatedIdentityResolution>>(
    () => authSessionManager.getFederatedIdentityResolution(),
  );
  /**
   * §9.3 — a federated session whose identity has NOT been verified by /auth/context. Distinct from
   * "the context query is fetching": the query may have stopped (errored, or been dropped as stale)
   * while the identity is still unresolved, and the session must not present as ready in that window.
   */
  const federatedIdentityPending = isFederated && identityResolution.pending;
  /**
   * §9.3 — the epoch whose /auth/context answer was ACCEPTED (epoch-validated and applied). A handoff
   * requires this to equal the epoch its own redeem established, which is what makes readiness reflect
   * the CURRENT identity context rather than a leftover ready-state for the same customer.
   */
  const [verifiedContextEpoch, setVerifiedContextEpoch] = useState<number | null>(null);
  const appSessionRef = useRef<StoreAppSession | null>(null);
  appSessionRef.current = appSession;

  const mountedRef = useRef(true);
  /**
   * The last principal whose user-scoped caches are in the query client.
   *
   * Tracked here rather than derived per callback because the two lifecycle entry points — the manager
   * subscription and the Supabase auth-state subscription — each see only some transitions, and neither
   * alone can tell whether the owner changed since the caches were filled.
   */
  const cachedOwnerRef = useRef<string | null>(null);

  /**
   * §9.3 — user-scoped caches belong to exactly one principal. Any move from a real owner to a DIFFERENT
   * one must drop them, and "different" includes signing out, a federated identity becoming unresolved,
   * and the same customer arriving through the other auth source.
   *
   * Only `null → owner` is exempt, and only because nothing user-scoped can have been cached under
   * nobody: that is the guest-to-provisional upgrade, where the guest's own public and in-progress state
   * must survive. Public marketplace caches are never in scope here — they are not keyed by principal and
   * browsing stays warm across every transition.
   */
  const applyOwnerTransition = useCallback(
    (nextOwner: string | null) => {
      const previousOwner = cachedOwnerRef.current;
      cachedOwnerRef.current = nextOwner;
      if (previousOwner !== null && previousOwner !== nextOwner) dropUserScopedState(queryClient);
    },
    [queryClient],
  );

  /**
   * Record the owner a restored session belongs to WITHOUT treating it as a transition. A cold start is
   * not somebody being replaced, and clearing there would throw away caches the app just restored. It has
   * to happen, though: leaving the tracked owner at null would make the next real change look like the
   * exempt `null → owner` case and silently keep the previous customer's data.
   */
  const adoptRestoredOwner = useCallback((restored: StoreAppSession | null) => {
    cachedOwnerRef.current = principalOwnerOf(restored);
  }, []);

  const applySession = useCallback((next: Session | null) => {
    if (!mountedRef.current) return;
    setSession(next);
  }, []);

  /** Pull the current source-neutral session from the manager (after any lifecycle transition). */
  const syncAppSession = useCallback(() => {
    if (!mountedRef.current) return;
    setAppSession(authSessionManager.getAppSession());
  }, []);

  /**
   * §3 — source-neutral lifecycle refresh (resume / reconnect / focus). Operates on the ACTIVE source: a
   * federated refresh routes to the federated adapter and re-syncs appSession; a Supabase refresh updates
   * both `session` and appSession. A definitive failure clears; transient/403 preserves. Returns the outcome
   * so callers can decide follow-ups (e.g. context invalidation on reconnect).
   */
  const refreshActiveSession = useCallback(
    async (reason: AuthRefreshReason): Promise<string> => {
      if (!appSessionRef.current) return "no_session";
      const federated = authSessionManager.getActiveSource() === "DilMart_federated";
      const result = await authSessionManager.refreshSessionSingleFlight(reason);
      if (!mountedRef.current) return result.status;
      if (result.status === AUTH_REFRESH_OUTCOMES.refreshed) {
        // §9.3 — the refreshed federated token could not be proven to belong to the identity we were
        // holding (another tab of this browser profile replaced the shared __Host- refresh cookie). Every
        // user-scoped cache still holds the PREVIOUS customer's data, so drop it before re-rendering.
        if (result.requiresIdentityRevalidation) dropUserScopedState(queryClient);
        if (federated) syncAppSession();
        else applySession(result.session);
        if (!federated) setAppSession(authSessionManager.getAppSession());
      } else if (result.status === AUTH_REFRESH_OUTCOMES.definitiveFailure) {
        if (federated) syncAppSession();
        else applySession(null);
        setAppSession(authSessionManager.getAppSession());
      }
      // transient / storage_error: preserve the active session (never clear on a blip).
      return result.status;
    },
    [applySession, syncAppSession, queryClient],
  );

  // ── Session bootstrap + the single onAuthStateChange subscription ──────────
  useEffect(() => {
    mountedRef.current = true;
    setBootstrapDelayed(false);

    const bootstrapUiTimer = window.setTimeout(() => {
      if (!mountedRef.current) return;
      setBootstrapDelayed(true);
    }, BOOTSTRAP_UI_TIMEOUT_MS);

    void (async () => {
      try {
        // §Phase J — the manager owns source selection (native federated secure session / web cookie /
        // Supabase). AuthProvider must not implement a second selection algorithm.
        const restored = await authSessionManager.bootstrapAppSession();
        if (!mountedRef.current) return;
        setStorageError(null);
        adoptRestoredOwner(restored);
        setAppSession(restored);
        applySession(authSessionManager.getLastKnownSession()); // Supabase back-compat (null when federated)
      } catch (error) {
        if (!mountedRef.current) return;
        if (isAuthStorageError(error)) {
          setStorageError(error);
        } else {
          // Never destroy the session because bootstrap read failed.
          console.warn("[auth] Session bootstrap failed; keeping stored session.");
        }
      } finally {
        if (mountedRef.current) {
          setSessionBootstrapping(false);
          setBootstrapDelayed(false);
          window.clearTimeout(bootstrapUiTimer);
        }
      }
    })();

    // §Phase J — source-neutral change notifications (federated establish/logout, source switch).
    const unsubscribeManager = authSessionManager.subscribe(() => {
      if (!mountedRef.current) return;
      // §9.3 THE BARRIER (provider half). The manager publishes here after ANY federated refresh whose
      // identity could not be proven — api-core, token acquisition, tab focus, reconnect, the
      // /auth/context query. Detecting the resolved→unresolved transition in this one place is what
      // makes every entry point safe; dropping caches in the individual callers instead would leave
      // whichever caller nobody remembered still serving the previous customer's data.
      // Enumerating the federated-only transitions here — resolved→unresolved, and one resolved customer
      // replaced by another — missed every transition that crossed the source boundary or ended in nobody.
      // `federated:A → supabase:B`, `federated:A → null` and `supabase:A → supabase:B` all left the
      // previous customer's profile, addresses, orders and loyalty readable under the new session. The
      // owner comparison covers all of them, the federated cases included.
      applyOwnerTransition(principalOwnerOf(authSessionManager.getAppSession()));
      // Mirror the barrier into React state so the auth-context query key can carry the generation.
      setIdentityResolution(authSessionManager.getFederatedIdentityResolution());
      syncAppSession();
      setSessionBootstrapping(false);
    });

    const subscription = authSessionManager.onAuthStateChange((event, nextSession) => {
      if (!mountedRef.current) return;
      // BLOCKER D — a federated identity owns the React session. A null Supabase SIGNED_OUT (or a
      // TOKEN_REFRESHED) event from the dormant Supabase adapter must NEVER erase it.
      if (authSessionManager.getActiveSource() === "DilMart_federated") return;

      // The manager does not publish on Supabase auth events, so this path must apply the same rule
      // itself — otherwise `supabase:A → supabase:B` would never be seen as an owner change at all.
      const nextAppSession = supabaseToAppSession(nextSession);
      applyOwnerTransition(principalOwnerOf(nextAppSession));

      applySession(nextSession);
      setAppSession(nextAppSession);
      setSessionBootstrapping(false);
      setBootstrapDelayed(false);

      if (event === "SIGNED_IN") {
        // Warm the context cache with an explicit token: React state still holds
        // the previous render's session, so letting useQuery run first can cache
        // a guest context and race admin/merchant login.
        if (nextSession?.access_token && nextSession.user?.id) {
          queryClient
            .fetchQuery({
              // Source-aware key — SIGNED_IN is always a direct Supabase identity.
              queryKey: ["auth-context", "supabase", nextSession.user.id],
              queryFn: () => apiClient.getAuthContext(nextSession.access_token),
              staleTime: 0,
            })
            .catch(() => {
              // The useQuery below owns retries and error surfacing.
            });
        }
        return;
      }

      // Token refreshes fire frequently; invalidating here causes refetch loops.
      if (event === "TOKEN_REFRESHED") return;

      if (event === "SIGNED_OUT") {
        clearUserScopedQueries(queryClient);
      }
    });

    return () => {
      mountedRef.current = false;
      window.clearTimeout(bootstrapUiTimer);
      subscription.unsubscribe();
      unsubscribeManager();
    };
  }, [applySession, syncAppSession, applyOwnerTransition, adoptRestoredOwner, queryClient]);

  // ── Native app lifecycle: exactly one appStateChange listener ──────────────
  useEffect(() => {
    if (!isNative()) return;

    let handle: PluginListenerHandleLike | null = null;
    let cancelled = false;

    const onAppStateChange = async ({ isActive }: { isActive: boolean }) => {
      if (!isActive) {
        await authSessionManager.stopAutoRefresh();
        return;
      }

      // startAutoRefresh no-ops for a federated identity (§4); the federated adapter owns its refresh.
      await authSessionManager.startAutoRefresh();
      if (!appSessionRef.current) return;
      // Source-neutral resume refresh: the Supabase path skips when not expiring; the federated adapter's
      // single-flight refresh only rotates when its own token is near expiry.
      if (authSessionManager.getActiveSource() === "supabase") {
        const supa = sessionRef.current;
        if (!supa || !authSessionManager.isExpiringSoon(supa)) return;
      }
      await refreshActiveSession(AUTH_REFRESH_REASONS.appResume);
    };

    (async () => {
      const { App } = await import("@capacitor/app");
      const registered = await App.addListener("appStateChange", (state) => {
        void onAppStateChange(state);
      });
      if (cancelled) {
        void registered.remove();
        return;
      }
      handle = registered;
      await authSessionManager.startAutoRefresh();
    })().catch(() => {
      // Without the App plugin we simply lose proactive resume refresh; explicit
      // refreshes on API 401 still recover the session.
    });

    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [applySession]);

  // ── Connectivity: offline never clears the session ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    let handle: PluginListenerHandleLike | null = null;

    const handleConnectivity = (connected: boolean) => {
      if (!mountedRef.current) return;
      setIsOffline(!connected);
      if (!connected) return;

      void (async () => {
        if (!appSessionRef.current) return;
        const status = await refreshActiveSession(AUTH_REFRESH_REASONS.networkOnline);
        if (!mountedRef.current) return;
        if (status === AUTH_REFRESH_OUTCOMES.definitiveFailure) return;
        // Always reload backend context after reconnect — token refresh alone is not enough.
        await queryClient.invalidateQueries({ queryKey: ["auth-context"] });
      })();
    };

    if (isNative()) {
      (async () => {
        const { Network } = await import("@capacitor/network");
        const status = await Network.getStatus();
        if (!cancelled) setIsOffline(!status.connected);
        const registered = await Network.addListener("networkStatusChange", (state) => {
          handleConnectivity(state.connected);
        });
        if (cancelled) {
          void registered.remove();
          return;
        }
        handle = registered;
      })().catch(() => {
        // Treat an unavailable Network plugin as "assume online" rather than
        // degrading the session into the offline state.
      });

      return () => {
        cancelled = true;
        void handle?.remove();
      };
    }

    const onOnline = () => handleConnectivity(true);
    const onOffline = () => handleConnectivity(false);
    if (typeof navigator !== "undefined" && navigator.onLine === false) setIsOffline(true);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [applySession, queryClient]);

  // ── Web tab focus: revalidate, but transient failures never sign out ───────
  useEffect(() => {
    if (isNative()) return;

    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      if (!appSessionRef.current) return;
      void refreshActiveSession(AUTH_REFRESH_REASONS.tabFocus);
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [refreshActiveSession]);

  // ── Backend-authoritative role/profile context ─────────────────────────────
  const authContextQuery = useQuery<AuthContextResponse | null>({
    // §Phase J — source-aware identity key so a Supabase user A cache can never cross-contaminate a
    // federated user B cache (or vice-versa).
    queryKey: [
      "auth-context",
      appSession?.authSource ?? null,
      appSession?.user?.id ?? null,
      // §9.3 — the epoch belongs in the key for EVERY federated session, not only unresolved ones. A
      // new redeem can keep the same customer id AND resolve immediately while still replacing the
      // identity context; keying only on the user id would let the previous context's cached answer
      // stay authoritative for the new session. Supabase keys are unchanged.
      isFederated ? `epoch:${identityResolution.epoch}` : null,
    ],
    // §9.3 — source-aware. A federated session whose identity is still pending deliberately projects
    // NO token (see FederatedSessionAdapter.getSession), so gating on appSession.accessToken would
    // disable the very query that resolves it and leave the session pending forever. Federated
    // enablement therefore keys off having a session at all; the credential comes from the
    // resolution path inside queryFn. Supabase keeps its original token requirement.
    enabled:
      (isFederated ? !!appSession : !!appSession?.accessToken) &&
      !sessionBootstrapping &&
      !storageError &&
      !isOffline,
    staleTime: 0,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
    queryFn: async () => {
      // §9.3 — this query IS the authority that resolves a quarantined federated identity, so it uses the
      // dedicated resolution path rather than the generic one. Generic acquisition returns null while the
      // barrier is up; using it here would deadlock — nothing could ever fetch the context that lifts it.
      // The adapter published the transition when it entered the barrier, so the caches were already
      // dropped and this query was already re-keyed by the time it runs.
      const credential = await authSessionManager.getAccessTokenForIdentityResolution();
      // §9.3 — for a federated session this is the ONLY permitted source. The old
      // `?? appSession?.accessToken` fallback reached around the quarantine through the session-shaped
      // projection, so it is gone: a missing credential now fails closed. Supabase keeps its own path.
      const token = isFederated ? credential.token ?? "" : credential.token ?? appSession?.accessToken ?? "";
      // Captured BEFORE the request. If another refresh moves the session to a different identity context
      // while this is in flight, the generation advances and this result is no longer authoritative.
      const startedEpoch = credential.epoch;
      if (!token) throw new Error("Missing session access token for auth context.");

      /**
       * §9.3 — the SINGLE acceptance point for a federated /auth/context answer. Both the initial
       * request and the 401 retry funnel through here: the retry used to `return await
       * apiClient.getAuthContext(...)` directly, which was a second authority path that never checked
       * the epoch. Duplicating the validation is what created that gap, so it exists exactly once.
       */
      const acceptFederatedContext = (ctx: AuthContextResponse | null, expectedEpoch: typeof startedEpoch) => {
        if (authSessionManager.getActiveSource() !== "DilMart_federated" || !ctx?.user?.id) return ctx;
        const applied = authSessionManager.applyFederatedIdentity(
          { id: ctx.user.id, email: ctx.user.email ?? null, phone: ctx.user.phone ?? null },
          ctx.profile?.id,
          expectedEpoch,
        );
        if (!applied) {
          // Stale: this answer describes an identity context the session has already left. Surfaced as
          // a failure so it is never cached as authoritative; the re-keyed query resolves the current
          // epoch.
          throw new Error("Federated identity resolution superseded by a newer identity epoch.");
        }
        // Published ONLY on an accepted context, so it can never advertise an epoch that was merely
        // requested. Handoff readiness keys off this.
        setVerifiedContextEpoch(expectedEpoch);
        syncAppSession();
        return ctx;
      };

      try {
        const ctx = await apiClient.getAuthContext(token);
        return acceptFederatedContext(ctx, startedEpoch);
      } catch (error) {
        const status = statusOf(error);

        if (status === 401) {
          // Exactly one refresh + one retry, then a definitive decision.
          const result = await authSessionManager.refreshSessionSingleFlight(
            AUTH_REFRESH_REASONS.authContextUnauthorized,
          );

          const federated = authSessionManager.getActiveSource() === "DilMart_federated";
          if (result.status === AUTH_REFRESH_OUTCOMES.refreshed && result.session?.access_token) {
            if (result.requiresIdentityRevalidation) {
              // The retry token belongs to someone else. Fetching here would cache THAT customer's context
              // under this query's key (the previous user id). Drop the caches, re-sync so the key changes,
              // and let the re-keyed query resolve the new identity from scratch.
              dropUserScopedState(queryClient);
              syncAppSession();
              throw error;
            }
            if (federated) syncAppSession();
            else applySession(result.session);
            // The retry answer is subject to exactly the same epoch validation as the initial one —
            // a redeem can advance the epoch while this retry is in flight.
            const retryCtx = await apiClient.getAuthContext(result.session.access_token);
            return acceptFederatedContext(retryCtx, startedEpoch);
          }

          if (
            result.status === AUTH_REFRESH_OUTCOMES.transientFailure ||
            result.status === AUTH_REFRESH_OUTCOMES.storageError
          ) {
            throw error;
          }

          // refreshSessionSingleFlight already cleared local state on a
          // definitive failure; just reflect it in React state.
          if (federated) syncAppSession();
          else applySession(null);
          setAppSession(authSessionManager.getAppSession());
          throw error;
        }

        // 403 means "authenticated but not allowed" — surfacing it must never
        // sign the user out. Same for 5xx and network errors.
        throw error;
      }
    },
  });

  const contextBootstrapping =
    authContextQuery.isLoading || (!!appSession && !authContextQuery.data && authContextQuery.isFetching);

  const context = authContextQuery.data;
  const user = context?.user ?? null;
  const profile = context?.profile ?? null;
  const role = context?.activeRole ?? null;
  const roles = useMemo(() => context?.roles ?? [], [context]);

  const isAdmin = isPlatformAdmin(role) || roles.includes("admin") || roles.includes("super_admin");
  const merchantUser =
    isMerchantUser(role) ||
    roles.includes("merchant_owner") ||
    roles.includes("merchant_manager") ||
    roles.includes("merchant_staff");
  const merchantApplicant = isMerchantApplicant(role);
  const agentUser = isAgent(role);

  const authStatus: AuthStatus = useMemo(() => {
    if (storageError) return "storage_error";
    if (sessionBootstrapping) return "bootstrapping";
    if (!appSession) return "unauthenticated";
    if (isOffline) return "authenticated_offline";
    if (contextBootstrapping) return "authenticated_loading_context";
    // §9.3 — a federated identity that is still unresolved is NOT ready, even if the auth-context
    // query has stopped fetching (e.g. it errored). Otherwise a failed resolution would present the
    // session as ready while the token is quarantined and the identity unverified, and protected
    // actions would start against an identity the backend never confirmed.
    if (federatedIdentityPending) return "authenticated_loading_context";
    // §9.3 GLOBAL AUTHORITY INVARIANT. `pending` alone is not sufficient: establishFromRedeem installs an
    // authoritative customer and clears the barrier while ADVANCING the epoch, so a same-customer
    // re-handoff leaves pending=false with the accepted context still belonging to the PREVIOUS epoch. If
    // /auth/context for the new epoch then fails and settles, contextBootstrapping goes false and the
    // session would present as ready on a context the current identity never verified. Ready must mean
    // the CURRENT epoch's context was accepted, for the customer this session actually holds.
    if (
      isFederated &&
      (verifiedContextEpoch !== identityResolution.epoch ||
        !context ||
        context.user?.id !== appSession?.user?.id)
    ) {
      return "authenticated_loading_context";
    }
    return "authenticated_ready";
  }, [
    storageError,
    sessionBootstrapping,
    appSession,
    isOffline,
    contextBootstrapping,
    federatedIdentityPending,
    isFederated,
    verifiedContextEpoch,
    identityResolution.epoch,
    context,
  ]);

  const retryStorageBootstrap = useCallback(async () => {
    setStorageError(null);
    setSessionBootstrapping(true);
    setBootstrapDelayed(false);
    try {
      await authSessionManager.retryStorageBootstrap();
      const restored = await authSessionManager.bootstrapAppSession();
      if (!mountedRef.current) return;
      adoptRestoredOwner(restored);
      setAppSession(restored);
      applySession(authSessionManager.getLastKnownSession());
    } catch (error) {
      if (!mountedRef.current) return;
      setStorageError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      if (mountedRef.current) {
        setSessionBootstrapping(false);
        setBootstrapDelayed(false);
      }
    }
  }, [applySession, adoptRestoredOwner]);

  // §5 — every Supabase-session-producing action first leaves any active federated identity via the manager's
  // single-active-source guard (fails closed on storage_error), so two identities never coexist.
  const applyNewSupabaseSession = useCallback((next: Session | null) => {
    applySession(next);
    setAppSession(supabaseToAppSession(next));
  }, [applySession]);

  const signInWithPassword = useCallback(
    async (credentials: PasswordCredentials) => {
      await authSessionManager.prepareForSupabaseAuthentication();
      const result = await signInWithPasswordAction(credentials);
      applyNewSupabaseSession(result.session);
      return result;
    },
    [applyNewSupabaseSession],
  );

  const signUpWithPassword = useCallback(
    async (credentials: PasswordCredentials) => {
      await authSessionManager.prepareForSupabaseAuthentication();
      const result = await signUpWithPasswordAction(credentials);
      if (result.session) applyNewSupabaseSession(result.session);
      return result;
    },
    [applyNewSupabaseSession],
  );

  const establishProvisionalSession = useCallback(
    async (email: string, password: string, expectedPrincipal: AuthPrincipalSnapshot) => {
      // §9.3 TOCTOU GUARD — DELEGATED, not performed here, and covering the WHOLE sign-in rather than its
      // first instruction. This provider is a React consumer of the session lifecycle, so anything it can
      // check has already been through a render and may lag the manager by a commit; and a check placed
      // just before the adoption would still be a check followed by a mutation. The manager therefore
      // mediates both ends: it opens a transaction here and refuses to install the result later if
      // anything changed who is signed in in between.
      const ticket = await authSessionManager.beginProvisionalAuthentication(expectedPrincipal);

      let result: Awaited<ReturnType<typeof establishProvisionalSessionAction>>;
      try {
        result = await establishProvisionalSessionAction(email, password);
      } catch (error) {
        authSessionManager.abortProvisionalAuthentication(ticket);
        throw error;
      }

      // A refused commit throws, and needs no cleanup here: the candidate came from an isolated exchange
      // and the manager stops before touching the global client, so nothing was installed and nothing of
      // the winner's needs restoring. The candidate is simply dropped.
      const committed = await authSessionManager.commitProvisionalAuthentication(ticket, result.session);

      // Everything downstream uses what was actually INSTALLED, not the candidate this closure still
      // holds. Supabase can refresh or normalize a session during setSession, and republishing the
      // candidate here would put superseded credentials into React state — and from there into
      // /auth/context, the checkout submit, and the next refresh.
      applyNewSupabaseSession(committed.session);
      return {
        ...result,
        session: committed.session,
        user: committed.session.user,
        principalSnapshot: committed.principalSnapshot,
      };
    },
    [applyNewSupabaseSession],
  );

  /** Stable delegate so an async operation reads the lifecycle owner, never a rendered copy. */
  const getPrincipalSnapshot = useCallback(() => authSessionManager.getPrincipalSnapshot(), []);

  // OTP verify actions produce a Supabase session via onAuthStateChange; still route through the guard first.
  const verifyEmailOtp = useCallback(
    async (email: string, token: string) => {
      await authSessionManager.prepareForSupabaseAuthentication();
      return verifyEmailOtpAction(email, token);
    },
    [],
  );
  const verifyPhoneOtp = useCallback(
    async (phoneE164: string, token: string) => {
      await authSessionManager.prepareForSupabaseAuthentication();
      return verifyPhoneOtpAction(phoneE164, token);
    },
    [],
  );
  const verifyEmailRecoveryOtp = useCallback(
    async (email: string, token: string) => {
      await authSessionManager.prepareForSupabaseAuthentication();
      return verifyEmailRecoveryOtpAction(email, token);
    },
    [],
  );

  const logoutCurrentDevice = useCallback(async () => {
    try {
      await authSessionManager.logoutCurrentDevice();
      if (!mountedRef.current) return;
      applySession(null);
      setAppSession(null);
      setStorageError(null);
      clearUserScopedQueries(queryClient);
    } catch (error) {
      if (!mountedRef.current) throw error;
      // A secure-clear failure surfaces as storage_error; the caller must NOT toast "logged out".
      if (isAuthStorageError(error) || (error as { code?: string })?.code === "storage_error") {
        setStorageError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }, [applySession, queryClient]);

  const logoutAllDevices = useCallback(async () => {
    try {
      await authSessionManager.logoutAllDevices();
      if (!mountedRef.current) return;
      applySession(null);
      setAppSession(null);
      setStorageError(null);
      clearUserScopedQueries(queryClient);
    } catch (error) {
      if (!mountedRef.current) throw error;
      if (isAuthStorageError(error) || (error as { code?: string })?.code === "storage_error") {
        setStorageError(error instanceof Error ? error : new Error(String(error)));
      }
      throw error;
    }
  }, [applySession, queryClient]);

  const refetchRef = useRef(authContextQuery.refetch);
  refetchRef.current = authContextQuery.refetch;
  const refetch = useCallback(async () => refetchRef.current(), []);

  const value: AuthContextValue = useMemo(
    () => ({
      user,
      profile,
      role,
      roles,
      context,
      session,
      appSession,
      verifiedContextEpoch,
      principalOwner,
      principalTransitionVersion: principalTransition.version,
      getPrincipalSnapshot,
      authSource: appSession?.authSource ?? null,
      capabilities: context?.capabilities ?? null,

      authStatus,
      sessionInitializing: authStatus === "bootstrapping",
      bootstrapDelayed,
      contextLoading: contextBootstrapping,
      contextReady: authStatus === "authenticated_ready",
      loading: authStatus === "bootstrapping" || authStatus === "authenticated_loading_context",
      isOffline,
      storageError,

      isAdmin,
      isMerchantUser: merchantUser,
      isMerchantApplicant: merchantApplicant,
      isAgent: agentUser,

      refetch,
      retryStorageBootstrap,

      signInWithPassword,
      signUpWithPassword,
      resendSignupEmail: resendSignupEmailAction,

      // OTP verification returns a real Supabase session; the provider's own
      // onAuthStateChange path then drives state exactly as it does for password login.
      requestEmailOtp: requestEmailOtpAction,
      verifyEmailOtp,
      requestPhoneOtp: requestPhoneOtpAction,
      verifyPhoneOtp,
      requestEmailPasswordRecovery: requestEmailPasswordRecoveryAction,
      verifyEmailRecoveryOtp,
      updatePasswordInSession: updatePasswordInSessionAction,

      startPhoneChange: startPhoneChangeAction,
      verifyPhoneChange: verifyPhoneChangeAction,
      getVerifiedAuthPhone: getVerifiedAuthPhoneAction,

      establishProvisionalSession,
      logoutCurrentDevice,
      logoutAllDevices,
    }),
    [
      user,
      profile,
      role,
      roles,
      context,
      session,
      appSession,
      verifiedContextEpoch,
      principalOwner,
      principalTransition.version,
      getPrincipalSnapshot,
      authStatus,
      bootstrapDelayed,
      contextBootstrapping,
      isOffline,
      storageError,
      isAdmin,
      merchantUser,
      merchantApplicant,
      agentUser,
      refetch,
      retryStorageBootstrap,
      signInWithPassword,
      signUpWithPassword,
      establishProvisionalSession,
      logoutCurrentDevice,
      logoutAllDevices,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
