# Closure Report — Native Auth Storage & Session Lifecycle

- **Status:** `CODE + ANDROID AUTH LIFECYCLE VALIDATION COMPLETE` / `SUPERVISOR REVIEW PENDING`
- **Base SHA:** `7bd1bbf3580fb12f086677de115b29c2b76d7646`
- **CODE_HEAD_SHA:** `80e4a0f1a624f66c3c8b171b6666fd9a8eab0757`
- **CURRENT_PR_HEAD:** tracked in PR
- **Branch:** `feat/native-auth-session-lifecycle`
- **PR:** https://github.com/cylendralabs-blip/DilMart-Store/pull/64 (Draft)
- **Verdict:** PASS WITH NOTES — Transaction-safety patch validated (unit A–F + same-key upgrade + Final CI device FAIL=0). Web Admin/Merchant/Agent smoke PASS via service-role SQL provisioning. Supervisor review still required; not Phase Complete.

---

## 1. What Was Implemented

### New auth layer — `src/lib/auth/`

| File                            | Responsibility                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `auth-storage-keys.ts`          | Canonical keys, Supabase project-ref parsing, persisted-session shape validation                                        |
| `supported-storage.ts`          | Shared `SupportedStorage` / `AsyncSupportedStorage` types (breaks the import cycle)                                     |
| `browser-auth-storage.ts`       | Web adapter over `localStorage`, with an in-memory fallback for hardened contexts                                       |
| `native-secure-auth-storage.ts` | Encrypted native adapter + single-flight install/migration bootstrap, fully dependency-injectable                       |
| `auth-storage-bootstrap.ts`     | `ensureAuthStorageReady()`, `getAuthStorageBootstrapError()`, migration flags, retry                                    |
| `auth-storage.ts`               | Platform selection: `isNativePlatform`, `platformStorageKey`, `authStorage`, `clearPersistedAuthSession()`              |
| `auth-errors.ts`                | `AuthStorageUnavailableError`, `StorageBootstrapError`, definitive/transient classification, Arabic UI copy             |
| `auth-events.ts`                | Refresh reasons/outcomes, user-scoped query-key list                                                                    |
| `auth-session-manager.ts`       | Singleton owning bootstrap, `getValidAccessToken()`, single-flight refresh, local-scope logout, targeted state clearing |
| `auth-actions.ts`               | `signInWithPassword`, `signUpWithPassword`, `resendSignupEmail`, `establishProvisionalSession`, `logoutCurrentDevice`   |
| `AuthContext.tsx`               | Context type with the new `AuthStatus` union and default value                                                          |
| `AuthProvider.tsx`              | Single owner of the session lifecycle and the `/auth/context` query                                                     |

### New elsewhere

- `src/hooks/use-auth.ts` — thin `useContext` reader (replaces `use-auth.tsx`, deleted)
- `src/components/auth/AuthStorageErrorScreen.tsx` — Arabic RTL retry screen
- `scripts/auth/check-auth-lifecycle-boundary.mjs` + `npm run auth:guard`
- 7 test files under `src/lib/auth/`; transaction sequence suite is `22 PASS (A–I)`

### Changed

