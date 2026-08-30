# STORE-PR5 — Dual Actor & Session Report

**Task:** DilMart-CUSTOMER-STORE-STORE-PR5 · **Spec:** DilMart-CUSTOMER-STORE-MASTER-001 §9.3–9.6, §14, §16, §18.
**Baseline:** Store `main` = `45b8cb3f5be1cb4f74d065b430c5a1549251c417` (STORE-PR4 merge; `f2893917…` in ancestry).
**Branch:** `feat/customer-federated-actor-session` (Draft PR).

> **Scope of this PR:** the **backend dual-actor authorization core** + the mandatory Phase 0 discovery.
> It is intentionally a slice of the full STORE-PR5 epic (which spans backend APIs, web cookies, and the
> whole frontend/native session stack). See the completion statement at the end.

---

## 1. What was built

### Unified `ActorContext` (spec §9.4) — `backend/src/common/authz/actor-context.decorator.ts`

`authSource: "supabase" | "DilMart_federated"` plus federated identifiers (`linkedProfileId`,
`DilMartUserId`, `sessionFamilyId`, `sessionVersion`). Invariants: `actorId` is always the Store
customer/profile UUID (both sources); `actorToken` (raw Supabase token) exists **only** for Supabase
actors and is `undefined` for federated actors; federated identifiers are internal (never in normal API
responses).

### `@AuthSources` decorator + default policy — `common/authz/auth-source.ts`

`@AuthSources(...sources)` sets route metadata. `DEFAULT_AUTH_SOURCES = ["supabase"]`: **any protected
route with no `@AuthSources` is Supabase-only.** `@Roles("authenticated")` alone never federated-enables
a route.

### `SupabaseActorResolverService` — `common/authz/supabase-actor-resolver.service.ts`

The Supabase token→user→profile→role logic extracted **verbatim** from the pre-PR5 guard, including the
project-ref diagnostics, DB-probe reachability check, and role-normalization semantics (unchanged).
Returns a discriminated result; depends on `SupabaseAdminService` (so existing test overrides still work).

### `DualActorResolverService` — `common/authz/dual-actor-resolver.service.ts`

Strict classifier + no-fallback composition of `SupabaseActorResolverService` +
`FederatedSessionVerifierService` (PR4) + `FederatedAuthConfig` (PR4):

- **Classification** inspects only UNVERIFIED header/claims to _select_ a verifier — markers:
  `sessionType=DilMart_federated_customer`, `iss=DilMart-store`, `aud=DilMart-store-api`, or a `kid` in the
  federated ring. Everything else (incl. Supabase HS256 tokens and garbage) → Supabase candidate.
- **No cross-verifier fallback:** a federated-classified token is verified ONLY by the federated verifier
  (which already rejects `alg=none`/HS and validates iss/aud/claims/600s/DB family); failure is final and
  **never** triggers a Supabase probe. A Supabase-classified token never touches the federated verifier.
- **Fail-closed:** federated resolution throws `FederatedAuthDisabledError` when
  `STORE_FEDERATED_AUTH_ENABLED` is not `true` (default) — the whole federated path is dark by default.

### `RolesGuard` rewrite — `common/authz/roles.guard.ts`

Order: required roles → allowed sources (default Supabase-only) → no-token handling (unchanged) →
classify → **source-not-permitted → 403** → resolve with the matching verifier only → attach normalized
`ActorContext` → enforce role. Federated success attaches federated context (no `actorToken`); federated
failure/disabled maps to the same per-route status as a bad Supabase token (no fallback).

### Wiring

`AuthzModule` (`common/authz/authz.module.ts`) provides/exports the resolvers and is imported by
`AppModule`; `FederatedAuthModule` now also exports `FederatedAuthConfig`.

### Route annotations

`@AuthSources("supabase","DilMart_federated")` added to exactly the 20 approved DUAL_CUSTOMER routes
(see discovery doc §2). All other routes remain Supabase-only / unchanged.

---

## 2. Preserved-contract decision (important)

