# DilMart Store — M4 Architecture Plan

## Status

**M4 Closed** — see `docs/m4-final-closure-report.md`.

M4 focus: move from operational governance baseline (M3) to scalable growth, automation, and commercial intelligence.

---

## 1) M4 Strategic Goal

Build the next operational layer that:

- reduces manual governance overhead
- increases merchant performance consistency
- improves conversion and retention signals
- enables data-driven commercial decisions at platform scale

---

## 2) M4 Design Principles

- **Automation-first:** minimize repetitive admin follow-ups
- **Scoped intelligence:** insights should respect platform/merchant boundaries
- **Actionable metrics:** every metric must map to a next action
- **Safe rollout:** phase features behind clear batch gates
- **Non-breaking evolution:** preserve existing M1–M3 contracts where possible

---

## 3) Batch Roadmap

## M4.0 — Discovery & KPI Contract

### Objectives

- Define canonical KPI dictionary for platform and merchant.
- Freeze metric formulas for readiness, performance, and growth funnels.
- Identify telemetry gaps from current events/logging.

### Non-goals

- No implementation of new dashboards yet.

### DoD

- KPI contract doc finalized.
- Event coverage map completed.

---

## M4.1 — Alerting Foundation

### Objectives

- Introduce lightweight rule engine for operational alerts.
- Trigger alerts for critical conditions:
  - delayed orders threshold
  - readiness regression
  - stock-risk spikes

### Non-goals

- No external notification providers in this batch.

### DoD

- Alert rules persisted and evaluated.
- In-app admin alert feed receives generated alerts.

---

## M4.2 — Merchant Performance Scorecard

### Objectives

- Build merchant-level scorecard:
  - readiness stability
  - fulfillment health
  - catalog quality consistency
  - coupon hygiene
- Surface trend direction (improving/stable/declining).

### Non-goals

- No automatic penalties/actions.

### DoD

- Merchant score visible in admin merchant detail/list.
- Weekly trend snapshot available.

---

## M4.3 — Conversion Funnel Visibility

### Objectives

- Define and expose funnel stages:
  - product view -> add to cart -> checkout preview -> order submit
- Add per-merchant funnel drop-off signals.

### Non-goals

- No attribution modeling beyond existing hook signals.

### DoD

- Funnel metrics available in merchant cockpit and admin governance.

---

## M4.4 — Automated Merchant Nudges

### Objectives

- Generate contextual nudges from readiness/performance gaps.
- Present prioritized “next best action” tasks in merchant dashboard.

### Non-goals

- No push/email delivery yet (in-app only).

### DoD

- Merchant sees dynamic recommendation queue.
- Nudge impact can be measured (resolved/not resolved).

---

## M4.5 — Governance Workflow Actions

### Objectives

- Add explicit workflow actions for admin:
  - assign owner
  - set deadline
  - mark resolved
  - escalate
- Move from passive indicators to managed remediation loops.

### Non-goals

- No external ticketing integrations.

### DoD

- Admin can track lifecycle of governance tasks.

---

## M4.6 — Commercial Policy Profiles

### Objectives

- Introduce policy profiles for groups of merchants:
  - coupon constraints
  - merchandising constraints
  - optional readiness thresholds
- Support gradual standardization without hardcoding per merchant.

### Non-goals

- No fully dynamic policy language.

### DoD

- At least 2 policy profiles configurable and assignable.

---

## M4.7 — Experimentation Baseline

### Objectives

- Enable simple A/B-ready surfaces for merchandising/copy.
- Log experiment exposure and basic outcome metrics.

### Non-goals

- No advanced stats engine.

### DoD

- One production-safe experiment path supported end-to-end.

---

## M4.8 — Executive Governance View

### Objectives

- Add executive summary dashboard:
  - merchant health distribution
  - delayed-order risk map
  - readiness trend
  - conversion trend

### Non-goals

- No predictive forecasting in this batch.

### DoD

- Leadership can view weekly platform health without drilling into raw tables.

---

## M4.9 — M4 Closure & Rulebook Update

### Objectives

- Consolidate M4 contracts and outcomes.
- Update commercial governance rulebook with automation policies.
- Publish final closure report.

### Non-goals

- No new feature implementation.

### DoD

- `M4 final closure report` published.
- Rulebook and KPI glossary updated and linked.

---

## 4) Cross-Batch Technical Tracks

- **Data contracts:** typed response shapes for all new metrics
- **Caching discipline:** query-key strategy for governance metrics
- **Auditability:** track automated decisions and rule triggers
- **Access model:** preserve strict platform vs merchant scope boundaries
- **Performance:** cap expensive aggregations; prefer incremental summaries where needed

---

## 5) Suggested Execution Order

1. M4.0 (contract first)
2. M4.1 + M4.2
3. M4.3 + M4.4
4. M4.5 + M4.6
5. M4.7 + M4.8
6. M4.9 closure

---

## 6) Exit Criteria for M4

M4 is considered successful when:

- platform can detect operational/commercial risk automatically
- merchants receive actionable, prioritized guidance in-product
- admin can manage remediation workflows, not just monitor KPIs
- leadership has concise, reliable governance visibility

---

## 7) Immediate Next Step

~~Start with **M4.0 Discovery & KPI Contract** as the first approved execution batch.~~ **Completed.** Follow-up work is out of scope for M4; next-phase kickoff documented in `docs/m5-architecture-plan.md`.
