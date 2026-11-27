# DilMart 2.0 — Operational Targets and Launch Criteria
Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D12
Status: OPS-01–20 owner-approved principles and initial pilot planning targets. Numerical performance thresholds remain provisional; G0 OPEN / BLOCKED.
References: 14_SECURITY_STAGING_QA.md, 15_IMPLEMENTATION_ROADMAP.md, 17_G0_APPROVAL_GATE.md; HOP-17 in pending PR #76.

## 1. Approved principles
| ID | Policy |
|---|---|
| OPS-01 | Four progressive operating stages |
| OPS-02 | Pre-register merchants; activate qualified cohorts only |
| OPS-03 | Initial pilot with 10–20 merchants |
| OPS-04 | Target 300–500 completed pilot orders |
| OPS-05 | Start in bounded Baghdad coverage zones |
| OPS-06 | Admission constrained by measured pickup, hub and delivery capacity |
| OPS-07 | Expansion requires demonstrated operational competence |
| OPS-08 | Measure commercial, logistics and financial KPIs |
| OPS-09 | Measure order contribution from actual costs |
| OPS-10 | Isolated load, burst and soak testing |
| OPS-11 | Zero unauthorized customer-data disclosure to merchants |
| OPS-12 | Zero duplicate collection, payout or assignment |
| OPS-13 | Pause affected new activity on critical incident |
| OPS-14 | Preserve safe recovery, custody and settlement |
| OPS-15 | Central launch readiness dashboard |
| OPS-16 | Backup and restore rehearsal before launch |
| OPS-17 | Independent review before major transitions |
| OPS-18 | Separate G6 pilot and G7 commercial launch approvals |
| OPS-19 | Rebaseline schedule after G0 |
| OPS-20 | No security or financial gate waiver for deadline |

## 2. Operating envelope (planning assumptions)
| Stage | Active merchants | Daily order target | Pickup drivers | Delivery drivers |
|---|---:|---:|---:|---:|
| Controlled pilot | 10–20 | 25–50 | 3 | 4 |
| Soft launch | 30–50 | 75–150 | 5–7 | 6–10 |
| Baghdad launch | 75–150 | 150–300 | 8–15 | 12–22 |
| Growth | 250+ | 300–600+ | measured | measured |

One hub initially; additional hubs only after separate approval. The 250 prospective merchants are not verified activated merchants. Pilot proposed 10–14 operating days, 5–7 hub/support staff excluding drivers, 2–2.5 parcels/master; extend if sample insufficient. At 25 entries/day for 10 days even perfect completion yields only 250, so calendar duration alone cannot satisfy sample. Target 300–500 completions plus all attempted/cancelled/failed orders in reporting. Include varied eligible categories, single/multi-merchant baskets, peak windows, failures, returns and settlement cycles. Exclude unsupported special handling. Merchant activation, fleet, cash security and legal readiness must be evidenced before field operations.

## 3. Capacity model
Illustrative sustainable daily admission = floor(utilization * min(pickup drivers * visits/day * parcels/visit / parcels/master, delivery drivers * stops/day, hub masters/day)). Default 5*12*4/2.5=96 first-mile, 8*20=160 final-mile, hub 150, utilization 75% gives 72 masters/day theoretical. Not measured throughput. Account for failure attempts, returns, variable parcel sizes, route windows, carryover, cash limits, staffing and bursts separately; actual admission based on verified bottleneck and backpressure. No demand forecast inferred from merchant count.

## 4. Proposed KPI targets and definitions
| KPI | Candidate target | Denominator / basis |
|---|---|---|
| Cohort activation | 100% | admitted merchants with all readiness evidence |
| Merchant acceptance | >=95% | accepted child requests / eligible due requests incl timeout |
| Pre-delivery cancellation | <=10% | cancelled masters / submitted cohort matured to outcome |
| Contribution | positive | ordinary tariff cohort, actual direct costs incl failures, returns, subsidies |
| On-time pickup | >=90% | due eligible stops incl misses |
| Parcels/merchant visit | >=3 | confirmed collected parcels / attempted pickup visits |
| First-attempt delivery | >=90% | successful first attempts / all first attempts |
| On-time delivery | >=90% | due masters incl overdue misses against original promise |
| Hub dwell | mean <=4h | receipt to outbound handover, report p95 and open dwell separately |
| CSAT | >=85% | satisfied respondents / valid responses; report response count/rate |
| Support initial response | <=15 min | proposed working-hours target; report distribution and misses |
| Item accuracy | >=99% | correct delivered items / verified assessed delivered items; report coverage |

Report date window, cohort, count, exclusions, missingness and confidence limitations. AOV and 30-day repeat measured, not predetermined. No claim of profitability from incomplete costs. Numeric KPI thresholds remain subject to approved measurement protocol and field evidence.

## 5. Non-negotiable integrity criteria
Zero unauthorized customer PII disclosure to merchants (HOP-17), cross-merchant access, oversell, duplicate economic/custody effects, dual assignments, lost critical evidence, unbalanced journal or diversion of merchant funds. All due cash/receipt/ledger effects reconciled; zero unexplained cash difference or missing parcel at launch decision. Eligible due settlements verified on schedule. No unresolved critical/high security blockers at G5. Zero observed incidents is necessary but not sufficient: independent negative-access, concurrency, fault and recovery tests mandatory. No averaging away failed mandatory gates.

## 6. Isolated workload proposals
| Profile | Equivalent masters/day | Parcels/master | Active drivers | Peak submit/s | Concurrent users |
|---|---:|---:|---:|---:|---:|
| Launch | 200 | 2.5 | 25 | 2 | 200 |
| Growth | 1000 | 2.5 | 100 | 5 | 1000 |
| Stress | 3000 | 3 | 300 | 15 | 3000 |

15s GPS cadence implies ~1.67/6.67/20 updates/s, not including bursts/reconnect. Peak submit rate is short burst, not sustained daily demand. Candidate read p95 <500ms, submit p95 <2s, server error rate <0.5% under approved normal load; separate client/network/provider timing, define timeout and denominator. Stress profile explores safe degradation and recovery, not guaranteed capacity. Before executing approve test duration, realistic request mix, burst/soak, provider mocks, queue targets, saturation/headroom and cost budget, target-equivalent environment, RPO/RTO and recovery criteria. No production load test. RPO/RTO not set; no assumed free-tier restore capability.

## 7. Readiness and incident policy
Readiness dashboard shows independently evidenced gates, actual/target values, freshness, responsible owner and blocker; unknown is not pass. G0 implementation authorization, G1 commerce, G2 custody, G3 dispatch/hub/device, G4 finance, G5 integrated security/load/restore, G6 separately authorized field pilot, G7 separately authorized release. Critical incident pauses affected new intake/assignment/payment/access, preserves existing custody, safe returns and remittance, evidence and authorized recovery. Independent review and owner approval for resumption. No destructive rollback or blind financial retries. Pilot evidence covers actual settlement cycle and operational privacy checks. No broad launch from calendar alone.

## 8. Gate disposition
D12 principles and initial cohort targets accepted; exact workload and KPI thresholds, staffing, test protocol, RPO/RTO, budget and verified capacity remain OPEN. D11 legal/privacy and other G0 prerequisites remain open. No runtime, DDL, procurement, test execution or deployment authorized. Rebaseline target date after G0. Next D11.
