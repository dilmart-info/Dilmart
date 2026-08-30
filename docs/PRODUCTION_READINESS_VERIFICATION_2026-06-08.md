# Production Readiness Verification — 2026-06-08

**Phase:** PRV-1 — Code-level Release Verification Report
**Report Generated:** 2026-06-08T17:47 (Baghdad time)
**Verification Scope:** Post-Hardening + Post-Operational Scalability

---

## 1. Git / Build State

| Item | Result | Details |
|------|--------|---------|
| Latest commit on main | `02ee8b5` | PRV-1: Production Readiness Verification Report + Smoke Checklist |
| Uncommitted changes | None | Working tree clean |
| Backend `nest build` | ✅ PASS | Zero errors, zero warnings |
| Frontend `tsc --noEmit` | ✅ PASS | Zero errors |
| `test:hardening` | ✅ PASS | **39/39 tests pass, 0 fail** |
| Pending migrations | ✅ NONE | `supabase db push --dry-run` → "Remote database is up to date" |

---

## 2. Backend Smoke Matrix

Code-level verification of all critical endpoints:

| Endpoint | Method | Auth | Throttle | Status |
|----------|--------|------|----------|--------|
| `GET /health` | Public | None | SkipThrottle | ✅ Returns `{ ok: true }` |
| `GET /health/db-public` | Admin only | `@Roles("super_admin", "admin")` | Throttled (default 120/min) | ✅ No error details exposed |
| `GET /health/config-public` | Public | None | SkipThrottle | ⚠️ See Known Notes |
| `POST /checkout/preview` | Authenticated | None | 20/min | ✅ DTO validated |
| `POST /checkout/submit` | Authenticated | None | 10/min | ✅ DTO validated, phone normalized |
| `GET /orders` | Admin/Merchant | Role-based | 120/min | ✅ Paginated, merchant scope stripped of PII |
| `GET /admin/customers` | Admin/Merchant | Role-based | 120/min | ✅ Merchant uses RPC, admin uses profiles |
| `GET /admin/analytics/overview` | Admin | Role-based | 120/min | ✅ SQL RPC |
| `GET /admin/executive-governance` | Admin | Role-based | 120/min | ✅ SQL RPC |
| `GET /admin/notifications` | Admin | Role-based | 120/min | ✅ |
| `GET /auth/context` | Token-based | JWT validated | 10/min | ✅ |
| `GET /catalog/*` | Public | None | 200/min | ✅ |

---

## 3. Security Verification

### 3.1 HTTP Security Headers

| Item | Status | Location |
|------|--------|----------|
| Helmet | ✅ Active | `main.ts:40` — `app.use(helmet({ contentSecurityPolicy: false }))` |
| CSP disabled | ✅ Intentional | Required for Supabase Storage image URLs |

### 3.2 Rate Limiting

| Scope | Limit | Location |
|-------|-------|----------|
| Global default | 120/min | `app.module.ts:49` |
| Checkout preview | 20/min | `checkout.controller.ts:13` |
| Checkout submit | 10/min | `checkout.controller.ts:22` |
| Auth context | 10/min | `auth.controller.ts:13` |
| Catalog | 200/min | `catalog.controller.ts:8` |
| Health `/` | SkipThrottle | `health.controller.ts:16` |
| Health `/config-public` | SkipThrottle | `health.controller.ts:23` |
| Health `/db-public` | Default (120/min) | Admin-only, no SkipThrottle |

### 3.3 SQL RPC Security

| RPC | SECURITY DEFINER | search_path | REVOKE all | GRANT service_role |
|-----|-----------------|-------------|------------|-------------------|
| `analytics_overview()` | ✅ | ✅ `public` | ✅ | ✅ |
| `operational_alert_counts()` | ✅ | ✅ `public` | ✅ | ✅ |
| `merchant_customer_summary()` | ✅ | ✅ `public` | ✅ (in OS-2 migration) | ✅ (in OS-2 migration) |
| `executive_governance_metrics()` | ✅ | ✅ `public` | ✅ | ✅ |

