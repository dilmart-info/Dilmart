# Batch M5.0 — Discovery & Durability Contract (Pre-Implementation Plan)

## Status

**Proposed for Approval**

This batch is discovery-only and contract-first.
No production runtime behavior changes are included in M5.0.

---

## 1) Batch Goal

Define the durable server-side contract that upgrades M4 lightweight local baselines into auditable, cross-device operational primitives.

---

## 2) Scope

## In Scope

- Inventory all M4 browser-local state keys and map each to target backend resource.
- Define canonical event ingestion contract for growth + experiment events.
- Define durable contracts for:
  - governance workflow tasks
  - commercial policy profile assignment
  - experiment assignment/exposure/outcome records
- Propose migration strategy: dual-write/read fallback/cutover gates.
- Draft acceptance criteria for M5.1–M5.4 implementations.

## Out of Scope

- No schema migration execution.
- No API endpoint implementation.
- No UI wiring changes.
- No external integrations.

---

## 3) Discovery Questions to Resolve

- Which localStorage states are temporary UX-only vs operational records of truth?
- What minimum fields are required for auditability per entity?
- How should idempotency be handled in event ingestion?
- Which contracts require versioning immediately (`v1`/`v2`)?
- What cutover order minimizes risk while preserving M4 behavior?

---

## 4) Local-to-Durable Mapping Draft

| Current Key / Surface                      | Current Location     | Proposed Durable Entity             | Priority |
| ------------------------------------------ | -------------------- | ----------------------------------- | -------- |
| `DilMart-growth-hooks-log-v1`              | browser localStorage | `analytics_events`                  | P0       |
| `DilMart-experiment-assignments-v1`        | browser localStorage | `experiment_assignments`            | P0       |
| `experiment.exposed/outcome` log records   | browser event log    | `experiment_events`                 | P0       |
| `DilMart-admin-governance-workflow-v1`     | browser localStorage | `governance_tasks`                  | P0       |
| `DilMart-commercial-policy-assignments-v1` | browser localStorage | `merchant_policy_assignments`       | P0       |
| `DilMart-executive-readiness-history-v1`   | browser localStorage | optional materialized weekly series | P1       |
| merchant nudge state                       | browser localStorage | optional `merchant_nudge_state`     | P2       |

---

## 5) Proposed Contract Surfaces (Draft)

## A) Telemetry ingest

- `POST /api/analytics/events/ingest`
- payload: array of canonical events (`name`, `occurred_at`, `actor_scope`, `merchant_id?`, `product_id?`, `experiment_id?`, `variant_id?`, `outcome_key?`, `source_surface?`, `session_id?`)
- response: accepted/rejected counts + validation errors

## B) Governance tasks

- `GET /api/admin/governance/tasks`
- `PATCH /api/admin/governance/tasks/:id`
- fields: `owner`, `deadline`, `status`, `updated_by`, `updated_at`, `note?`

## C) Policy assignment

- `GET /api/admin/commercial-policy/assignments`
- `PUT /api/admin/commercial-policy/assignments/:merchantId`

## D) Experiment registry/reporting

- `GET /api/admin/experiments`
- `POST /api/admin/experiments`
- `GET /api/admin/experiments/:id/report?window=...`

---

## 6) Migration Strategy (Draft)

## Phase 1 — Shadow Write

- keep existing local behavior
- add optional server writes where available
- no UI dependency on server data yet

## Phase 2 — Read Preference Switch

- admin/merchant surfaces prefer server data
- fallback to local only when server unavailable

## Phase 3 — Cutover

- deprecate local keys for operational records
- retain local cache for UX-only optimizations

---

## 7) Risks and Mitigations

- **Risk:** schema over-design slows implementation  
  **Mitigation:** lock MVP fields for M5.1–M5.4 only.

- **Risk:** duplicate records during dual-write  
  **Mitigation:** include idempotency key and dedupe policy.

- **Risk:** scope leakage between merchants/admin  
  **Mitigation:** preserve role guards and merchant scope resolver rules from M3/M4.

---

## 8) Deliverables

1. `docs/m5-architecture-plan.md`
2. `docs/batch-m5.0-pre-implementation-plan.md` (this document)
3. `docs/batch-m5.0-implementation-report.md` (after execution)

---

## 9) Definition of Done (DoD)

- [ ] Durable contract draft approved for telemetry/governance/policy/experiments
- [ ] Local-to-durable mapping finalized with priorities
- [ ] Migration phases and rollback strategy documented
- [ ] No production code behavior changed in this batch

---

## 10) Approval Request

If approved, execution proceeds with M5.0 documentation closure first, then implementation begins with M5.1 telemetry ingestion and M5.2 governance persistence.
