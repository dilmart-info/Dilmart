# Skill: Checkout, Orders & Finance QA — DilMart-Store

## V2 extension

DilMart 2.0 scope is governed by `docs/dilmart-2.0/00_MASTER_SPEC.md` and `governance/CURRENT_PHASE.md`. Legacy checkout remains single-merchant; V2 permits a multi-merchant master checkout only in an explicitly authorized implementation phase, behind default-off flags. Each merchant child order remains single-merchant. Phase 0.2 is local/read-only baseline verification; no feature implementation, remote provisioning, live writes, deployment or activation is authorized. Existing safety and environment rules remain binding.

Test mandatory V2 idempotency, stock contention, deterministic fee/discount/COD allocation, partial rejection, cash custody, payout dedupe and reversal. Do not weaken legacy gates.

## Mission

Protect the highest-risk money/order flows: cart, checkout, pricing, coupon, loyalty, inventory, orders, COD, settlement.

## Launch Invariants

### Cart

- Legacy cart: one merchant only. V2 master checkout: multiple merchants allowed only under authorized phase/flag; each child order has exactly one merchant.
- Hydration must sanitize inconsistent local state.
- Checkout must revalidate server-side regardless of frontend cart state.

### Checkout

Backend must compute:

- product price
- merchant ID
- discount
- coupon validity
- loyalty redemption
- stock availability
- delivery fee
- final total

Frontend must not be trusted for:

- `user_id`
- `merchant_id`
- `points_spent`
- price totals
- stock truth

### Inventory

- Stock must be checked and decremented/reserved atomically.
- No overselling under concurrent checkout.
- Disabled/out-of-stock products must not pass checkout.

### Orders

- Order snapshot must preserve financial truth at creation.
- Status transitions must be valid and auditable.
- Customer-visible tracking must not expose internal finance/merchant-only data.

### Finance

- COD collection must connect to delivery/order state.
- Merchant payable should derive from order financial snapshot.
- Courier/company payout must be auditable.
- Adjustments/reversals/disputes require role guard and audit trail.

## Required Test Scenarios

- guest checkout without loyalty.
- authenticated checkout with valid loyalty redemption.
- spoofed `user_id` ignored/rejected.
- points over balance rejected.
- coupon valid/invalid/expired/minimum amount.
- mixed-merchant cart blocked in legacy; V2 validates atomic parent/children, conservation and isolation.
- stock insufficient rejected.
- concurrent stock checkout safe.
- order visible to owning merchant only.
- delivered COD order appears in settlement path.

## Output Required

```md
# Checkout/Order/Finance QA

## Verdict

PASS / PASS WITH NOTES / FAIL

## Scenarios Checked

- ...

## Findings

- ...

## Required Fixes

- ...

## Risk Level

P0 / P1 / P2
```
