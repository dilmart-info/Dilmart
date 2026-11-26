# DilMart 2.0 — Architecture Decision Register (Phase 0.3J)

Date: 2026-11-26
Baseline: b27a4b64cf0da5a281ad2a7fb706d13c534e50bc
Status: consolidated design register; owner approved roadmap direction; G0 OPEN.

## 1. Authority and decision semantics

This register indexes the exact decision rows in merged 06–14 at the baseline. Detailed constraints remain in the linked documents. A merged proposal is not evidence of implementation or approval of operational parameters. A/C/M/DIS/FIN/DB/SEC are owner-approved design directions according to source headers. HUB/DRV source headers explicitly say proposed for owner review; retain that status pending explicit ratification, not inferred from merge. DB physical freeze, mobile stack, provider choice and commercial policies remain open. Any conflict escalates to owner; no silent reinterpretation. Total 179 design IDs, not 179 independently implemented features.

## 2. [06_SYSTEM_ARCHITECTURE.md](06_SYSTEM_ARCHITECTURE.md)

| Decision ID | Exact source direction | Source qualification |
|---|---|---|
| A01 | Evolve existing repository and NestJS modular monolith | No rewrite or microservice split at launch |
| A02 | Existing PostgreSQL/Supabase as transactional authority | Additive migrations after G0; ED-01 object diff before DDL |
| A03 | React/TypeScript existing storefront and merchant/admin surfaces; customer Capacitor | Driver separate app; D09 stack pending device spike |
| A04 | One customer master order, merchant-specific children | Existing orders candidate for reuse; no forced historical conversion |
| A05 | Independent pickup, central cross-dock, consolidated outbound delivery | One initial hub; hub-aware identifiers; no unapproved partial release |
| A06 | Deterministic dispatch and spatial shortlist | PostGIS and routing adapter proposed implementation; weights and provider validation pending |
| A07 | Transactional financial ledger and explicit custody | Money invariants designed before commerce implementation |
| A08 | PostgreSQL durable outbox and idempotent consumers | No Redis unless measured need; in-process events not durable authority |
| A09 | Preserve legacy single-merchant and Jenni path | Provider exclusivity per shipment; default-off V2 flags |
| A10 | Independent staging and gated deployment | No staging provisioning in this phase |

## 3. [07_COMMERCE_ORDER_CONTRACTS.md](07_COMMERCE_ORDER_CONTRACTS.md)

| Decision ID | Exact source direction |
|---|---|
| C01 | Multi-merchant customer cart |
| C02 | One master order, merchant-specific child orders |
| C03 | Reuse existing orders for children subject to structural and compatibility proof |
| C04 | Atomic master checkout, including all child stock and snapshot effects |
| C05 | Decrement saleable stock at successful checkout; compensating movements on eligible cancellation |
| C06 | Mandatory idempotency for V2 checkout |
| C07 | One customer delivery charge for the default consolidated shipment |
| C08 | Exact integer-IQD allocation and conservation |
| C09 | Rejection/cancellation via audited compensating commands |
| C10 | Master status derived from child and fulfillment facts |
| C11 | Preserve historical orders and snapshots; no forced conversion |
| C12 | Default-off V2 flags; preserve legacy paths |

## 4. [08_MERCHANT_FULFILLMENT.md](08_MERCHANT_FULFILLMENT.md)

| Decision ID | Exact source direction |
|---|---|
| M01 | Operational activation separate from account registration |
| M02 | Verified physical pickup location and GPS |
| M03 | One active approved pickup location per merchant at initial launch |
| M04 | Acceptance separate from actual readiness |
| M05 | Estimated readiness timestamp, revisable with audit |
| M06 | One or more physical parcels per child |
| M07 | Unique opaque barcode per parcel |
| M08 | Batch compatible ready parcels at same pickup location |
| M09 | Explicit merchant-to-driver custody acknowledgement |
| M10 | Durable readiness events committed with state |
| M11 | Structured exception handling for delay/rejection |
| M12 | Merchant and location scoped authority |
| M13 | Operational merchant metrics with defined denominators |
| M14 | Extend existing merchant portal rather than rewrite |

## 5. [09_INTELLIGENT_DISPATCH.md](09_INTELLIGENT_DISPATCH.md)

| Decision ID | Exact source direction |
|---|---|
| DIS01 | Central dispatch module within NestJS modular monolith |
| DIS02 | Separate first-mile and last-mile task semantics |
| DIS03 | Dynamic geographic zones with soft preferences and hard coverage boundaries |
| DIS04 | Hard eligibility before ranking |
| DIS05 | Versioned weighted deterministic score |
| DIS06 | Road-network travel time, not straight-line distance alone |
| DIS07 | Compatible parcel/stop batching |
| DIS08 | Feasible greedy route insertion |
| DIS09 | Sequential expiring offers |
| DIS10 | Atomic assignment and capacity control |
| DIS11 | Multidimensional capacity |
| DIS12 | Authorized on-shift GPS |
| DIS13 | No silent reassignment after custody |
| DIS14 | Routing provider abstraction |
| DIS15 | Durable events and idempotent workers |
| DIS16 | Audited manual fallback |
| DIS17 | Explainable decision log |
| DIS18 | Shadow evaluation and field calibration |

