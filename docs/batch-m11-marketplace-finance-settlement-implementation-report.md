# M11 Implementation Report — Marketplace Finance & Settlement

## Scope

This report documents the implemented work for:

- M11.0 Foundation & Schema Alignment
- M11.1 Order Financial Snapshot
- M11.2 Merchant Commercial Terms Snapshot
- M11.3 Payment / Collection State Model
- M11.4 COD Collection Tracking
- M11.5 Merchant Ledger Core
- M11.6 Courier Payable Commercial Integration (pragmatic model)
- M11.8 Payout Batches
- M11.9 Financial Reconciliation Workspace
- M11.10 Merchant Statement & Finance Summary UI/API
- M11.11 Reversal Rules Enrichment
- M11.17 Manual Adjustments + Auditability

---

## Executive Summary

The project has moved from operational commerce-only behavior to a finance-aware marketplace model with:

- Order-level financial snapshots persisted at order creation time.
- Merchant settlement ledger with idempotency protections.
- Payout batch lifecycle (draft/approved/settled) with lock semantics.
- COD/payment/collection/settlement state separation.
- Financial reconciliation endpoints and admin UI separated from operational reconciliation.
- Merchant-facing finance summary, statement, and payout history.
- Manual adjustment and reversal APIs with required reason codes.
- Finance event timeline via dedicated `order_finance_events`.

---

## Database Migrations Added

1. `20260423130000_m11_0_finance_foundation_alignment.sql`
   - Fix schema drift fields on `orders`.
   - Add missing runtime tables:
     - `outbound_dispatch_attempts`
     - `outbound_dead_letters`
     - `governance_tasks`
     - `merchant_policy_assignments`
   - Add `financial_snapshot_version` and base hardening.

2. `20260423133000_m11_1_m11_2_order_financial_snapshot.sql`
   - Add `merchant_commercial_terms`.
   - Add financial snapshot fields to `orders`.
   - Extend `place_order` to persist financial snapshot in DB transaction.

3. `20260423140000_m11_3_m11_4_payment_collection_cod.sql`
   - Add payment/collection/settlement states to `orders`.
   - Add COD tracking fields.
   - Create `collection_event_log`.
   - Extend `place_order` defaults for new state model.

4. `20260423150000_m11_5_m11_6_m11_8_ledger_payouts.sql`
   - Add `courier_settlement_status` on `orders`.
   - Create `merchant_ledger_entries` with uniqueness/idempotency constraints.
   - Create `merchant_payout_batches` (+ `locked_at`).
   - Create `merchant_payout_batch_items` with duplicate guard.

5. `20260423153000_m11_8_payout_fk_and_indexes.sql`
   - Add FK from `merchant_ledger_entries.payout_batch_id` to payout batches.

6. `20260423170000_m11_11_m11_17_reversal_adjustments_audit.sql`
   - Add `reversal_reason_code` + `metadata` to ledger entries.
   - Create `order_finance_events` for finance timeline/audit trail.

All migrations were pushed to linked Supabase remote successfully.

---

## Backend Modules and Services Updated

## Finance Core

- `backend/src/modules/finance/order-finance.service.ts`
  - Active merchant commercial terms resolution.
  - Order financial snapshot calculation.
  - Idempotency key generation.
  - Order status transition mapping:
    - `delivered` -> accrual entries.
    - `delivered -> cancelled/returned` -> reversal entry.
  - Finance event appends to `order_finance_events`.

- `backend/src/modules/finance/finance.module.ts`
  - Registered and exported finance service for integration.

## Orders and Checkout Integration

- `backend/src/modules/checkout/checkout.service.ts`
  - Computes and sends financial snapshot fields to `place_order`.
  - Initializes payment/collection/settlement defaults.

- `backend/src/modules/orders/orders.service.ts`
  - Manual orders now snapshot finance and state model fields.
  - Status changes now trigger centralized finance transition handling.

## Admin Finance APIs

- `backend/src/modules/admin/admin.controller.ts`
- `backend/src/modules/admin/admin.service.ts`

Added APIs for:

- Order financial detail.
- Merchant ledger listing.
- Payout batch lifecycle:
  - create
  - approve
  - settle
  - list
- Financial reconciliation data:
  - orders view
  - merchant balances
  - courier payables
- Manual finance operations:
  - create manual adjustment (reason code required)
  - reverse ledger entry (reason code required)
- Finance events timeline listing.

## Merchant Finance APIs

- `backend/src/modules/merchants/merchants.controller.ts`
- `backend/src/modules/merchants/merchants.service.ts`

Added:

- Finance summary.
- Statement entries.
- Payout history.

Extended with:

- Pagination (`limit`, `offset`).
- Date range filtering (`from`, `to`).
- Status filtering (statement).
- Response metadata (`total`, `limit`, `offset`).

---

## Frontend Work Delivered

## Admin

### New page

- `src/pages/admin/FinanceReconciliation.tsx`

Features:

- Financial KPI cards.
- Orders financial reconciliation list.
- Merchant balances panel.
- Courier payables panel.
- Manual adjustment form.
- Ledger reversal actions.
- Finance events timeline.

### Routing & Navigation

- `src/App.tsx`:
  - Route: `/admin/finance-reconciliation`
- `src/components/AdminLayout.tsx`:
  - Added sidebar entry for finance reconciliation.

## Merchant

### New page

- `src/pages/merchant/Finance.tsx`

Features:

- Finance summary cards.
- Statement list with:
  - status filter
  - date range filter
  - pagination
  - localized labels
  - CSV export
- Payout history with:
  - date range filter
  - pagination
  - localized status labels

### Routing & Navigation

- `src/App.tsx`:
  - Route: `/merchant/finance`
- `src/components/MerchantLayout.tsx`:
  - Added finance menu item.

## API Client

- `src/lib/api-client.ts`
  - Added admin finance operations methods.
  - Added merchant finance methods.
  - Added reconciliation finance methods.
  - Extended statement/payout methods to support pagination/date filters.

---

## Acceptance Coverage Mapping

### Covered (Implemented)

- Financial snapshot persisted for new orders.
- Merchant ledger with idempotency key and duplicate protections.
- Payment/collection/settlement states separated from order status.
- COD tracking fields and collection event log model.
- Payout batch mechanism with lock and duplicate prevention.
- Reversal support with required reason code.
- Manual adjustments with required reason code and audit event.
- Centralized finance service for status-triggered posting.
- Operational reconciliation separated from financial reconciliation in UI/API.
- Merchant finance summary/statement/payout history available.

### Partially Covered / Next Steps

- Full dispute workflow lifecycle automation (status + actions).
- Partial refund-specific amount decomposition rules (beyond current reversal baseline).
- Dedicated courier ledger table (current model uses order-level payable + settlement status).
- Broader role-based fine-grained permissions for finance operations.
- Advanced exports and external accounting adapters (explicitly out-of-scope for current phase).

---

## Validation

Performed repeatedly after each substantial change:

- Backend build: `npm run build` (success).
- Frontend build: `npm run build` (success).
- Lint diagnostics on changed files (no issues).
- Supabase migrations push to linked project (success).

---

## Source of Truth Reminder

Financial reporting and settlement must use finance-layer entities:

- order financial snapshot fields
- merchant ledger entries
- payout batches/items
- finance events

and must not regress to simple operational totals aggregation.
