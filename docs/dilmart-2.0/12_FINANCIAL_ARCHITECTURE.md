# DilMart 2.0 — Financial Architecture (Phase 0.3G)

Date: 2026-11-26
Baseline: a44b375d2299c4268ded479337e3cb6e7d0f85fd
Status: owner-approved FIN01–FIN28 design direction; detailed contracts proposed for review. G0 OPEN.
Scope: documentation only. No runtime changes, DDL, production access, payments, provider purchase, provisioning, deployment or activation.

## 1. Authority and source evidence

Read [Master Spec](00_MASTER_SPEC.md) sections 14–15, [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md), [architecture](06_SYSTEM_ARCHITECTURE.md), [commerce](07_COMMERCE_ORDER_CONTRACTS.md), [merchant](08_MERCHANT_FULFILLMENT.md), [dispatch](09_INTELLIGENT_DISPATCH.md), [hub](10_HUB_PARCEL_MANAGEMENT.md), [driver](11_DRIVER_APPLICATION.md), and CURRENT_PHASE. PRs #55–60 merged. C01–C12 and the custody/release contracts constrain finance.

| Existing source | Observed evidence | V2 treatment |
|---|---|---|
| backend/src/modules/finance/commercial-engine.service.ts:116,226 | commercial rule resolution and legacy fallback | retain versioned rule concepts; prove compatibility |
| backend/src/modules/finance/order-finance.service.ts:198–288 | stable keys, documented delivery sentinel, sequential merchant and courier posting after delivery | require atomic critical effects or proven durable workflow |
| order-finance.service.ts:290–391 | merchant gross credit, fees/debit entries, idempotent upsert, event and order-status update in separate calls | balanced journal and guarded derived projections |
| order-finance.service.ts:393–455 | delivery/remittance-based payable gate with legacy compatibility | V2 strict reconciliation and dispute/hold checks |
| courier-finance.service.ts:124–250 | courier accrual/payable/reversal | distinct beneficiary ledger, preserve legacy |
| courier-finance.service.ts:389–626 | payout batch lifecycle | review existing atomicity, approval, settlement, failure recovery |
| 05_PHASE_0_2A_DATABASE_PROOF_REPORT.md | ED-02 post-commit finance risk; COD, payout, reversal fault injection outstanding | blocking proof before implementation acceptance |

Specific risk: order-finance.service.ts:272 may return early when merchant settlement is accrued, before subsequent courier steps at :277–280; the documented sentinel and reconciliation query depend on order_accrued event, appended before all effects complete. A crash or partial failure could therefore leave some effects unresolved despite the marker. This is a source-level risk hypothesis, not observed financial loss. Verify exact fault windows and recovery in isolated tests, including event appended before status update, merchant accrual before courier accrual and payable update before ledger update. Existing payout APIs/RPCs not certified by this review. ED-01–06 open.

## 2. Decisions FIN01–FIN28

| ID | Direction |
|---|---|
| FIN01 | One authoritative financial source per economic effect |
| FIN02 | Balanced double-entry journal for V2 |
| FIN03 | Exact integer IQD |
| FIN04 | Immutable accepted commercial snapshots |
| FIN05 | Versioned agreements and pricing rules |
| FIN06 | Conserved multi-merchant allocation |
| FIN07 | Shipment-level COD |
| FIN08 | Idempotent collection and posting |
| FIN09 | Separate driver cash custody account |
| FIN10 | Cash exposure limits |
| FIN11 | Cash sessions |
| FIN12 | Two-party cash remittance confirmation |
| FIN13 | Daily reconciliation |
| FIN14 | Merchant accrual subledger |
| FIN15 | Distinct accrued, payable and settled stages |
| FIN16 | Payout batches |
| FIN17 | Maker/checker approval |
| FIN18 | Verified payment execution evidence |
| FIN19 | Separate driver earnings |
| FIN20 | No unauthorized netting against COD |
| FIN21 | Reversal/adjustment journal entries |
| FIN22 | Cost centers |
| FIN23 | Order, merchant and zone profitability |
| FIN24 | Dispute and discrepancy workflows |
| FIN25 | Atomic effects and durable recoverable events |
| FIN26 | Preserve legacy financial history |
| FIN27 | Scoped finance authority |
| FIN28 | Complete audit and reconciliation |

