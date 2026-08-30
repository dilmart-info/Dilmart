# STORE-PR5 — Discovery & Route Matrix

**Task:** DilMart-CUSTOMER-STORE-STORE-PR5 (Dual Actor Auth, Federated Customer APIs, Session Persistence)
**Governing spec:** DilMart-CUSTOMER-STORE-MASTER-001 (`docs/customer-store-integration/00_MASTER_IMPLEMENTATION_SPEC.md` in `cylendralabs-blip/DilMart`) — §9.3–9.6, §14, §16, §18, §19 Phase 3, §20, §21, §22.
**Baseline:** Store `main` = `45b8cb3f5be1cb4f74d065b430c5a1549251c417` (the STORE-PR4 merge commit; PR4 head `f2893917…` is in ancestry).
**Branch:** `feat/customer-federated-actor-session` (new Draft PR).

> This is the Phase 0 discovery gate required before implementation. It inventories and classifies
> every protected backend route and the frontend auth surface, audits direct-Supabase usage, and
> defines the staged implementation plan. **No route is federated-enabled merely because it carries
> `@Roles("authenticated")`** — each is explicitly classified below.

---

## 1. Classification legend

| Class                    | Meaning                                             | Auth sources accepted                          |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------- |
| `SUPABASE_ONLY`          | Direct Store Supabase identity only                 | `supabase` (default — no `@AuthSources`)       |
| `DUAL_CUSTOMER`          | Supabase customer **or** DilMart federated customer | `@AuthSources("supabase","DilMart_federated")` |
| `PUBLIC_OR_OPTIONAL`     | No `@Roles` / optional bearer / signed webhook      | n/a                                            |
| `BARBER_X_STORE_SESSION` | Barber app HMAC `X-Store-Session` (never Bearer)    | unchanged (in-handler)                         |
| `BACKOFFICE_ROLE_ONLY`   | admin / super*admin / merchant*\* / agent           | `supabase`                                     |

The global `RolesGuard` (`backend/src/common/authz/roles.guard.ts`) is the single enforcement point
(`APP_GUARD`). Default policy: a protected route with **no** `@AuthSources` metadata is `SUPABASE_ONLY`.

---

## 2. Approved DUAL_CUSTOMER matrix (the ONLY federated-enabled routes)

All 20 exist in the codebase and are annotated in this PR with `@AuthSources("supabase","DilMart_federated")`.

| Route                                     | Controller.method — file:line                                                                         | Ownership key                        |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------ |
| GET /auth/context                         | `AuthController.getContext` — auth/auth.controller.ts:53                                              | actor (context)                      |
| GET /customer/profile                     | `CustomerController.*` — customer/customer.controller.ts (per-handler `@AuthSources`, no class-level) | `actor.actorId`                      |
| PATCH /customer/profile                   | customer.controller.ts                                                                                | `actor.actorId`                      |
| GET /customer/addresses                   | customer.controller.ts                                                                                | `actor.actorId`                      |
| POST /customer/addresses                  | customer.controller.ts                                                                                | `actor.actorId`                      |
| PATCH /customer/addresses/:id             | customer.controller.ts                                                                                | `actor.actorId`                      |
| DELETE /customer/addresses/:id            | customer.controller.ts                                                                                | `actor.actorId`                      |
| POST /customer/addresses/:id/set-default  | customer.controller.ts                                                                                | `actor.actorId`                      |
| GET /customer/orders                      | customer.controller.ts                                                                                | `actor.actorId`                      |
| GET /customer/orders/:id                  | customer.controller.ts                                                                                | `actor.actorId`                      |
| POST /customer/orders/:id/reorder-preview | customer.controller.ts (note: **POST**, spec wrote GET)                                               | `actor.actorId`                      |
| GET /orders/me                            | `OrdersController.getMyOrders` — orders/orders.controller.ts:104                                      | `actor`                              |
| POST /orders/:id/customer-cancel          | `OrdersController.customerCancelOrder` — orders.controller.ts:298                                     | `actor.actorId`                      |
| POST /orders/:id/return-request           | `OrdersController.createReturnRequest` — orders.controller.ts:314                                     | `actor.actorId`                      |
| GET /orders/:id/return-request            | `OrdersController.getReturnRequestStatus` — orders.controller.ts:330                                  | `actor.actorId`                      |
| PATCH /profiles/me                        | `ProfilesController.updateMe` — profiles/profiles.controller.ts:11                                    | `actor`                              |
| POST /loyalty/preview                     | `LoyaltyController.preview` — loyalty/loyalty.controller.ts:11                                        | `actor.actorId`                      |
| POST /loyalty/redeem                      | `LoyaltyController.redeem` — loyalty/loyalty.controller.ts:21                                         | `actor.actorId`                      |
| POST /checkout/submit                     | `CheckoutController.submit` — checkout/checkout.controller.ts:24                                      | `actor.actorId` (guest via no-token) |
| GET /checkout/attempts/:attemptId         | `CheckoutController.getAttemptStatus` — checkout/checkout.controller.ts:31                            | `actor`                              |