## 6. [10_HUB_PARCEL_MANAGEMENT.md](10_HUB_PARCEL_MANAGEMENT.md)

| Decision ID | Exact source direction |
|---|---|
| HUB01 | Cross-docking and order consolidation, not speculative inventory storage |
| HUB02 | One initial hub, hub-aware model for future expansion |
| HUB03 | Physically distinct operating areas |
| HUB04 | Stable opaque parcel ID and barcode |
| HUB05 | Verified inbound handover |
| HUB06 | Condition inspection before consolidation |
| HUB07 | Quarantine for unknown, mismatched or damaged parcels |
| HUB08 | Numbered temporary consolidation locations |
| HUB09 | Audited internal parcel movements |
| HUB10 | Deterministic consolidation completeness |
| HUB11 | No incomplete release without approved split policy and consent |
| HUB12 | Idempotent packing task per valid consolidation revision |
| HUB13 | Separate outbound shipment identity |
| HUB14 | Versioned outbound trip manifests |
| HUB15 | Verified outbound driver custody |
| HUB16 | Capacity signals integrated with intake and dispatch |
| HUB17 | Explicit returns workflow |
| HUB18 | Separate cash desk and finance authority |
| HUB19 | Operational metrics and alerts |
| HUB20 | Role-scoped commands and immutable audit |

## 7. [11_DRIVER_APPLICATION.md](11_DRIVER_APPLICATION.md)

| Decision ID | Exact source direction |
|---|---|
| DRV01 | Separate DilMart Driver app |
| DRV02 | Android-first controlled pilot |
| DRV03 | Authorized pickup, delivery and hybrid modes |
| DRV04 | Shift and availability lifecycle |
| DRV05 | Secure device registration and session management |
| DRV06 | Authorized on-shift background location only |
| DRV07 | Expiring task offers |
| DRV08 | Versioned route and stop execution |
| DRV09 | Barcode/QR scanning with guarded manual recovery |
| DRV10 | Acknowledged custody transfers |
| DRV11 | Offline-first evidence and read recovery |
| DRV12 | Encrypted minimized local operation queue |
| DRV13 | Idempotent synchronization |
| DRV14 | Server-verified delivery OTP or approved alternative |
| DRV15 | Server-authoritative COD amount |
| DRV16 | Cash custody separate from driver earnings |
| DRV17 | Failed delivery and controlled returns |
| DRV18 | Push hints with authoritative API recovery |
| DRV19 | Arabic RTL, accessible driver UX |
| DRV20 | Representative real-device acceptance |
| DRV21 | No unsafe interaction while driving |
| DRV22 | Shift close requires custody/cash resolution or explicit exception |
| DRV23 | Stack decision after technical spike |
| DRV24 | Driver-specific task, device and data scope |

## 8. [12_FINANCIAL_ARCHITECTURE.md](12_FINANCIAL_ARCHITECTURE.md)

| Decision ID | Exact source direction |
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

## 9. [13_DATABASE_API_CONTRACTS.md](13_DATABASE_API_CONTRACTS.md)

| Decision ID | Exact source direction |
|---|---|
| DB01 | PostgreSQL transactional authority |
| DB02 | Preserve existing supported schema |
| DB03 | Additive backward-compatible migrations |
| DB04 | Unified entity model |
| DB05 | One authority per domain fact/economic effect |
| DB06 | Explicit keys, relations and constraints |
| DB07 | Exact integer IQD |
| DB08 | UUID for new business entities; preserve existing key types |
| DB09 | Optimistic aggregate version checks |
| DB10 | Mandatory idempotency for critical commands |
| DB11 | Atomic transaction contracts |
| DB12 | Global deterministic lock protocol |
| DB13 | Immutable posted financial and custody history |
| DB14 | PostGIS only after approved verification |
| DB15 | RLS and backend object authorization |
| DB16 | Explicit versioned REST APIs |
| DB17 | Common DTO/error contracts |
| DB18 | Transactional durable outbox |
| DB19 | Idempotent event consumers |
| DB20 | Preserve legacy behavior |
| DB21 | Default-off server-side feature gates |
| DB22 | Structural catalog comparison |
| DB23 | Migration replay and recovery testing |
| DB24 | No duplicate accounting authority |
| DB25 | Unified contracts before implementation |

## 10. [14_SECURITY_STAGING_QA.md](14_SECURITY_STAGING_QA.md)

