# Batch M8.0 — Discovery & Recovery Contract (Pre-Implementation Plan)

## Status

**Proposed for Approval**

This batch is discovery-only and contract-first.
No production runtime behavior changes are included in M8.0.

---

## 1) Batch Goal

Define deterministic recovery contracts for dead-letter handling, replay lifecycle orchestration, and provider-grade outbound telemetry.

---

## 2) Scope

## In Scope

- Dead-letter queue contract (record shape + transition rules).
- Replay lifecycle states and transition guards.
- Provider acknowledgment telemetry contract.
- Policy trend analytics contract (blocked replay and failure clusters).
- Rollout/cutover constraints for compatibility with M7 contracts.

## Out of Scope

- No queue worker/runtime implementation yet.
- No provider SDK integration work yet.
- No admin lifecycle UI release yet.
- No schema migration execution.

---

## 3) Discovery Questions to Resolve

- Which failure patterns should move directly to dead-letter vs retry queue?
- What minimum fields are required to explain lifecycle transition decisions?
- Which provider acknowledgment fields are mandatory vs optional?
- How should operators resolve stale dead-letter records safely?
- What trend windows best represent resilience health for governance cadence?

---

## 4) Draft Contract Artifacts

## A) Dead-letter record model

- `dead_letter_id`
- `dispatch_key`
- `alert_type`
- `failure_category`
- `last_error_message`
- `state` (`dead_lettered` | `resolved`)
- `created_at`
- `updated_at`

## B) Replay lifecycle states

- `new`
- `retrying`
- `dead_lettered`
- `resolved`

## C) Provider telemetry baseline

- `provider_name`
- `provider_message_id`
- `ack_status`
- `ack_at`
- `provider_error_code`

---

## 5) Deliverables

1. `docs/m8-architecture-plan.md`
2. `docs/batch-m8.0-pre-implementation-plan.md` (this document)
3. `docs/batch-m8.0-implementation-report.md` (closure report)

---

## 6) Risks and Mitigations

- **Risk:** lifecycle model over-complexity slows operator response  
  **Mitigation:** keep initial states minimal and action-oriented.

- **Risk:** provider telemetry shape divergence across adapters  
  **Mitigation:** standardize core acknowledgment fields with extension slots.

- **Risk:** aggressive dead-lettering hides recoverable paths  
  **Mitigation:** enforce explicit transition guards and review thresholds.

---

## 7) Definition of Done (DoD)

- [ ] Recovery lifecycle contract approved
- [ ] Dead-letter handling contract approved
- [ ] Provider telemetry contract approved
- [ ] Trend analytics contract approved
- [ ] No runtime behavior changes introduced in this batch

---

## 8) Approval Request

If approved, execution proceeds with M8.0 documentation closure, then M8.1 dead-letter queue baseline and M8.2 provider acknowledgment telemetry.

