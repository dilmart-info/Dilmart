# Order Lifecycle Manual Smoke Checklist

**Version:** P1-2 audit — 2026-05-12  
**Purpose:** DB-dependent lifecycle steps that cannot be verified without a live Supabase instance.  
Run this before every production deploy.

---

## A — Customer Checkout

- [ ] Place a guest order (no auth token) with a valid product and governorate
  - `POST /checkout/submit` returns `{ order_number, totals }`
  - `totals.delivery_cost` matches the governorate's delivery price in DB
  - `orders.user_id` is NULL in DB
  - `orders.points_earned > 0` (floor(merchandise_subtotal / 100))
- [ ] Place an authenticated order with `points_spent > 0`
  - `orders.points_spent` matches the request
  - `profiles.points` decremented atomically by `place_order` RPC
  - `orders.user_id` equals the JWT actor id
- [ ] Attempt to place an order with `points_spent` exceeding balance → 400

## B — Merchant Sees Order

- [ ] Merchant owner calls `GET /orders` → sees only their own orders, no PII
- [ ] Admin calls `GET /orders` → sees all orders including customer name/phone
- [ ] `GET /orders/:id/detail` for merchant → no `customer_name` / `customer_phone` in response

## C — Agent Assignment

- [ ] `POST /orders/:id/agent` with a valid `agent_id`
  - Fails with 400 if order has no `delivery_company_id` assigned yet
  - Fails with 403 if agent's `delivery_company_id` ≠ order's `delivery_company_id`
  - Fails with 403 if agent's `is_active = false`
  - Succeeds when company matches; `orders.agent_id` updated in DB
  - `delivery_events` row inserted with `event_type = 'assigned_to_agent'`

## D — Delivery Lifecycle (Normal Path)

Run as agent assigned to the order; run as admin to confirm bypass works.

- [ ] `POST /orders/:id/delivery/picked-up` → `delivery_status = picked_up`, event written
- [ ] `POST /orders/:id/delivery/in-transit` → `delivery_status = in_transit`, event written
- [ ] `POST /orders/:id/delivery/delivered`
  - `delivery_status = delivered`, `status = delivered` in DB
  - `delivered_at` timestamp set
  - **Finance**: `merchant_ledger_entries` rows inserted (`order_accrual`, `commission_charge`)
  - **Loyalty**: if order has `user_id` and `points_earned > 0`, `profiles.points` incremented
  - `settlement_status = accrued` on the order
- [ ] Attempt `picked-up` on an already-delivered order → 403 (invalid transition)
- [ ] Agent B attempt on Agent A's order → 403 (scope check)

## E — Failure & Cancellation

- [ ] `POST /orders/:id/delivery/failed` with `reason_code` → `delivery_status = failed`
  - Fails with 400 if `reason_code` is missing
- [ ] `POST /orders/:id/cancel` with reason → `delivery_status = cancelled`, `status = cancelled`
  - Fails with 403 if order is already delivered or returned

## F — Admin Override

- [ ] `POST /orders/:id/admin-override-delivery` with `next_status = delivered` and `reason`
  - `delivery_status = delivered`, `status = delivered` in DB — ✓
  - `delivery_events` row inserted with `override: true` metadata — ✓
  - **Finance accrual**: `merchant_ledger_entries` posted automatically (P1-A fix — 2026-05-12) — ✓
  - `settlement_status = accrued` after call — ✓
  - Loyalty points credited (DB trigger fires on `status` update) — ✓
  - Duplicate override to delivered is idempotent (`settlement_status = accrued` guard short-circuits) — ✓
- [ ] `POST /orders/:id/admin-override-delivery` with `next_status = failed` or `returned`
  - Finance accrual NOT triggered (correct — only delivered triggers accrual) — ✓

**Reconciliation query (for pre-fix orders or process crashes):**
```sql
SELECT o.id, o.order_number, o.merchant_id, o.merchant_net_amount, o.settlement_status
FROM orders o
WHERE o.status = 'delivered'
  AND o.settlement_status = 'not_accrued'
  AND o.financial_snapshot_version > 0;
```

## G — COD Remittance

- [ ] After delivery, agent/admin collects cash
  - `POST /finance/cod/remittance` records remittance via `process_cod_remittance_to_platform` RPC
  - `collection_status = remitted_to_platform`
  - `collection_event_log` row inserted (append-only)
- [ ] Attempt to remit twice → idempotent (second call returns without error or duplicate)

## H — Loyalty Guest Claim

- [ ] Customer registers/logs in with phone number matching a past guest order
  - `on_profile_claim_points` trigger fires
  - `profiles.points` incremented by sum of `orders.points_earned` for matched orders
  - `loyalty_transactions` rows inserted

## I — Order Tracking (Public)

- [ ] `POST /orders/track` with valid `{ order_number, phone }` → returns status and delivery info
- [ ] `POST /orders/track` with wrong phone → `{ found: false }`

## J — Payout Batch (Atomic, P1-6)

- [ ] `POST /admin/finance/payout-batches` with a merchant that has accrued ledger entries
  - Returns `{ ok: true, batch: { id, status: "draft", total_credits, total_debits, net_amount }, entries_count }`
  - `merchant_payout_batches` row exists in DB with `status = draft`
  - `merchant_payout_batch_items` rows exist — one per ledger entry, matching amounts
  - `merchant_ledger_entries` rows have `status = in_payout` and `payout_batch_id` set — all atomically
- [ ] `POST /admin/finance/payout-batches` when merchant has no eligible entries
  - Returns `{ ok: true, empty: true, message: "..." }` — no batch created
- [ ] Concurrent batch creation for the same merchant (manual: two requests within milliseconds)
  - Only one batch created; second call finds 0 candidates (FOR UPDATE serializes them)
- [ ] `POST /admin/finance/payout-batches/:id/approve` → `status = approved`
- [ ] `POST /admin/finance/payout-batches/:id/settle` → `status = settled`, ledger entries `status = settled`

**Reconciliation query (detect orphaned batches from old non-atomic code):**
```sql
SELECT b.id, b.merchant_id, b.status, b.created_at, COUNT(i.id) AS item_count
FROM merchant_payout_batches b
LEFT JOIN merchant_payout_batch_items i ON i.payout_batch_id = b.id
GROUP BY b.id
HAVING COUNT(i.id) = 0;
-- Any rows here are orphaned batches (no items). Safe to delete if status = 'draft'.
```