No agreed tariffs, rates, taxes, hold days, cash limits or final chart of accounts. Accounting/legal review is required before production recognition policy is frozen.

## 3. Financial authority and compatibility

Finance owns monetary amounts, approved COD versions, journal postings, liabilities, cash custody, reconciliation, settlement and payout. Commerce owns accepted quantities and commercial resolution; logistics owns physical delivery/return proof; Dispatch consumes exposure projections; Hub owns release and parcel custody, not cash settlement. Use a coordinated database transaction for cross-domain critical effects; no duplicate independent writers or client-provided financial authority.

V2 journal is authoritative for V2 economic effects. Existing merchant_ledger_entries, courier_ledger_entries, order_finance_events and settlement fields are reuse or projection candidates, not assumed double-entry tables. ED-01 must establish exact catalog/grants and writer inventory; 0.3H must specify reuse versus additive structures, effect routing and reconciliation. Legacy transactions continue with original authority and historical amounts; never post the same V2 effect in two authoritative systems. Legacy statements may be combined through explicitly labeled read models, not duplicate mutable balances. No forced historical conversion or opening balance migration without separately approved reconciled plan.

## 4. Money and commercial snapshot

IQD amounts are bounded integers; exact decimal/rational rates, explicit rounding, overflow guards; no binary float monetary calculations. Transport large integers safely (decimal strings if outside safe JS integer range). No mixed currency journal. Snapshot includes master/child/line IDs, accepted quote, currency, agreement/rule versions, quantity/price, discount funding, commissions, assisted/extra fees, delivery deductions, tax, fee charged, subsidy, beneficiary allocations, destination and fulfillment revision, COD version. Actual operating cost is a separately versioned fact, not retroactive mutation of quote.

From 0.3B: due = S - Dm - Dp + F + T; S after product-level reductions, Dm merchant-funded, Dp platform-funded, F customer delivery fee, T configured tax. Avoid counting reductions twice. Customer delivery fee charged once by default; allocate internally without multiplying debt. Deterministic largest-remainder allocation with stable canonical tie-break and eligible-base caps; preserve original allocation and apply signed reversal to original values. Define rounding base, commission treatment and tax under D06; no live rate assumed. Reject negative due, inconsistent allocations, stale versions and unauthorized price changes. Original snapshot immutable; revisioned delta for customer-approved adjustment, not recalculation under today's agreement. No checkout recognition of earned revenue or collected cash.

## 5. Logical journal and subledgers

| Entity | Grain / invariant |
|---|---|
| financial_accounts | account type, currency, owner/custodian dimension, status |
| financial_journals | one immutable economic effect, unique business key and payload hash |
| financial_journal_lines | positive amount, debit or credit, account, allocation/reference |
| financial_snapshots / allocations | original accepted commercial facts and versioned deltas |
| shipment_cod_versions / receipts | approved due and actual verified collection facts |
| driver_cash_sessions / cash_desk_sessions | opening and closing count/evidence, lifecycle |
| cash_transfers / transfer_allocations | physical remittance and receipt-level application |
| financial_obligations | beneficiary accrual and payable projection, remaining amount |
| payout_batches / payout_items / payment_attempts | reserved obligation amounts and verified execution |
| financial_disputes / reconciliation_runs | explicit variance and resolution evidence |
| cost_allocations / financial_effect_jobs | approved costs and durable posting/recovery |

Names conceptual only; reconcile with existing tables and cross-domain entities in 0.3H. A journal posts atomically only if sum debit = sum credit by currency; at least two valid lines, nonzero amounts, valid account/period/scope, exact business key uniqueness. Same key and same canonical effect returns original; different payload conflicts. No update/delete of posted amounts. Correction through linked reversal or approved adjustment with reason/actor/evidence. Lifecycle and projections can change through guarded commands, not rewriting original journal. Balances derived from posted entries; materialized balances are rebuildable, reconciled projections, not second authority. Use bounded integers/decimal types and check constraints plus transactional validation. Journal numbering and period close policy pending accountant approval.

Proposed account families: cash in driver custody, cash desk, cash in bank, provider clearing/receivable, unapplied receipts/discrepancy clearing, merchant liability by beneficiary, driver earnings payable, courier payable, customer refund payable, platform commission revenue, delivery revenue, tax liability, logistics expenses, platform-funded discount/contra-revenue as approved, loss/recovery accounts. Classification is illustrative, not statutory advice. Accrual/payable/in-payout/settled are obligation workflow states, not duplicate liabilities. GMV is analytical volume, not necessarily platform revenue.

