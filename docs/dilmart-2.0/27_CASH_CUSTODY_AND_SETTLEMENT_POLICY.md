# DilMart 2.0 — Cash Custody and Settlement Policy

Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D07
Status: CASH-01–16 approved in principle by owner in project conversation. Numeric limits, accounting, legal and operating details remain open. G0 OPEN / BLOCKED.
Authority: 07_COMMERCE_ORDER_CONTRACTS.md, 09_INTELLIGENT_DISPATCH.md, 11_DRIVER_APPLICATION.md, 12_FINANCIAL_ARCHITECTURE.md, 17_G0_APPROVAL_GATE.md. Proposed documents 25 and 26 are in independent PRs; no dependency on their merge.

## 1. Approved principles
| ID | Policy |
|---|---|
| CASH-01 | Separate cash custody account per driver. |
| CASH-02 | Configurable risk-based cash exposure limit. |
| CASH-03 | Remit daily or upon reaching applicable limit; controlled recovery if physical transfer cannot occur immediately. |
| CASH-04 | Independent driver and cashier acknowledgement of actual transfer. |
| CASH-05 | Daily cash reconciliation. |
| CASH-06 | Driver earnings separate from COD custody; no silent netting. |
| CASH-07 | Weekly standard merchant settlement; faster cycles only for qualified merchants under approved conditions. |
| CASH-08 | Hold affected disputed amounts only, unless documented separate risk authority requires broader hold. |
| CASH-09 | Independent maker/checker approval for payouts and monetary adjustments. |
| CASH-10 | Electronic scoped statements for merchants and drivers. |
| CASH-11 | Dispatch enforces current cash exposure constraints. |
| CASH-12 | Electronic receipt for every confirmed cash movement. |
| CASH-13 | No destructive edit/delete of posted journal entries; linked corrections only. |
| CASH-14 | Record and investigate cash discrepancies. |
| CASH-15 | Support cash, bank transfers and approved licensed payment providers subject to legal and operational approval. |
| CASH-16 | Merchant funds must not finance platform operating expenses. |

Approval is a design decision, not authorization to move funds, open accounts, activate payment providers or implement features.

## 2. Cash ownership and journal authority
Finance owns COD version, actual receipt, cash accounts, obligations, settlements, reconciliation and balanced journal. Logistics owns verified physical delivery/custody. Dispatch consumes versioned exposure projections. Hub packing cannot change monetary amounts. Use integer IQD, immutable accepted financial snapshot, one authoritative economic effect, unique idempotency keys and balanced posting. Customer COD is not platform revenue. Example (no tax/discount): merchant sales 40,000 at 8%, 35,000 at 10%, 25,000 at 5%; commissions 3,200 + 3,500 + 1,250 = 7,950; merchant liabilities 92,050; fee 5,000; customer COD 105,000; illustrative platform gross revenue 12,950 before costs and accounting approval. No revenue or cash receipt at checkout. Pickup-only drivers do not collect customer COD.

## 3. Cash exposure and dispatch
Exposure = confirmed held cash + unresolved conservatively counted cash evidence not already held + expected COD of accepted uncollected shipments + active offer reservations, deduplicated by shipment/effect. Validate atomically at offer, acceptance and load; convert reservation to actual custody without duplicate counting. Missing/stale limit or projection blocks new automated COD assignment, not safe recovery. At/above limit, stop new positive-COD assignments and arrange remittance. Never prevent truthful evidence capture or safe return of already held parcels/cash. Limit changes require authorized finance actor, version, reason and audit; no driver override. Proposed tiers for study only: new 250,000; standard 500,000; trusted 1,000,000 IQD; exceptional documented approval. No tiers or values activated. Actual limits require cash concentration, insurance, security, route and hub evidence.

## 4. Collection and remittance
Exact current COD, verified delivery, assigned actor, due version, proof and receipt; duplicate retry returns original. Partial/excess/uncertain cash: record actual known fact, preserve evidence, hold affected obligations and conflicting collection; no false delivery or paid status. Critical cash/custody effects atomic or durable recoverable under FIN contracts; ED-02 proof remains mandatory.
Driver requests transfer with receipt allocations; cashier independently counts actual money; driver acknowledges same transfer and amounts; guarded Finance commit creates journal and electronic receipt. Only confirmed amount reduces driver custody. Partial remittance allocated to receipt balances explicitly; cannot exceed outstanding amount. Example expected 500,000, actual accepted 490,000: transfer 490,000; preserve unresolved 10,000, not zero balance or automatic write-off. Where physical possession is uncertain, use approved discrepancy workflow and ledger classification, not fabricated cash. Duplicate, conflicting, offline or unknown operation requires reconciliation before replay; no silent clearing. Driver earnings never deducted from COD.

