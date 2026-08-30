# M11-R Implementation Report — Settlement Operations Closure

## Objective

Close remaining operational gaps after M11 core rollout, specifically:

- event-driven COD collection flow
- deterministic `accrued -> payable` transition logic
- payout operations from Admin UI
- legacy order isolation from settlement operations
- courier settlement endpoint completion
- idempotency hardening

---

## Delivered Components

## 1) COD Collection Workflow APIs (P0)

Added admin endpoints:

- `POST /admin/orders/:id/collection/collected`
- `POST /admin/orders/:id/collection/remit-platform`
- `POST /admin/orders/:id/collection/remit-merchant`

Implemented behavior:

- updates `orders.collection_status` forward-only
- updates cash/remittance timestamps and tracking fields
- writes to `collection_event_log` via upsert
- triggers payable transition evaluation after collection/remittance events

---

## 2) Accrued -> Payable Transition Rules (P0)

Implemented in:

- `backend/src/modules/finance/order-finance.service.ts`

New logic:

- `evaluatePayableTransition(orderId, actorId?)`

MVP policy:

- requires `order.status = delivered`
- for `payment_method = cod`:
  - `collection_status` must be `remitted_to_platform` or `remitted_to_merchant`
- for non-COD:
  - `payment_status = paid`

Effects on success:

- `orders.settlement_status = payable`
- ledger entries for same order: `accrued -> payable`
- `order_finance_events` append: `order_marked_payable`

---

## 3) Legacy Orders Isolation (P0)

Implemented protections:

- accrual posting skips orders with `financial_snapshot_version = 0`
- event logged: `order_accrual_skipped_legacy`
- payout batch generation excludes ledger entries linked to legacy orders
- admin financial reconciliation data now includes `financial_snapshot_version`
- UI shows legacy badge and excludes legacy rows from high-level finance KPI totals

---

## 4) Courier Settlement Completion (P0)

Added endpoint:

- `POST /admin/orders/:id/courier/settle`

Behavior:

- sets `courier_settlement_status = settled`
- sets `courier_settled_at`
- records finance event `courier_settled`

---

## 5) Dispute Flow (P1 Implemented Early)

Added endpoint:

- `POST /admin/orders/:id/finance/dispute`

Behavior:

- requires `reason_code`
- sets `orders.settlement_status = disputed`
- marks non-settled related ledger entries as `disputed`
- writes finance event `order_disputed`

---

## 6) Idempotency & DB Guards (P0)

Migration:

- `20260423180000_m11_r_collection_payable_guards.sql`

Changes:

- added `orders.courier_settled_at`
- added unique index:
  - `uq_collection_event_log_order_event` on `(order_id, event_type)`

This enforces collection endpoint idempotency at DB level.

---

## 7) Admin UI Operations Completion (P0)

Updated page:

- `src/pages/admin/FinanceReconciliation.tsx`

Added operational sections:

- manual adjustment form (existing endpoint wiring)
- ledger reversal actions (existing endpoint wiring)
- payout operations:
  - generate payout batch from payable entries
  - list/filter payout batches
  - approve payout batch
  - settle payout batch
- finance events timeline

Also added:

- legacy order badge in orders financial list
- totals computed from finance-enabled orders only

---

## 8) API Client Updates

Updated:

- `src/lib/api-client.ts`

Added methods for:

- collection/remittance endpoints
- courier settle endpoint
- dispute endpoint
- payout batch list/create/approve/settle
- admin ledger/events endpoints already used by finance UI

---

## Files Updated (Key)

- `backend/src/modules/finance/order-finance.service.ts`
- `backend/src/modules/admin/admin.module.ts`
- `backend/src/modules/admin/admin.service.ts`
- `backend/src/modules/admin/admin.controller.ts`
- `src/pages/admin/FinanceReconciliation.tsx`
- `src/lib/api-client.ts`
- `supabase/migrations/20260423180000_m11_r_collection_payable_guards.sql`

---

## Validation Results

- backend build: success
- frontend build: success
- lint diagnostics: no new lint issues
- migration push: success (remote applied `20260423180000_m11_r_collection_payable_guards.sql`)

---

## Remaining Follow-ups (Optional)

- Add dedicated admin order-level controls in order detail page for collection/remittance/dispute (currently available via API and finance page-driven ops).
- Add explicit payout cancel endpoint and UI action before approval.
- Add hold-period policy configuration for payable transitions.

---

## 9) Idempotency Constraint Update (Hotfix Sync)

### Issue Summary
During Pilot #2 pre-implementation testing, a DB-level blocker was discovered on production when transitioning order status. The `transition_delivery_status` function uses `ON CONFLICT (idempotency_key) DO NOTHING` on the `order_finance_events` table. 

### Why Partial Unique Index Fails
Previously, the table had a partial unique index on `idempotency_key`. However, in PostgreSQL, `ON CONFLICT (idempotency_key)` requires a standard unique constraint or index matching the target column *exactly*. If a unique constraint is not defined, PG throws:
`ERROR: 42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`

### Solution
Applied a standard unique constraint `uq_order_finance_events_idempotency_key_constraint` on `public.order_finance_events(idempotency_key)`.
This was executed on production database as a hotfix. This PR introduces the official migration `20260630130000_add_unique_constraint_order_finance_events.sql` in the repository to document and sync Git with the DB state.