Every handler derives identity from the **verified** `actor.actorId` (the Store customer/profile UUID,
identical shape for both sources) — never from a request body/query customer id. Cross-customer
authorization is therefore source-agnostic and enforced in the services (verified in the DB integration
phase, deferred — see §7).

---

## 3. SUPABASE_ONLY authenticated routes (explicitly NOT federated-enabled)

These carry `@Roles("authenticated")` but **must not** accept federated identities. They receive **no**
`@AuthSources` metadata → default `SUPABASE_ONLY`. A federated customer hitting them gets a safe 403.

| Route                                | Controller.method — file:line                                                       | Reason                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| POST /auth/account-claim/request     | AuthController.requestAccountClaim — auth.controller.ts:71                          | Direct-Store account claim (Supabase identity)                                       |
| POST /auth/phone-identity/check      | AuthController.checkPhoneAvailability — auth.controller.ts:148                      | Phone identity is Supabase-only (§14 capability `phoneIdentity=false` for federated) |
| POST /auth/phone-identity/sync       | AuthController.syncPhoneIdentity — auth.controller.ts:164                           | as above                                                                             |
| GET /analytics/events/summary        | AnalyticsController.summary — analytics/analytics.controller.ts:24                  | Not a customer-commerce route; bare-authenticated analytics read                     |
| GET /merchant-applications/me/status | MerchantApplicationsController.getMyStatus — merchant-applications.controller.ts:16 | Merchant applications (Supabase)                                                     |

A regression test (`tests/federated-actor.test.mjs`) asserts these carry no `@AuthSources` so they can
never be silently federated-enabled.

---

## 4. BARBER_X_STORE_SESSION (unchanged — no Bearer support added)

Barber isolation (ADR-004, spec §2.2): these use the HMAC `X-Store-Session` header verified in-handler
and are **not touched** by this PR.

- `/cart` (all 7 routes) — cart/cart.controller.ts
- `GET /orders/b2b/my-orders`, `GET /orders/b2b/:orderId` — orders/orders.controller.ts:126,132
- `POST /integrations/DilMart/session/exchange` — store-integration/store-integration.controller.ts:34

---

## 5. Other classes (for completeness)

- **BACKOFFICE_ROLE_ONLY** — all `admin/*` (~92 routes), `merchant*`, `products`, `inventory`,
  `categories`, `users`, `uploads`, and role-gated routes in `orders`/`merchants`/`coupons`/`shipping`/
  `analytics`/`whatsapp-intents`/`health(db-public)`. Unchanged.
- **PUBLIC_OR_OPTIONAL** — `marketplace/*` (12), `catalog/*` (8), `customer-entry`, `customer-handoff`
  prepare/redeem, `auth/federated/*` (refresh/logout/logout-all — federated refresh token, not Bearer),
  `supabase-auth-hook`, `jenni-webhook`, `checkout/preview`, `orders/track`, `analytics/events/ingest`,
  `coupons/validate`, various public reads. Unchanged.

### Services calling Supabase Auth Admin (kept Supabase-only; must never run for a federated actor)

