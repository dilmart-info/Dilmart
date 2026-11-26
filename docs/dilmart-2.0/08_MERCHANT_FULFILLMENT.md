# DilMart 2.0 — Merchant Fulfillment (Phase 0.3C)

Date: 2026-11-26
Baseline: 890cc28542d9fff54909dfedbfc3d2dd3d840b27
Status: owner-approved M01–M14 direction; detailed contracts proposed for review. G0 OPEN.
Scope: design/documentation only. No runtime change, DDL, deployment, provisioning, live access or activation.

## 1. Authority and source evidence

Read [Master Spec](00_MASTER_SPEC.md), [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md), [architecture](06_SYSTEM_ARCHITECTURE.md), [commerce contracts](07_COMMERCE_ORDER_CONTRACTS.md), and CURRENT_PHASE. PRs #55 and #56 merged. C01–C12 constrain this package.

| Existing source | Verified observation | Direction |
|---|---|---|
| backend/src/modules/orders/orders.service.ts:499–531 | Merchant scope resolution, pending/new compare-and-set, accepted immediately changes status to preparing, then calls finance separately | Reuse authorization/CAS principles; V2 decision and readiness distinct; durable effects |
| orders.service.ts:485–497,533–552 | Standard rejection codes and cancellation service with expected merchant scope | Reuse validated reason taxonomy and compensation patterns subject to V2 transaction proof |
| backend/src/modules/orders/orders.controller.ts | POST /orders/:id/merchant-accept and merchant-reject limited to owner/manager | Preserve routes and roles; V2 commands separately guarded |
| src/pages/merchant/Orders.tsx:65–186,233–242,530 | Canonical merchant envelope checks, PII exclusions, merchant-specific cache and keyed workspace | Extend existing portal with scoped operational projections |
| orders.service.ts:611–627 | Existing order-level delivery authority for agent/admin | Preserve legacy; package/task custody is a new V2 contract |

No new runtime tests performed. No claim that existing accept/reject logic is already suitable for V2 or that finance calls are proven unsafe in every transition. ED-01/02/03 remain open.

## 2. Decisions M01–M14

| ID | Direction |
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

Operational thresholds, equipment and commercial penalties are not approved by these decisions.

## 3. Activation and pickup-location authority

Activation is a checklist/projection, not necessarily a sequential database enum. Required gates: account and business verification, current approved commercial agreement, verified pickup location, eligible catalog and stock, operating hours/preparation profile, training, successful authorized test order, operations approval and cohort enablement. Account active does not imply V2 operationally active. Record evidence, approver, timestamp and reason; keep sensitive merchant records in private authorized systems. Verbal merchant commitments are not activated merchants.

Proposed logical location fields: location_id, merchant_id, label, WGS84 latitude/longitude, district, landmark, scoped pickup contact, access instructions, timezone, hours/calendar, preparation SLA profile, assigned hub/coverage, operational status, verification state/by/at, revision. Validate coordinate bounds, accuracy/source and field verification. Store UTC and display Asia/Baghdad. Do not infer coordinates from billing address. Require a verified serviceable location at quote and submit. Initial launch permits one active approved pickup point per merchant; model future branches without introducing multi-location fulfillment prematurely.

Hours include holidays, temporary pause and cutoff. Closing or suspension blocks new eligible V2 intake but never erases accepted orders or custody. Active orders retain location snapshot/revision. Location changes require verification and explicit replan of affected active tasks; no silent redirect. Hub and zone policy are controlled by logistics/operations, not merchant self-assignment.

## 4. Logical entities and invariants

| Entity | Grain / responsibility |
|---|---|
| merchant_pickup_locations | verified physical point with versioned configuration |
| merchant_operational_activation | activation evidence and eligibility projection |
| merchant_fulfillment | one child preparation lifecycle and version |
| packages | one physical parcel with immutable opaque identifier; merchant/child/location linkage |
| package_items | allocated order-item quantities per parcel |
| readiness_events | auditable readiness revision; may reuse state-event infrastructure |
| pickup_batches / pickup_batch_packages | compatible manifest membership; logistics owns assignment |
| custody_events / handover_attempts | immutable transfer evidence and current-custody projection |
| fulfillment_exceptions | typed issue, owner, severity, deadline, resolution evidence |

