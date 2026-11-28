# DilMart 2.0 — Inventory, Promotion and Loyalty Policy

Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D02
Status: PROM-01–16 owner-approved design principles in project conversation. Numeric terms and detailed financial rules remain open. G0 OPEN / BLOCKED.
Authority: 07_COMMERCE_ORDER_CONTRACTS.md, 08_MERCHANT_FULFILLMENT.md, 10_HUB_PARCEL_MANAGEMENT.md, 12_FINANCIAL_ARCHITECTURE.md, 17_G0_APPROVAL_GATE.md. Related policy documents 25–27 are pending separate PRs; no dependency on their merge.

## 1. Approved principles
| ID | Policy |
|---|---|
| PROM-01 | Atomically decrement saleable stock at successful checkout, not cart or quote. |
| PROM-02 | Prevent overselling and duplicate stock movements. |
| PROM-03 | Returned goods become saleable only after approved inspection and disposition. |
| PROM-04 | Support fixed and percentage discounts and extensible promotion types. |
| PROM-05 | Merchant-funded, platform-funded and co-funded discounts. |
| PROM-06 | Versioned campaign budget and usage limits. |
| PROM-07 | Coupon eligibility by merchant, category, geography or platform scope. |
| PROM-08 | No stacking except under explicitly approved rules. |
| PROM-09 | Unified loyalty across participating merchants. |
| PROM-10 | Earn points on completed eligible orders under approved conditions. |
| PROM-11 | Points nonwithdrawable and nontransferable at launch. |
| PROM-12 | Reverse or restore points and discounts on cancellation/returns under approved rules. |
| PROM-13 | Preserve promotion rules and funding allocations in financial snapshot. |
| PROM-14 | Measure campaign contribution and prevent budget overrun. |
| PROM-15 | Separate scoped merchant and platform promotion permissions. |
| PROM-16 | Configurable campaign conditions without application redeployment. |

Approval concerns design principles only, not campaign activation, customer entitlements, live balances or new runtime scope.

## 2. Inventory authority
Cart and quote do not reserve or decrement stock. Successful master checkout atomically revalidates current stock, price, product/merchant eligibility and approved promotion rules, then commits child orders, stock effects, coupon/points consumption and immutable snapshot. Use deterministic locks and compatible legacy writers; ED-01 and PRE-G0-03 proof required. Stock movement unique by business effect and original quantity. Merchant acceptance, pickup and delivery do not decrement again. Eligible pre-custody rejection/cancellation compensates once with original reference; after collection require verified return and inspection before saleable restock. Damaged/missing/unsaleable items require recorded disposition. Never restore more than original uncompensated quantity. Merchant inventory edits/imports must not oversell or consume committed quantities. Preserve legacy behavior; no historical conversion.

## 3. Promotion and coupon policy
Proposed initial types: fixed/percentage merchandise discount, one eligible coupon per master and approved delivery subsidy. Quantity offers, buy-X-get-Y, basket thresholds and first-order offers are extensibility candidates; activate only after separate rule and test approval. Scope and funding must be explicit: merchant cannot allocate discounts to other merchants or platform funds without authorization. Campaign version includes eligible products/categories/merchants/zone, start/end UTC, eligibility, percentage/fixed amount, maximum benefit, minimum basket, per-user and total usage, funded budget, payer shares, stacking priority, approval actor. Numeric limits and precedence remain pending. Proposed default: approved product prices plus one eligible coupon, no additional coupon or points redemption in combination unless explicitly permitted. Never silently replace customer-selected terms; changed terms require requote. Server computes eligibility and allocations; no client authority. Validate concurrent budget and usage consumption atomically at checkout, no overcommit. Reconcile reserved/consumed/released budget by original effect and approved reversal rules. Quote preview is not guaranteed redemption or stock reservation.

## 4. Funding and financial allocation
Use exact integer IQD and deterministic conserved allocation according to C/FIN contracts. Customer due = S - Dm - Dp + F + T, where S is frozen merchandise after product-level price reductions, Dm merchant-funded order discounts, Dp platform-funded discounts, F customer delivery fee and T applicable configured tax. No double subtraction or negative due. Delivery subsidy represented by approved fee/funding components, not a second charge. Co-funded campaign preserves exact payer allocation and eligible line caps. Suggested commission base for discussion: eligible merchandise net of merchant-funded discount, before platform-funded discount. D06/accountant approval still required.