## 6. Posting example and accounting policy

Illustrative no tax/discounts, agent-style marketplace economics only: products A 25,000, B 35,000, C 40,000; total 100,000; 10% commission 10,000; merchant liabilities 22,500/31,500/36,000 = 90,000; delivery fee 7,000; COD 107,000. Variable logistics cost 8,000; contribution 9,000 before overhead, losses and tax. Not approved tariffs.

| Verified economic event | Debit | Credit | IQD |
|---|---|---|---:|
| combined valid delivery and exact COD, assuming recognition criteria met | driver cash custody | merchant liability A | 22,500 |
| same journal | driver cash custody | merchant liability B | 31,500 |
| same journal | driver cash custody | merchant liability C | 36,000 |
| same journal | driver cash custody | commission revenue | 10,000 |
| same journal | driver cash custody | delivery revenue | 7,000 |
| confirmed driver remittance | cash desk | driver cash custody | 107,000 |
| merchant payout verified | merchant liability | cash/bank | 90,000 |
| approved incurred logistics cost | logistics expense | driver/courier/other payable | 8,000 |
| verified cost payout | corresponding payable | cash/bank | 8,000 |

First five lines represent one balanced multi-line journal totaling 107,000 on each side, not five separately retriable commercial effects. If delivery and actual cash occur at different times, post verified facts via approved receivable/clearing/advance accounts and settle against them, never recognize the same revenue or liability twice. Cash received without verified delivery is not automatically earned revenue; use unapplied receipt/clearing and reconcile. Prepaid provider payments require approved licensed provider, verified settlement events and separate clearing; no assumed payment capability. Tax, gross/net revenue (principal versus agent), discount classification, recognition timing and legal chart of accounts require accountant/legal approval. Journal examples are engineering fixtures, not finalized accounting treatment.

## 7. COD authority and cash exposure

Only release-approved shipment with current destination, customer resolution and finance COD revision may be assigned/loaded. Verify assigned last-mile actor, custody, shipment version, due version, proof and payment method. Default exact full COD, no unattended drop or arbitrary driver discount. One final verified receipt per eligible shipment/due effect; retry same key/hash returns original. Partial or excess cash, actual cash with failed proof, or uncertain offline collection is a discrepancy: capture truthful evidence, hold conflicting collection and affected payout, authorized reconciliation; do not erase money or mark paid incorrectly. Pickup-only driver cannot collect customer COD.

Normal exact COD delivery command must atomically record delivery proof, custody outcome, actual receipt, cash-custody posting and required financial effect or durable uniquely identified posting work with explicit pending status. Prefer one DB transaction for critical cash/custody/journal; any deferred accrual must be recoverable and block payout until complete. No best-effort in-memory handler. Customer payment and merchant liability reconcile by shipment/child/line allocation. No duplicate provider or internal COD for one shipment.

Exposure = verified held cash + unresolved conservatively counted cash evidence not already held + expected COD of active accepted uncollected shipments + active offer reservations, deduped by shipment/effect; after collection convert reserved exposure to actual custody without double counting. Finance supplies authoritative limit/policy version and safe projection; Dispatch atomically validates at offer, acceptance and load. Stale/unknown financial exposure blocks automated COD assignment. Cash limit, escalation, shift/mode policy under D07; no arbitrary numeric cap. Never reduce actual held cash based on request or GPS.

## 8. Driver and cashier sessions / remittance

Driver session records verified opening held cash (carry-over only if authorized), shift/device, collections, transfers, approved corrections and physical closing count. Cash desk session records cashier/hub, opening count, receipts, payouts/deposits/authorized transfers, adjustments, closing count and approvals. Opening count reconciles existing custody, never creates cash automatically. No shared cash accounts or shared cashier credentials.

Remittance workflow: driver requests transfer with receipt allocations and counted amount; cashier verifies driver/session, independently counts, acknowledges exact physical amount and receipt references; driver acknowledges same attempt. Finalize guarded transaction with source/destination cash accounts, receipt applications and balanced journal. Partial remittance supported only with explicit receipt-level allocation, not a blanket paid flag; never allocate more than verified receipt outstanding. Driver custody reduces only by confirmed transferred amount. Mismatch records claimed/counted/confirmed amounts and actual known possession, keeps unresolved difference in approved discrepancy workflow, blocks affected payable and unsafe assignments. Do not write off or manufacture cash. Cash drawer cannot go negative by unauthorized disbursement. Bank deposit requires transfer/clearing and evidence, not just cash count.

