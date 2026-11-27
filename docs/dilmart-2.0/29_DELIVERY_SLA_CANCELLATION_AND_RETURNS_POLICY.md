# DilMart 2.0 — Delivery SLA, Cancellation and Returns Policy

Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D10
Status: SLA-01–18 approved in principle by owner in project conversation. Numeric windows, legal terms and operational readiness remain open. G0 OPEN / BLOCKED.
Authority: 07_COMMERCE_ORDER_CONTRACTS.md, 08_MERCHANT_FULFILLMENT.md, 09_INTELLIGENT_DISPATCH.md, 10_HUB_PARCEL_MANAGEMENT.md, 11_DRIVER_APPLICATION.md, 12_FINANCIAL_ARCHITECTURE.md, 17_G0_APPROVAL_GATE.md. Documents 25–28 are independent pending policy PRs.

## 1. Approved principles
| ID | Policy |
|---|---|
| SLA-01 | Standard and scheduled delivery are launch priorities. |
| SLA-02 | Express service disabled until capacity is demonstrated and approved. |
| SLA-03 | Configurable stage deadlines. |
| SLA-04 | Account for merchant and hub operating calendars in promises. |
| SLA-05 | Predict delay and alert early. |
| SLA-06 | Distinguish readiness from physical custody. |
| SLA-07 | No silent removal of rejected items without customer consent. |
| SLA-08 | Block outbound release while required customer resolution is pending. |
| SLA-09 | Cancellation governed by stage and actual custody. |
| SLA-10 | No undisclosed fees or penalties. |
| SLA-11 | Evidenced failed-delivery and rescheduling workflow. |
| SLA-12 | Explicit reverse logistics. |
| SLA-13 | Category-specific return rules subject to consumer law. |
| SLA-14 | Allocate return costs according to established responsibility and approved terms. |
| SLA-15 | No saleable restock before return inspection and authorized disposition. |
| SLA-16 | Measure merchant, driver and hub performance separately. |
| SLA-17 | Record exceptions, evidence, ownership and resolution. |
| SLA-18 | No monetary changes outside approved financial adjustment commands. |

## 2. Service levels and promise formation
Baghdad first; default consolidated shipment, one final delivery charge. Proposed service hypotheses: economy 24–48 hours; standard same or next day depending on cutoff; scheduled available capacity slots introduced progressively; express 2–4 hours only after measured capacity and separate approval; intercity later. No service activated by this document. At quote and submit verify eligible merchant schedules, preparation, route/receiving windows, hub capacity, handling class, destination and provider policy. Account for slowest required child, parallel collection and consolidation, not sum of all merchant times. Store accepted promise and policy version; UTC storage, Asia/Baghdad display. Revised promise is explicit, communicated and audited; preserve original for SLA metrics. No fictitious ETA or guarantee from missing routing data. Do not accept incompatible baskets or silently split shipments. Scheduled slots require capacity validation at submit; quote alone is not reservation.

## 3. Stage deadlines — hypotheses only
| Stage | Candidate window |
|---|---|
| Merchant acceptance during operating hours | 15 min |
| Ordinary preparation | 30–120 min |
| Pickup assignment after valid readiness | 15–45 min |
| Travel to merchant | verified route estimate |
| Merchant handover | 5–15 min |
| Hub processing of complete eligible parcel group | 15–45 min |
| Final-mile delivery after departure | 1–4 hours |
| Customer arrival wait | 10–15 min |
| Customer resolution after rejection | 60 min |

Define start/end fact, calendar, warning threshold, escalation owner, retry and terminal policy per stage. Merchant no-response alerts and escalates; no automatic cancellation until explicitly approved. Predicted delay is not actual breach; keep expected and actual distinct. Exception does not overwrite custody or pause original customer promise metrics. Do not assume windows are additive or feasible. Actual cutoff, grace periods, shift/hub hours, retry limits and maximum dwell remain open.

## 4. Cancellation and rejected child
Before merchant acceptance and after acceptance before pickup: proposed no customer cancellation fee, subject to approved policy and legal review. Guarded cancellation compensates eligible stock once, reverses eligible promotion consumption and records original snapshot adjustment. After any physical pickup: cancellation request creates custody-aware return workflow; never erase handover or auto-restock. At hub or after outbound load preserve actual custody, block conflicting work, route return safely. Delivered goods use return case, not rollback of delivery. No invented penalty or unauthorized driver wage deduction. Track incurred costs independently from customer fee.