These names are conceptual, not DDL. Reuse existing structures only after ED-01 and 0.3H review. Child belongs to one merchant and location; every package belongs to one child at launch; item allocations cannot cross children. Sum of active allocations cannot exceed committed surviving item quantities; ready declaration requires complete allocation of the eligible set. Package may later join a multi-merchant outbound shipment without changing its origin. No duplicate active batch/assignment for a parcel. One current physical custodian, with immutable transfer history. Merchant cannot mutate ledger, dispatch assignment or hub receipt directly.

## 5. Merchant workflow and transition commands

Separate decision, preparation, custody, assignment and exception state. UI may render a combined timeline but cannot edit derived state.

| Command | Preconditions | Effect |
|---|---|---|
| accept | owner/manager, scoped pending child, current version, valid deadline | accepted, estimated_ready_at, decision fact and event |
| reject | same scope and pending decision; approved reason | rejection, eligible stock compensation, customer resolution under 0.3B |
| begin preparation | accepted and authorized worker | preparing |
| declare packages | accepted/preparing, matching line allocations | draft parcels and manifest revision |
| mark ready | complete verified allocations, sealed/labeled parcels, eligible fulfillment | committed readiness revision and durable event |
| revise estimate | active preparation, reason and version | audited estimate update, planning signal |
| withdraw readiness | before custody transfer, reason and guarded version | revoke uncollected readiness; logistics invalidates/replans tasks |
| acknowledge handover | authenticated scoped merchant, matching parcel/task/attempt | record merchant confirmation; finalize only under custody contract |
| report exception | scoped actor and typed reason | open exception, route to responsible operations owner |

Acceptance confirms ability to fulfill already decremented stock; do not decrement again. PACKED is a preparation milestone, not custody. READY is an actual operational fact, not merely a predicted time. Driver assigned/arrived/picked up are logistics-owned facts. Merchant readiness cannot bypass unresolved customer resolution or shipment eligibility. After collection, package composition and custody cannot be edited by merchant. A later problem becomes a return/exception command.

All writes require idempotency key, actor context, scope, current expected version where applicable, correlation and server timestamps. Concurrent accept/reject, ready/cancel, ready/withdraw, or handover/cancel must have one consistent outcome under transaction locks. Duplicate same command returns original effect; changed payload under same key conflicts. Reject and compensation plus resolution/outbox must commit atomically or use a proven durable recovery boundary; no best-effort calls for stock or money.

## 6. Preparation, parcel labeling and physical readiness

Merchant sees own child items, quantities, SKU/variant where available, approved packing instructions, preparation deadline and pickup window. Provide checklist, partial preparation progress, reasoned exceptions and label reprint. No silent quantity reduction or substitute product. A shortage after acceptance invokes authorized cancellation/resolution, not pending-order rejection or arbitrary inventory edits.

Parcel declaration requires child ID, item IDs and quantities, package type, declared dimensions/weight where required, handling restrictions, seal/condition where applicable and revision. Reject unsupported category, unsafe size or missing required fields. Actual equipment and dimensional limits depend on operations approval. Allocate one order line across multiple parcels only with exact quantity conservation. No mixed-child parcels at merchant in launch scope.

Barcode encodes opaque unique identifier, not phone, address, cash amount or authentication secret. Human-readable short reference and origin/hub routing hint may appear on authorized label; no unnecessary personal data. Backend generates identity once. Reprint retains identity and audit; damaged-label replacement invalidates previous active code or requires controlled reprint policy, never creates a second physical parcel implicitly. Scanner/camera/manual lookup fallback must enforce identical guards. Merchant without printer can use a controlled driver-generated/preprinted label flow, with package identity and matching recorded before transfer; equipment SOP remains pending. No actual barcode standard/printer selected.

