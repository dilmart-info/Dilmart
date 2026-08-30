# Phase — DilMart-Store Native Auth Storage & Session Lifecycle

- **Base SHA:** `7bd1bbf`
- **Branch:** `feat/native-auth-session-lifecycle`
- **Task class:** E (Launch Closure)
- **Status:** CODE + ANDROID AUTH LIFECYCLE VALIDATION COMPLETE / SUPERVISOR REVIEW PENDING

---

## 1. Problem Statement

Before this phase the Capacitor build persisted the Supabase session in the
WebView's `localStorage`. Three consequences made this a launch blocker:

1. **Plaintext refresh token at rest.** A rooted/jailbroken device, an ADB backup,
   or any WebView data dump exposed a long-lived refresh token that grants full
   account access, including order placement and address/PII reads.
2. **Reinstall bleed-through.** iOS keychain items survive app deletion, and
   there was no install marker, so there was no defined behaviour for a session
   that outlives an uninstall.
3. **Accidental sign-outs.** `use-auth.tsx` owned session bootstrap _per hook
   instance_, and its failure handling conflated "offline" with "session dead":
   - an 8-second safety timer, plus an explicit `signOut()` when the stored
     session looked expired at cold start;
   - `visibilitychange` called `refreshSession()` and signed out on _any_ error;
   - `/auth/context` returning **403** (authenticated but not permitted) called
     `signOut()`, which turned an authorization message into a logout.

Because every component calling `useAuth()` re-ran that effect, the app also had
N `onAuthStateChange` subscriptions and N concurrent refresh attempts.

---

## 2. Invariants This Phase Must Preserve

| #   | Invariant                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| I1  | On native, the session is only ever persisted inside the OS keystore/keychain. No plaintext fallback.             |
| I2  | A legacy session is deleted only after the encrypted copy is written _and_ read back byte-for-byte.               |
| I3  | A fresh install never inherits a session from a previous install.                                                 |
| I4  | Transient network failure never clears the session.                                                               |
| I5  | Only definitive refresh-token rejection clears the session.                                                       |
| I6  | `403` is an authorization verdict and never triggers a logout.                                                    |
| I7  | Logout clears the auth keys only — cart, marketplace cache, and preferences survive.                              |
| I8  | At most one in-flight refresh, one `onAuthStateChange`, one `appStateChange` listener, one connectivity listener. |
| I9  | Backend remains the sole authority for roles via `/auth/context`.                                                 |
| I10 | Tokens and passwords are never logged.                                                                            |

---

## 3. Architecture

### 3.1 Module graph (acyclic by construction)

```txt
auth-storage-keys ─┐
supported-storage ─┤
browser-auth-storage ─┐
native-secure-auth-storage ─┤
auth-errors ────────────────┴─> auth-storage ──> integrations/supabase/client
                                     │                      │
                                     └─> auth-storage-bootstrap
                                                            │
                              auth-session-manager <────────┘
                                     │
                    ┌────────────────┼────────────────┐
              auth-actions      api-core          AuthProvider
                                     │                 │
                                api-client ────────────┘
```

The one rule that keeps this acyclic: **`auth-storage.ts` must never import the
Supabase client.** The client imports the storage; the session manager imports
the client. `scripts/auth/check-auth-lifecycle-boundary.mjs` enforces the
downstream half of this (nobody outside `src/lib/auth` may drive the session).

### 3.2 Storage keys

| Key                               | Store                                       | Purpose                                       |
| --------------------------------- | ------------------------------------------- | --------------------------------------------- |
| `DilMart.store.auth.session.v1`   | SecureStorage (Keychain / Android Keystore) | Session blob on native                        |
| `DilMart.store.install.marker.v1` | Capacitor Preferences                       | Proof this install already bootstrapped       |
| `sb-<ref>-auth-token`             | `localStorage`                              | Active key on web; migration source on native |

### 3.3 Install bootstrap (single-flight, native only)

```txt
marker absent path:
1) Read legacy session (fail closed if unreadable)
2) Secure write
3) Secure read-back verification
4) Install marker write
5) Install marker read-back verification
6) Legacy delete
7) Legacy absence verification
```

Marker-present recovery:

```txt
Marker present + Legacy residue:
- Secure storage is source of truth
- scrub Legacy residue
- never remigrate Legacy into Secure

Marker present + Secure absent + Legacy present:
- delete Legacy residue
- do not revive a logged-out session
```

Every `getItem`/`setItem`/`removeItem` awaits this promise, so Supabase cannot
read a half-migrated store. On failure the marker stays unset and the next launch
retries; `retry()` exists for the in-app retry affordance.

### 3.4 AuthStatus

