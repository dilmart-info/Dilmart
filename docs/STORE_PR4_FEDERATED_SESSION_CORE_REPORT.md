# STORE-PR4 — Federated Store Session Core — Implementation Report

- **Task:** `DilMart-CUSTOMER-STORE-STORE-PR4`
- **Repo:** `cylendralabs-blip/DilMart-Store`
- **Branch:** `feat/customer-federated-session-core`
- **Baseline:** `faae63722926a1fac56261b076240b28d55bcc94` (main, includes merged STORE-PR3 #76)
- **PR state:** Draft / unmerged.
- **Governing spec:** `DilMart-CUSTOMER-STORE-MASTER-001` §8–§16, §21.

## Scope

Backend **core** for a durable federated customer session that a DilMart customer receives when they land in the Store from the Customer App via a LINKED handoff:

handoff redeem → **atomic** session-family creation → short-lived Store **federated access token** → opaque **rotating refresh token** → rotation → **reuse detection** → family **compromise/revocation** → **logout / logout-all** → access-token **verification foundation** (exported for STORE-PR5; **not** wired into the global guard).

This PR is the session _engine_. It does **not** migrate any supported customer API onto the new actor, and does **not** enable the feature anywhere.

## Phase-0 discovery note

Before writing code I confirmed against the baseline:

- **PR3 already defines the session boundary.** `customer-handoff/federated-session-issuer.ts` exposes a DI token `FEDERATED_SESSION_ISSUER` (a `Symbol`) + a `FederatedSessionIssuer` interface with `redeemAndIssue(...)`, and the redeem controller **fails closed** when no issuer is bound. STORE-PR4's job is to bind the concrete implementation — not to alter the redeem endpoint contract. PR3 deliberately removed any `redeem_and_issue` DB path (session creation is PR4's responsibility).
- **Barber sessions are a separate, untouched implementation.** `POST /integrations/DilMart/session/exchange`, the `X-Store-Session` header, and the OWNER/BARBER HMAC session are independent. PR4 reuses **none** of that code and modifies **none** of those contracts.
- **The global `RolesGuard` must stay unchanged.** The federated verifier is exported for STORE-PR5 to consume; PR4 does not attach it to any existing endpoint or to the guard.
- **Time authority is PostgreSQL.** PR3 established `clock_timestamp()` as the sole expiry clock and immutable, service-role-only audit tables with `FORCE RLS`. PR4 follows the same pattern for the session family, refresh tokens, and the new session audit log.
- **Secret discipline.** The raw refresh token must live **only** in backend memory + the HTTPS response body. The DB, logs, metadata, analytics, exceptions, and URLs must never see it — only a keyed HMAC-SHA256 hash.

## Database (additive migrations)