Ready command validates all active required parcels, quantity coverage, label assignment, pickup-location revision, readiness version and blocking exceptions. Commit readiness and outbox together. A revised or withdrawn readiness invalidates stale uncollected dispatch offers. Already collected parcels never become uncollected merely because another parcel is late. Partial collection policy is a logistics exception, not permission to release incomplete master outbound shipment.

## 7. Dispatch handoff and pickup batching

Acceptance and estimated_ready_at allow shadow planning. Actual pickup assignment/collection requires current readiness and logistics eligibility; do not send driver on an unready parcel as normal workflow. Dispatch can group multiple orders from one verified pickup point into one stop, bounded by compatible ready windows, hub destination, service constraints, vehicle capacity and parcel handling requirements. Do not wait indefinitely for another parcel to complete a batch. Dispatch owns batch creation, routes, offers and assignment; merchant views pickup status and can report readiness/exception only.

Durable readiness event contains child_id, merchant_id, location_id/revision, fulfillment_version, readiness_revision, actual_ready_at, parcel IDs or versioned manifest reference, hub/coverage reference and correlation. Consumer revalidates authoritative current facts before queueing. Unique parcel/readiness effect key and active membership constraints prevent duplicate tasks after replay. Stale or withdrawn readiness must not re-queue cancelled parcels. No automatic Jenni dispatch on V2 readiness. Provider choice remains D13 and is owned by logistics.

Example (illustrative): five ready parcels across five children at one merchant location may be one stop on a feasible route. A sixth unready parcel is not automatically included. A different merchant location requires separate stop even if same driver. Hub manifests retain individual parcel identities.

## 8. Merchant-to-driver handover protocol

Driver must have current assigned pickup task, active authorized shift and matching manifest. On arrival, verify location/task context; merchant checks assigned driver/task identity without exposing unnecessary customer information. Scan each parcel, validate current code, manifest membership, child/location, readiness revision, current custodian and condition. Scanning alone does not transfer custody. Require merchant acknowledgement and driver acceptance bound to the same handover attempt, parcel set and versions; final guarded transaction records custody transfer, manifest result and durable event once. Exact evidence method (authenticated confirmation, short-lived challenge or approved assisted flow) is pending 0.3D/F/H and field validation. Never expose reusable credentials in labels.

Handover is per parcel; a partially completed manifest must show collected versus remaining explicitly. No duplicate acceptance by two drivers, no unassigned scan, no transfer of unknown/damaged parcel through normal path. Condition mismatch creates exception; physical possession if already taken must be represented truthfully and routed to controlled custody correction/quarantine. A merchant cannot confirm pickup on behalf of driver without approved audited exception. Manual override cannot fabricate custody or bypass scope. If response is lost, retry same command and retrieve authoritative result; do not repeat physical handoff. Offline queued evidence is pending, not confirmed server custody; do not silently reassign until reconciliation. Pickup driver does not collect customer COD.

## 9. Exceptions, deadlines and resolution

| Issue | Required behavior |
|---|---|
| no acceptance by deadline | alert and escalate; automated cancellation only under approved policy |
| pending merchant rejection | validated reason, stock compensation exactly once, customer resolution |
| shortage after acceptance | explicit adjustment/cancellation request; custody-aware handling |
| estimated readiness missed | revised estimate with reason; dispatch replan and support notification |
| merchant closed/unreachable | block new intake if policy allows; preserve existing tasks, escalate |
| driver arrives before ready | record waiting; do not mark collected; replan under approved waiting policy |
| wrong/duplicate/damaged parcel | reject normal transfer, record exception and actual physical custody |
| readiness withdrawn after offer | invalidate/replan uncollected task under version check |
| cancellation after collection | return workflow; no automatic restock |
| network loss or stale version | pending/retry or conflict; reconcile before duplicate physical action |
| location revision | verify new point and explicitly replan affected tasks |