Illustration only: merchandise 100,000; discount 15,000 split 7,500/7,500; commission 10% of 92,500 = 9,250; merchant liability 83,250; delivery fee 5,000; customer due 90,000; platform contribution 750 after platform discount 7,500 and logistics cost 6,000. No tax or other costs. This is not an approved tariff or statutory accounting treatment. Record original funding, rate, allocations and campaign versions in snapshot; do not reprice historical orders. Partial cancellation/return uses original eligible allocations and signed adjustment, customer consent/revised COD where required. No automatic retroactive clawback or arbitrary allocation to unrelated merchants. Exact minimum-basket treatment after partial cancellation, coupon reissue/usage restoration, expiry and fee refund remain D02/D06/D10 decisions.

## 5. Loyalty
Unified participating-merchant rewards, not cash wallet or transferable stored value. Proposed lifecycle: pending estimate at checkout; earned after verified eligible completion; available after approved hold; redeemed against eligible future order; expired/reversed/restored as distinct audited effects. No duplicate accrual or redemption; authoritative balance and atomic consumption, idempotent original effect, concurrency guard, no negative available balance from ordinary redemption. Return/cancellation reverses earned points or restores eligible redeemed points under approved policy, preserving original allocation and expiry facts; already-spent points and expired restoration require explicit policy, not fabricated balance or unauthorized cash deduction. Points rates, conversion, eligible base, expiry, hold, minimum redemption, caps, funding, accounting liability and consumer terms remain open. Illustrative 1% reward on 100,000 = 1,000 IQD redemption value; 12.5% of illustrative 8,000 commission before redemption probability/expiry and accounting. No actual customer credit created.

## 6. Permissions, analytics and abuse prevention
Merchant creates scoped offers against own eligible catalog and budget; platform campaigns and shared funding require authorized platform/finance approval. Version, audit and publish/disable lifecycle; no retroactive editing of accepted snapshots. Prevent duplicate identities/usage abuse through approved eligibility checks and rate limits, without excessive PII. Campaign reporting distinguishes committed/redeemed/reversed discounts, payer funding, budget remaining, completed GMV, net commission, fulfillment cost and contribution; no unsupported ROI claims. Platform subsidy must not be counted twice as expense and contra-revenue. Disable new redemption without blocking recovery, refunds or historical statements. Default-off V2 and independent legacy paths.

## 7. Supplemental acceptance scenarios
| ID | Scenario | Required result |
|---|---|---|
| PP01 | Two buyers compete for last stock | one eligible atomic success, no oversell |
| PP02 | Legacy stock writer races V2 checkout | compatible lock/predicate, no negative stock |
| PP03 | Last campaign budget or use consumed concurrently | no overcommit or duplicate redemption |
| PP04 | Invalid child after stock/promotion effect | whole checkout rolls back |
| PP05 | Same command retried | one stock/coupon/points effect |
| PP06 | Merchant tries cross-merchant subsidy | denied |
| PP07 | Disallowed coupon/points stacking | reject or explicit requote, no silent terms change |
| PP08 | Co-funded discount and rounding | exact conserved payer/line amounts |
| PP09 | Partial rejection/return | original allocation and bounded compensation |
| PP10 | Damaged return | not saleable until approved disposition |
| PP11 | Points already spent when original order returned | controlled policy resolution, no fabricated balance |
| PP12 | Campaign disabled after checkout | existing snapshot and recovery preserved |

## 8. Open decisions and gate
D02 principles approved, but stacking priority, budget lifecycle, coupon restoration, loyalty conversion/expiry/holds and partial return semantics still need explicit finance/commerce approval. D06 commission base/tax/subsidy/refund and D10 timing/consumer policy remain open. Physical schema, RPCs, lock protocol and test implementation deferred to PRE-G0-10 and authorized phases. ED-01/02/03 and PRE-G0-03 remain open. PRE-G0-11 in progress; G0 OPEN / BLOCKED. No runtime, DDL, deployment, campaign activation, production data or monetary operations.
