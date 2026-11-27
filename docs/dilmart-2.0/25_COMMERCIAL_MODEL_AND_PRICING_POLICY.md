# DilMart 2.0 — Commercial Model and Pricing Policy v1.0

Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Task: PRE-G0-11 / D06, with dependencies D02, D05, D07, D10, D12, D13
Status: COM-01–12 approved in principle by owner in project conversation. Numeric tariffs, accounting and operational policies remain proposed. G0 OPEN / BLOCKED.

## 1. Scope and evidence
Baghdad first. Owner confirmed merchant commission and price negotiations remain entirely open. Approximately 250 prospective merchants are a verbal pipeline, not verified active merchants. This document records commercial principles and scenario assumptions, not signed agreements or approved production prices. Read 07_COMMERCE_ORDER_CONTRACTS.md, 12_FINANCIAL_ARCHITECTURE.md, 16_ARCHITECTURE_DECISION_REGISTER.md and 17_G0_APPROVAL_GATE.md. Existing design gates and no-runtime authorization remain unchanged.

## 2. Owner-approved commercial principles
| ID | Direction |
|---|---|
| COM-01 | No merchant onboarding fee at launch |
| COM-02 | Variable commission by category and agreement |
| COM-03 | Time-limited promotional commission with approved budget and expiry |
| COM-04 | One customer delivery charge for default consolidated shipment |
| COM-05 | Configurable pricing by zone and service level |
| COM-06 | Hybrid internal/external logistics model subject to D13 |
| COM-07 | Batch compatible ready parcels on merchant visits where feasible |
| COM-08 | Immutable accepted financial snapshot with agreement and pricing versions |
| COM-09 | Measure full order and return costs |
| COM-10 | Weekly standard merchant settlement; faster settlement conditional on reconciliation and liquidity |
| COM-11 | No additional customer service fee initially |
| COM-12 | Defer subscriptions, advertising and external-order B2B logistics to later approved scope |

No production flags, contracts, rates or payments activated by approval. No automatic external provider fallback. Existing legacy provider behavior remains unchanged. COM-06 does not authorize new integrations or dispatch.

## 3. Market intelligence and evidence limitations
Prior conversation research reported Iraqi marketplace category commissions, restaurant platform commission complaints, local courier pricing, COD fees and driver recruitment offers. These are heterogeneous service types and cannot be treated as equivalent contracts. Research references to revisit during field validation: Gini help center; Miswag merchant guide/ChannelEngine; https://mersal-zayouna.com/e-commerce-delivery-services-iraq/ ; https://al-sai.com/pricing ; https://prime.iq/en/faq/ ; https://www.tryboxy.com/ ; https://wsl.iq/ ; https://tarish.iq/ ; https://jenni.solutions/pricing ; ARIJ reporting on Iraqi delivery riders. No source pages independently re-opened in this documentation task. No signed courier quote, merchant margin, driver compensation or field measurement received. Prior discussion ranges are indicative hypotheses, not independently verified tariffs in this document. Do not market unproven savings or SLA.

## 4. Proposed negotiation ranges (NOT approved tariffs)
| Category | Proposed range | Reference hypothesis |
|---|---:|---:|
| Phones/computers | 2–4% | 3% |
| Electronics accessories | 4–7% | 5% |
| Groceries | 3–6% | 5% |
| Home appliances | 4–8% | 6% |
| Home goods | 7–10% | 8% |
| Automotive parts | 7–12% | 9% |
| Clothing/footwear | 8–12% | 10% |
| Beauty/perfume | 8–12% | 10% |
| Gifts/accessories | 10–15% | 12% |
| Strategic merchant | negotiated | not predetermined |

Launch partner 0–3% temporary offer, standard category rules, enterprise negotiated agreement. These are hypotheses. No universal 0% or free delivery; cap promotion exposure and obtain finance approval. Proposed specificity ordering for agreement resolution: approved merchant+product exception, merchant+category, merchant agreement, platform category, platform default. Exact precedence, overlapping rule handling, effective dates and authorization require D06 approval. Missing rule must fail closed for V2 admission, not silently assume zero or use a current rate on historical order.

## 5. Proposed customer delivery prices (IQD, NOT approved)
| Service | Hypothesis |
|---|---:|
| Scheduled economy | 3000 |
| Standard | 4000 |
| Consolidated multi-merchant | 5000 |
| Express | 6000–7000 |
| Oversize/outlying zones | quoted |
| Free delivery | approved funded promotion only |

One final quoted customer fee, not multiplied by merchant count. Service levels are hypotheses; express disabled until field evidence and approval. Quote records zone, service, eligible merchant/parcel constraints, price version, subsidy payer and expiry. No unilateral increases after acceptance. Large or incompatible baskets require explicit eligibility/quote handling; do not silently split. Internal cost model is not the customer tariff.

