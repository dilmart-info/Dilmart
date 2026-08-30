# DilMart Store — M5 Architecture Plan

## Status

**M5 Closed** — see `docs/m5-final-closure-report.md`.

M5 focus: move from M4 lightweight intelligence baselines to durable, auditable, cross-device governance and growth operations.

---

## 1) M5 Strategic Goal

Build the reliability layer that:

- centralizes operational telemetry and experiment signals
- replaces browser-local governance state with durable server contracts
- enables policy/audit consistency across devices and operators
- prepares controlled outbound automation channels (notifications/workflows)

---

## 2) M5 Design Principles

- **Durability-first:** governance-critical data must persist server-side
- **Auditability by default:** key actions are traceable with actor + timestamp
- **Scope safety:** preserve strict admin vs merchant access boundaries
- **Backward compatibility:** keep M3/M4 APIs stable while introducing v2 contracts
- **Incremental migration:** run local baseline + server contract in parallel before cutover

---

## 3) Batch Roadmap

## M5.0 — Discovery & Durability Contract

### Objectives

- Define canonical server-side contract for:
  - telemetry events
  - governance workflow tasks
  - commercial policy assignments
  - experimentation assignments/exposures/outcomes
- Produce migration map from localStorage keys to backend resources.

### Non-goals

- No production behavior change yet.

### DoD

- Data model and API contract docs approved.
- Migration/cutover plan documented with risk controls.

---

## M5.1 — Telemetry Ingestion Pipeline (Server)

### Objectives

- Add backend ingestion endpoint for client events with validation and scope-safe fields.
- Persist canonical growth/experiment events server-side.
- Keep client-side logging as fallback during transition.

### Non-goals

- No advanced analytics engine.

### DoD

- Core events stored server-side with retention policy defined.
- Read path available for admin/merchant summaries.

---

## M5.2 — Governance Workflow Persistence

### Objectives

- Move M4.5 workflow tasks (owner, deadline, status, updated_at) from browser-local to backend.
- Add minimal audit fields (updated_by, updated_at, optional note).

### Non-goals

- No external ticketing sync yet.

### DoD

- Admin workflow survives sessions/devices and is role-protected.

---

## M5.3 — Commercial Policy Persistence & Enforcement Source of Record

### Objectives

- Persist policy profiles and merchant assignments on server.
- Keep form guardrails aligned with server contract (single source of truth).

### Non-goals

- No policy language DSL.

### DoD

- Admin assignment is durable and visible across operators.
- Product/coupon validation references server policy contract.

---

## M5.4 — Experiment Registry & Reporting Contract

### Objectives

- Persist experiment registry and assignment strategy.
- Record exposures/outcomes on server and expose lightweight report endpoints.

### Non-goals

- No Bayesian/frequentist significance engine.

### DoD

- At least one existing experiment (home hero copy) fully migrated to server tracking.

---

## M5.5 — Outbound Notification Foundation

### Objectives

- Introduce pluggable notification channel abstraction (in-app + webhook/email adapter-ready).
- Route selected high-priority governance alerts through channel rules.

### Non-goals

- No full marketing automation suite.

### DoD

- One operational alert category can fan out beyond in-app feed.

---

## M5.6 — M5 Closure & Rulebook Addendum

### Objectives

- Consolidate M5 contracts and migration outcomes.
- Update governance rulebook with durability/audit requirements.

### Non-goals

- No net-new feature surface.

### DoD

- M5 final closure report published.
- Rulebook addendum and contract links updated.

---

## 4) Cross-Batch Technical Tracks

- **Schema discipline:** explicit table ownership and idempotent migrations
- **Contract versioning:** v1/v2 response strategy where needed
- **Observability:** ingestion health, dead-letter/error counters
- **Security:** RLS-compatible access model for merchant-scoped reads
- **Performance:** bounded query windows and indexed aggregate paths

---

## 5) Suggested Execution Order

1. M5.0 (contract + migration map)
2. M5.1 + M5.2
3. M5.3 + M5.4
4. M5.5
5. M5.6 closure

---

## 6) Exit Criteria for M5

M5 is considered successful when:

- key M4 local states have server source-of-record alternatives
- experiment and telemetry data are queryable beyond one browser
- governance actions are durable and auditable
- operational alerts can reach at least one outbound channel

---

## 7) Immediate Next Step

~~Start with **M5.0 Discovery & Durability Contract** in doc-first mode.~~ **Completed.** Follow-up work is out of scope for M5; see `docs/m5-final-closure-report.md` §6.