Normal close requires all operations reconciled, opening + inflows - outflows + approved signed adjustments = ledger closing custody, physical count reconciled and no unresolved critical evidence. If not, controlled exception, supervisor approval and carry-over/hold; no silent zero or loss of history. Cash transfer/adjustment roles and thresholds pending D07.

## 9. Merchant obligations, courier and driver earnings

Recognize eligible delivered quantities under approved policy, not the whole original basket when rejected/undelivered. Accrual is a financial liability; payable is eligibility for settlement, not second recognition. Gate: verified delivered amount, all relevant journal effects complete, confirmed cash remittance allocated to shipment/eligible obligations or confirmed licensed payment, no blocking dispute, applicable hold/return conditions, verified beneficiary details. Partial remittance treatment must be explicitly approved; default hold affected unpaid obligation until sufficient verified allocation. No global freeze of unrelated obligations unless justified by separate risk policy.

Workflow: accrued -> payable -> reserved in payout -> approved -> execution pending -> verified paid/settled; dispute/hold and reversals explicit. State changes do not mutate posted history. Obligation roll-forward = opening + accruals - reversals - verified payouts +/- approved adjustments. Remaining and reserved amounts nonnegative unless separately classified recoverable debit/receivable. Distinct merchant, courier and driver beneficiary dimensions; no cross-beneficiary netting.

Driver earnings based on approved policy version, completed qualifying tasks/stops/shift or other validated units; no assumed rate or payment for duplicate task. Failed attempt/return compensation requires policy, not fabricated completion. Record unique earning effect, expense and payable; separate earnings dashboard from cash held. No unauthorized deduction from COD. Driver/courier payouts follow same guarded workflow. D05/D06/D07 approve tariffs and hold rules.

## 10. Payout batches and external execution

Create batch with explicit beneficiary/currency and locked eligible obligation allocations; reserve each amount atomically, prevent concurrent duplicate membership or overpayment. Batch snapshot and total immutable for an approved revision; modifications revoke approval and require new review. Maker creates, distinct authorized checker approves, execution actor/service follows approved policy; no self-approval or silent override. Validate beneficiary payment details and changes with controlled verification. No raw banking details in public Git/logs.

External payment occurs outside long-running DB locks. Persist unique payment attempt/reference before execution, use provider idempotency if supported; unknown outcome remains execution_pending/uncertain and blocks duplicate retry until provider/bank evidence reconciled. For manual bank/cash payout, require unique verified evidence, actor, amount, beneficiary and date, independent approval. Partial success reconciles by payout item and actual amount; failed/unknown item not marked paid. On verified execution atomically post liability reduction/cash or clearing movement and update item. Repeated confirmation returns original effect. Cancel only unexecuted verified items and release reservation exactly once; never cancel an unknown external transfer to re-pay. Reconcile provider callbacks out-of-order/duplicate and signed/authenticated where available. No actual money movement in this phase.

## 11. Reversals, refunds, discrepancies

Before pickup cancellation: Commerce compensates stock and adjusts due under 0.3B; no delivery accrual if not earned. After custody: return task and physical proof, no automatic saleable restock. Partial acceptance/split not enabled by default; approved customer decision and versioned allocations/COD required. Refund eligibility and amount determined by original allocation, actual verified paid amount, fees/discount funding and approved policy. Never refund more than remaining refundable amount or change original history.

After accrual or payout: post linked reversal/adjustment by original effect/line and authorized quantity; prevent cumulative reversal above original eligible amount. If already settled, recognize authorized recoverable receivable/offset or other approved treatment, not negative cash or rewriting settled batch. Refund liability creation and verified refund payment are separate effects. Refund execution unknown handled like payout. Distinguish stock return, customer refund, merchant reversal, courier earning reversal, tax adjustment and cash discrepancy. No implied automatic offset against unrelated merchant/driver funds. Write-offs require maker/checker, evidence, approved loss classification and audit; no arbitrary admin balance edit.

## 12. Costing and profitability

