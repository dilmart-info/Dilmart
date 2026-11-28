# DilMart 2.0 — External Logistics Provider Policy

Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D13
Status: EXT-01–18 owner-approved design principles in project conversation. Contracts, rates, actual integrations and operating thresholds remain open. G0 OPEN / BLOCKED.
Authority: 07_COMMERCE_ORDER_CONTRACTS.md, 09_INTELLIGENT_DISPATCH.md, 10_HUB_PARCEL_MANAGEMENT.md, 12_FINANCIAL_ARCHITECTURE.md, 17_G0_APPROVAL_GATE.md. Policy documents 25–29 are separate PRs; no dependency on their merge.

## 1. Approved principles
| ID | Policy |
|---|---|
| EXT-01 | Internal managed fleet is primary in qualified coverage zones. |
| EXT-02 | Support multiple external delivery providers. |
| EXT-03 | Unified provider adapter boundary. |
| EXT-04 | Avoid exclusive technical dependency on one carrier. |
| EXT-05 | Internal first-mile collection is launch priority. |
| EXT-06 | Allow approved external final-mile delivery of consolidated shipments. |
| EXT-07 | Select providers by full cost, service quality and availability. |
| EXT-08 | Mandatory eligibility gates before ranking. |
| EXT-09 | One exclusive active provider per shipment. |
| EXT-10 | No reassignment while prior external execution outcome is unknown. |
| EXT-11 | Verified custody transfer to external carrier. |
| EXT-12 | Unified internal and external shipment tracking. |
| EXT-13 | Separate financial account and reconciliation per provider. |
| EXT-14 | Include COD and return fees in cost comparison. |
| EXT-15 | Authenticate provider webhooks and deduplicate effects. |
| EXT-16 | Preserve legacy Jenni integration and behavior. |
| EXT-17 | New integrations disabled until approved and tested. |
| EXT-18 | Share only customer data necessary for shipment execution. |

## 2. Service scope and eligibility
Baghdad first. Internal managed drivers collect merchant parcels and deliver them to DilMart cross-dock hub. Internal or approved external carrier may take the released consolidated shipment for final-mile delivery. External first-mile and intercity operations are deferred pending separate scope and proof. Use external capacity for qualified overflow, coverage gaps, breakdown recovery or handling classes under approved contracts; not an automatic fallback. Internal fleet means managed drivers, not company-owned vehicles.
Eligibility before ranking: approved contract, active provider and integration, validated zone, shipment dimensions and handling class, current capacity and promised window, verified release revision, COD acceptance and exposure, custody protocol, settlement and reconciliation capability, data/security approval and service restrictions. Missing or stale critical evidence blocks automated assignment. No override of hard safety or financial gates. Legacy Jenni remains isolated; no V2 child event directly triggers legacy dispatch.

## 3. Selection and economics
Proposed ranking weights for study only: full expected cost 30%, deadline/service reliability 25%, delivery success 20%, COD/settlement quality 15%, available capacity 10%. Normalize with approved fixed bounds and comparable cohorts, distinguish unknowns from zero, record inputs and reasons. No LLM authority or unverified probability. Internal priority subject to feasibility and approved commercial policy; exact thresholds and override scope remain open.
Illustrative expected last-mile cost per dispatched shipment: internal base 3,000 plus 10% failure x 1,500 incremental return = 3,150 IQD. External base 3,500 plus 90% success x 60,000 COD x 1.5% fee plus 10% failure x 2,000 return = 4,510 IQD; difference 1,360. Assumes base charged per dispatch, COD fee on success, equal failure rates and no other costs. Not provider quotes. Compare actual service-specific success/failure, remote area and weight surcharges, taxes, settlement delay, loss exposure, incremental vs fully allocated internal cost and returns. Avoid double counting costs. Customer accepted fee cannot change silently when carrier changes.

## 4. Provider adapter (design only)
Conceptual capabilities: quote, create/dispatch, lookup by unique client reference, track, cancel, return, reconcile. Explicit capabilities and typed unsupported/unknown responses; do not assume Jenni or another provider supports every method. Routing provider is separate from physical carrier. Store provider ID, policy/contract version, external shipment reference, request correlation, accepted quote, status mapping and evidence. No remote network call within DB transaction. Durable uniquely keyed dispatch intent/outbox and authoritative operation status; idempotency supported where verified. Use scoped credentials, secret storage, bounded timeouts/retries, circuit breaker and monitored reconciliation. Exact routes, DTOs and lock contracts PRE-G0-10. No new integration or credential changes authorized.

