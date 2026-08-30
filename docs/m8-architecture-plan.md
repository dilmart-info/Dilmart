# DilMart Store — M8 Architecture Plan

## Status

**M8 Closed**

M8 focus: evolve M7 operational governance into deterministic recovery orchestration, provider-grade delivery telemetry, and deeper resilience controls at scale.

---

## 1) M8 Strategic Goal

Build the deterministic reliability layer that:

- introduces dead-letter queue patterns and replay lifecycle states
- expands outbound observability to provider acknowledgment telemetry
- turns policy outcomes into trendable operational intelligence
- strengthens incident-safe automation boundaries

---

## 2) M8 Design Principles

- **Deterministic recovery:** every failed dispatch must have a clear lifecycle state
- **Policy-as-contract:** replay and escalation decisions must be explicit and explainable
- **Provider observability:** delivery channels must expose acknowledgment and failure context
- **Operator-first ergonomics:** diagnostics must reduce mean-time-to-recovery
- **Safe rollout:** preserve compatibility with M7 contracts while adding v2 controls

---

## 3) Batch Roadmap

## M8.0 — Discovery & Recovery Contract

### Objectives

- Define dead-letter queue contract and replay lifecycle state model.
- Define provider telemetry/acknowledgment contract for outbound channels.
- Define trend analytics contract for policy-blocked replays and failure clusters.

### Non-goals

- No runtime behavior change yet.

### DoD

- Recovery and telemetry contracts approved.
- Migration and rollout guardrails documented.

---

## M8.1 — Dead-Letter Queue Baseline

### Objectives

- Introduce dead-letter queue persistence for terminal or exhausted failures.
- Add lifecycle transitions (new, retrying, dead_lettered, resolved).

### Non-goals

- No auto-reopen workflows from external systems.

### DoD

- Failed dispatches can move into dead-letter records with auditable transitions.

---

## M8.2 — Provider Acknowledgment Telemetry

### Objectives

- Expand outbound attempt model with acknowledgment metadata where available.
- Capture provider response IDs and delivery status hints.

### Non-goals

- No provider-specific SDK lock-in.

### DoD

- At least one channel exposes acknowledgment telemetry in diagnostics.

---

## M8.3 — Replay Lifecycle Console

### Objectives

- Extend admin reconciliation to manage lifecycle states.
- Support operator actions: escalate, dead-letter, resolve, retry.

### Non-goals

- No full incident-management system.

### DoD

- Operators can process lifecycle transitions through admin-safe flows.

---

## M8.4 — Policy Trend Intelligence

### Objectives

- Add trend reporting for:
  - policy-blocked replay rates
  - repeated-failure clusters
  - recovery lead time
- Provide windowed summaries for leadership/operations.

### Non-goals

- No predictive ML alerting in this phase.

### DoD

- Trend indicators are visible and queryable for weekly operations review.

---

## M8.5 — M8 Closure & Rulebook Update

### Objectives

- Consolidate M8 outcomes and reliability maturity deltas.
- Update operations rulebook with dead-letter and lifecycle governance.

### Non-goals

- No net-new customer-facing commerce features.

### DoD

- M8 final closure report published.
- Rulebook/playbook references updated.

---

## 4) Cross-Batch Technical Tracks

- **Lifecycle model:** replay/dead-letter/resolution state transitions
- **Telemetry model:** provider ack IDs, timestamps, and status mapping
- **Governance model:** policy outcomes, escalation thresholds, and operator authority
- **Storage model:** retention/indexing for attempts + dead-letter analytics
- **UX model:** actionable queues and minimal-friction remediation

---

## 5) Suggested Execution Order

1. M8.0 (contract first)
2. M8.1 + M8.2
3. M8.3 + M8.4
4. M8.5 closure

---

## 6) Exit Criteria for M8

M8 is considered successful when:

- failed deliveries follow deterministic lifecycle states
- dead-letter handling is auditable and operator-manageable
- provider-level acknowledgment telemetry is available in diagnostics
- policy outcomes are trendable for weekly resilience governance

---

## 7) Immediate Next Step

~~Proceed with **M8.5 — M8 Closure & Rulebook Update**.~~ **Completed.** Move follow-up resilience expansion into next phase planning.