`auth.service.ts` (createUser/deleteUser), `account-claim.service.ts`, `password-recovery.service.ts`,
`merchant-applications.service.ts`, `admin.service.ts`, and `checkout.service.ts:264` (`getUserById`,
already capability-guarded). The federated checkout path must not create a provisional Supabase user —
enforced in the deferred checkout-integration phase.

---

## 6. Frontend auth inventory (`src/`)

**Key finding: the customer app is already fully backend-mediated. There are ZERO direct Supabase table
calls (`supabase.from/rpc/storage`) anywhere in `src/`.** All customer data (Profile, Checkout,
Addresses, Orders, loyalty) flows through the Nest backend via `src/lib/api-core.ts`. This means **no
per-page migration is required** to support federated actors (spec §9.5 is already satisfied for the
customer surface).

| Concern                    | Location                                                                                                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AuthProvider / AuthContext | `src/lib/auth/AuthProvider.tsx`, `src/lib/auth/AuthContext.tsx` (`session: Session` = raw Supabase)                                                                           |
| Session manager            | `src/lib/auth/auth-session-manager.ts` (`authSessionManager` singleton wrapping `supabase.auth.*`)                                                                            |
| api-core                   | `src/lib/api-core.ts` — Bearer attach; **401 → single-flight refresh → 1 retry**; 403 untouched; timeouts                                                                     |
| Auth storage keys          | `src/lib/auth/auth-storage-keys.ts` — `NATIVE_AUTH_STORAGE_KEY="DilMart.store.auth.session.v1"`, `INSTALL_MARKER_KEY`, legacy `sb-<ref>-auth-token`                           |
| Native secure storage      | `src/lib/auth/native-secure-auth-storage.ts` — `@aparajita/capacitor-secure-storage` + `@capacitor/preferences` marker; keychain purge on fresh install; targeted delete only |
| Route guard                | `src/components/guards/RequireAuthenticatedUser.tsx`                                                                                                                          |
| Customer pages             | `Profile.tsx`, `Checkout.tsx`, `account/Addresses.tsx`, `account/Orders.tsx`, `account/PhoneSecurity.tsx`, `account/ClaimAccount.tsx`                                         |
| Customer API modules       | `src/lib/api/customer.ts`, `src/lib/api/checkout.ts`, `src/lib/api/orders.ts` (via `api-client.ts`)                                                                           |
| Arch guard                 | `scripts/architecture/check-no-new-direct-supabase.mjs` + allowlist/baseline (baseline empty)                                                                                 |

**Residual Supabase couplings a full federation must address (frontend phases, deferred):**

1. Raw `Session` type from `@supabase/supabase-js` threaded through `AuthContextValue`/`AuthProvider`.
2. `AuthSessionManager` singleton wrapping `supabase.auth.*`.
3. Native secure-storage adapter persisting the Supabase session blob.
4. One Realtime `supabase.channel(...)` notification subscription (`src/lib/realtime/notification-subscriptions.ts`) — delivery-only, allowlisted; not customer table CRUD.

---

## 7. Staged implementation plan (this PR vs. deferred)

### Delivered in THIS PR (backend dual-actor authz core, unit-tested, no DB)

1. `AuthSource` type + `@AuthSources` decorator + `DEFAULT_AUTH_SOURCES=["supabase"]` — `common/authz/auth-source.ts`.
2. Extended `ActorContext` (+`authSource`, federated ids; `actorToken` Supabase-only) — `actor-context.decorator.ts`.
3. `SupabaseActorResolverService` — Supabase resolution extracted verbatim from the guard.
4. `DualActorResolverService` — **strict discriminated classifier** (`supabase_candidate` /
   `federated_candidate` / `ambiguous_or_invalid_federated`) + no-cross-verifier fallback + **typed
   federated outcomes** (disabled/invalid/expired-or-revoked/dependency/internal), composing the PR4
   `FederatedSessionVerifierService` + `FederatedAuthConfig`.
5. `RolesGuard` rewrite — dual-source; **request-state hygiene** (resets all actor fields); federated
   HTTP mapping (401/403/503/500 with stable codes); preserves the existing Supabase HTTP contract.
