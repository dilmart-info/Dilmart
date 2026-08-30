# Batch M3.8 — Lightweight Admin Governance Layer Implementation Report

## Status

**Completed**

Scope implemented: lightweight governance signals embedded into admin dashboard for daily operational oversight.

---

## 1) Objectives Implemented

- Add a concise governance layer without heavy new modules.
- Surface key operational risk indicators in one admin location.
- Highlight top merchant-readiness follow-up priorities.

---

## 2) Implementation

File:

- `src/pages/admin/Dashboard.tsx`

Added new dashboard query block:

- `admin-governance-light-layer`

Aggregated from existing APIs:

- merchants list (`getAdminMerchants`)
- scoped products (`listScopedProducts`)
- scoped orders (`listScopedOrders`)
- merchant readiness (`getMerchantReadiness` per merchant)

Calculated governance metrics:

- total merchants
- non-ready merchants
- non-ready products
- delayed orders (>24h in pending states)
- top non-ready merchants (name + readiness score)

UI additions:

- new section card: `الحوكمة التشغيلية الخفيفة`
- KPI tiles for the above indicators
- quick follow-up list for top non-ready merchants

---

## 3) Operational Impact

- Admin gets immediate multi-merchant health signal on entry.
- Readiness and delayed-order risks are visible without switching pages.
- Supports faster daily triage and follow-up prioritization.

---

## 4) Validation

- Lint checks executed on touched file.
- No new lint errors introduced.

---

## 5) Completion Verdict

**M3.8 is implemented and active in admin dashboard.**

The platform now includes a practical governance layer with low complexity and high operational visibility.