| Migration                                                            | Purpose                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260806100000_federated_session_hardening.sql` | Additive columns + CHECK constraints on `store_federated_session_families` and `store_federated_refresh_tokens`; new immutable `store_federated_session_audit_events` (FORCE RLS, service-role only, referenced by value, no cascading FK).                                                                                               |
| `supabase/migrations/20260806100100_federated_session_functions.sql` | Six `SECURITY DEFINER` RPCs (search_path pinned, revoked from PUBLIC/anon/authenticated, granted service_role only): `redeem_and_create_federated_session`, `rotate_federated_refresh_token`, `logout_federated_session`, `logout_all_federated_sessions`, `revoke_federated_sessions_for_identity`, `validate_federated_session_family`. |

Per-migration detail: `docs/migration-reports/20260806100000_federated_session_hardening.md` and `.../20260806100100_federated_session_functions.md`.

### Atomicity guarantee (never lose the one-time code)

The issuer **pre-signs** the access token and **generates** the raw refresh token _before_ the consuming RPC. If signing OR the RPC fails, the handoff/token stays **unconsumed** and **no token is returned**. Session-family creation + handoff consumption + both audit rows commit in a **single** transaction inside `redeem_and_create_federated_session`.

### Rotation, reuse, compromise

`rotate_federated_refresh_token` re-reads the current token `FOR UPDATE`, so a **reused** (already-rotated) token is detected under concurrency: the family is marked **COMPROMISED** (committed, not rolled back), `session_version` is incremented, and **all** its refresh tokens are revoked — which immediately invalidates any access token bound to the prior version (the verifier's `validate_federated_session_family` returns `valid=false`). Reuse detection runs **before** the DB-time fixed-window rate limit (30 / hour / family).

## Backend module — `backend/src/modules/auth/federated/`

| File                                    | Responsibility                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------- |
| `federated-auth.types.ts`               | `FederatedAccessClaims`, `VerifiedFederatedActor` (`authSource:"DilMart_federated"`), `FEDERATED_LIFETIMES`, `REFRESH_RATE`, bounds.                                                                                                                                                                                                             |
| `federated-auth.errors.ts`              | Safe `FederatedError` codes + `mapRpcErrorCode` (no raw DB/crypto leakage).                                                                                                                                                                                                                                                                      |
| `federated-auth.config.ts`              | Strict fail-closed config: exact TTLs (access 600 / refresh 2592000 / absolute 7776000 / clock-tol 0–10), mandatory `kid`, alg allowlist `EdDSA`/`RS256`, base64url refresh secret ≥32 bytes, JSON-array public-key ring with duplicate-kid detection, and `assertOnBoot` (imports all keys + a sign→verify private/public compatibility probe). |
| `federated-access-token.service.ts`     | `sign(ctx)` → 600s access token, mandatory `kid`, returns `{accessToken, jti, expiresIn}`.                                                                                                                                                                                                                                                       |
| `federated-refresh-token.service.ts`    | 256-bit CSPRNG raw token (base64url); keyed HMAC-SHA256 hash (the only DB value); domain-separated keyed device hash.                                                                                                                                                                                                                            |
| `federated-session-repository.ts`       | Thin, typed wrappers over the six RPCs.                                                                                                                                                                                                                                                                                                          |
| `federated-session-verifier.service.ts` | `verify(token)` → crypto (kid + alg allowlist + iss/aud/clock-tolerance/max-age) + claim checks + DB `validate_federated_session_family` → `VerifiedFederatedActor`. **Exported for STORE-PR5; not wired into `RolesGuard`.**                                                                                                                    |
| `federated-session-issuer.service.ts`   | Concrete `FederatedSessionIssuer`: inspect → route LINKED vs non-LINKED → pre-sign+generate → atomic `redeemAndCreate` → §8.8 response. Throws PR3 `HandoffError` so the existing redeem controller renders §14.5.                                                                                                                               |
| `federated-auth.service.ts`             | `refresh` (IP limiter → resolve → pre-sign → rotate, discard on failure), `logout`, `logoutAll`, `revokeForIdentity`.                                                                                                                                                                                                                            |
| `federated-auth.dto.ts`                 | `RefreshDto`, `LogoutDto`, optional `FederatedDeviceDto`.                                                                                                                                                                                                                                                                                        |
| `federated-auth.controller.ts`          | `POST /auth/federated/refresh                                                                                                                                                                                                                                                                                                                    | logout | logout-all`; `Cache-Control: no-store`on token responses; safe error mapping. **No`sessions/revoke` route.\*\* |
| `federated-auth.module.ts`              | Binds `FEDERATED_SESSION_ISSUER` → concrete issuer; exports the verifier + revoke foundation; `onModuleInit` runs `assertOnBoot` (fail closed when enabled + misconfigured).                                                                                                                                                                     |

### Touched PR3/app files (minimal, contract-preserving)

- `customer-handoff/federated-session-issuer.ts` — `RedeemAndIssueResult` set to master §8.8 shape (no `sessionFamilyId` leak).
- `customer-handoff.module.ts` — imports `FederatedAuthModule`.
- `customer-handoff.controller.ts` — redeem adds `no-store`/`no-cache` on the token response.
- `app.module.ts` — imports `FederatedAuthModule`.

## Explicitly NOT changed (verified by diff)

`RolesGuard`, `POST /integrations/DilMart/session/exchange`, `X-Store-Session`, the OWNER/BARBER HMAC session, and Barber cart/checkout/orders are untouched. `git status` shows no matching file. No feature flag is enabled; `STORE_IDENTITY_AUTO_LINK_ENABLED` remains default-false.

## Tests

### Unit (no DB) — `npm run test:federated` → **34 pass / 0 fail / 0 skip**

- `federated-config.test.mjs` — feature-off boots without keys; feature-on complete boots; exact-TTL rejection; refresh-secret ≥32 bytes; array-only ring + duplicate-kid + unsupported-alg; missing/malformed private key; signing-kid-not-in-ring; private/public mismatch; alg/key-type mismatch.
- `federated-access-token.test.mjs` — Ed25519 + RS256 round-trip to a `VerifiedFederatedActor`; missing/unknown kid, HS256, `alg:none`, wrong iss/aud, wrong sessionType/role/origin, malformed UUID, session-version < 1, expired, future nbf, TTL > 600, and DB-family-invalid rejection.
- `federated-refresh-token.test.mjs` — 256-bit entropy + base64url + uniqueness; deterministic keyed HMAC (independently recomputed); different tokens→different hashes; hash ≠ raw; secret-dependence; keyed domain-separated null-safe device hash.
- `federated-issuer.test.mjs` — §8.8 success shape with only the **hash** reaching the DB; **signing failure never calls the consuming RPC**; RPC failure returns no token; ALREADY_REDEEMED mapped; LINK_REQUIRED/BLOCKED create **no** session; feature-off fails closed before the DB; committed-identity mismatch → safe error.
- `federated-startup-gate.test.mjs` — disabled boots; enabled-but-incomplete refuses to boot; enabled+complete boots; DI contract (`redeemAndIssue` present, token is a `Symbol`).

### DB integration (live local Supabase, **no skips**) — `npm run test:federated-db` → **11 pass / 0 fail / 0 skip**

- `federated-session-core.test.mjs` (9) — issuance atomicity + DB-time expiry, atomic rollback, already-redeemed, non-LINKED, refresh chain A→B→C, DB-time EXPIRED marking, logout idempotency, logout-all identity isolation, RLS/permission/audit-immutability.
- `federated-session-redeem-concurrency.test.mjs` — **25 × 2** concurrent redeems → exactly one authenticated winner, one family, one initial refresh, one of each audit.
- `federated-session-refresh-concurrency.test.mjs` — **25 × 2** concurrent refreshes of the same token → one rotates, the other detected as reuse → family COMPROMISED, version incremented, all tokens revoked, pre-compromise access token rejected.

### Regression (unchanged, all green)

`test:customer-handoff` 94/94 · `test:customer-entry` 45/45 · `test:policy` 23/23 · `test:hardening` 39/39 · `test:commercial` 6/6. Backend `npm run build` clean.

## CI

`.github/workflows/ci.yml` adds a named step **"Run Federated Session Core Security & DB Tests"** (`npm run test:federated` + `npm run test:federated-db`) that executes against the same live local Supabase stack the job already starts. The existing **"Run Customer Handoff Foundation Security & DB Tests"** step is retained. No DB test is skipped.

## Security Closure — Session Authority & Concurrency (additive round)

A follow-up hardening round layered on the core via an additive migration
`supabase/migrations/20260806100200_federated_session_authority_hardening.sql` (the earlier PR4 migrations are
unmerged and undeployed, so the six RPCs are REPLACED with old signatures explicitly dropped — no stale overload
survives). No merged STORE-PR3 migration is touched.

- **B1 — logout authority.** logout / logout-all now require a currently-valid, **locked** refresh token; used/
  revoked/expired/unknown tokens change nothing and emit no success audit; the response stays a generic
  `logged_out`. logout-all is scoped to **all three** identity values.
- **B2 — lock ordering.** rotate / logout / logout-all share one deterministic order (family `FOR UPDATE` → token
  `FOR UPDATE` → revalidate membership). No lifecycle deadlocks.
- **B3 — constants in PostgreSQL.** Trusted TTL/rate/window params are removed; approved values are constants
  inside the RPCs (refresh/inactive 2592000, rate 30, window 3600). `validate` no longer takes an inactivity TTL.
- **B4 — real refresh lifetime.** redeem + rotate return `refresh_expires_in_seconds` computed by PostgreSQL from
  the committed `LEAST(now+30d, absolute_expires_at)`; the backend returns that value (not a constant).
- **B5 — mandatory claims.** The verifier passes `requiredClaims` for all 14 claims and enforces jti-UUID,
  integer iat/nbf/exp, `nbf === iat`, `exp - iat === 600`, UUID identity claims, and `sessionVersion >= 1`.
- **B6 — pre-signed context binding.** redeem checks expected handoff/identity/target under lock before consuming
  (mismatch → full rollback, code unspent); rotate checks expected family/identity/session_version under lock
  (mismatch → no rotation). The issuer/service compare **every** committed identity value against the signed claims.
- **B7 — revoke selector.** The internal identity revoke uses AND semantics (both selectors must match the same
  family when both are supplied); the widening OR is gone. Still no HTTP endpoint.

### Added tests (closure)

- Unit: `federated-verifier-claims.test.mjs` (missing-claim matrix + exact-600s contract), plus B4/B6 assertions
  in `federated-issuer.test.mjs`. `npm run test:federated` → **39/39**.
- DB: `federated-session-logout-authority` (9), `-context-binding` (12), `-revoke-selector` (4), `-constants`
  (5, incl. B4 near-absolute-expiry + B3 rate boundary), `-lifecycle-concurrency` (5 races × 25 = no deadlock,
  documented outcomes). `npm run test:federated-db` → **41/41**, 0 skipped. Existing 25×2 redeem + 25×2 refresh
  concurrency retained.
- Regression on a clean DB: `npm run test:db-integration` **128 / 0 fail / 0 skipped** (glob now runs sequentially
  for deterministic point-in-time assertions), `npm test` 144, customer-handoff 94 + 39 DB, customer-entry 45,
  policy 23, hardening 39, commercial 6. `npm run build` clean.

## Final Closure — Multi-Family Logout-All Concurrency (additive round)

A further round via additive migration
`supabase/migrations/20260806100300_federated_logout_all_lock_hardening.sql` (replaces only
`logout_all_federated_sessions`; old signature dropped). No merged STORE-PR3 migration is touched.

- **B1 — cross-family deadlock fixed.** The previous logout-all locked the presented token's family first, then
  every identity family in id order — two concurrent logout-all calls presenting valid tokens from **different**
  families of the same identity could deadlock (T1 holds A waits B; T2 holds B waits A). Now logout-all takes an
  **identity mutex** (`store_linked_profiles FOR UPDATE`) **before** any family lock, then locks families in one
  `ORDER BY id` pass, then the token (family→token order preserved), then the full authority gate. Acyclic with
  rotate / logout / revoke_for_identity / redeem. Proven by `federated-session-logout-all-multifamily.test.mjs`:
  50× logoutAll(A)-vs-logoutAll(B) across **both** UUID orderings + 25× each vs refresh / logout / revoke — 0
  deadlocks, 0 SQLSTATE, both families REVOKED, `session_version` bumped once each, all tokens revoked, one
  logout-all audit per family, unrelated identity untouched.
- **B2 — full refresh context compare.** `FederatedAuthService.refresh` now requires exact equality on **all five**
  committed context values (family_id, store_customer_id, linked_profile_id, DilMart_user_id, session_version) —
  not session_version alone — before returning any token; any divergence fails closed with the safe error.
- **B3 — no invented refresh lifetime.** The `?? FEDERATED_LIFETIMES.REFRESH_TTL_SECONDS` fallback is removed from
  both the issuer and `refresh`. Every success requires `Number.isInteger(refresh_expires_in_seconds) && >0 &&
