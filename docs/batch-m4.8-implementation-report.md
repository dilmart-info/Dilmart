# Batch M4.8 — Executive Governance View Implementation Report

## Status

**Completed**

Scope implemented: leadership-facing executive snapshot with merchant health distribution, delayed-order risk by governorate, weekly commercial throughput, and a lightweight local readiness trend — without predictive forecasting.

---

## 1) Implementation Summary

### A) Backend — `GET /api/admin/analytics/executive`

Files:

- `backend/src/modules/merchants/merchants.service.ts` — `getPlatformMerchantReadinessSummariesForAdmin()` (per-merchant readiness, buckets 0–49 / 50–79 / 80–100, averages)
- `backend/src/modules/admin/admin.service.ts` — `getExecutiveGovernance()` aggregates readiness, delayed orders (>24h, pending statuses) by `governorates(name)`, and 8 non-overlapping weekly windows of order count + revenue
- `backend/src/modules/admin/admin.controller.ts` — route registration
- `backend/src/modules/admin/admin.module.ts` — imports `MerchantsModule` for `MerchantsService` injection

Response shape: `contract_version`, `generated_at`, `merchant_health`, `delayed_order_risk`, `weekly_commercial_throughput`.

### B) Frontend — Executive page

Files:

- `src/lib/admin-executive.types.ts` — typed response
- `src/lib/api-client.ts` — `getAdminExecutiveGovernance()`
- `src/lib/executive-readiness-history.ts` — weekly snapshot of avg readiness in `localStorage` when the page loads (sparse trend over time)
- `src/pages/admin/Executive.tsx` — KPI tiles, pie (distribution), horizontal bar (delayed by governorate), line (readiness history), composed bar+line (weekly orders + revenue), list of lowest readiness merchants with links to `/admin/merchants/:id`
- `src/App.tsx` — `/admin/executive` route
- `src/components/AdminLayout.tsx` — sidebar entry «حوكمة تنفيذية»

### C) Tests

- `backend/tests/policy-matrix.test.mjs` — asserts `GET /api/admin/analytics/executive` returns 403 without auth

---

## 2) Metric Semantics

- **Merchant health distribution:** Current readiness scores only (no historical store on server).
- **Readiness trend:** Browser-local weekly snapshots of **platform average** readiness when an admin opens the executive page — builds a simple line over visits/weeks.
- **Conversion trend (proxy):** **Weekly order volume + revenue** from server orders (no client funnel), labeled clearly as operational/commercial momentum.

---

## 3) Limitations (by design)

- Readiness history depends on **repeat visits** to the executive page in different weeks (lightweight baseline).
- Platform-wide funnel conversion still requires centralized telemetry if needed later.

---

## 4) Completion Verdict

**Done.** Leadership can open **حوكمة تنفيذية** for a weekly health snapshot without drilling into raw tables.