6. **Per-handler** `@AuthSources` on the 20 approved DUAL routes (no class-level widening); `AuthzModule`
   wiring; `FederatedAuthConfig` exported.
7. `common/authz/route-policy-registry.ts` — canonical registry enforced by an **exhaustive**
   introspection test over every compiled controller.
8. Unit suite `tests/federated-actor.test.mjs` — **42 tests** (`npm run test:federated-actor`), including
   real-verifier dependency-path tests, classify config-boundary tests, log-redaction/request-id
   sanitization tests, and a two-way registry scan with duplicate-live-route detection, plus a CI step.

### Deferred to later STORE-PR5 phases (require live Supabase/Docker + frontend work)

- **Federated `/auth/context`** capabilities contract + `AuthService.getContext` federated branch (§14).
- **Backend DB integration tests** (`test:federated-actor-db`): real federated session → approved APIs; cross-customer denial; session-state (revoked/compromised/expired/version-mismatch → 401); Supabase + Barber regression.
- **Federated checkout path** (no provisional Supabase user for `DilMart_federated`) + loyalty eligibility rule.
- **Web HttpOnly `__Host-` refresh cookie** path + CSRF/origin + cookie integration tests.
- **Frontend** unified session model, adapters, `unified-auth-session-manager`, `api-core` integration, `AuthProvider` refactor, capability gating, `establishFederatedSessionFromRedeem`, native/web restart acceptance proofs, `test:federated-client`.

> **Gate 3 is NOT claimed.** This PR delivers the backend dual-actor foundation; the acceptance
> evidence (DB integration, cookie integration, restart proofs) is produced in the deferred phases,
> which require a live Supabase/Docker stack unavailable in the authoring environment.

---

## 8. Boundaries preserved (this PR)

- Feature flags remain default-false: `STORE_CUSTOMER_HANDOFF_ENABLED`, `STORE_FEDERATED_AUTH_ENABLED`,
  `STORE_CUSTOMER_APP_SURFACE_ENABLED`, `STORE_IDENTITY_AUTO_LINK_ENABLED`. Backend federated resolution
  fails closed when `STORE_FEDERATED_AUTH_ENABLED` is not `true`.
- No PR3/PR4 migration edited; no new migration added.
- `X-Store-Session` / barber cart / B2B / `session/exchange` unchanged.
- No deep-link / OS-link / Main-repo / identity-collision work (out of scope, spec §19 Phases 4–7).

---

## 9. Update — backend federation layer landed (Phases A–E)

The items below moved from "deferred" to **done + unit-validated** this round (see
`STORE_PR5_DUAL_ACTOR_AND_SESSION_REPORT.md` §7 for detail). All additive, flag-gated, regression-green.

| Phase | Surface                                                                                                        | Status                                                   |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A     | `/auth/context` source-aware (`authSource` + `capabilities`; federated never provisional/claim; no id leakage) | ✅ done, `federated-auth-context.test.mjs` 8/8           |
| B     | `/customer/**` ownership scoped by verified `actorId`; cross-customer denial                                   | ✅ verified, `federated-customer-ownership.test.mjs` 7/7 |
| C     | `/checkout/submit` federated (no provisional Supabase user; `authSource` threaded)                             | ✅ done (guest/Supabase paths unchanged)                 |
| D     | `/loyalty/**` explicit Store-owned eligibility rule (verified `actorId`; federated assurance)                  | ✅ documented + checkout gate                            |
| E     | Web `__Host-DilMart_store_frt` HttpOnly cookie on redeem(web)/refresh/logout; single-channel + Origin CSRF     | ✅ done, `federated-cookie.test.mjs` 13/13               |

`npm run test:federated-actor` now runs 4 files → **70/70**.

**Still deferred to later phases (Gate 3 pending):** the full frontend/native unified session stack
(Phases F–M), real-DB integration (`test:federated-actor-db`, Phase O), native-restart/web-reload
acceptance proofs (Phase N), the `test:federated-client` frontend suite (Phase Q), and the CI wiring for
those two suites once they exist. These need a live Supabase/Docker stack and frontend work not in this branch.