```ts
"bootstrapping" | // restoring the persisted session
  "unauthenticated" |
  "authenticated_loading_context" |
  "authenticated_ready" |
  "authenticated_offline" | // session intact, device offline
  "storage_error"; // keystore unreadable — retryable, NOT a logout
```

`sessionInitializing` is kept as an alias for `authStatus === "bootstrapping"` so
existing consumers keep working.

### 3.5 Refresh failure classification

| Signal                                                                                                                        | Class      | Action                               |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------ |
| `refresh_token_not_found`, `invalid refresh token`, `invalid_grant`, `session_not_found`, 400/401/403 from the token endpoint | definitive | local sign-out + clear auth keys     |
| `Failed to fetch`, abort/timeout, `navigator.onLine === false`, 408/429/5xx                                                   | transient  | keep the session, retry later        |
| `AuthStorageUnavailableError`, `StorageBootstrapError`                                                                        | storage    | `storage_error` UI, keep the session |
| anything unclassified                                                                                                         | transient  | bias toward keeping the session      |

---

## 4. Behaviour Changes

| Area                              | Before                                   | After                                                          |
| --------------------------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Native session at rest            | plaintext `localStorage`                 | encrypted keystore/keychain                                    |
| Session bootstrap                 | per `useAuth()` caller                   | once, in `AuthProvider`                                        |
| `onAuthStateChange`               | one per hook instance                    | exactly one                                                    |
| Cold start with an expiring token | explicit `signOut()`                     | single-flight refresh                                          |
| 8s safety timer                   | stopped the spinner _and_ could sign out | stops the spinner only                                         |
| Tab focus refresh failure         | `signOut()` on any error                 | logout only on definitive failure                              |
| `/auth/context` 401               | `signOut()`                              | one refresh + one retry, then definitive                       |
| `/auth/context` 403               | `signOut()`                              | surfaced as an error, session kept                             |
| API 401                           | no retry                                 | one single-flight refresh + one replay                         |
| Offline                           | indistinguishable from signed out        | `authenticated_offline`, session kept                          |
| Logout scope                      | global `signOut()`                       | `signOut({ scope: "local" })`                                  |
| Logout cache clearing             | 4 query keys, ad hoc per call site       | 10 user-scoped keys in one place; marketplace caches preserved |

---

## 5. Test Coverage

`src/lib/auth/*.test.ts(x)` — 22 targeted transaction tests in `native-secure-auth-storage` (A–I) + broader auth coverage:

- `auth-storage-keys` — project-ref parsing, legacy key derivation, session-blob validation
- `auth-errors` — definitive vs transient vs storage classification
- `native-secure-auth-storage` — migration transaction order, marker read/write verification, marker-present residue scrub, fail-closed unreadable legacy reads, single-flight, retry safety, targeted clearing, logout verification failures
- `auth-storage` — native vs web adapter and key selection, targeted web clearing
- `auth-session-manager` — 60s refresh threshold, single-flight coalescing, definitive → logout, transient → keep, storage error, local-scope sign-out, bootstrap ordering
- `api-auth-retry` — token attachment, 401 refresh + single retry, no retry loop, 403 no refresh/logout, `accessToken` override honoured, public GETs untouched
- `AuthProvider` — unauthenticated, ready, `storage_error`, `authenticated_offline`, 401 retry, 403 no sign-out, `SIGNED_OUT` cache clearing

---

## 6. Guards

`npm run auth:guard` fails when:

1. `src/integrations/supabase/client.ts` contains `storage: localStorage`, or is
   missing `storage: authStorage` / `storageKey: platformStorageKey`.
2. `supabase.auth.{getSession,refreshSession,startAutoRefresh,stopAutoRefresh,onAuthStateChange,signOut}(`
   appears outside `src/integrations/supabase/client.ts` or `src/lib/auth/**`.

Comments are stripped before scanning. Sign-in style calls
(`signInWithPassword`, `signUp`, `resend`) are intentionally not restricted —
they are wrapped in `auth-actions.ts` but do not affect lifecycle ownership.

---

## 7. Residual Risk

| Risk                                                     | Mitigation / Status                                                                                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Keystore unavailable while the device is locked          | fail closed → `storage_error` + Arabic retry screen. Needs device validation.                                                           |
| Android Keystore key invalidated by a credential change  | secure read fails → `storage_error`; user re-authenticates. Needs device validation.                                                    |
| Migration interrupted mid-write                          | legacy copy retained, marker unset, next launch retries. Unit-tested; needs device validation.                                          |
| Offline route access with no cached `/auth/context`      | route guards fall back to the session check; role-gated backoffice routes still require cached context and otherwise redirect to login. |
| Two Network listeners on native (auth + offline overlay) | intentional and separate concerns; the auth listener is the only one that refreshes tokens.                                             |