Every exception has type, affected IDs, reporter, opened_at, owner, severity, deadline, current status, resolution action and audit evidence. Keep exception separate from preparation and custody. No silent order deletion, arbitrary extra charge or automatic merchant penalty. D06/D10 must approve merchant acceptance deadline, expected preparation window, wait tolerance, escalation/cancellation default and customer-resolution timing. Use configurable policy versions, not hardcoded speculative minutes. Until policy approved, block unsafe outbound release and escalate; preserve collected parcels.

## 10. Merchant portal and access matrix

Extend existing React merchant portal, Arabic/RTL first. Views: location/activation, new-order inbox, preparation queue, parcel declaration/labels, ready-for-pickup queue, assigned pickup status, handover and exceptions, history and metrics. Use explicit loading/empty/error states, merchant-keyed cache and fail-closed response parser. Do not combine unrelated merchants' lists or cache data across identity change.

| Role | Proposed permissions |
|---|---|
| merchant_owner / merchant_manager | own location scope, accept/reject, preparation oversight, authorized operational settings |
| merchant_staff | own authorized location preparation, label and handover actions only if specifically granted; no default accept/reject expansion |
| dispatcher | pickup planning/assignment and exceptions; no merchant commercial override |
| pickup driver | assigned stop, needed contact and parcel manifest; own acknowledgement |
| hub operator | assigned hub receipt, not merchant acceptance |
| platform operations/admin | activation, verification, audited exception handling; no arbitrary custody or financial edits |
| finance | own authorized monetary projections and adjustments, no readiness override |

Existing owner/manager accept/reject restriction remains. Staff permissions are proposed and must be explicitly authorized in 0.3H. Merchant sees only own child data and minimal operational pickup information, never sibling merchant details, master-wide commission, unrelated customer address or cash. Driver sees only necessary assigned pickup location/contact and parcel data. Backend/RLS enforce object scope, not just UI. No direct client privileged writes.

## 11. Proposed API and events

All routes relative to API prefix, names subject to collision audit in 0.3H. Existing /orders/:id/merchant-accept and merchant-reject remain legacy; V2 candidates below do not replace them silently.

| Command/query | Purpose |
|---|---|
| GET /merchant/v2/locations | own location and activation state |
| GET /merchant/v2/fulfillment | scoped paginated inbox/queue |
| GET /merchant/v2/fulfillment/:childId | own child operational projection |
| POST /merchant/v2/fulfillment/:childId/accept or reject | decision with version and reason where relevant |
| POST /merchant/v2/fulfillment/:childId/prepare | begin preparation |
| POST /merchant/v2/fulfillment/:childId/estimate | revise predicted readiness |
| POST /merchant/v2/fulfillment/:childId/packages | declare versioned parcel allocation |
| POST /merchant/v2/fulfillment/:childId/ready or withdraw-ready | actual readiness revision |
| POST /merchant/v2/packages/:id/label-reprint | audited authorized label operation |
| POST /merchant/v2/handovers/:id/acknowledge | merchant side of guarded transfer |
| POST /merchant/v2/fulfillment/:childId/exceptions | report typed issue |

0.3B suggested /merchant/orders paths; these versioned paths are candidates for reconciliation, not a competing approved route set. Commands include idempotency, expected version, actor-derived scope and correlation; never trust supplied merchant ID. Typed errors include LOCATION_NOT_VERIFIED, MERCHANT_NOT_OPERATIONALLY_ACTIVE, DECISION_EXPIRED, INVALID_TRANSITION, PACKAGE_ALLOCATION_MISMATCH, READINESS_STALE, PARCEL_NOT_IN_MANIFEST, CUSTODY_CONFLICT and BLOCKING_EXCEPTION. Use 0.3B error semantics.

