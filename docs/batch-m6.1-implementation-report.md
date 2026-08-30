# Batch M6.1 — Telemetry Reliability & Retention Ops Implementation Report

## Status

**Completed (Baseline)**

Scope delivered: operational ingestion-health visibility and safe retention cleanup controls for server-side analytics events.

---

## 1) Backend Implementation

Files:

- `backend/src/modules/analytics/analytics.service.ts`
- `backend/src/modules/analytics/analytics.controller.ts`

Added:

- `GET /api/analytics/ops/ingestion-health?window_hours=...` (admin only)
  - reports ingested rows in window
  - reports lagging rows (created_at significantly later than occurred_at)
  - reports event-name distribution
- `POST /api/analytics/ops/retention-cleanup` (admin only)
  - payload: `older_than_days`, `dry_run`
  - **dry-run is default-safe behavior**
  - returns candidate row count and delete outcome when non-dry-run

---

## 2) Frontend API Client Coverage

File:

- `src/lib/api-client.ts`

Added:

- `getAnalyticsIngestionHealth(...)`
- `runAnalyticsRetentionCleanup(...)`

These methods are ready for future admin ops UI wiring.

---

## 3) Operational Notes

- Retention cleanup is intentionally conservative:
  - minimum retention floor: 7 days
  - default cutoff: 90 days
  - maximum accepted retention window input: 365 days
- Health/read paths remain non-blocking and return structured fallback errors when tables are unavailable.

---

## 4) Completion Verdict

**Done.** M6.1 baseline introduces reliability operations primitives for telemetry ingestion and retention hygiene.

