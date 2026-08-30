# M11 Finance Operations Runbook

## Purpose

This runbook defines day-to-day operating procedures for finance and admin teams after M11 rollout.

It covers:

- merchant settlement operations
- payout lifecycle operations
- manual adjustments
- ledger reversals
- financial reconciliation checks

---

## Roles and Responsibilities

- `admin` / `super_admin`:
  - create and approve payout batches
  - settle payout batches after real payment
  - create manual adjustments
  - reverse eligible ledger entries
  - monitor finance reconciliation and events
- `merchant_*` roles:
  - read-only finance summary/statement/payout history

---

## Core Operational Principles

- Never settle based on `sum(orders.total)` directly.
- Use ledger and payout entities as source of truth.
- Every manual finance action must include a clear `reason_code`.
- Do not modify approved/locked payout batches manually.
- Treat reversals as explicit accounting events, not hidden field edits.

---

## Daily Operations Checklist

1. Review `Financial Reconciliation` page:
   - outstanding merchant balances
   - courier payable gaps
   - orders with inconsistent payment/collection/settlement states
2. Review finance event timeline:
   - verify accrual and reversal events are being generated
3. Resolve anomalies before opening new payout batches.

---

## Payout Batch Workflow

## Step 1 — Create Batch

Endpoint:

- `POST /admin/finance/payout-batches`

Behavior:

- collects merchant ledger entries in `accrued/payable` and not already batched
- creates batch + batch items
- marks included entries as `in_payout`

Operator checks:

- non-empty candidate set
- period window correctness
- totals are plausible (credits/debits/net)

## Step 2 — Approve Batch

Endpoint:

- `POST /admin/finance/payout-batches/:id/approve`

Behavior:

- allowed only for `draft`
- sets batch to `approved`
- stamps `locked_at`

Operator checks:

- ensure no unresolved disputes for included entries
- ensure payout amount matches intended transfer amount

## Step 3 — Settle Batch

Endpoint:

- `POST /admin/finance/payout-batches/:id/settle`

Behavior:

- allowed for `approved` / `processing`
- marks batch `settled`
- marks linked ledger entries `settled`

Operator checks:

- real payment transfer completed
- transfer reference stored in internal ops records

---

## Manual Adjustment Workflow

Use when exceptional correction is needed:

- rounding correction
- negotiated commercial correction
- operational under/over collection correction

Endpoint:

- `POST /admin/finance/manual-adjustments`

Required fields:

- `merchant_id`
- `direction` (`credit` / `debit`)
- `amount` (> 0)
- `reason_code` (required)

Recommended:

- `description`
- `reference_id` (ticket/case ID)

Post-action validation:

- verify new entry appears in merchant ledger
- verify event appears in finance timeline

---

## Ledger Reversal Workflow

Use only when an existing entry is incorrect and must be offset by explicit reversal.

Endpoint:

- `POST /admin/finance/ledger/:id/reverse`

Required:

- `reason_code`

Recommended:

- `description` with incident/case context

Behavior:

- creates reversal entry with opposite direction
- marks original entry as `reversed`
- records finance event

Restrictions:

- do not use ledger reversal for payout correction unless payout reversal flow is defined

---

## Finance Reconciliation Procedure

## Orders View

Check:

- `payment_status`
- `collection_status`
- `settlement_status`
- gross / merchant net / commission / courier payable

Escalate when:

- delivered order remains `not_accrued` unexpectedly
- collection marked complete while payment status is inconsistent

## Merchant Balances View

Check:

- `accrued`, `payable`, `in_payout`, `settled`, `reversed`

Escalate when:

- outstanding grows unexpectedly without new delivered volume

## Courier Payables View

Check:

- outstanding courier payable by delivery company

Escalate when:

- high accrued with low settlement over prolonged periods

---

## Incident Playbooks

## A) Wrong Merchant Balance

1. Inspect merchant ledger entries and finance events.
2. Identify faulty entry and root cause.
3. Apply manual adjustment or reversal with explicit `reason_code`.
4. Recheck reconciliation views.

## B) Duplicate-like Finance Action

1. Check idempotency key behavior in ledger records.
2. Confirm whether duplicate was prevented or created.
3. If created due to operational misuse, reverse erroneous entry and document incident.

## C) Payout Settled but Merchant Claims Missing Payment

1. Verify batch `settled` status and involved ledger entries.
2. Verify transfer reference outside system.
3. If operational transfer failed, apply correction workflow (adjustment/reversal/new payout).

---

## Recommended Reason Code Catalog

Suggested baseline codes:

- `ROUNDING_CORRECTION`
- `NEGOTIATED_COMPENSATION`
- `COURIER_COLLECTION_MISMATCH`
- `ORDER_CANCELLED_AFTER_DELIVERY`
- `ORDER_RETURNED_AFTER_DELIVERY`
- `DUPLICATE_ENTRY_CORRECTION`
- `MANUAL_REVIEW_REVERSAL`

Keep this set stable and review monthly.

---

## Audit and Compliance Notes

- Every manual adjustment/reversal must be attributable (`created_by`).
- Every finance event should be traceable in `order_finance_events`.
- Prefer explicit entries over direct balance mutation.

---

## Weekly Governance Review

Weekly finance ops review should include:

- total outstanding merchant balance trend
- payout throughput and cycle time
- reversal volume by reason code
- manual adjustment volume by reason code
- top courier outstanding buckets

This review helps detect policy or process drift early.