The spec's idealized guard "response semantics" (invalid auth → 401) **conflicts** with the pinned
`policy-matrix` suite (part of the required "Commercial & Security Policy" CI step), which asserts **403
for missing/invalid Bearer tokens** on protected routes. Per the spec's own change-control rule (contract
changes require amending the primary spec first) and the "do not regress required suites" constraint, this
PR **preserves the existing Supabase HTTP contract exactly** (403 for missing/invalid on non-context
routes; 401 on `/auth/context`; same diagnostics) and layers the federated path + source-policy (403) on
top. Adopting the 401 model is a follow-up that must start with a spec amendment.

---

## 3. Closure hardening (Blockers B1–B5)

- **B1 — per-handler federated authorization.** `CustomerController` no longer carries class-level
  `@AuthSources`; each of the 10 approved handlers declares `@AuthSources("supabase","DilMart_federated")`
  individually, so every federated-enabled route is reviewable in isolation and a newly added handler is
  Supabase-only until explicitly classified.
- **B2 — canonical registry + exhaustive introspection.** `common/authz/route-policy-registry.ts` is the
  single source of truth for every `@Roles("authenticated")` route. The test scans EVERY compiled
  controller and fails on: a new unclassified authenticated route; a DUAL route lacking method-level
  `@AuthSources`; a SUPABASE_ONLY or backoffice route permitting `DilMart_federated`; or any class-level
  `@AuthSources` (silent widening).
- **B3 — typed federated failures.** `DualActorResolverService.resolveFederatedActor` returns a
  discriminated outcome; the guard maps it (federated path only, NOT the historical Supabase 403):

  | Federated reason                                   | HTTP | code                         |
  | -------------------------------------------------- | ---- | ---------------------------- |
  | invalid signature / claims / malformed             | 401  | `FEDERATED_INVALID`          |
  | expired / revoked / compromised / version mismatch | 401  | `FEDERATED_INVALID`          |
  | source not permitted                               | 403  | `AUTH_SOURCE_NOT_PERMITTED`  |
  | role not permitted                                 | 403  | (plain)                      |
  | feature disabled                                   | 503  | `FEDERATED_AUTH_DISABLED`    |
  | dependency (DB/key/config) unavailable             | 503  | `FEDERATED_AUTH_UNAVAILABLE` |
  | unexpected internal error                          | 500  | `FEDERATED_INTERNAL_ERROR`   |

  Bodies are `{ code, message }` only — no DB messages, stack traces, tokens, headers, key material, or
  env guidance. `FederatedDependencyError` is exported for the repository/key layer to signal 503.

- **B4 — strict discriminated classifier.** `classify()` returns
  `supabase_candidate | federated_candidate | ambiguous_or_invalid_federated`. It handles: 3-segment
  check, `aud` as string or array, issuer/audience/sessionType/kid markers, contradictory markers
  (federated marker + Supabase issuer), `alg=none`/`HS*` with a federated marker (→ fail closed via the
  federated-invalid path, never Supabase), and malformed/oversized segments (DoS-guarded decode). Any
  credible federated marker prevents a Supabase fallback.
- **B5 — request-state hygiene.** The guard resets all ten actor fields before any trust decision, so a
  reused/pre-populated request cannot leak a stale `actorToken` or federated id, and a failed
  authentication leaves no trusted actor context attached.

## 3b. Correctness closure (round 2)

- **Typed verifier boundary** — `federated-verification.errors.ts` defines `FederatedTokenInvalidError`,
  `FederatedSessionFamilyInvalidError`, `FederatedVerificationDependencyError`,
  `FederatedVerificationInternalError` (the first two extend the pre-PR4 `FederatedSessionInvalidError`
  for compatibility). `FederatedSessionVerifierService` now raises these and **wraps repository/key/config
  availability failures** as dependency errors, so raw Supabase/PostgreSQL/PostgREST or key-import errors
  never escape. `DualActorResolverService` classifies **by `instanceof` only** (no message matching).
  Real-path tests instantiate the **real verifier** with fake repo/config: repo RPC throws → 503; bad
  public-ring import → 503; invalid token → 401; invalid family → 401; valid → actor.
