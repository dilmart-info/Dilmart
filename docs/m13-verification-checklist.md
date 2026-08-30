# M13 — Advanced Commercial Engine — Verification Checklist

This document is a practical acceptance and smoke-test guide after deploying M13 (migrations `20260424010000` + `20260424011000`, backend `CommercialEngineService`, admin APIs, admin UI).

**Prerequisites**

- Backend API reachable with an admin JWT (same auth as other `/admin/*` routes).
- Supabase migrations applied (`merchant_plans`, `merchant_plan_assignments`, `commercial_rules`, new `orders.*` commercial snapshot columns, updated `place_order`).

---

## 1) Database sanity

| Check | How |
|--------|-----|
| Tables exist | Confirm `merchant_plans`, `merchant_plan_assignments`, `commercial_rules` exist. |
| Seed applied | At least three plans: `basic`, `pro`, `premium`; baseline `commercial_rules` rows for global + channel overrides. |
| `place_order` signature | RPC accepts new params: `p_commission_rule_id`, `p_assisted_fee_rule_id`, `p_platform_fee_rule_id`, `p_delivery_billing_rule_id`, `p_resolved_plan_id`, `p_resolved_plan_code`, `p_commercial_snapshot_version`. |

---

## 2) Admin APIs (curl / Postman / Insomnia)

Base path: `{API}/admin` with `Authorization: Bearer <token>`.

### Plans

| Method | Path | Expected |
|--------|------|----------|
| GET | `/admin/merchant-plans` | `{ "plans": [...] }` |
| GET | `/admin/merchant-plans?active=true` | Only active plans |
| POST | `/admin/merchant-plans` | Body: `name`, `code`, `default_commission_type`, `default_commission_rate`, optional fees/modes |
| PATCH | `/admin/merchant-plans/:id` | Partial update, e.g. `is_active` |

### Plan assignments

| Method | Path | Expected |
|--------|------|----------|
| GET | `/admin/merchant-plan-assignments` | List with embeds `merchants`, `merchant_plans` |
| GET | `/admin/merchant-plan-assignments?merchant_id=<uuid>&active=true` | Filtered |
| POST | `/admin/merchant-plan-assignments` | Body: `merchant_id`, `plan_id`, optional `start_at`, `end_at`; only one active assignment per merchant (others deactivated) |
| PATCH | `/admin/merchant-plan-assignments/:id` | Update; activating one deactivates others for same merchant |

### Commercial rules

| Method | Path | Expected |
|--------|------|----------|
| GET | `/admin/commercial-rules` | List |
| GET | `/admin/commercial-rules?rule_type=commission&is_active=true` | Filtered |
| POST | `/admin/commercial-rules` | Create rule (see JSON examples below) |
| PATCH | `/admin/commercial-rules/:id` | Update |
| POST | `/admin/commercial-rules/:id/disable` | `is_active = false` |
| POST | `/admin/commercial-rules/:id/enable` | `is_active = true` |

**Example: channel commission override (JSON body for POST)**

```json
{
  "name": "Test web commission",
  "rule_type": "commission",
  "scope_type": "channel",
  "priority": 200,
  "value_type": "percentage",
  "value": 5,
  "conditions": { "channel": "web_checkout" }
}
```

**Example: merchant override**

```json
{
  "name": "VIP merchant commission",
  "rule_type": "commission",
  "scope_type": "merchant",
  "scope_reference_id": "<merchant_uuid>",
  "priority": 500,
  "value_type": "percentage",
  "value": 3,
  "conditions": {}
}
```

---

## 3) Admin UI smoke

| Page | URL | Checks |
|------|-----|--------|
| Merchant Plans | `/admin/merchant-plans` | List loads; create plan; toggle enable/disable |
| Plan Assignments | `/admin/merchant-plan-assignments` | Pick merchant + plan; assign; list shows assignment |
| Commercial Rules | `/admin/commercial-rules` | List + filters; create rule with valid JSON `conditions`; enable/disable |

---

## 4) Order financial snapshot (post-order)

| Check | How |
|--------|-----|
| Admin order finance | `GET /admin/finance/orders/:id` (or Admin Order Detail UI) |
| New fields present | `commission_rule_id`, `assisted_fee_rule_id`, `platform_fee_rule_id`, `delivery_billing_rule_id`, `resolved_plan_id`, `resolved_plan_code`, `commercial_snapshot_version` |
| Versioning | New orders from checkout/manual should show `commercial_snapshot_version >= 1` when engine path ran; legacy rows may remain `0` |

**Scenarios**

1. **Web checkout** — place order via storefront checkout; expect channel rules for `web_checkout` to influence resolved commission vs global seed; assisted fee rules typically do not apply (non-assisted channels).
2. **Manual / WhatsApp assisted** — create manual order with channel `whatsapp_assisted` or `manual_assisted`; expect higher channel commission + assisted fee rules from seed where applicable.
3. **Plan assignment** — assign merchant to `premium` plan with lower default rates; with no higher-priority rules, snapshot should reflect plan defaults + any winning rules.

---

## 5) Resolution priority (regression)

Expected order when multiple rules match (implemented in `CommercialEngineService`):

1. `merchant`
2. `merchant_category`
3. `merchant_channel`
4. `category`
5. `channel`
6. `global`
7. Plan defaults, then legacy `merchant_commercial_terms` fallback

**Multi-category cart:** commission among `category` / `merchant_category` candidates uses **highest `value` wins** (documented policy).

---

## 6) Non-regression

| Area | Check |
|------|--------|
| M11 finance | Payouts, ledger, reconciliation pages still load |
| M12 courier | Courier ledger/payout flows unchanged at API level |
| Old orders | Orders with `financial_snapshot_version = 0` / `commercial_snapshot_version = 0` still display; no forced migration of historical rows |

---

## 7) Optional SQL spot-checks

```sql
-- Plans seeded
SELECT code, default_commission_rate, is_active FROM public.merchant_plans ORDER BY code;

-- Active assignments per merchant (should be 0 or 1 active)
SELECT merchant_id, COUNT(*) FILTER (WHERE is_active) AS active_count
FROM public.merchant_plan_assignments
GROUP BY merchant_id
HAVING COUNT(*) FILTER (WHERE is_active) > 1;

-- Recent orders with commercial snapshot
SELECT order_number, commercial_snapshot_version, resolved_plan_code,
       commission_rule_id, assisted_fee_rule_id
FROM public.orders
ORDER BY created_at DESC
LIMIT 10;
```

---

## Sign-off

| Role | Date | Notes |
|------|------|--------|
| Dev | | |
| QA | | |
| Product / Supervisor | | |
