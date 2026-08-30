# Batch M7.0 — Discovery & Automation Contract (Pre-Implementation Plan)

## Status

**Proposed for Approval**

This batch is discovery-only and contract-first.
No production runtime behavior changes are included in M7.0.

---

## 1) Batch Goal

Define the automation and orchestration contract for scheduled reliability operations, multi-channel delivery, and reconciliation diagnostics beyond M6 baseline.

---

## 2) Scope

## In Scope

- Scheduled reliability job contract (retention/replay/cleanup run model).
- Delivery channel capability matrix and routing/failover policy draft.
- Reconciliation diagnostics contract:
  - failure taxonomy categories
  - replay outcome metrics
  - streak/repeat-failure indicators
- Replay governance policy draft (limits, cooldowns, severity controls).
- Safety/rollback requirements for automated actions.

## Out of Scope

- No scheduler implementation yet.
- No new channel adapter implementation yet.
- No UI feature release.
- No schema migration execution.

---

## 3) Discovery Questions to Resolve

- Which reliability jobs must run automatically vs operator-triggered only?
- What minimum metadata is required to explain failover decisions?
- Which replay limits are global vs per-alert-type vs per-channel?
- What diagnostics are mandatory for first responder operators?
- How should rollback be triggered when automation causes error amplification?

---

## 4) Draft Contract Artifacts

## A) Scheduled job run model

- `job_name`
- `started_at`, `finished_at`
- `status` (`ok`/`partial`/`failed`)
- `processed_count`
- `error_count`
- `notes`

## B) Delivery channel matrix

- `channel_id`
- `supports_ack`
- `supports_retry_hint`
- `max_payload_size`
- `cooldown_capability`

## C) Failure taxonomy baseline

- `network_timeout`
- `rate_limited_429`
- `provider_5xx`
- `terminal_4xx`
- `payload_schema_error`
- `config_missing`

---

## 5) Deliverables

1. `docs/m7-architecture-plan.md`
2. `docs/batch-m7.0-pre-implementation-plan.md` (this document)
3. `docs/batch-m7.0-implementation-report.md` (closure report)

---

## 6) Risks and Mitigations

- **Risk:** over-automation causes repeated failures  
  **Mitigation:** policy-driven replay caps + circuit-breaker conditions.

- **Risk:** channel failover hides root causes  
  **Mitigation:** explicit failover reason tracking in dispatch logs.

- **Risk:** operator overload from noisy diagnostics  
  **Mitigation:** taxonomy grouping and severity prioritization.

---

## 7) Definition of Done (DoD)

- [ ] Automation contract approved for scheduled jobs
- [ ] Channel/failover policy draft approved
- [ ] Reconciliation diagnostics taxonomy approved
- [ ] Replay governance limits defined
- [ ] No runtime behavior changes introduced in this batch

---

## 8) Approval Request

If approved, execution proceeds with M7.0 documentation closure, then M7.1 scheduled reliability jobs and M7.2 channel orchestration implementation.