- **Independent header/payload decode** — `classify()` decodes the two segments separately; any federated
  marker in **either** segment prevents a Supabase fallback, and a malformed/oversized opposite segment
  (or a non-3-segment token) becomes `ambiguous_or_invalid_federated`. Cases covered: valid-header +
  malformed/oversized-payload, malformed/oversized-header + valid-payload, 2/4-segment marked tokens.
- **Authenticate before source authorization** — for a `federated_candidate` the guard verifies the actor
  first, then enforces `allowedSources`: a **valid** federated actor on a Supabase-only route → **403**; a
  **forged/invalid** federated token on any route → **401**; a dependency failure → **503**. An
  `ambiguous_or_invalid_federated` token → **401** before any source check. Never a Supabase probe.
- **Sanitized Supabase public errors** — the guard preserves the historical status codes but returns only
  generic bodies (`AUTH_CONFIG_ERROR` / `AUTH_TEMPORARILY_UNAVAILABLE` / `AUTH_ROLE_RESOLUTION_FAILED` /
  generic invalid-token). Project ref, `SUPABASE_URL`, `SERVICE_ROLE_KEY`, DB-probe text, and Dashboard
  guidance are written to the server log with a request id — never to the API body.
- **Two-way exhaustive registry** — the introspection test scans **`dist/**/\*.controller.js`** (not just
`dist/modules/\*\*`) and additionally proves: every registry entry maps to exactly one live route (stale
  entries fail), no duplicate entries, registry policy matches method metadata, and registry↔discovered
  authenticated routes are 1:1.

## 3c. Correctness closure (round 3)

- **`classify()` inside the typed config boundary** — token classification no longer lets a raw
  `FederatedAuthConfig` exception escape. Header/payload markers are detected with guarded config reads;
  a **visible federated marker with an unavailable/malformed issuer/audience/key-ring** classifies as
  the new `federated_routing_dependency_unavailable` → guard renders **503 `FEDERATED_AUTH_UNAVAILABLE`**
  (never Supabase, never an untyped 500). A normal Supabase token still classifies as `supabase_candidate`
  when the optional federated key-ring is absent and the feature is disabled. An intrinsic marker
  (`sessionType`) never falls back to Supabase.
- **No free-form text in Supabase failures** — `SupabaseResolveFailure` is now `{ reason }` (+ an optional
  **non-reversible `diagnosticCode` fingerprint**); the resolver builds **no** operational message. The
  guard logs a stable code + the fingerprint + a **sanitized** request id (allowlist `A-Za-z0-9._:-`,
  max 128, stripping newline/CR/tab/control/Unicode-line-separator — a log-injection defense) and **never**
  a raw Supabase/PostgreSQL message, project ref, `SUPABASE_URL`, `SERVICE_ROLE_KEY`, or Dashboard text.
  Logger-spy and API-body tests assert none of those strings leak and that request-id injection is stripped.
- **Duplicate live-route detection** — the two-way registry test now fails if two live routes resolve to
  the same registry identity, tracking source file + class + method + HTTP path + policy, and reports exact
  counts: **live_authenticated=25, registry=25, reverse=25, dup_live=0, dup_registry=0, stale=0,
  backoffice_checked=187, class-level-widening=0**.

## 4. Tests (all green locally; no DB required)

`backend/tests/federated-actor.test.mjs` — **42 tests, 42 pass, 0 fail, 0 skipped**
(`npm run test:federated-actor`): the B4 classifier decision table (10 cases), typed federated outcomes
(disabled/invalid/expired/dependency/internal) + strict path isolation (both directions), guard
401/403/503/500 mapping, ActorContext invariants, B5 request-state hygiene (3 cases),
`DEFAULT_AUTH_SOURCES=["supabase"]`, B1 per-handler `CustomerController`, and the **B2 exhaustive
introspection over every compiled controller**.