## 5. Cash desk and daily close
Each cashier has scoped independent drawer/session, opening count reconciled to previous verified custody, no shared credentials. Record incoming cash, approved deposits/disbursements and transfer receipts; prohibit unauthorized negative drawer. Reconcile opening + inflows - outflows +/- approved adjustments to physical closing count. Unresolved differences require exception, responsible owner and evidence; no forced zero. Bank deposit is separate transfer with proof and confirmed clearing. Segregate merchant liabilities and funds from company operating liquidity through approved accounting, custody and banking arrangements; no diversion to payroll/expenses. Legal/accountant must approve actual segregation and regulatory requirements. Daily reconciliation dashboard includes pending/unknown receipts, driver exposure, cash desk balances, bank clearing, disputes and aging. Escalation timing, security procedures, cash transport and insurance pending operating approval.

## 6. Merchant settlement
Accrued -> payable -> reserved -> approved -> execution pending -> verified settled. Payable requires verified delivery, complete financial effects, allocated confirmed remittance or verified licensed payment, approved hold/return conditions, no blocking dispute and verified beneficiary. Weekly standard cycle approved in principle; proposed fast 3-day, daily 24-hour and exceptional manual cycles require separate approval and liquidity/reconciliation eligibility. Exact cutoff, calendar, minimum payout, hold period, partial remittance eligibility and fees remain open. Default affected obligation held pending sufficient verified allocation; no unrelated freeze without documented risk. Maker cannot approve own payout or adjustment. Persist unique payment attempt before external execution; unknown outcome blocks duplicate retry pending evidence. Partial success tracked per payout item; only verified amounts settle. Cancel only verified unexecuted reservation. Reversal/refund references original allocation; no rewriting settled history or unauthorized cross-beneficiary offset. No direct client posting or arbitrary admin balance editor.

## 7. Statements and controls
Merchant sees own delivered sales, commission, adjustments, accrued/payable/held/reserved/settled amounts, payout references and dispute status; driver sees own actual held cash, pending evidence, exposure and separate earnings. Avoid displaying competitor details, unnecessary customer PII or other driver financial data. Role-scoped electronic receipts and audit trail; retention D11. Statements reconcile opening + accruals - reversals - verified payouts +/- approved adjustments, not duplicate liabilities. Accounting/legal sign-off on principal-agent treatment, segregation, tax, payment providers, chart of accounts and recognition remains required.

## 8. Acceptance scenarios (supplemental to FA tests)
| ID | Scenario | Required result |
|---|---|---|
| CP01 | Concurrent offers near limit | exposure never double-reserved or exceeds approved limit through new assignment |
| CP02 | Cash collected after limit lowered | capture actual money, block unsafe new work, reconcile |
| CP03 | Remittance 490,000 of 500,000 | actual transfer recorded, 10,000 unresolved |
| CP04 | Duplicate transfer confirmation | one journal and receipt |
| CP05 | Cashier and driver disagree | no false confirmed amount; evidence and escalation |
| CP06 | Unknown bank payout | no blind retry or settled status |
| CP07 | One disputed order among payable items | only affected obligation held absent documented broader risk |
| CP08 | Merchant funds used for company expense | prohibited; independent liquidity and accounting controls |
| CP09 | Maker approves own adjustment | denied |
| CP10 | Driver earnings viewed with COD | separate balances; no netting |
| CP11 | Drawer discrepancy at close | exception and evidence, not silent zero |
| CP12 | Cross-merchant statement access | denied |

## 9. Open decisions and field validation
Obtain finance/operations sign-off for limits, daily cutoff, remittance triggers, cash desk capacity, physical cash security, deposit procedures, approval thresholds, hold periods, payout cycle calendar and methods, verified beneficiary rules, disputes, partial remittance, exception SOP, accounting and legal requirements. Validate synthetic concurrency and fault injection ED-02 before affected implementation/acceptance; field evidence at applicable G3/G6 gates. D07 principles approved; detailed decision remains OPEN. D02, D06, D10, D11, D12, D13 dependencies open. PRE-G0-11 remains in progress. No code, DDL, deployment or production operations.