## 6. Accounting and policy contracts
Integer IQD, exact rational/decimal rates and deterministic allocation per FIN/C contracts. Customer due = S - Dm - Dp + F + T as defined in 07/12, no double deduction. Commission base (before/after merchant discounts), tax, promotional funding, fixed charges, rounding, cancellation/partial return/delivery-fee refund and principal-agent recognition still require D02/D06/accountant approval. Suggested for discussion: commission on eligible delivered merchandise net of merchant-funded discounts; platform-funded discount does not silently reduce merchant entitlement. No recognition of collected cash or earned commission at checkout. Preserve original snapshot and linked adjustments, original rate reversal, no retroactive repricing. Separate GMV, cash custody, liabilities, platform revenue, variable cost and contribution. No new accounting authority outside FIN contracts.

## 7. Unit economics model
Definitions: N = monthly orders entering delivery; q = completed fraction; A = average completed merchandise value; r = effective weighted commission rate; F = customer delivery fee; m = average merchant shares per completed order; b = shares collected per merchant visit; V = fully allocated visit cost; H = variable hub cost per completed order; L = final-mile cost; e = modeled cash loss reserve rate; K = full variable cost per failed order; O = fixed monthly overhead excluding already allocated costs.
Completed = N*q; Revenue = N*q*(A*r+F); Variable cost = N*q*(m*V/b+H+L+(A+F)*e)+N*(1-q)*K; Contribution = Revenue - Variable cost; operating result = Contribution - O. Avoid double counting failed-order cost, labor, cash reserve, discounts or hub overhead. Reserve is planning estimate, not accounting provision. Excludes post-delivery returns, taxes, promotion and missing costs; measure separately.

Illustrative inputs: 200 entries/day x 30 days, A=60000, r=8%, F=5000, m=2, b=3, V=2500, H=1000, L=3000, q=90%, K=5000, e=0.5%, O=10000000. Completed 5400; GMV 324000000; revenue 52920000; variable cost 35355000; contribution 17565000; operating result 7565000 IQD before excluded costs. Break-even approximately 114 daily entries under unchanged assumptions. Not forecast or operational capacity proof.

Example 3 separate shipments x 4000 versus consolidated 5000 implies 7000 customer saving, 58.3%, only as hypothetical comparison. Example 2500 visit cost / 10 compatible ready parcels = 250 per parcel before extra loading/transport; no claim competitors always collect separately. Density and synchronized readiness determine achievable batching. Track first-mile cost per parcel/share, parcels per visit, hub cost, last-mile cost, failed and returned orders, weighted commission, net contribution and cash discrepancies.

## 8. Driver compensation and settlement dependencies
D05 not approved numerically. Compare fixed salary, per qualifying stop/batch and hybrid base+activity with floor, fuel, equipment, safe hours, insurance, failed attempt/return policy and no speed incentives. Distinguish employee/contractor legal status, vehicle ownership and first/last-mile tasks. No deduction from COD or unauthorized netting. D07: weekly settlement principle approved; exact eligibility, remittance schedule, driver cash limit, maker/checker thresholds, dispute holds, payout minimum, bank/payment method and accounting remain open. No payment before verified eligible obligation/custody reconciliation; no automatic payout for unknown external execution. Use existing FIN authority. D13: internal fleet primary in validated dense zones, external carrier only under approved exclusive shipment assignment and reconciled custody/cash contract; coverage, rate, SLA, failure, return and fallback conditions unresolved.

## 9. Field validation
Target sample proposed: 30 prospective merchants stratified by category; 8–10 courier written quotes; 20 driver interviews; 50–100 customer interviews; 300–500 authorized pilot orders subject to G5/G6. Record quote date, service, weight/zone, volume tier, COD fee/base, remittance cadence, failed/return charges, tax, insurance and exclusions. Merchant evidence: gross margin, average order, readiness, acceptable commission and funded promotions. Driver evidence: hours, vehicle/fuel ownership, guaranteed pay, actual route stops and failed attempts. Pilot: observed route density, hub throughput, cash/returns and contribution. Sample targets are proposals, not statistical guarantees. Keep contact details, actual contracts and business records private.

## 10. Gate disposition
COM-01–12 principle approval recorded. D06, D05, D07, D02, D10, D12 and D13 remain OPEN; numeric and legal/accounting decisions require separate owner/finance/operations approval. PRE-G0-11 remains in progress. No DDL, application changes, staging creation, feature activation or production operations. Next: D05 driver compensation model and D07 cash custody/settlement policy. G0 OPEN / BLOCKED.
