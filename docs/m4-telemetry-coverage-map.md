# M4 Telemetry Coverage Map

## Status

**M4.0 Discovery Output** — still the working coverage map for M4; phase closure: `docs/m4-final-closure-report.md`.

Coverage states:
- `ready`: KPI can be computed with current signals
- `partial`: some dimensions/rules missing
- `missing`: cannot compute reliably yet

---

## 1) Existing Signal Inventory (Current)

Known instrumentation/events from current foundation:

- `product.viewed`
- `wishlist.added`
- `wishlist.removed`
- `wishlist.opened`
- `store.viewed`
- `reentry.link_opened`
- `reentry.source_captured`

Operational data surfaces:

- orders (status, totals, timestamps, merchant scope)
- products (readiness, active state, stock-related fields, merchant scope)
- merchants (readiness)
- coupons (definition/state)

---

## 2) KPI Coverage Matrix

| KPI | Coverage | Notes |
|---|---|---|
| `store_readiness_score` | ready | computed via readiness endpoint |
| `product_readiness_coverage` | ready | available from product readiness data |
| `active_catalog_ratio` | ready | product active state available |
| `low_stock_ratio` | ready | stock + threshold available |
| `delayed_order_ratio` | ready | order status + created_at available |
| `delivered_revenue` | ready | delivered totals available |
| `avg_order_value` | ready | derived from delivered orders |
| `coupon_usage_rate` | partial | requires explicit coupon-applied marker consistency in orders |
| `coupon_invalid_attempt_rate` | missing | invalid attempt stream not yet persisted as analytics source |
| `product_view_count` | partial | event exists, retention/pipeline formalization pending |
| `add_to_cart_count` | missing | no canonical add-to-cart event contract yet |
| `checkout_preview_count` | missing | no explicit telemetry counter contract yet |
| `checkout_submit_count` | partial | inferable from orders, but not event-level funnel step |
| funnel ratios (`view->cart`, `cart->checkout`, `checkout->submit`) | missing | dependent on missing funnel stages |

---

## 3) Gap Priorities

## P0 (blocks M4.3 funnel quality)

- Add canonical `cart.added` event
- Add canonical `checkout.previewed` event
- Add canonical `checkout.submitted` event attribution payload

## P1 (improves coupon intelligence)

- Persist invalid coupon attempts as structured analytics records
- Normalize coupon-applied marker in orders path

## P2 (nice-to-have enrichment)

- Add campaign/source dimensions to all funnel events
- Add product/category tags in funnel events for segmentation

---

## 4) Required Event Dimensions (Minimum)

For each analytics event used in KPI derivation:

- `occurred_at`
- `merchant_id` (if known)
- `product_id` (if relevant)
- `source_surface` (if relevant)
- `session_id` (recommended for funnel coherence)

---

## 5) Acceptance Gate for M4.1+

M4.1 can proceed with current readiness/order/catalog coverage.  
M4.3 funnel implementation should not be marked complete until P0 gaps are delivered.