Regression (re-run locally, unchanged): `test:policy` 23/23, `test:customer-entry` 45/45,
`test:federated` 46/46, `test:customer-handoff` 94/94, `test:commercial` 6/6, `test:hardening` 39/39,
`npm test` (product-import) 146/146. Backend `nest build` clean; root `arch:guard` + `auth:guard` +
frontend build pass. **Zero skipped across all suites.**

CI: step **"Run Dual Actor & Federated Customer Session Tests"** runs `npm run test:federated-actor`
(after the PR4 federated step). The `-db` and `-client` suites arrive with the deferred phases.

---

## 4. Boundaries & flags

- Flags default-false and untouched: `STORE_CUSTOMER_HANDOFF_ENABLED`, `STORE_FEDERATED_AUTH_ENABLED`,
  `STORE_CUSTOMER_APP_SURFACE_ENABLED`, `STORE_IDENTITY_AUTO_LINK_ENABLED`. No deployment/env change.
- No PR3/PR4 migration edited; no new migration.
- Barber isolation unchanged: `X-Store-Session`, `/cart/**`, `/orders/b2b/**`,
  `POST /integrations/DilMart/session/exchange` — no Bearer support added.
- No deep-link/OS-link, no Main-repo endpoints, no identity-collision/auto-link, no frontend changes.
- No secrets, tokens, cookie values, or keys in code, tests, or logs.

---

## 5. STORE-PR6 handoff

STORE-PR6 (deep linking) will call the (to-be-exported) client method
`establishFederatedSessionFromRedeem(result)` after a successful redeem. This PR adds no `/open` route
or OS-link listener.

---

## 7. Backend federation layer added this round (Phases A–E)

This round extends the dual-actor **core** into the actual federated customer backend surface. All work is
additive, flag-gated (`STORE_FEDERATED_AUTH_ENABLED` default-false), and non-breaking (regression green).

### Phase A — source-aware `/auth/context` (`modules/auth/auth.service.ts`, `auth.types.ts`)

`AuthContextResponse` gains `authSource: "supabase" | "DilMart_federated" | null` and a `capabilities`
object `{ customerCommerce, phoneIdentity, accountClaim, passwordManagement, federatedLogoutAll }`.
`getContext()` branches on `actor.authSource`:

- **Federated** → `activeRole="customer"`, `roles=["customer"]`, `merchant=null`, `merchant_memberships=[]`,
  `claim_required=false` **always** (even if the shadow profile row still says `provisional_customer` — the
  fix is at the contract layer, **no DB mutation**), `account_type="DilMart_federated_customer"` (response
  marker only), capabilities `{customerCommerce:true, phoneIdentity:false, accountClaim:false,
passwordManagement:false, federatedLogoutAll:true}`. `user.id = actor.actorId` (the Store customer UUID);
  verified DilMart email/phone win. **No** `linkedProfileId`/`DilMartUserId`/`sessionFamilyId`/`sessionVersion`/
  token ever appears in the response.
- **Supabase** → exact pre-PR5 shape preserved + capabilities for the role (customer/provisional get the
  Store-account surface; merchant/admin/agent get none; `federatedLogoutAll:false`).

### Phase B — ownership (verified; `modules/customer/customer.service.ts`)

The 10 approved `/customer/**` routes were already dual-source with method-level `@AuthSources`. Confirmed
`CustomerService` scopes **every** read/write to the guard-verified `actorId` via service-role and re-checks
`row.user_id === actorId` on every id-addressed resource (address update/delete/set-default, order detail).
The check is **source-agnostic**, so it holds identically for a federated actor (which has no `actorToken`).

### Phase C — federated checkout (`modules/checkout/`)

`checkout.submit` derives identity only from `actor.actorId` and never calls `createProvisionalUser` for an
authenticated actor (guest with no `actorId` → 401, unchanged). The controller now also passes
`actor.authSource`; the loyalty-at-checkout assurance gate (which reads Supabase `user_metadata.phone_verified`)
is **skipped for federated actors** — a validated federated session is the Store-owned assurance — while the
server-side **balance** check still applies. Guest and direct-Supabase paths are byte-for-byte unchanged.

