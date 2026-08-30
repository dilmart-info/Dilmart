# Skill: Checkout, Orders & Finance QA — DilMart-Store

## Mission

Protect the highest-risk money/order flows: cart, checkout, pricing, coupon, loyalty, inventory, orders, COD, settlement.

## Launch Invariants

### Cart

- One merchant only.
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
- mixed-merchant cart blocked.
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
