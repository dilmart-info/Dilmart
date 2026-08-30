# Batch M5.2 — Governance Workflow Persistence Implementation Report

## Status

**Completed (Baseline + Fallback)**

Scope delivered: server-side governance workflow task APIs with admin-role protection, plus dashboard integration that prefers server persistence and safely falls back to local storage.

---

## 1) Backend Implementation

Files:

- `backend/src/modules/admin/admin.service.ts`
- `backend/src/modules/admin/admin.controller.ts`

Added:

- `GET /api/admin/governance/tasks?task_ids=...`
  - returns persisted workflow rows by `task_id` (`owner`, `deadline`, `status`, `updated_at`, `updated_by`, `note`)
  - soft-fails with structured message when table is unavailable
- `POST /api/admin/governance/tasks/:id`
  - upserts server record by `task_id`
  - stores `updated_by`, `updated_at`
  - writes audit log entry

---

## 2) Frontend Integration

Files:

- `src/lib/api-client.ts`
- `src/pages/admin/Dashboard.tsx`

Added:

- API client methods:
  - `listAdminGovernanceTasks(...)`
  - `upsertAdminGovernanceTask(...)`
- Admin dashboard workflow now:
  - loads server task map for non-ready merchants
  - uses server values as primary source
  - falls back to existing local workflow store if server persistence is unavailable
  - preserves non-blocking operator flow

---

## 3) Operational Behavior

- If `governance_tasks` table is available, task lifecycle becomes cross-session and cross-device for admins.
- If unavailable, workflow remains functional via local fallback (M4 behavior continuity).

---

## 4) Completion Verdict

**Done.** M5.2 baseline introduces durable governance task persistence while keeping M4 local safety net.

