# Skill: Admin & Merchant Operations — DilMart-Store

## Mission

Ensure Admin and Merchant panels support real marketplace operations without leaking scope or breaking workflows.

## Admin Responsibilities

- merchant approval/rejection
- product/category governance
- order operations
- delivery assignment and monitoring
- finance reconciliation
- settlement approvals
- disputes/adjustments
- notifications
- analytics

## Merchant Responsibilities

- own products
- own inventory/availability where allowed
- own orders
- own finance summary
- own coupons/offers where allowed
- no access to other merchants

## Scope Invariants

- Admin can see global data.
- Merchant can only see own merchant-scoped data.
- Backend validates scope regardless of frontend filters.
- UI filters are convenience, not security.

## QA Scenarios

- merchant A cannot read merchant B products/orders/finance.
- merchant cannot approve own platform status unless designed.
- admin actions changing money/status are auditable.
- merchant order list reflects only owned orders.
- admin order list has accurate status filters.
- admin finance pages match backend finance snapshots.

## Output Required

```md
# Admin/Merchant Ops Review

## Verdict

PASS / PASS WITH NOTES / FAIL

## Admin Impact

- ...

## Merchant Impact

- ...

## Scope Findings

- ...

## Required Fixes

- ...
```