| Decision ID | Exact source direction |
|---|---|
| SEC01 | Separate development, staging and production |
| SEC02 | Synthetic test data |
| SEC03 | Environment-specific credentials and secrets |
| SEC04 | Least privilege |
| SEC05 | RBAC |
| SEC06 | Object-level authorization |
| SEC07 | Default-deny RLS |
| SEC08 | RPC grants and SECURITY DEFINER review |
| SEC09 | API validation and rate limits |
| SEC10 | Device and session security |
| SEC11 | Encrypted minimized local evidence |
| SEC12 | Privacy and retention controls |
| SEC13 | Dependency vulnerability review |
| SEC14 | No new lint diagnostics |
| SEC15 | Automated test pipeline |
| SEC16 | Concurrency tests |
| SEC17 | Fault injection |
| SEC18 | Performance and load tests |
| SEC19 | API/event contract tests |
| SEC20 | Legacy regression tests |
| SEC21 | Operational observability |
| SEC22 | Financial and custody alerts |
| SEC23 | Backup and verified restore |
| SEC24 | Server-side default-off flags |
| SEC25 | Progressive release and safe rollback |
| SEC26 | Incident response runbook |
| SEC27 | Real-device and field pilot |
| SEC28 | Evidence-based gate decisions |

## 11. Master decisions D01–D13

All OPEN; owner records dated decision, rationale, evidence, policy version, affected contracts, reviewer and gate. Named people not assigned; accountable roles proposed. No fabricated values.

| ID | Required decision/evidence | Accountable role / deadline |
|---|---|---|
| D01 | exact HEAD, environment identity, full metadata diff, reuse/writer/lock matrix, physical schema | Architecture/DB / G0 |
| D02 | stock, coupon stacking/funding, points use/restoration, immutable snapshot and exact rounding | Commerce + Finance / G0 |
| D03 | initial hub operating model and constraints at G0; verified location, hours, equipment and capacity before G3 | Operations / G0–G3 |
| D04 | verified merchant activation and contracted launch cohort, not verbal commitments | Operations / G6 |
| D05 | fleet/vehicles/shift/capacity and compensation; financial interface constraints at G0 | Operations + Finance / G3 |
| D06 | fee/commission bases, subsidy, tax, partial/refund and recognition rules | Product + Finance/accountant / G0 |
| D07 | cash exposure, receipt/remittance, holds, payout approvals and accounting policy | Finance/accountant / G0 |
| D08 | road provider, motorcycle coverage, measured ETA, quota/cost; adapter boundaries at G0 | Engineering / G3 |
| D09 | comparative device spike, stack, OS/device matrix and distribution | Mobile / G0 |
| D10 | promises, cutoff, deadlines, retries, exceptions and offline recovery SOP | Operations + Product / G0 |
| D11 | privacy/retention constraints for design at G0; terms, permits, insurance and legal signoff before pilot | Owner/Legal / G6 |
| D12 | approved workload, sample size, performance, pilot and launch thresholds | QA + Operations / G0 |
| D13 | exclusive external provider fallback, pricing, split policy | Logistics + Finance / G0 |

G0 deferrals only for genuinely nonblocking detail, with explicit owner acceptance, disabled dependent capability, owner/deadline and tests proving containment. No deferral of unknown stock/money/custody authorization semantics.

## 12. Engineering debt ED-01–06

| ID | Status / evidence | Owner / required gate |
|---|---|---|
| ED-01 | OPEN: 62-table counts agree, full structural equivalence and writer matrix unproven | Architecture/DB before DDL/G0 |
| ED-02 | OPEN: legacy postcommit finance, sentinel early exit, optional checkout idempotency, swallowed event errors; fault tests needed | Finance+QA risk disposition G0; runtime G4 |
| ED-03 | OPEN: six local definers without configured search_path; actual grants and scope need proof | Security+DB before affected exposure; G5 |
| ED-04 | OPEN: prior 35 frontend/15 backend advisories, no reachability closure | Security+Mobile review G0; critical/high launch blockers G5 |
| ED-05 | OPEN: prior 449 errors/33 warnings; no actual lint step in critical CI | QA baseline enforcement from implementation start |
| ED-06 | OPEN: retired host references and Android/auth/CORS/hooks/Jenni acceptance | Release+Ops, operational acceptance G6/G7 |

Detailed evidence in 05 and 14; do not treat historical counts as fresh scans.

## 13. Change control

New or superseding ADR records ID, exact old/new text, reason, affected contracts/TX/API/events, compatibility and migration consequences, tests, security/finance review and owner decision. Preserve original history. No agent self-approval. Record actual owners and sensitive evidence in authorized private tracker, never public Git. See [roadmap](15_IMPLEMENTATION_ROADMAP.md) and [G0](17_G0_APPROVAL_GATE.md).