Events: MerchantOrderCreated, MerchantOrderAccepted, MerchantOrderRejected, PreparationStarted, PreparationEstimateChanged, MerchantOrderReady, MerchantReadinessWithdrawn, FulfillmentExceptionOpened, PackagePickedUp (logistics authority), FulfillmentExceptionResolved. Use common 0.3B envelope, event schema version, aggregate version, minimal payload, durable outbox, consumer dedupe and ordered reconciliation. Do not publish personal data in events unnecessarily. Notification is not authority.

## 12. Metrics

| Metric | Definition |
|---|---|
| operational activation | active eligible merchants / contracted merchants in cohort |
| decision rate | accepted or rejected children / children requiring decision, same cohort/window |
| acceptance rate | accepted / eligible children requiring decision; report pending/expired separately |
| decision latency | decision_at minus submitted_at, p50/p95 |
| preparation latency | first valid ready_at minus accepted_at, p50/p95 |
| on-time readiness | ready within promised deadline / children due for readiness, overdue included |
| ready-to-pickup latency | confirmed transfer minus actual ready_at, by parcel |
| first-pass handover accuracy | parcels successfully matched on first attempt / parcels attempted |
| merchant-caused exceptions | classified merchant-attributable exceptions / eligible children, reviewed attribution |
| batch density | collected parcels / completed pickup stops |

Separate orders, parcels and stops. Record timezone/window, denominator and exclusions; show unknown or insufficient sample rather than fabricated zero. No punitive automation until attribution and commercial policy approved.

## 13. Acceptance requirements

| ID | Scenario | Required result |
|---|---|---|
| MF01 | registered but not operationally active merchant | V2 intake denied; legacy preserved |
| MF02 | invalid/unverified location or changed revision | no new eligible pickup without verified current point |
| MF03 | concurrent accept/reject | one decision, no duplicate compensation |
| MF04 | accepted but not ready | no normal pickup assignment |
| MF05 | estimate change and actual readiness | separate facts; planning uses current version |
| MF06 | multi-parcel allocation, duplicate/excess/cross-child quantities | exact coverage or reject |
| MF07 | label reprint and duplicate scan | stable identity, no duplicated custody |
| MF08 | readiness event replay or stale withdrawal | no duplicate active task; stale offers invalidated |
| MF09 | five compatible parcels same location | one feasible stop with exact manifest |
| MF10 | incompatible hub, capacity or ready window | no unsafe batching |
| MF11 | two drivers try same parcel | only one guarded transfer |
| MF12 | missing merchant/driver acknowledgement | no normal final custody transition |
| MF13 | wrong parcel/damaged condition/partial pickup | exception and truthful parcel-level custody |
| MF14 | cancellation before and after transfer | exact stock compensation or controlled return |
| MF15 | lost response/offline stale command | recover original result, no silent reassignment |
| MF16 | merchant staff/other merchant/location access | deny unauthorized commands and PII |
| MF17 | missed deadline/closed merchant | escalation, no arbitrary cancellation or deletion |
| MF18 | disabled V2 cohort with active orders | stop intake, retain fulfillment recovery |
| MF19 | legacy accept/reject/Jenni paths | unchanged and no double dispatch |
| MF20 | outbox crash and retry | no lost readiness or duplicate effect |

Requirements only; not executed tests. Link to CB01–CB16 and T04–T13/T19/T20. ED-01 structural proof and clean DB baseline remain prerequisites.

## 14. Handoff and unresolved decisions

D03 hub location/hours/capacity, D04 actual ready merchants, D05 driver staffing/capacity, D06 financial compensation/fees, D10 deadlines and exception SOP, D11 privacy/handling/legal policy, D13 provider selection remain open. Printer/label hardware, handover evidence and staff grants require field validation and approval. No claim of current operational readiness. Detailed package schema and custody transaction design coordinated with 0.3D/E/F/H; finance with 0.3G. Next: 0.3D Intelligent Dispatch, including eligibility, readiness-aware batching, offers, route insertion, capacity and manual fallback. G0 stays OPEN; no V2 implementation or deployment authorized.
