# Batch M4.2 — Merchant Performance Scorecard Implementation Report

## Status

**Completed**

Scope implemented: merchant performance scorecard foundation (backend computation + admin visibility in list/detail).

---

## 1) Backend Implementation

Files:

- `backend/src/modules/merchants/merchants.service.ts`
- `backend/src/modules/merchants/merchants.controller.ts`

Added endpoint:

- `GET /api/merchants/:id/performance-scorecard`

Scorecard output includes:

- overall score (`0..100`)
- trend (`stable` baseline in this batch)
- KPI group:
  - store readiness score
  - product readiness coverage
  - active catalog ratio
  - low stock ratio
  - delayed order ratio
  - delivered revenue
  - average order value
- totals:
  - total products
  - total orders
  - delayed pending orders

Current weighted score baseline:

- store readiness: 35%
- product readiness coverage: 25%
- active catalog ratio: 15%
- inverse low-stock ratio: 10%
- inverse delayed-order ratio: 15%

---

## 2) Frontend Integration

Files:

- `src/lib/api-client.ts`
- `src/pages/admin/Merchants.tsx`
- `src/pages/admin/MerchantDetail.tsx`

Implemented:

- API client method:
  - `getMerchantPerformanceScorecard(merchantId)`
- Merchant list:
  - new `الأداء` column with per-merchant performance score badge
- Merchant detail:
  - new performance scorecard card with:
    - total score progress bar
    - key KPI slices (readiness, catalog activity, delayed ratio)

---

## 3) Operational Impact

- Admin can rank merchants by operational/commercial health at a glance.
- Merchant detail now combines readiness + scorecard for faster intervention decisions.
- Provides baseline for M4.5 governance workflows and M4.8 executive views.

---

## 4) Validation

- Lint checks executed on all touched files.
- No new lint errors introduced.

---

## 5) Completion Verdict

**M4.2 is implemented and usable.**

Merchant performance is now measurable in a single scorecard model and visible in core admin operations surfaces.