| File                                                                                                                                 | Change                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/integrations/supabase/client.ts`                                                                                                | `storage: authStorage`, `storageKey: platformStorageKey`, `detectSessionInUrl: !isNativePlatform`. `storage: localStorage` removed. |
| `src/app/AppProviders.tsx`                                                                                                           | `AuthProvider` mounted between `QueryClientProvider` and the rest                                                                   |
| `src/components/guards/RequireAuthenticatedUser.tsx`                                                                                 | Handles `bootstrapping`, `storage_error`, `authenticated_offline`                                                                   |
| `src/components/guards/BackofficeRouteGuards.tsx`                                                                                    | Same, for admin/merchant/agent guards                                                                                               |
| `src/lib/api-core.ts`                                                                                                                | `getValidAccessToken()`; one single-flight refresh + one replay on 401; 403 untouched; `accessToken` override never swapped         |
| `src/lib/api-client.ts`                                                                                                              | `downloadJenniSticker` uses `getValidAccessToken()`                                                                                 |
| `src/lib/api/merchant.ts`                                                                                                            | Multipart import upload uses `getValidAccessToken()`                                                                                |
| `src/pages/Auth.tsx`                                                                                                                 | `useAuth()` actions instead of direct `supabase.auth`                                                                               |
| `src/pages/Checkout.tsx`                                                                                                             | `establishProvisionalSession()`, then waits for context                                                                             |
| `src/pages/Profile.tsx`, `src/components/IconNav.tsx`                                                                                | `logoutCurrentDevice()`                                                                                                             |
| `src/components/AdminLayout.tsx`, `src/components/MerchantLayout.tsx`, `src/pages/AgentOrders.tsx`, `src/pages/merchant/Pending.tsx` | `logoutCurrentDevice()`                                                                                                             |
| `src/pages/admin/Login.tsx`, `src/pages/merchant/Login.tsx`                                                                          | `signInWithPassword()` / `logoutCurrentDevice()`                                                                                    |
| `src/components/CapacitorAppWrapper.tsx`                                                                                             | Documented that AuthProvider owns auth lifecycle; network listener now cancel-safe with `void handle.remove()`                      |
| `scripts/architecture/supabase-guard-allowlist.json`                                                                                 | Reduced from 16 entries to 4 — only the auth layer and the realtime module import the client now                                    |
| `package.json`                                                                                                                       | `auth:guard` script                                                                                                                 |
| `src/app/forbidden-native-routes.test.tsx`, `src/components/native-chrome-boundary.test.tsx`                                         | `useAuth` mocks extended for the new shape                                                                                          |

---

## 2. Validation Results

```text
VITEST            = 86 passed / 14 files
AUTH_GUARD        = PASS
ARCH_GUARD        = PASS (0 current violations)
WEB_BUILD         = PASS
MOBILE_BUILD      = PASS
MOBILE_BOUNDARY   = PASS (FORBIDDEN_MODULE_COUNT=0, CONTENT_MARKER_HITS=0)
LINT              = 464 problems (452 errors, 12 warnings)
```

Evidence: `governance/evidence/native-auth-session-lifecycle/` (`03`–`09` per command,
`10-final-revalidation.txt` for the re-run after the final AuthProvider hardening pass).

Lint comparison against the base commit `7bd1bbf`:

- 0 problems reported in any new or modified auth file. Per-file attribution of
  all 12 warnings is recorded in `10-final-revalidation.txt`; none of the listed
  files are touched by this phase.
- Errors went **453 → 452** (one pre-existing `no-explicit-any` removed with the
  old Checkout sign-in block).
- Warnings went 9 → 12 versus the _older_ `capacitor8-native-foundation`
  evidence; all three additions are `react-refresh/only-export-components` in
  `src/app/CustomerRoutes.tsx` and `src/app/WebBackofficeRoutes.tsx`, both
  introduced by base commit `7bd1bbf` (#63), not by this phase.

The auth boundary guard was verified in both directions: it fails on
`storage: localStorage` in the client and on a probe file calling
`supabase.auth.signOut()` outside the allowlist, and passes on the current tree.

TypeScript: `tsc --noEmit` reports only the pre-existing baseline errors
(`ProductCardProduct` shape mismatches, `merchant-push` `Uint8Array`, etc.).
No new type errors in auth files.

---

## 3. Edge Cases Handled

- Fresh install with a legacy `localStorage` session → verified migration, then legacy deletion
- Fresh install with a keychain session surviving an uninstall → purged
- Migration write failure or read-back mismatch → legacy retained, marker unset, retried next launch
- Malformed/partial legacy blob → not migrated, treated as a fresh install
- Secure storage unavailable → `storage_error`, Arabic retry, session never cleared
- Concurrent reads during bootstrap → one bootstrap run
- Concurrent refresh requests → one network round-trip
- Access token expiring within 60s → proactive refresh
- Offline resume → `authenticated_offline`, then single-flight revalidation when back online
- API 401 → one refresh + one replay, never a retry loop
- API/context 403 → `ApiError`, no sign-out
- Logout → auth keys only; cart and marketplace caches preserved
- `signOut()` network failure → local state still cleared

---

## 4. Known Limitations

1. **Offline role decisions** for backoffice still need cached `/auth/context`.
2. **No biometrics** and no device-local re-auth prompt (out of scope).
3. **No "sign out on all devices"** — logout is local-scope only by design.
4. **Two Capacitor Network listeners on native** — AuthProvider + CapacitorAppWrapper.
5. **iOS real Keychain device** remains signing-blocked; Simulator/Generic CI PASS.

---

## 5. Risks

| Risk                                                                | Severity | Note                                                                                         |
| ------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| Keystore read failure blocks login on some OEM Android builds       | Medium   | Fails closed to a retry screen rather than a plaintext fallback. Device validation required. |
| Migration edge case on a very old stored session shape              | Low      | Shape validation rejects it, user re-authenticates once.                                     |
| `AuthProvider` mounted above `TooltipProvider` changes render order | Low      | Web + mobile builds and all route tests pass.                                                |
| Reduced Supabase allowlist could break an unnoticed import          | Low      | `arch:guard` and `auth:guard` both pass on the full tree.                                    |

---

## 6. Remaining Work Before Closure

- [x] `npx cap sync android/ios` + plugins registered
- [x] Android device validation (force-stop, offline/reconnect on `/profile`, logout, fresh reinstall)
- [x] Same-key Phase2→Phase3 `adb install -r` migration
- [x] LAUNCH + NATIVE CI green on micro-patch head
- [x] Draft PR opened (#64)
- [ ] Supervisor review (do not Ready/merge / do not mark Phase Complete)

## 7. Final validation snapshot

```text
TRANSACTION_TESTS=22 PASS (A–I)
WEB_CUSTOMER_SMOKE=PASS
WEB_ADMIN_SMOKE=PASS
WEB_MERCHANT_SMOKE=PASS
WEB_AGENT_SMOKE=PASS
WEB_ROLE_TEST_ACCOUNT_CLEANUP=PASS
```
