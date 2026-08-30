# Auth Storage Design — Native Encrypted Session

## 1. Threat model this addresses

| Threat                                                                 | Before                                    | After                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Device data extraction (root/jailbreak, ADB backup, WebView data dump) | plaintext refresh token in `localStorage` | token sealed in Keychain / Android Keystore                          |
| App reinstall by a new device owner (iOS keychain survives deletion)   | undefined; session could persist          | install marker absent → keychain auth entry purged before first read |
| Partial migration leaving the user signed out                          | n/a                                       | legacy copy kept until the encrypted copy is verified by read-back   |
| Silent fallback to plaintext when the keystore is unavailable          | n/a                                       | fail closed: throw, surface `storage_error`, never write plaintext   |

## 2. Storage matrix

| Platform             | Adapter                      | Key                             | Backing store                                      |
| -------------------- | ---------------------------- | ------------------------------- | -------------------------------------------------- |
| Native (iOS/Android) | `NativeSecureAuthStorage`    | `DilMart.store.auth.session.v1` | SecureStorage plugin → Keychain / Android Keystore |
| Web                  | `createBrowserAuthStorage()` | `sb-<project-ref>-auth-token`   | `window.localStorage`                              |

Web keeps the historical Supabase key on purpose: changing it would silently sign
out every existing browser session. The native key is namespaced under
`DilMart.store.` so it never collides with other secure entries.

`DilMart.store.install.marker.v1` lives in Capacitor **Preferences**, not
SecureStorage — deliberately. Preferences is wiped by app uninstall on both
platforms, which is exactly the signal "this is a fresh install". Storing the
marker in the keychain would defeat reinstall detection on iOS.

## 3. Bootstrap state machine

```
read marker from Preferences
├── marker present
│   ├── read legacy session (fail closed if unreadable)
│   ├── legacy absent -> done (alreadyBootstrapped)
│   └── legacy present -> scrub legacy residue, verify absence
│       (Secure remains source of truth; never remigrate legacy)
└── marker absent
    1) Read legacy session (fail closed if unreadable)
    2) Secure write (if legacy valid)
    3) Secure read-back verification
    4) Install marker write
    5) Install marker read-back verification
    6) Legacy delete
    7) Legacy absence verification
```

Special guard:

```
marker present + secure absent + legacy present
-> delete legacy residue only
-> do not revive a logged-out session by remigrating legacy
```

Invariants encoded here:

- The legacy key is removed **only** on the verified-migration path.
- The marker is written **only** when the whole routine succeeded, so a failure
  is always retried on the next launch.
- `SecureStorage.clear()` is never called; only the single auth key is removed.

## 4. Concurrency

`ready()` memoises one promise. Every `getItem`/`setItem`/`removeItem` awaits it,
so Supabase can never observe a half-migrated store, and N simultaneous callers
produce exactly one bootstrap run. The promise is created eagerly at module load
(with a no-op `.catch` attached to avoid an unhandled rejection) so the keystore
is usually warm before the first Supabase read.

`retry()` discards a failed promise and the cached plugin handles, which is what
the Arabic retry button drives.

## 5. Fail-closed policy

Any SecureStorage or Preferences error becomes `AuthStorageUnavailableError`;
migration-specific failures become `StorageBootstrapError`. Neither is ever
classified as an auth failure, so neither can trigger a logout. There is no
`localStorage` fallback on native — the unit test
`"never falls back to localStorage when secure reads fail"` asserts that the
legacy storage is not even read in that path.

The user sees `AuthStorageErrorScreen` (Arabic, RTL):

- title: `تعذّر الوصول إلى التخزين الآمن`
- body: `لم نتمكن من فتح مخزن الجلسة المشفّر على جهازك. تأكد من فتح قفل الجهاز ثم أعد المحاولة.`
- action: `إعادة المحاولة`

## 6. Session lifecycle ownership

`authSessionManager` is the only module that calls `getSession`,
`refreshSession`, `signOut`, `onAuthStateChange`, `startAutoRefresh`, or
`stopAutoRefresh`. `AuthProvider` is the only component that subscribes to auth
state, app state, and connectivity. `npm run auth:guard` enforces the first half
of that statement mechanically.

Refresh trigger points, all funnelled through `refreshSessionSingleFlight`:

| Trigger                           | Reason tag                  |
| --------------------------------- | --------------------------- |
| Access token within 60s of expiry | `token_expiring`            |
| Native app returns to foreground  | `app_resume`                |
| Connectivity restored             | `network_online`            |
| Web tab becomes visible           | `tab_focus`                 |
| API request returned 401          | `api_unauthorized`          |
| `/auth/context` returned 401      | `auth_context_unauthorized` |

## 7. Logout semantics

`logoutCurrentDevice()` calls `supabase.auth.signOut({ scope: "local" })` — a
session on the user's other devices is theirs, not ours to kill — and then clears
local state even if that network call failed.

Cleared: the secure auth key and the legacy `localStorage` auth key.
Not cleared: everything else. Specifically **not** `SecureStorage.clear()` and
**not** `localStorage.clear()`.

Query caches removed on sign-out (`USER_SCOPED_QUERY_KEYS`):

```
auth-context, notifications, admin-notifications, user-notifications,
customer-profile, customer-addresses, customer-orders, customer-orders-last,
customer-order-last-detail, loyalty-preview
```

`marketplace-*` caches are preserved so a signed-out user still browses instantly.

## 8. Transaction evidence status

`native-secure-auth-storage` transaction cases `A–I` are PASS in unit evidence.

## 9. Logging policy

No token, refresh token, session blob, or password is ever logged. Refresh
reasons and outcome statuses are plain enums chosen so diagnostics never require
printing credential material. The migration path compares the legacy blob to the
read-back value by equality only — the value is never emitted.
