# DilMart Store — M7 Architecture Plan

## Status

**M7 Closed**

M7 focus: evolve M6 reliability baseline into automated operations at scale, multi-channel delivery orchestration, and deeper recovery intelligence.

---

## 1) M7 Strategic Goal

Build the automation-and-resilience layer that:

- schedules reliability jobs (retention, replay, cleanup) without manual dependence
- expands outbound channels beyond webhook-first baseline
- improves reconciliation insights and operator decision speed
- introduces policy-driven automation with explicit safety controls

---

## 2) M7 Design Principles

- **Automate with guardrails:** every automation path must be bounded and reversible
- **Channel abstraction first:** delivery logic should be provider-agnostic
- **Actionable observability:** dashboards must drive recovery decisions, not just status display
- **Controlled blast radius:** retries/replays must support quotas and scoped execution
- **Compatibility-first:** preserve M6 APIs while introducing richer v2 surfaces incrementally

---

## 3) Batch Roadmap

## M7.0 — Discovery & Automation Contract

### Objectives

- Define automation contract for scheduled jobs and replay policies.
- Define channel capability matrix (webhook/email/provider adapters).
- Define reconciliation analytics contract (failure taxonomy, replay effectiveness).

### Non-goals

- No runtime behavior change yet.

### DoD

- Automation + channel + reconciliation contracts approved.
- Safety limits and rollback controls documented.

---

## M7.1 — Scheduled Reliability Jobs

### Objectives

- Add scheduled jobs for:
  - retention cleanup runs
  - stale failed-dispatch scans
  - bounded replay windows (policy-controlled)
- Persist job run summaries and outcomes.

### Non-goals

- No autonomous replay of all failures without policy checks.

### DoD

- At least one scheduled reliability job runs with audit-safe summaries.

---

## M7.2 — Multi-Channel Delivery Orchestration

### Objectives

- Expand outbound channels to support at least one additional adapter (e.g. email).
- Add channel-priority/fallback routing rules.

### Non-goals

- No marketing campaign engine.

### DoD

- Alert can route through primary channel and fail over based on policy.

---

## M7.3 — Reconciliation Analytics & Diagnostics

### Objectives

- Add failure taxonomy views (timeout, 429, 5xx, terminal 4xx, schema/config).
- Add replay outcome analytics (success-after-retry, repeated-failure streaks).

### Non-goals

- No predictive ML failure forecasting.

### DoD

- Admin reconciliation UI includes grouped diagnostics and replay effectiveness indicators.

---

## M7.4 — Policy-Driven Replay Governance

### Objectives

- Add replay policies:
  - max attempts per window
  - cooldown per alert signature
  - severity-based replay allowances
- Enforce limits on manual and scheduled replay actions.

### Non-goals

- No organization-level RBAC redesign.

### DoD

- Replay execution obeys policy limits and provides clear operator feedback.

---

## M7.5 — M7 Closure & Operations Playbook Update

### Objectives

- Consolidate M7 automation and orchestration outcomes.
- Update governance rulebook with scheduled operations and replay policy standards.

### Non-goals

- No net-new customer-facing commerce features.

### DoD

- M7 final closure report published.
- Rulebook/playbook links updated and validated.

---

## 4) Cross-Batch Technical Tracks

- **Job safety:** idempotent runs, lock discipline, bounded execution windows
- **Dispatch intelligence:** channel telemetry, failover reasons, delivery acknowledgments
- **Diagnostics:** error normalization and replay outcome lineage
- **Governance:** policy contracts for retries/replays with hard caps
- **Performance:** index strategy for attempt history and job-run summaries

---

## 5) Suggested Execution Order

1. M7.0 (contract first)
2. M7.1 + M7.2
3. M7.3 + M7.4
4. M7.5 closure

---

## 6) Exit Criteria for M7

M7 is considered successful when:

- critical reliability operations can run on schedule with bounded risk
- outbound delivery supports multi-channel routing/failover policies
- reconciliation includes diagnostic groupings and replay effectiveness insight
- replay actions (manual/scheduled) are policy-governed and auditable

---

## 7) Immediate Next Step

~~Proceed with **M7.5 — M7 Closure & Operations Playbook Update**.~~ **Completed.** Move follow-up reliability expansion to next phase planning.
