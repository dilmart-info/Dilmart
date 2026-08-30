# Batch M5.4 — Experiment Registry & Reporting Contract Implementation Report

## Status

**Completed (Baseline)**

Scope delivered: server-side experiment registry/read APIs and server-first reporting contract for experiment exposure/outcome rollups, with dashboard fallback to local summary.

---

## 1) Backend Contract

Files:

- `backend/src/modules/analytics/analytics.service.ts`
- `backend/src/modules/analytics/analytics.controller.ts`

Added:

- `GET /api/analytics/experiments`
  - lists registry rows from `experiments_registry`
  - fallback to default registered experiment when table is unavailable
- `POST /api/analytics/experiments`
  - upsert experiment registry row (`experiment_id`, label, surface, variants, primary outcome, status)
- `GET /api/analytics/experiments/report?experiment_id=...&window_days=...`
  - aggregates `experiment.exposed` and `experiment.outcome` from `analytics_events`
  - returns rollup by variant

---

## 2) Frontend Integration

Files:

- `src/lib/api-client.ts`
- `src/pages/admin/Dashboard.tsx`

Added:

- API methods:
  - `listAnalyticsExperiments()`
  - `getAnalyticsExperimentReport(...)`
- Dashboard experiment card now:
  - prefers server report contract (`M5.4`)
  - falls back to local `getExperimentRollup` if server data is unavailable

---

## 3) Operational Notes

- Registry and reporting are lightweight and contract-oriented; no statistical significance engine is included.
- The fallback keeps M4.7 behavior continuity while M5 tables are phased in.

---

## 4) Completion Verdict

**Done.** M5.4 introduces a durable experiment reporting contract and server-first admin visibility path.