If a merchant rejects, preserve other accepted children, open customer resolution, show exact revised item totals, discount allocations, fee and promise. Options: explicit accept remainder or request full cancellation subject to custody. Illustrative no-discount basket 45,000 + 35,000 + 20,000 with 5,000 delivery = 105,000; if third child rejected and fee unchanged, revised due 85,000 only after approved customer resolution. No automatic substitution, split, fee increase or consent by silence. Block outbound release pending decision; alert and escalate at approved deadline. Proposed 60-minute window not approved for automation. Define terminal handling and whether additional pickup may proceed before implementation; preserve already held parcels. All-rejected cannot create shipment/COD.

## 5. Failed delivery and operational exceptions
Record typed reason, affected shipment/parcel, actual custody, reporter, evidence, owner, deadline and resolution. For unreachable customer, approved contact/notification and safe waiting, then controlled reschedule or return; no unattended delivery or false proof. Wrong address requires verified update, coverage/price/COD review and customer consent when needed. Refusal, damage, breakdown, hub closure and cash mismatch use distinct workflows. Reassignment after custody requires verified transfer, not status rewrite. Pending/offline evidence remains distinct from confirmed outcome. No automatic liability assignment, fee or wage penalty. Return to authorized receiving location with manifest and receipt; no stranded parcels or unsafe travel incentives.

## 6. Reverse logistics and refund
Customer requests return referencing original order/line/quantity and reason; eligibility checked against approved category, time, consumer rights and warranty terms. Review/authorize return, create distinct reverse task/manifest, verify pickup and custody, inspect and record condition, route to merchant or approved disposition. Finance evaluates refund entitlement and verified payment separately from physical stock; do not require physical merchant receipt where applicable law requires earlier remedy. Restore saleable stock only after authorized inspection/disposition. Use original allocations, bounded quantity and refund amounts, exact IQD and linked journal adjustments. Already-settled merchant obligations require approved recovery treatment, never rewrite settlement. Unknown refund execution blocks duplicate retry. No automatic deduction from unrelated funds.

Proposed responsibility matrix: merchant for established wrong/description mismatch; responsible custodian for proven transit damage according to contract; platform for its own error; change-of-mind subject to disclosed lawful terms; defect/warranty according to applicable responsibility. Investigation and evidence before cost allocation. No universal return window or exclusions approved; D11 legal review required for Iraqi consumer rights, warranties, privacy, liability and fee disclosure. No legal conclusion in this document.

## 7. Monitoring
Metrics by stage and actor: merchant acceptance among eligible due requests; preparation time p50/p95; on-time pickup among due pickups including misses; parcels per visit; hub processing and consolidation p50/p95; first-attempt delivery success among first attempts; on-time delivery against original promise including overdue misses; cancellation and returns by defined cohort; exception resolution age; customer satisfaction with response rate. Report denominators, window, exclusions, unknowns and verified attribution. Do not use inferred fault or raw speed as penalty basis. Maintain alerts with owner and escalation; distinguish original SLA from revised customer-approved promise. D12 targets and pilot proof pending.

## 8. Supplemental acceptance scenarios
| ID | Scenario | Required outcome |
|---|---|---|
| SL01 | Merchant closed at requested time | feasible quote or explicit blocker |
| SL02 | Last child delayed | warning and preserved original promise |
| SL03 | Merchant reject races pickup | one consistent custody/stock outcome |
| SL04 | Customer silent after rejection | outbound held, escalation, no assumed consent |
| SL05 | All children rejected | no shipment or COD |
| SL06 | Cancel before custody retried | one compensation |
| SL07 | Cancel after custody | reverse task, no automatic restock |
| SL08 | Failed delivery and reschedule | evidence, no false delivery/receipt |
| SL09 | Returned item damaged | not saleable until disposition |
| SL10 | Partial refund retried | bounded original allocation, one effect |
| SL11 | Express capacity unavailable | service not offered |
| SL12 | Promise revised | original preserved for measurement |

## 9. Gate disposition
SLA-01–18 approved principles only. D10 remains OPEN pending actual calendars, promise windows, cutoff, merchant timeout/default, resolution terminal policy, wait/retry/reschedule, return eligibility/windows, refund/fee rules, maximum dwell and exception SOP. D02/D06/D07/D11/D12/D13 dependencies remain open. PRE-G0-11 continues. No application code, DDL, production operations, deployment or service activation.
