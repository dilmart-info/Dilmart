# Batch M4.0 — Discovery & KPI Contract (Pre-Implementation Plan)

## Status

**Proposed for Approval**

This batch is discovery-only and contract-first.  
No production behavior changes are included in M4.0.

---

## 1) Batch Goal

Define a canonical KPI and telemetry contract that all M4 batches will build on, so implementation decisions are consistent, auditable, and measurable.

---

## 2) Scope

## In Scope

- KPI glossary and metric formulas (platform + merchant perspectives)
- Event-to-metric mapping using existing telemetry foundations
- Gap analysis for missing events/fields and ownership of each gap
- Data contract draft for future governance endpoints/widgets
- Acceptance criteria for M4.1+ metric consumption

## Out of Scope

- No new runtime feature flags
- No new dashboard widgets in production pages
- No alert engine implementation
- No schema migrations unless strictly required for contract codification (prefer deferred)

---

## 3) Key Questions to Resolve

- Which KPIs are “decision KPIs” vs “informational KPIs”?
- What are the canonical formulas and denominator rules?
- What timeframe defaults are required (daily/weekly/30-day)?
- Which KPIs must be merchant-scoped vs platform-scoped?
- What is the minimum telemetry shape required for M4.1–M4.4?

---

## 4) Proposed KPI Contract (Draft)

## A) Merchant Health KPIs

- `store_readiness_score`
- `product_readiness_coverage` = ready_products / total_products
- `active_catalog_ratio` = active_products / total_products
- `low_stock_ratio` = low_stock_products / total_products
- `delayed_order_ratio` = delayed_pending_orders / total_pending_orders

## B) Commercial KPIs

- `delivered_revenue`
- `avg_order_value`
- `coupon_usage_rate`
- `coupon_invalid_attempt_rate`
- `offer_product_conversion_proxy` (initial proxy, final in M4.3)

## C) Funnel KPIs (M4.3-ready contract)

- `product_view_count`
- `add_to_cart_count`
- `checkout_preview_count`
- `checkout_submit_count`
- stage-to-stage drop ratios

---

## 5) Telemetry Mapping Baseline

Use current instrumentation as baseline (M2.9+):

- `product.viewed`
- `wishlist.added`
- `wishlist.removed`
- `wishlist.opened`
- `store.viewed`
- `reentry.*`

Initial mapping outputs:

- Event -> KPI contribution table
- Required dimensions:
  - merchant_id
  - product_id (when relevant)
  - source_surface
  - timestamp window

---

## 6) Deliverables

1. `docs/m4-kpi-contract.md`
2. `docs/m4-telemetry-coverage-map.md`
3. `docs/m4-metric-formula-catalog.md`
4. `docs/batch-m4.0-implementation-report.md` (closure report)

---

## 7) Implementation Approach

## Step 1 — Inventory Existing Signals

- Review existing API response surfaces and tracked events
- Identify already-computable KPIs vs blocked KPIs

## Step 2 — Freeze Metric Definitions

- Standardize formulas, naming, and time windows
- Define null/zero handling explicitly

## Step 3 — Build Coverage Matrix

- For each KPI, mark:
  - ready now
  - partial
  - missing telemetry

## Step 4 — Contract for M4.1+

- Draft minimal typed shapes for future governance endpoints
- Include sample JSON response blocks for key widgets

---

## 8) Risks and Mitigations

- **Risk:** KPI ambiguity across teams  
  **Mitigation:** one formula catalog with canonical examples.

- **Risk:** Over-design in discovery phase  
  **Mitigation:** enforce “minimum viable contract” for next 2 batches only.

- **Risk:** Hidden telemetry gaps discovered late  
  **Mitigation:** coverage map with explicit blocker tags and owners.

---

## 9) Definition of Done (DoD)

- [ ] KPI glossary approved with formulas and windows
- [ ] Telemetry coverage map completed and reviewed
- [ ] Gap list prioritized (P0/P1/P2) with ownership
- [ ] Contract artifacts published in `docs/`
- [ ] No runtime behavior changes introduced in this batch

---

## 10) Approval Request

If approved, execution will proceed in doc-first mode to produce the four M4.0 deliverables, then hand off cleanly to M4.1 alerting foundation.
