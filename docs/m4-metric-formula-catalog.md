# M4 Metric Formula Catalog

## Status

**Canonical Formula Reference (M4.0)** — frozen with M4 closure; see `docs/m4-final-closure-report.md`.

This file gives exact formulas and examples to avoid interpretation drift.

---

## 1) Merchant Health Formulas

## `product_readiness_coverage`

Formula:

`ready_products / total_products`

Example:

- ready: 40
- total: 50
- result: `0.8` (80%)

If total is `0`: result `0`.

## `active_catalog_ratio`

Formula:

`active_products / total_products`

If total is `0`: result `0`.

## `low_stock_ratio`

Formula:

`low_stock_products / total_products`

Low stock baseline:

`stock <= low_stock_threshold`

If total is `0`: result `0`.

## `delayed_order_ratio`

Formula:

`delayed_pending_orders / total_pending_orders`

Pending statuses baseline:

- `new`
- `contacted`
- `preparing`

Delayed baseline:

pending order older than 24h.

If total pending is `0`: result `0`.

---

## 2) Commercial Formulas

## `delivered_revenue`

Formula:

`SUM(order.total where status='delivered')`

## `avg_order_value`

Formula:

`delivered_revenue / delivered_orders_count`

If delivered count is `0`: result `0`.

## `coupon_usage_rate`

Formula:

`orders_with_coupon / eligible_orders`

If eligible is `0`: result `0`.

## `coupon_invalid_attempt_rate`

Formula:

`invalid_coupon_attempts / total_coupon_attempts`

If attempts are `0`: result `0`.

---

## 3) Funnel Formulas (M4.3-ready)

## `funnel_view_to_cart_rate`

`add_to_cart_count / product_view_count`

## `funnel_cart_to_checkout_rate`

`checkout_preview_count / add_to_cart_count`

## `funnel_checkout_to_submit_rate`

`checkout_submit_count / checkout_preview_count`

Zero-denominator behavior for all funnel ratios: `0`.

---

## 4) Precision and Formatting

- Internal precision: store as float.
- Display precision:
  - percentages: 1 decimal
  - currency: existing `formatPrice`

---

## 5) Anti-Drift Rules

- Do not change denominator definitions without contract version bump.
- Do not mix delivered+cancelled totals in revenue KPIs.
- Do not infer missing funnel stages from unrelated events.
