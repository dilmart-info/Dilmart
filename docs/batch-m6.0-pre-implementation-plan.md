# Batch M6.0 — Discovery & Cutover Contract (Pre-Implementation Plan)

## Status

**Proposed for Approval**

This batch is discovery-only and contract-first.
No production runtime behavior changes are included in M6.0.

---

## 1) Batch Goal

Define the operational cutover and reliability contract needed to transition M5 durable baselines into production-grade, fallback-minimized operations.

---

## 2) Scope

## In Scope

- Build fallback-to-server cutover matrix for:
  - governance workflow persistence
  - commercial policy assignment resolution
  - experiment reporting source
  - outbound alert fanout paths
- Define reliability KPIs/SLO-style thresholds:
  - ingestion accept rate
  - outbound dispatch success rate
  - retry backlog threshold
  - task/policy write error rate
- Define reconciliation contract (detect, classify, recover).
- Define retention and cleanup baseline for analytics and dispatch records.
- Produce runbook draft for operations handoff.

## Out of Scope

- No endpoint implementation.
- No schema migration execution.
- No admin UI implementation.
- No provider expansion beyond current webhook baseline.

---

## 3) Discovery Questions to Resolve

- Which fallbacks are still required for continuity, and which can be disabled safely now?
- What observable signals gate fallback-off decisions?
- What is the minimum retry policy that avoids alert floods and silent drops?
- Which reconciliation actions must be self-serve in admin vs engineering-only?
- What retention windows balance auditability and storage cost?

---

## 4) Proposed Cutover Matrix (Draft)

| Flow | Current State | Target State | Cutover Gate |
|---|---|---|---|
| Governance workflow task writes | server-first + local fallback | server-only default | write success rate >= 99% for 14d |
| Commercial policy assignment | server-first + local fallback | server-only default | assignment read/write stable for 14d |
| Experiment admin report | server-first + local fallback | server-only default | report endpoint healthy + data parity checks |
| Outbound delayed-order fanout | in-app + optional webhook | tracked dispatch + retry policy | dispatch tracking + retry baseline in place |

---

## 5) Reliability Metrics Contract (Draft)

- `ingest_accept_rate_24h`
- `outbound_dispatch_success_rate_24h`
- `outbound_retry_queue_size`
- `governance_task_write_error_rate_24h`
- `policy_assignment_write_error_rate_24h`

All metrics must define:
- window (`last_24h`, `last_7d`)
- denominator rules
- null/zero handling
- alert thresholds

---

## 6) Deliverables

1. `docs/m6-architecture-plan.md`
2. `docs/batch-m6.0-pre-implementation-plan.md` (this document)
3. `docs/batch-m6.0-implementation-report.md` (closure report)

---

## 7) Risks and Mitigations

- **Risk:** premature fallback removal causes operator disruption  
  **Mitigation:** staged cutover with explicit rollback switch.

- **Risk:** unseen dispatch failures in outbound channel  
  **Mitigation:** introduce tracked attempts + retry backlog thresholds before hard cutover.

- **Risk:** retention cleanup removes useful audit trails  
  **Mitigation:** retention policy with protected audit minimum window.

---

## 8) Definition of Done (DoD)

- [ ] Cutover matrix finalized with measurable gates
- [ ] Reliability metric contract approved
- [ ] Reconciliation workflow drafted (detect → classify → recover)
- [ ] Retention/cleanup baseline documented
- [ ] No runtime behavior changes introduced in this batch

---

## 9) Approval Request

If approved, execution proceeds with M6.0 documentation closure first, then M6.1 telemetry reliability operations and M6.2 server-only cutover work.