## 5. Exclusivity and unknown outcome
Shipment has one exclusive active provider assignment. Atomically reserve authority before any external request. Distinguish confirmed rejection, accepted, unknown execution, cancelled-confirmed-before-handover, actual custody and return. Timeout is not rejection. Unknown result blocks internal and external reassignment; query by stable reference or obtain verified carrier evidence, never blind create retry. Confirmed rejection or cancellation without custody can release assignment under guarded command; after handover require actual verified transfer/return and reconciliation before reassignment. No destructive rollback or dual COD. Existing parcels/cash remain recoverable if intake disabled. Manual override records actor, evidence and reason but cannot bypass exclusivity or custody. Verify legacy/V2 isolation.

## 6. Custody and tracking
Carrier handover only after release approval and revalidation of shipment, manifest, COD, destination and provider assignment versions. Record individual parcels or approved intact seal, actual transfer and acknowledgement; partial transfer creates explicit exception. Provider tracking states mapped to canonical facts without inventing missing custody or delivery proof. Authenticate webhook according to verified provider protocol; validate event identity, actor/reference scope, freshness/replay and payload. Duplicate/out-of-order events reconcile without regressing state or duplicating finance. Untrusted or contradictory callbacks quarantined for review. Polling and manual evidence where contracted; customer sees safe unified projection, not raw provider status or internal PII. Data minimization, retention, deletion and contractual responsibility D11.

## 7. Financial reconciliation
Separate carrier clearing/receivable and payable effects from merchant obligations and internal driver custody. Record verified gross COD, contractual delivery fee, COD fee, returns, taxes/adjustments and actual remittance separately. Example: 10,000,000 gross collected less 600,000 delivery, 150,000 COD and 50,000 returns = 9,200,000 net expected only if authorized contract permits deduction. No automatic netting without contract/accounting approval. Match shipment-level verified delivery, collection and fee evidence to remittance and bank confirmation; provider notice is not proof of cash receipt. Affected discrepancy or unknown payment blocks relevant settlement, not unrelated funds absent documented risk. One balanced journal per economic effect, immutable original allocation and audited reversal. D07 merchant-fund segregation applies. ED-02 recovery evidence required.

## 8. Provider qualification and supplemental tests
Obtain written tariff/coverage/handling/SLA/COD/remittance/return/liability/privacy terms, API capability and cancellation/idempotency/webhook evidence, test credentials for isolated approved environment, measured service and finance reconciliation. No signed contract or new provider selected in this task.
| ID | Scenario | Required result |
|---|---|---|
| EP01 | Concurrent internal/external assignment | one exclusive authority |
| EP02 | External create timeout | unknown; no second dispatch |
| EP03 | Confirmed rejection before custody | guarded alternative eligibility |
| EP04 | Cancel after actual handover | verified custody recovery first |
| EP05 | Duplicate/out-of-order webhook | one effect, no false regression |
| EP06 | Invalid callback authentication/scope | reject/quarantine |
| EP07 | Carrier fee/collection discrepancy | affected settlement held and reconciled |
| EP08 | Provider outage | no unsafe fallback or fabricated ETA |
| EP09 | New provider disabled | no external dispatch |
| EP10 | Legacy Jenni order | unchanged, no V2 duplicate |
| EP11 | Partial physical handover | truthful parcel custody and exception |
| EP12 | Unknown payout/remittance | no false settled state |

## 9. Gate disposition
D13 principles approved, but exact provider eligibility, fallback thresholds/authority, carrier contracts, pricing, remittance, status mappings and API capabilities remain OPEN. Existing Jenni V2 suitability unverified. D03/D05/D06/D07/D10/D11/D12 dependencies remain open. PRE-G0-11 in progress; G0 OPEN / BLOCKED. No application code, DDL, remote calls to carriers, payments, deployment or activation. Next D03 hub operating constraints and capacity.