Versioned cost components: first-mile driver/courier, hub handling, packing materials, last-mile, failed attempts, returns, platform-funded discounts, payment processing, loss/damage, overhead separately. Capture actual incurred cost with source and unit; planned estimates separate. Allocate shared route/hub cost using approved driver (e.g., stops, parcels, weight, time), exact conserved allocation and transparent method/version. Do not double count driver pay within route cost. Reconcile allocation totals to original expense; unresolved costs marked unknown, not zero.

Metrics: ordered GMV and delivered GMV separately; actual customer receipts, net recognized platform revenue, merchant liabilities, direct variable cost, contribution, overhead/net profit only where complete, cost per delivered master including failed/return cost, profitability by merchant/zone/cohort under approved allocation. Define recognition window, currency, denominator and exclusions. Contribution = recognized commission + delivery/other approved revenue - direct operating cost - platform-funded subsidies if not already deducted from revenue. Avoid double counting discounts as expense and contra-revenue. Cash flow is separate from profitability. Internal versus Jenni pricing/provider cost separate, exclusive dispatch and no duplicate charge. D06/D13 remain open.

## 13. Reconciliation and recovery (ED-02)

Daily reconciliation by hub/driver/session/beneficiary and currency, with versioned time window (Asia/Baghdad display, UTC storage):
- verified shipment receipts equal recorded cash collection effects, with explicit pending/disputed exceptions;
- driver roll-forward and physical handover equal confirmed custody movements, no unmatched transfer;
- cashier roll-forward matches physical drawer, bank deposit/clearing matched to evidence;
- merchant/driver/courier obligation roll-forward equals journal and payout items;
- each journal balanced, allocations conserved, no duplicate effect keys, no negative unapproved residual;
- delivered eligible shipments missing required finance effects, orphan effects, stale reservations, uncertain payments and partial workflows surfaced.

Use durable outbox/work table committed with business facts, uniquely scoped effect keys, leases, bounded retry and dead-letter alert. Completion marker only after ALL required effects verified or separately tracked sub-effect completion. Never early-exit merely because one merchant status is accrued. Reconciler compares authoritative facts to expected effect set, not only an event marker. Repair via idempotent commands, no manual arbitrary SQL or history rewrite. Pending finance visible, payout blocked until reconciliation. Fault injection after each boundary (including receipt before ledger, ledger before projection, merchant before courier, external execution before confirmation, reversal/payout race), replay and concurrent commands. Prefer atomic SQL/RPC for core money/custody; exact lock order and transaction boundaries in 0.3H. No full proof executed in this design phase.

## 14. Access, API and events

Roles: merchant own statement; driver own cash/earnings; cashier scoped drawer and remittance; finance maker, checker, payout executor/reconciler; supervisor dispute approval; auditor read-only scoped evidence. Hub packer/dispatcher cannot edit amounts. Least privilege, backend object scope plus RLS, restricted definer EXECUTE/search_path review (ED-03). No direct client journal writes, no service-role secret. Maker/checker separation enforced server-side; manual correction audited. Minimize PII, receipt evidence access and retention under D11. Period close locks and exception policy pending accounting approval.

Proposed API relative to existing prefix: GET /finance/v2/merchants/:id/statement; GET /driver/v2/cash and /earnings; POST /driver/v2/remittances; POST /finance/v2/remittances/:id/confirm; POST /finance/v2/cash-sessions/start or close; GET /finance/v2/reconciliation; POST /finance/v2/payouts/create; POST /finance/v2/payouts/:id/approve or confirm-payment; POST /finance/v2/adjustments/request or approve; GET /finance/v2/operations/:id. Delivery proof command from 0.3F coordinates Finance, no second arbitrary COD endpoint. Route/DTO reconciliation in 0.3H. Actor-derived scope, idempotency key, payload hash, expected version, correlation. Typed errors: COD_VERSION_MISMATCH, CASH_LIMIT_EXCEEDED, CASH_DISCREPANCY, JOURNAL_UNBALANCED, EFFECT_CONFLICT, OBLIGATION_NOT_PAYABLE, PAYOUT_ALREADY_RESERVED, APPROVAL_REQUIRED, PAYMENT_OUTCOME_UNKNOWN, RECONCILIATION_BLOCKED.