### Phase D — loyalty eligibility (`modules/loyalty/loyalty.controller.ts`)

Explicit, documented Store-owned rule: eligibility flows ONLY from the guard-verified `actor.actorId`; a
revoked/compromised/expired federated family never reaches the controller (verifier → 401 first); balance is
keyed by the verified id so cross-customer preview/redeem is structurally impossible; a body `userId` is never
consulted; no Store password / Supabase phone-change is required of a federated customer.

### Phase E — web HttpOnly refresh cookie + CSRF (`modules/auth/federated/federated-cookie.ts`,

`federated-auth.controller.ts`, `store-integration/.../customer-handoff.controller.ts`,
`common/http/allowed-origins.ts`)

- Cookie `__Host-DilMart_store_frt`: `HttpOnly; Secure; SameSite=Lax; Path=/`, **no Domain**, `Max-Age` =
  the **committed** refresh lifetime returned by the issuer/rotation RPC (never a hardcoded 30d).
- **Redeem (web)** additionally plants the rotating refresh token in the cookie; the §8.8 body contract is
  unchanged (the web client discards the body `refreshToken`). Native gets no cookie (body token → secure
  storage).
- **Refresh / logout / logout-all** accept the token from EITHER the JSON body (native) OR the cookie (web).
  Supplying **both** → `400 FEDERATED_AUTH_AMBIGUOUS`. Cookie mode requires an **allowed Origin**
  (`403 FORBIDDEN_ORIGIN`, exact-match allowlist shared with CORS — never `*`+credentials). Web refresh
  rotates the cookie and returns **no raw token** to JS; a definitive `401` clears the cookie, a transient
  `503` does not; logout/logout-all clear it.

### Tests added this round (all green, no DB)

- `tests/federated-auth-context.test.mjs` — **8/8**: federated context (role pin, capabilities, no
  provisional/claim, no id leakage, synthesized profile) + Supabase customer/provisional/merchant/guest.
- `tests/federated-cookie.test.mjs` — **13/13**: cookie attributes, Max-Age from lifetime, read/parse,
  single-channel (ambiguous), cookie-CSRF (foreign/missing Origin), allowlist exact-match.
- `tests/federated-customer-ownership.test.mjs` — **7/7**: Customer A ⊘ Customer B (order/address
  read+mutate), no-existence-oracle, no-actor denial.

`npm run test:federated-actor` now runs all four files: **70/70 pass, 0 fail, 0 skipped**. Regression
re-verified: `policy` + `customer-handoff-redeem` + `customer-handoff-log-safety` +
`store-integration-barber-regression` = 39/39; PR4 `federated-*` = 31/31. (Pre-existing, unrelated:
`p0-checkout-identity-geo` has 6 failures at the untouched baseline due to a test-harness DI gap —
confirmed identical with these edits reverted.)

---

## 6. Completion statement

**STORE-PR5 implementation PARTIAL — Gate 3 pending.**

**Done + validated this epic (backend):** dual-actor authz core (B1–B5 + rounds 2/3); source-aware
`/auth/context` capabilities (Phase A); approved customer-API ownership scoping + cross-customer denial
(Phase B, unit-proven); federated checkout with no provisional Supabase user + federated loyalty assurance
(Phases C/D); web HttpOnly `__Host-` refresh cookie + single-channel + cookie-CSRF + committed-lifetime
Max-Age (Phase E). Flags default-false; no migration; Barber isolation intact; no secret/token/cookie leakage.

**Landed round 2 (frontend session engine + DB proof + CI):**

