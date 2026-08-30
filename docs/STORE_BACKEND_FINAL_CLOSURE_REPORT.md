# Store Backend Final Closure Report

## Snapshot

- Date: 2026-04-20
- Migration direction: API-first backend-centric
- Guard status: `arch:guard` passing
- Frontend build status: passing
- Backend build status: passing

## What Is Migrated (implemented and wired)

### Critical flows (P0)

- Checkout submit/preview via backend endpoints (`/api/checkout/preview`, `/api/checkout/submit`)
- Coupon validation via backend (`/api/coupons/validate`)
- Order operations via backend (detail, status, notes, agent, cancel, track)
- Loyalty preview/redeem via backend (`/api/loyalty/*`)
- Merchant settings via backend (`/api/merchants/settings`)
- Inventory adjustments/list via backend (`/api/inventory`, `/api/inventory/adjust`)

### Admin / merchant operations

- Products create/update/status and product read-by-id via backend
- Categories CRUD via backend
- Merchants CRUD/status/assign-owner via backend
- Delivery companies and governorate pricing via backend
- Admin dashboard analytics via backend (`/api/admin/analytics/overview`)
- Shared scoped query layer now API-only (`src/lib/scoped-queries.ts`)

### Storefront reads

- Home, products list, offers, category page, product detail, suggested products via `/api/catalog/*`
- Wishlist hydration via `/api/catalog/products/by-ids`
- Header categories via `/api/catalog/categories`

## Remaining Direct Supabase Usage in Frontend (actual current)

Derived from source scan (`supabase.(from|rpc|auth|storage)`):

- **No matches found in `src/`**.
- Frontend business/data flows now route through backend APIs via `src/lib/api-client.ts`.

## Why Any Gaps Still Exist

- Remaining gaps are no longer direct Supabase calls from frontend code.
- Open items are backend hardening and authorization-depth concerns (policy/guard rigor), not client-side data access architecture.

## Authorization Hardening Progress (new)

- Added backend `RolesGuard` as a global guard (`APP_GUARD`) with bearer-token verification.
- Added endpoint role policies with `@Roles(...)` on critical controllers (`orders`, `products`, `merchants`, `admin`).
- Roles and actor identity are now derived on backend from verified bearer token (`Authorization: Bearer <access_token>`) via Supabase auth + profile role lookup.
- Added server-side merchant scope resolution for merchant-role actors in scoped services (`orders`, `products`, `merchants`, `inventory`, `coupons`, `admin/customers`) by resolving membership from `merchant_users` and overriding untrusted client scope parameters.
- Added policy matrix integration tests (`backend/tests/policy-matrix.test.mjs`) and endpoint policy tests (`backend/tests/policy-endpoints.test.mjs`) via `npm run test:policy` with passing assertions for:
  - guard denial scenarios,
  - missing-actor-id scope denial scenarios,
  - allow/deny merchant scope resolution matrix across core scoped services,
  - HTTP endpoint-level allow/deny for own-vs-foreign merchant scopes.
- This is a baseline hardening layer; final target remains signed identity claims + server-authoritative scope resolution.

## Migration ETA (recommended)

### Next 3-5 days

- Harden backend authorization (actor-to-scope resolution, role guards) on all scoped list/write endpoints.
- Add structured audit logging for sensitive mutations (orders, coupons, merchant management).

### Next 1-2 weeks

- Replace remaining client auth direct calls with backend session endpoints if identity strategy phase is activated
- Remove direct Supabase from allow-list guard entries that are no longer needed

## Prioritized Remaining Backlog

### P0 (close immediately)

1. Replace remaining transitional controller header wiring with request actor context injection (cleanup refactor)
2. Add token-claim caching strategy to reduce repeated profile lookups per request burst

### P1

1. Centralize backend error shape and correlation IDs
2. Add mutation audit trails and observability dashboards
3. Add integration tests for scope-enforcement and order integrity flows

### P2

1. Session/auth transition cleanup in `Header` and related auth-dependent UI paths
2. Update and reduce architecture allow-list as migration nears completion

## Open Architectural Risks

1. Some endpoints still accept request scope parameters (`merchant_id`) and should continue evolving toward stricter server-authoritative actor-scope defaults.
2. Role resolution currently performs DB profile lookup per protected request; should be optimized with short-lived cache.
3. SQL RPC dependency still exists for selected low-level flows (`place_order`, `get_order_status`, `validate_coupon`) though orchestration is now backend-owned.
4. Large migration delta remains uncommitted in one branch state; risk of drift if not checkpointed soon.

## Success Criteria Status

- Backend exists and is operational: **Done**
- Full migration inventory exists: **Done**
- Critical paths migrated: **Done (frontend no longer uses direct Supabase)**
- Guardrails preventing regression: **Done (script + policy docs)**
- Thin-client direction established for web/mobile reuse: **Done, with remaining residuals listed above**
