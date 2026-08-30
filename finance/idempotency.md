# Finance Idempotency Strategy (M11.0)

This document defines baseline idempotency rules for Marketplace Finance implementation.
It is a blocker reference for M11 phases that post financial entries.

## Goals

- Prevent double accrual, double reversal, and double payout.
- Make retries safe for APIs, jobs, and webhook-like events.
- Keep event replay deterministic and auditable.

## Idempotency Key Pattern

Canonical pattern:

`order:{order_id}:event:{event_type}:{reference_id?}`

Examples:

- `order:7f...:event:order_accrual`
- `order:7f...:event:refund_reversal:rf_123`
- `order:7f...:event:courier_accrual:delivery_45`

## Required DB Uniqueness Rules (next phases)

- Merchant ledger:
  - unique(`order_id`, `entry_type`) for non-repeatable entries.
  - unique(`idempotency_key`) as global replay guard.
- Payout items:
  - unique(`payout_batch_id`, `merchant_ledger_entry_id`).
- Courier accrual:
  - unique(`order_id`, `entry_type`) for accrual/reversal pairs where applicable.

## Non-repeatable Finance Events

- `order_accrual`
- `commission_charge` (snapshot-based)
- `delivery_deduction` (if generated from order snapshot)
- `refund_reversal` (per refund reference)
- `payout_inclusion` per ledger entry + batch

## Transaction Boundaries

- Financial posting for a single business event must run in one DB transaction.
- Status transition + ledger writes must commit atomically.
- If commit fails, no partial writes are allowed.

## Retry Policy

- On duplicate-key error for idempotency constraints:
  - return success-equivalent response with previously created record reference.
- Never create compensating duplicates to "fix" replay.

## Source of Truth

- Finance amounts must come from order financial snapshot fields.
- Do not compute settlement balances from `sum(orders.total)` in operational queries.