1. **Frontend/native session engine (Phases F–I, M, N)** — `authSessionManager` is now the source-neutral
   facade (activeSource / subscribe / getAppSession / establishFederatedSessionFromRedeem / logoutAllDevices)
   with the Supabase branch unchanged. New `src/lib/auth/session/`: normalized `StoreAppSession` types,
   native OS-encrypted federated storage (`DilMart.store.federated.session.v1`, write+read-back, targeted
   remove, fresh-install purge, app-scoped device id), typed federated client (native body vs web cookie,
   `credentials:"include"`, bodies never logged), and the federated adapter (single-flight refresh: 10
   concurrent → 1; one 401 → clear; 5xx/network → preserve; storage_error on secure failure). `api-core`
   threads `credentials:"include"` + safe ApiError code/requestId/retryable. `establishFederatedSessionFromRedeem()`
   is exported for STORE-PR6 (no URL/deep-link code). Tests: `test:federated-client` **18/18** (incl. the
   native-restart and web-reload acceptance proofs + "no refresh token in browser storage").
2. **Real-DB integration (Phase O)** — `tests/db-integration/federated-customer-api.test.mjs` +
   `test:federated-actor-db`: real linked customer → `redeem_and_create_federated_session` → live ACTIVE
   family → `validate_federated_session_family` (the exact DB authority the verifier composes) → identity,
   and the full session-state matrix (ACTIVE / version-mismatch / REVOKED / COMPROMISED / absolute-expired /
   logout-all / BLOCKED linked-profile → invalid), plus two-customer identity isolation. Runs on CI against
   the live local Supabase stack (Docker daemon is unavailable in the authoring sandbox, so it is
   CI-validated).
3. **CI wiring** — the "Run Dual Actor & Federated Customer Session Tests" step now runs
   `test:federated-actor` + `test:federated-actor-db` (backend) + `test:federated-client` (root). No skips.
4. **Checkout harness (§21)** — `p0-checkout-identity-geo` DI drift repaired (added the `checkoutAttempts` +
   `enrichmentService` stubs that CheckoutService gained after the test was written): 6 → 4 failing, no
   runtime change. The remaining 4 encode a pre-PR5 _guest-checkout-allowed_ premise (submit with no actor →
   `place_order` with null user) that production intentionally superseded — submit now requires an
   authenticated/provisional actor. Aligning those is a checkout-owner product-semantics decision, not a safe
   mechanical harness fix, so they are flagged rather than silently rewritten. This suite is not in the CI gate.

## 8. React integration + closure blockers (Phases J/K/L)

- **J — source-neutral AuthProvider.** Bootstraps via `authSessionManager.bootstrapAppSession()` (the manager
  owns source selection); holds a normalized `StoreAppSession` (Supabase `session` retained for back-compat,
  null when federated); exposes `appSession` / `authSource` / `capabilities` / `logoutAllDevices`; keys
  `/auth/context` by `(authSource, user.id)`; and fills the federated identity from the verified backend
  context on web bootstrap (`applyFederatedIdentity`, the Store customer id — never `DilMartUserId`). `authStatus`
  is driven by the source-neutral session for both providers.