Events: CashCollected, CashTransferRequested, CashHandedOver, CashReconciled, FinancialJournalPosted, MerchantAccrued, ObligationPayable, DriverEarningsAccrued, PayoutReserved/Approved/PaymentConfirmed, RefundApproved/PaymentConfirmed, FinancialDisputeOpened/Resolved, FinancialEffectPending/Completed. Common envelope, durable state/event commit, minimal payload, dedupe. Do not expose sensitive financial details in push. Default-off flags, disable new V2 intake without blocking reconciliation/returns/settlements for existing obligations. Legacy unchanged.

## 15. Acceptance requirements

| ID | Scenario | Required outcome |
|---|---|---|
| FA01 | illustrative 107,000 journal | balanced, 90,000 merchant liability, 17,000 revenue |
| FA02 | invalid debit/credit or overflow | reject atomically |
| FA03 | uneven allocation, rounding, discount caps | exact conserved integer sum |
| FA04 | commercial rule changes after checkout | original snapshot preserved |
| FA05 | rejected/undelivered child | no unsupported accrual |
| FA06 | duplicate COD / lost response | one receipt and cash effect |
| FA07 | stale COD or wrong driver mode | no normal collection |
| FA08 | actual cash with failed proof | truthful discrepancy, no duplicate collection |
| FA09 | two simultaneous COD assignments | exposure limit preserved |
| FA10 | offer-to-collection transition | no double counting exposure |
| FA11 | pending cash handover | driver balance unchanged |
| FA12 | confirmed partial remittance | exact receipt allocation and custody reduction |
| FA13 | cashier count mismatch | unresolved variance, affected payout held |
| FA14 | cash session close with unresolved custody | controlled exception |
| FA15 | accrual without confirmed remittance | not payable |
| FA16 | dispute on one obligation | affected funds held, unrelated funds preserved |
| FA17 | concurrent payout reservations | no duplicate or excess allocation |
| FA18 | maker self-approval | denied |
| FA19 | payment timeout/unknown outcome | no duplicate payment or false settlement |
| FA20 | partial payout success | exact verified item outcomes |
| FA21 | duplicate confirmation | one liability reduction |
| FA22 | cancel unexecuted payout | reservation released once |
| FA23 | return before payout | original linked reversal, no over-reversal |
| FA24 | return after settled payout | authorized recovery without rewriting history |
| FA25 | refund request beyond remaining paid amount | denied |
| FA26 | driver earnings and COD | separate accounts, no silent netting |
| FA27 | shared route cost allocation | exact expense conservation |
| FA28 | crash after delivery before finance | recover all pending effects |
| FA29 | crash after merchant before courier effect | missing effect detected and recovered |
| FA30 | crash after accrual event before projection | reconciliation repairs without duplicate entry |
| FA31 | crash after external payment before confirmation | verify outcome before retry |
| FA32 | concurrent payout and reversal | one consistent authorized result |
| FA33 | journal/projection discrepancy | rebuild/reconcile, block affected payout |
| FA34 | unauthorized merchant/driver/cashier access | deny API and DB |
| FA35 | V2 disabled with open obligations | recovery and settlement retained |
| FA36 | legacy finance/Jenni paths | no regression or dual posting |
| FA37 | daily cash and liability roll-forward | exact reconciliation or explicit exception |
| FA38 | unapproved manual write-off | denied; approved adjustment balanced and auditable |

Requirements only, not executed tests. Link CB/MF/DS/HB/DA and master T01–T23 in 0.3H/I. ED-02 fault proof, ED-01 structural comparison, clean full DB suite and approved accounting policy required at relevant gates.

## 16. Open decisions and handoff

D02 discount/coupon/loyalty funding and restoration; D05 driver compensation; D06 commission base/rate, fees, subsidies, tax, partial/refund and gross/net recognition; D07 cash limits, remittance cadence, cash desk procedures, hold periods, approval thresholds, payout methods and accounting policy; D10 dispute/return SLA; D11 privacy/legal/licensing/insurance; D12 test/operational targets; D13 provider remittance/fallback remain open. No actual merchant agreements, tariffs or bank details inspected. Finance/accounting owner must approve chart and journal policy before launch. Next 0.3H Database & API Contracts reconciles all logical names, ownership, exact keys, constraints, command/event versions, transactional lock strategy and legacy writer isolation. G0 OPEN; no implementation or live operations authorized.