> **Note:** `merchant_customer_summary` was redefined in OS-2.2 migration without repeating REVOKE/GRANT. PostgreSQL preserves existing privileges on `CREATE OR REPLACE FUNCTION` for the same signature, so the original OS-2 grants remain active. Non-blocking but noted.

### 3.4 Input Validation

| Validator | Coverage | Tests |
|-----------|----------|-------|
| `IsIraqiPhoneConstraint` | Checkout phone field | 6 tests (#1-#11) |
| `NoHtmlTagsConstraint` | All text fields in checkout DTO | 8 tests (#12-#20) |
| `escapePostgrestSearch` | All search queries | 6 tests (#21-#27) |
| `sanitizeSearchTerm` | All search inputs | 3 tests (#28-#30) |
| `buildSafeOrFilter` | Search filter construction | 1 test (#31) |

---

## 4. Privacy Verification

### 4.1 Orders List — What Each Role Sees

| Field | Admin | Merchant |
|-------|-------|----------|
| `order_number` | ✅ | ✅ |
| `status` | ✅ | ✅ |
| `total` | ✅ | ✅ |
| `created_at` | ✅ | ✅ |
| `customer_name` | ✅ | ❌ **Not in select** |
| `customer_phone` | ✅ | ❌ **Not in select** |
| `governorates(name)` | ✅ | ✅ |
| Search on `customer_name` | ✅ | ❌ Merchant searches `order_number` only |
| Search on `customer_phone` | ✅ | ❌ |

**Evidence:** `orders.service.ts:74` — merchant select omits `customer_name`, `customer_phone`. Line 85 — merchant search is `["order_number"]` only. Tests #33-#34 enforce this.

### 4.2 Customers Page — What Each Role Sees

| Field | Admin | Merchant |
|-------|-------|----------|
| `full_name` | ✅ | ❌ |
| `email` | ✅ | ❌ |
| `phone` | ✅ | ❌ |
| `customer_ref` | — | ✅ `عميل #A1B2` (MD5 hash) |
| `phone_masked` | — | ✅ `****4567` (last 4 digits) |
| `orders` count | — | ✅ |
| `spent` total | — | ✅ |
| Search on full phone | ✅ | ❌ **RPC searches only on `customer_ref` and `phone_masked`** |
| Search on full name | ✅ | ❌ |

**Evidence:** Tests #36-#39 enforce RPC usage, no PII in response, search on masked fields only. Test #39 reads actual SQL migration file and verifies no `customer_name ILIKE` or `customer_phone ILIKE`.

### 4.3 Privacy Verdict

> **Merchant cannot see, search, or infer full customer PII through any API endpoint.**

---

## 5. Performance Verification

| Function | Before | After | Rows loaded to TS |
|----------|--------|-------|-------------------|
| `computeOperationalAlerts()` | 3 full tables (merchants, products, orders) | 1 RPC: `operational_alert_counts()` → 4 integers | **0** |
| `getScopedCustomers()` merchant | All orders → JS Map grouping | 1 RPC: `merchant_customer_summary()` → paginated JSON | **0** |
| `getExecutiveGovernance()` | All orders → JS filter/loop/reduce | 1 RPC: `executive_governance_metrics()` → JSON | **0** |
| `listOrders()` | N/A (was always paginated) | Paginated with `count: "exact"` | **page-size only** |

---

## 6. Supabase Migration Verification

### 6.1 Migration Status

All deployed. `supabase db push --dry-run` → "Remote database is up to date."

### 6.2 Migrations Added During Hardening + OS Phases

| Migration | Phase | Purpose |
|-----------|-------|---------|
| `20260608122500_fix_place_order_overloads.sql` | Pre-hardening | Fix checkout 500 |
| `20260608130000_analytics_rpc.sql` | PR-P2 | Analytics overview RPC |
| `20260608140000_regions.sql` | PR-F1 | Regions table + seed data |
| `20260608150000_analytics_rpc_hardening.sql` | PR-H8 | search_path + REVOKE/GRANT for analytics |
| `20260608163000_operational_alert_counts_rpc.sql` | OS-1.1 | Alert counts RPC |
| `20260608170000_merchant_customer_summary_rpc.sql` | OS-2 | Customer aggregation RPC (initial) |
| `20260608173000_fix_merchant_customer_search_privacy.sql` | OS-2.1 | Search privacy fix |
| `20260608175000_fix_merchant_customer_pagination.sql` | OS-2.2 | CTE pagination fix |
| `20260608180000_executive_governance_metrics_rpc.sql` | OS-3 | Executive governance RPC |

### 6.3 Security Audit per RPC

| RPC | SECURITY DEFINER | search_path | REVOKE/GRANT self-contained |
|-----|-----------------|-------------|----------------------------|
| `analytics_overview` | ✅ | ✅ | ✅ (in hardening migration) |
| `operational_alert_counts` | ✅ | ✅ | ✅ |
| `merchant_customer_summary` | ✅ | ✅ | ⚠️ REVOKE/GRANT in OS-2 migration, not repeated in OS-2.2 |
| `executive_governance_metrics` | ✅ | ✅ | ✅ |

---

## 7. Known Non-blocking Notes

| # | Note | Severity | Impact |
|---|------|----------|--------|
| 1 | `/health/config-public` still has `@SkipThrottle()` | Low | Exposes only `supabaseProjectRef` (not secret). Could be throttled or made admin-only later. |
| 2 | Executive weekly label uses `TO_CHAR('DD Mon')` — may render in English | Low | UI cosmetic only. Future: return `week_start` timestamp, format in frontend with Arabic locale. |
| 3 | `merchant_readiness` still uses `merchantsService` (N+1 per merchant) | Low | Acceptable at pilot scale (~20 merchants). Document for future SQL migration. |
| 4 | `merchant_customer_summary` OS-2.2 migration lacks REVOKE/GRANT | Low | PostgreSQL preserves grants from OS-2 migration on `CREATE OR REPLACE`. Functionally correct. |
| 5 | `customer_ref` uses 4-char MD5 prefix — possible collision | Low | Label-only purpose. Future: extend to 6 chars. |
| 6 | Throttler is per-instance (in-memory) — not shared across Render instances | Low | Acceptable for single-instance pilot. Redis-backed throttler needed for horizontal scaling. |
| 7 | Profile `latitude`/`longitude`/`map_url` not returned by `/auth/context` | Low | Was always `null` — `as any` was hiding dead code. Now explicitly `null` (fixed in `02ee8b5`). |

---

## 8. Verification Commands — Results

```
# Backend Build
> cd backend && npx nest build
✅ PASS — zero errors

# Frontend Type Check
> npx tsc --noEmit
✅ PASS — zero errors

# Hardening Regression Tests
> npm run test:hardening
✅ 39/39 PASS, 0 FAIL

# Supabase Migration Status
> npx supabase db push --dry-run
✅ "Remote database is up to date"

# Git Status
> git log --oneline -1
02ee8b5 PRV-1: Production Readiness Verification Report + Smoke Checklist

> git status --short
(clean — no uncommitted changes)
```

---

## 9. Final Verdict

# ✅ READY WITH MINOR NON-BLOCKING NOTES

**Justification:**

- All builds pass (backend + frontend).
- All 39 regression tests pass.
- All migrations deployed to production Supabase.
- Security headers (Helmet) active.
- Rate limiting configured globally and per-endpoint.
- All 4 SQL RPCs secured with SECURITY DEFINER + service_role restriction.
- Merchant privacy enforced at SQL level — no PII leakage in response or search.
- Performance-critical functions migrated from full-table JS scans to SQL aggregation.
- No blockers identified.
- 8 non-blocking notes documented for future improvement.

**Ready for pilot deployment.**