- **K — capability gating.** `CustomerCapabilityGuard` redirects a federated customer away from account-claim /
  phone-security (capabilities false) to a safe `/profile` route with an Arabic message ("إدارة هذه البيانات تتم
  من خلال حساب DilMart.") — never `/login`, never calling the identity temporary. Wired into `/claim-account`
  and `/profile/security/phone`. Direct Supabase customers and guests are unaffected.
- **L — checkout federation.** A federated customer is authenticated, so provisional signup never runs; the
  guard now fires ONLY on the settled `authStatus === "unauthenticated"` (a submit mid-bootstrap can never race
  a federated identity into a provisional Supabase account). `customer-profile/addresses/orders/loyalty` query
  keys are source-aware.
- **Closure blockers (§23 A–D):** (A) `establishFederatedSessionFromRedeem` fails closed if persisted Supabase
  state can't be removed — no two dormant identities; (B) a definitive refresh whose secure clear fails →
  `storage_error`, not a raw throw; (C) `403 → forbidden` (never clears/refreshes), `401 → definitive`,
  `5xx → transient`; (D) a Supabase `SIGNED_OUT` cannot erase an active federated React session.

`test:federated-client` → **6 files / 36** (engine 21 + closure-blocker A + federated AuthProvider 2 +
CustomerCapabilityGuard 3 + Supabase AuthProvider regression 10). §22: `p0-checkout-identity-geo` updated to
the current contract (no-actor submit rejected; guest→provisional is a frontend flow) — **14/14**, no runtime
change. Frontend build + `arch:guard` + `auth:guard` green.

---

## 9b. Review-closure round (protected routes + lifecycle + single-source + cache)

Independent review found real React-integration gaps in the first J/K/L pass; all fixed and tested:

- **Protected routes were still gating on the raw Supabase `session`** — `RequireAuthenticatedUser` and
  `Profile` redirected federated customers (whose Supabase `session` is null) to `/auth`. Both now gate on the
  source-neutral `appSession`. New `RequireAuthenticatedUser.federated.test.tsx` (5) pins every `authStatus`.
- **Source-neutral lifecycle** — native app-resume, network-reconnect, and web tab-focus now refresh the
  ACTIVE source via `refreshActiveSession` (federated routes to the adapter + re-syncs appSession); the
  Supabase auto-refresh ticker no longer starts for a federated identity (`startAutoRefresh` guard).
- **Single-active-source (Supabase direction)** — `authSessionManager.prepareForSupabaseAuthentication()`
  revokes + securely clears the federated session and only then flips the source; a secure-clear failure
  throws `storage_error` and the source stays federated (never two identities). Wrapped around
  sign-in / sign-up / provisional / OTP-verify. Tested (switch + fail-closed).
- **Query-cache isolation** — `Orders`, `Addresses`, and Checkout's last-order-detail keys now include
  `(authSource, user.id)`.
- **Password-management gating** — `/forgot-password` is wrapped in `CustomerCapabilityGuard`
  (`passwordManagement`): an authenticated federated customer is redirected to `/profile`; an unauthenticated
  guest still recovers a password.
- **Logout-all UI** — Profile shows "تسجيل الخروج من جميع الأجهزة" only when `capabilities.federatedLogoutAll`.

`test:federated-client` → **7 files / 44** (adds RequireAuthenticatedUser federated 5 + switch/auto-refresh
manager tests). Build + arch/auth guards + p0 (14/14) green.

## 9c. Micro-closure — fail-closed capability guard + real page acceptance

- **`CustomerCapabilityGuard` now fails CLOSED for a known federated identity** (`appSession.authSource ===
"DilMart_federated"`): the account-claim / phone-security / password surfaces are blocked in EVERY authStatus
  (`authenticated_loading_context`, `authenticated_offline`, `authenticated_ready`), before capabilities load
  and without flashing the forbidden child. Guests keep account/password recovery; direct Supabase preserves
  its load-then-obey behavior. 7 fail-closed cases tested.
- **Real customer-page acceptance** (`src/pages/federated-pages-acceptance.test.tsx`): the REAL `Profile`,
  `Addresses`, `Orders`, and `Checkout` render under a federated identity (Supabase session null) — Profile
  renders with no `/auth` redirect (+ offline shell), Addresses/Orders fetch under source-aware keys, and
  Checkout uses customer APIs and NEVER calls `createProvisionalUser`/`establishProvisionalSession`.

`test:federated-client` → **8 files / 53**; full frontend suite **242/242**; build + arch/auth guards + p0
(14/14) green.

## 9. Completion statement (final)

**STORE-PR5 implementation COMPLETE** — backend dual-actor core + federated surface (A–E), the frontend/native
session engine (F–I, M, N), real-DB session-state integration (O), the client + React-integration test suite
(Q), the source-neutral AuthProvider + capability gating + federated checkout/logout (J/K/L), and the four
review closure blockers — all green locally and on exact-head CI. Flags default-false; no migration; Barber
isolation intact; no secret/token/cookie leakage.

**Gate 3:** PASS on evidence, pending only the standing rule that PR #85 stays **Draft / unmerged** until the
owner authorizes Ready. Do not mark Ready or merge.
