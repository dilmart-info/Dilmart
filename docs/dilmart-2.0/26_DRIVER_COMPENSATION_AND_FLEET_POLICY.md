# DilMart 2.0 — Driver Compensation and Fleet Policy

Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D05
Status: PAY-01–12 owner-approved design principles in project conversation; numeric tariffs and contracts remain open. G0 OPEN / BLOCKED.
Related: 09_INTELLIGENT_DISPATCH.md, 11_DRIVER_APPLICATION.md, 12_FINANCIAL_ARCHITECTURE.md, 17_G0_APPROVAL_GATE.md. Commercial policy document 25 is pending independently in PR #70; this document does not require that unmerged branch.

## 1. Approved principles

| ID | Policy |
|---|---|
| PAY-01 | Drivers use their own motorcycles or cars. |
| PAY-02 | No company vehicle fleet acquisition at launch. |
| PAY-03 | Support fixed salary, hybrid base plus activity, and per-operation arrangements. |
| PAY-04 | Separate pickup and final-mile earning rules. |
| PAY-05 | Versioned configurable driver-specific agreements. |
| PAY-06 | Accrue earnings from verified qualifying operations and approved contractual components. |
| PAY-07 | Driver earnings and COD custody are separate; no silent netting. |
| PAY-08 | Support configured fuel and distance allowances. |
| PAY-09 | Reward quality, compliance and safety; no unsafe speed incentives. |
| PAY-10 | Support core and supplemental driver rosters, subject to lawful contracts. |
| PAY-11 | Preserve applicable compensation agreement version for every earning effect. |
| PAY-12 | Measure driver, route and zone economics with explicit cost allocation. |

Approval covers design principles, not hiring, compensation rates, employment classification, insurance coverage, purchases or feature activation.

## 2. Operating model
One authorized driver application; pickup, delivery and hybrid capability. No automatic mixed pickup/delivery route at launch. Pickup driver collects compatible ready parcels at merchant stops, transfers custody to hub, does not collect customer COD. Delivery driver loads released consolidated shipments and verifies delivery/COD and returns. Hybrid mode changes require server authorization and custody/cash checks. Capacity profile by verified vehicle, weight, volume and parcel count; motorcycles and cars not interchangeable by default.

Driver owns vehicle, maintains roadworthiness and provides required driving/vehicle documents. Proposed allocation: driver supplies phone and routine vehicle operation; company supplies app, operational training, identity and approved parcel equipment; fuel/distance reimbursement according to contract. Insurance, liability, equipment safety, employment status, minimum compensation, working time/rest, contributions and lawful deductions require D11 legal review. No assumption that driver ownership transfers all legal risk.

## 3. Compensation engine contracts (design only)
Finance owns authoritative earning effects. Dispatch/logistics supply verified operation evidence, never directly set pay. Agreement fields: driver, authorized modes, effective interval, version, currency IQD, compensation type, base pay terms, pickup stop rate, additional-parcel rule, delivered shipment rate, approved distance/fuel allowances, verified failed-attempt and return compensation, quality bonus rules, eligibility and approval actor. Exact physical schema and APIs deferred to PRE-G0-10. Use exact integer IQD/rational rates; effective dates and overlap rules must be explicit. Freeze applicable rule when qualifying work is assigned or accepted under the approved policy; no retrospective adverse repricing. Missing/ambiguous terms block paid new assignment until resolved. Existing custody recovery must remain available.

Pay a pickup visit once per unique verified qualifying stop/batch, not once per parcel unless explicitly configured incremental component. Multiple parcels at one stop do not create multiple visit fees. Final-mile pay once per qualifying shipment delivery, not per merchant child. Failed attempts and returns need independent evidence and eligibility; not fabricated successful deliveries. Distance allowance uses approved route/measurement and dispute procedure, not arbitrary GPS ping totals. Base pay, time, expenses and bonuses governed by contract; no duplicate reimbursement. Changes and adjustments are authorized, auditable, linked to original effect and idempotent. No direct driver client journal writes. Earnings remain separate from COD and payouts; do not withhold lawful earned pay automatically for cash dispute. Follow FIN19 and approved accounting rules.

## 4. Illustrative comparison (not tariffs)
26 days, 20 qualifying operations/day = 520 operations.
| Model | Base IQD | Per operation IQD | Monthly gross IQD | Gross pay/operation IQD |
|---|---:|---:|---:|---:|
| Fixed | 900000 | 0 | 900000 | 1731 |
| Hybrid | 400000 | 1000 | 920000 | 1769 |
| Variable | 0 | 2000 | 1040000 | 2000 |

These are hypothetical gross payments before driver-owned vehicle costs, tax/contributions or additional company expenses. They are not minimum wage claims or verified local offers. Hybrid core roster plus supplemental capacity is recommended for testing, not a selected legal arrangement.

## 5. Illustrative capacity model
Inputs: 5 pickup drivers x 12 qualifying merchant visits/day x 4 ready parcels/visit = 240 parcels/day; 2 parcels per completed master implies 120 masters/day first-mile theoretical capacity. 10 delivery drivers x 20 deliveries/day = 200 masters/day last-mile theoretical capacity. Bottleneck = min(120,200) = 120 masters/day before hub, shift, failure and availability constraints. At 26 shared operating days: theoretical 3120 masters/month. Hybrid illustrative base 400000 each, 1000/visit or delivery: pickup gross 3560000, delivery gross 9200000 if each performs all assumed paid stops; total 12760000 IQD. At bottleneck throughput, assumed 200 successful final-mile deliveries/day is inconsistent with 120 daily completed masters absent backlog/other streams; treat full activity pay as an upper-cost scenario, not forecast. Consistent no-backlog scenario uses 120 daily final-mile deliveries aggregate: delivery gross 7120000, total 10680000 IQD, gross pay per master ~3423 IQD at 3120 completions. No hub/insurance/fuel/failed attempts/returns/leave or extra company overhead included. Schedule and actual utilization need field evidence.

## 6. Controls and test expectations
- Same verified pickup batch retried: one visit earning; configured incremental parcel earnings bounded and unique.
- Multi-merchant master delivered: one final-mile earning per qualifying shipment.
- Failed delivery/return: separate evidenced event and approved rule, no double pay for same effect.
- Agreement updated mid-route: preserve applicable version; original history unchanged.
- Missing rate or conflicting agreement: fail closed for new paid assignment, retain recovery.
- Duplicate event, concurrent replay, restart: idempotent earnings and ledger posting.
- COD remittance never offsets driver pay silently; cash limit applies independently.
- Unauthorized rate change, cross-driver statement access or GPS manipulation cannot authorize pay.
- Incentives do not reward unsafe speed; disputes and manual corrections require evidence and review.

## 7. Validation and open items
Interview proposed sample of 20 local drivers, distinguishing motorcycles/cars, fuel, maintenance, net income, hours, rest, vehicle insurance, availability, pickup versus delivery rates and failed-attempt handling. Obtain written contract proposals. Validate actual route density and hub capacity, peak demand, downtime, absences and backup capacity in authorized pilot. Finance and operations approve rates, minimum guarantees, allowance rules, bonus metrics, pay cycle, qualifying event definitions and cost allocation. Legal approves contract classification and protections. D05 design direction accepted; numerical and field readiness remain OPEN. D07 cash limits/remittance, D10 failure windows, D11 legal, D12 capacity, D13 external provider dependencies remain open. PRE-G0-11 in progress; G0 OPEN. No code, DDL, deployment or production mutation.
