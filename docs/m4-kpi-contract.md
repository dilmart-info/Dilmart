# M4 KPI Contract

## Status

**Frozen at M4 closure** — canonical reference for M4 implementations; see `docs/m4-final-closure-report.md`.

This document defines canonical KPI names, scopes, calculation windows, and ownership rules for M4 implementations.

---

## 1) Contract Rules

- Each KPI has one canonical name.
- Each KPI must declare scope: `platform`, `merchant`, or `both`.
- Each KPI must declare default window.
- Each KPI must define null/zero behavior.
- Derivative KPIs must reference source KPIs (no duplicated formulas).

---

## 2) Scope Definitions

- **Platform scope:** aggregated across all merchants.
- **Merchant scope:** filtered to one merchant only.
- **Both:** same formula, different filter boundary.

---

## 3) Time Windows

Default windows:

- `today` (calendar-day local system timezone)
- `last_7d` (rolling)
- `last_30d` (rolling)

If no window is specified by consumer, use `last_7d`.

---

## 4) KPI Catalog

## A) Merchant Health KPIs

### `store_readiness_score`
- Scope: both
- Window: current snapshot
- Source: readiness contract (M3.1)
- Type: percentage `0..100`

### `product_readiness_coverage`
- Scope: both
- Window: current snapshot
- Formula: `ready_products / total_products`
- Zero behavior: if `total_products=0`, return `0`

### `active_catalog_ratio`
- Scope: both
- Window: current snapshot
- Formula: `active_products / total_products`
- Zero behavior: if `total_products=0`, return `0`

### `low_stock_ratio`
- Scope: both
- Window: current snapshot
- Formula: `low_stock_products / total_products`
- Zero behavior: if `total_products=0`, return `0`

### `delayed_order_ratio`
- Scope: both
- Window: rolling, default `last_7d`
- Formula: `delayed_pending_orders / total_pending_orders`
- Delayed rule baseline: pending older than 24h
- Zero behavior: if `total_pending_orders=0`, return `0`

## B) Commercial KPIs

### `delivered_revenue`
- Scope: both
- Window: time-based (`today`, `last_7d`, `last_30d`)
- Formula: sum of delivered order totals

### `avg_order_value`
- Scope: both
- Window: time-based
- Formula: `delivered_revenue / delivered_orders_count`
- Zero behavior: if no delivered orders, return `0`

### `coupon_usage_rate`
- Scope: both
- Window: time-based
- Formula: `orders_with_coupon / eligible_orders`
- Zero behavior: if no eligible orders, return `0`

### `coupon_invalid_attempt_rate`
- Scope: both
- Window: time-based
- Formula: `invalid_coupon_attempts / total_coupon_attempts`
- Zero behavior: if no attempts, return `0`

## C) Funnel KPIs (M4.3-ready)

### `product_view_count`
- Scope: both
- Window: time-based

### `add_to_cart_count`
- Scope: both
- Window: time-based

### `checkout_preview_count`
- Scope: both
- Window: time-based

### `checkout_submit_count`
- Scope: both
- Window: time-based

### `funnel_view_to_cart_rate`
- Scope: both
- Window: time-based
- Formula: `add_to_cart_count / product_view_count`
- Zero behavior: if no product views, return `0`

### `funnel_cart_to_checkout_rate`
- Scope: both
- Window: time-based
- Formula: `checkout_preview_count / add_to_cart_count`
- Zero behavior: if no add-to-cart, return `0`

### `funnel_checkout_to_submit_rate`
- Scope: both
- Window: time-based
- Formula: `checkout_submit_count / checkout_preview_count`
- Zero behavior: if no checkout previews, return `0`

---

## 5) Naming and Versioning

- Contract version: `m4-kpi-contract-v1`
- Breaking formula changes require:
  - new version suffix
  - migration note in release report

---

## 6) Ownership

- **Formula owner:** Platform product/operations governance
- **Implementation owner:** Engineering batch owner
- **Validation owner:** QA + analytics reviewer

---

## 7) Usage Policy

- Dashboards must consume only canonical KPI names in this contract.
- Ad-hoc KPI aliases are not allowed in production UI.
