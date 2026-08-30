# DilMart Store — M6 Architecture Plan

## Status

**M6 Closed** — see `docs/m6-final-closure-report.md`.

M6 focus: move from M5 durable baselines to production hardening, reliability operations, and controlled automation at scale.

---

## 1) M6 Strategic Goal

Build the scale-hardening layer that:

- removes remaining fallback ambiguity and finalizes server-only operational truth
- strengthens delivery reliability for outbound automation
- improves observability, reconciliation, and data hygiene operations
- enables safer scaling with runbooks, SLO-style monitoring, and governance controls

---

## 2) M6 Design Principles

- **Server truth:** operational records should converge to server-only source of record
- **Reliability-first:** prioritize retry/ack/reconciliation over feature expansion
- **Measured automation:** expand channels only with guardrails and observability
- **Controlled migration:** each cutover has rollback path and verification gates
- **Non-breaking evolution:** preserve existing user/admin UX contracts where possible

---

## 3) Batch Roadmap

## M6.0 — Discovery & Cutover Contract

### Objectives

- Define strict cutover criteria for removing local fallbacks introduced in M4/M5.
- Specify operational SLO baselines (ingestion success, webhook dispatch success, task persistence latency).
- Produce reconciliation plan for legacy/local records.

### Non-goals

- No production feature behavior changes yet.

### DoD

- Cutover matrix approved with rollback strategy.
- Monitoring KPIs and thresholds documented.

---

## M6.1 — Telemetry Reliability & Retention Ops

### Objectives

- Add retention/cleanup and integrity checks for analytics events.
- Add ingestion health metrics and error classification.

### Non-goals

- No new analytics dashboards beyond operations visibility.

### DoD

- Ingestion reliability and retention jobs documented and runnable.

---

## M6.2 — Workflow & Policy Cutover (Server-Only Mode)

### Objectives

- Move governance workflow and commercial policy flows to strict server mode.
- Keep read/write fallback as emergency flag only (disabled by default).

### Non-goals

- No redesign of workflow UX.

### DoD

- Dashboard/forms run server-first with explicit fallback-off default.

---

## M6.3 — Outbound Delivery Tracking & Retry

### Objectives

- Persist outbound dispatch attempts with status/attempt count/last error.
- Add retry policy for transient webhook failures.

### Non-goals

- No multi-provider notification orchestration yet.

### DoD

- Dispatch success/failure can be audited and retried safely.

---

## M6.4 — Reconciliation Console (Admin)

### Objectives

- Add admin reconciliation surface for failed dispatches and data drift checks.
- Support manual replay/reconcile actions for selected records.

### Non-goals

- No full ticketing platform implementation.

### DoD

- Operators can identify and recover from common failure scenarios without DB access.

---

## M6.5 — M6 Closure & Operations Rulebook Update

### Objectives

- Consolidate M6 hardening outcomes and cutover completion.
- Update governance rulebook with reliability operations and reconciliation routines.

### Non-goals

- No net-new customer-facing features.

### DoD

- M6 final closure report published.
- Rulebook addendum updated and linked.

---

## 4) Cross-Batch Technical Tracks

- **Reliability metrics:** ingestion and delivery success rates, queue depth, retry backlog
- **Operational tooling:** replay endpoints, dead-letter visibility, safe manual actions
- **Data hygiene:** retention windows, archival strategy, cleanup safety checks
- **Security:** strict role checks for reconcile/replay actions
- **Performance:** bounded operational queries, indexes for event/task/dispatch tables

---

## 5) Suggested Execution Order

1. M6.0 (contract + cutover matrix)
2. M6.1 + M6.2
3. M6.3 + M6.4
4. M6.5 closure

---

## 6) Exit Criteria for M6

M6 is considered successful when:

- fallback-dependent operational paths are formally cut over or explicitly gated
- outbound alert delivery is observable, auditable, and retryable
- operators can reconcile failures through documented/admin-safe flows
- retention and cleanup operations are defined and verifiable

---

## 7) Immediate Next Step

~~Start with **M6.0 Discovery & Cutover Contract** in doc-first mode.~~ **Completed.** Follow-up work is out of scope for M6; see `docs/m6-final-closure-report.md` §6.