<=2592000`; a missing/null/zero/negative/out-of-range value is treated as an internal contract failure (no
  token). The public `refreshExpiresIn` equals the PostgreSQL value exactly.

### Added tests (final closure)

- Unit: `federated-refresh-service.test.mjs` (5 single-field context mismatches; lifetime 2592000/86400/300/1
  pass-through; null/0/negative/2592001/non-integer → no token) + B3 lifetime cases in `federated-issuer.test.mjs`.
  `npm run test:federated` → **46/46**.
- DB: `federated-session-logout-all-multifamily.test.mjs` (4 races, real `Promise.all` parallelism).
  `npm run test:federated-db` → **45/45**, 0 skipped (existing 25×2 redeem + 25×2 refresh retained).
- Clean-DB regression: `test:db-integration` **132 / 0 fail / 0 skipped**, `npm test` 144, customer-handoff 94 +
  39 DB, customer-entry 45, policy 23, hardening 39, commercial 6. Build clean.

## Verdict

**PASS WITH NOTES** — STORE-PR4 backend federated session core + Session Authority & Concurrency + Multi-Family
Logout-All closure complete and validated (46 unit + 45 federated DB tests incl. 25×2 redeem, 25×2 refresh, 5×25
single-family lifecycle races, and 50× + 3×25 **cross-family** logout-all races; full regression green on a clean
DB). Four additive PR4 migrations (20260806100000 / 100100 / 100200 / 100300); no merged STORE-PR3 migration
touched. **Gate 3 remains pending STORE-PR5 actor integration and supported customer API migration.** Gate 3 is
**not** claimed here.
