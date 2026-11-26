# DilMart 2.0 — Intelligent Dispatch (Phase 0.3D)

Date: 2026-11-26
Baseline: 1210f663d4aad0c14304a1ad4275b7a545c88370
Status: owner-approved DIS01–DIS18 direction; detailed engineering proposals for review. G0 OPEN.
Scope: design only. No implementation, DDL, production access, provider purchase, provisioning, deployment or activation.

## 1. Authority and baseline

Read [Master Spec](00_MASTER_SPEC.md) section 9, [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md), [architecture](06_SYSTEM_ARCHITECTURE.md), [commerce](07_COMMERCE_ORDER_CONTRACTS.md), [merchant fulfillment](08_MERCHANT_FULFILLMENT.md), CURRENT_PHASE and root governance. PRs #55–57 merged. C01–C12 and M01–M14 remain binding.

Existing backend/src/modules/shipping/delivery-operations.service.ts:195–245 validates active agent role, delivery company association and assignable order state before order-level assignment; :248 onward uses an atomic clear-order-agent RPC; :103–160 uses transition_delivery_status with a separate finance call. Reuse authorization and audited transition patterns, not order-grain assumptions or non-durable financial effects. Existing AgentOrders, DeliveryOps and DeliveryIntelligence are candidate UI references from the audit; their complete reuse mapping remains open. Local PostGIS 3.3.7 was available but not installed in Phase 0.2a; no extension activation authorized. No fresh runtime tests or real routing measurements.

## 2. Decisions DIS01–DIS18

| ID | Direction |
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

Weights, intervals, caps, SLAs, provider, commercial tariffs and fleet configuration are hypotheses or pending policies, not approved production values.

## 3. Domain boundary and topology

Dispatch owns queue, candidate eligibility, scoring, offers, capacity reservations, route plans and operational assignment. Logistics owns parcels, custody, manifests and shipment state. Merchant owns preparation/readiness; Hub owns receiving, consolidation and release authority; Finance owns COD amount and exposure constraints. Dispatch never edits customer due, warehouse completeness, merchant readiness or cash balances. Identity supplies actor and company/hub scope. Use explicit cross-domain transactional commands; no circular services or direct client writes.

First mile: ready merchant parcels -> pickup stops -> designated hub. Last mile: hub release-approved shipment -> customer stops -> return/cash remittance destination as required. One hub initially; hub-aware entities. Pickup driver does not collect customer COD. Hybrid mode is explicitly authorized and must preserve capacity, custody and cash rules; no automatic mixing of first/last-mile stops for launch.

## 4. Logical entities

| Entity | Grain and purpose |
|---|---|
| service_zones | versioned polygon, hard coverage, soft preference, hours and hub |
| driver_operational_profiles | identity, company, authorized modes, vehicle and certifications |
| driver_shifts | active availability and shift constraints |
| driver_location_latest / history | latest eligible telemetry and restricted retention |
| driver_capacity | versioned vehicle/shift limits and reserved/onboard load projection |
| dispatch_tasks | pickup or delivery work unit, version, priority, window and hub |
| task_parcels / task_shipments | manifest membership, no duplicate active assignment per leg |
| dispatch_offers | candidate, opaque token, expiry, route/task version and reservation lease |
| task_assignments | accepted assignment and execution status |
| route_plans / route_stops | versioned ordered itinerary and immutable completed prefix |
| dispatch_decisions | inputs, exclusions, score, policy version and outcome |
| dispatch_exceptions | issue, owner, deadline and resolution |

Logical proposals only; physical tables, keys and indexes await ED-01 and 0.3H. Task is not an order or a physical custody record. One driver may have several compatible assigned tasks in a route. One parcel may have sequential legs, never two conflicting active assignments for the same leg. A task may reference multiple parcels at one pickup stop; route contains multiple stops. A last-mile stop may contain compatible shipments for the same authorized destination, with separate proof and COD per shipment.

## 5. Queue and readiness

Consume MerchantOrderReady only after transaction commit, revalidate current child/location/readiness versions, surviving parcel set, verified hub and absence of blocking restrictions. Deduplicate by event and business effect; maintain one active pickup membership per eligible parcel/leg. Acceptance or estimated readiness permits shadow planning only, not normal dispatch of unready parcels. Withdrawal/cancellation invalidates pending offers and uncollected assignments under guarded versions; already collected parcels enter exception/return handling.

For last mile, only Hub's release-approved shipment manifest with current customer resolution and COD version is eligible for planning/assignment. Physical loading and driver custody are separate guarded actions. Never release incomplete consolidation merely because a driver is available. Exact hub release versus load/handoff commands reconcile in 0.3E.

Priority queue: earliest feasible deadline/slack, then aging and stable task ID. Apply approved priority classes without starving low-priority eligible tasks; aging cannot override safety. Queue reconsideration on readiness, release, offer expiry, shift/capacity change, relevant location change, exception resolution or periodic bounded reconciliation. Avoid global recomputation on each GPS ping.

## 6. Geographic and telemetry contract

Use WGS84 longitude/latitude, validated bounds and verified location snapshots. Proposed PostGIS geography and GiST spatial index for radius shortlist using ST_DWithin in meters; zone polygons require valid geometry, explicit overlap/boundary precedence and version. Coverage restrictions are hard; preferred driver zone soft. Expand radius within policy and coverage, then manual queue. Never infer actual Baghdad routes from Euclidean distance or district labels.

Telemetry includes driver_id from trusted actor, shift/device/session ID, sequence, captured_at, received_at, accuracy meters, coordinates, optional speed/source. Validate active shift, timestamp plausibility, bounds, rate limit, authorization and monotonic sequence; duplicate/out-of-order samples cannot replace fresher location. Clock skew and impossible movement flag quality issues rather than invent location. Proposed active-task interval 15–30 seconds, adaptive idle, no off-shift background tracking. Freshness/accuracy thresholds and retention require device/field/privacy approval. Stale or unavailable location blocks automatic assignment, not existing custody. Manual verified-location procedure requires explicit evidence. GPS is planning evidence, not proof of physical handover.

Restrict live map to authorized dispatcher/operations scope; merchant sees relevant pickup estimate, customer sees own delivery progress only. No unrelated customer/driver location or full route disclosure. Retain minimal history under D11. Do not expose telemetry service keys.

## 7. Hard eligibility and capacity

Candidate must satisfy all: active authorized actor and shift, correct company/hub/provider and mode, feasible operating hours/coverage, location quality for automatic mode, handling/vehicle compatibility, current manifest and readiness or release eligibility, no blocking safety/operational exception, feasible route respecting committed stops and cutoff, and available capacity. Outbound additionally requires Finance-authoritative cash exposure check. Manual override may address routing uncertainty with verification but cannot bypass custody, scope, capacity or cash safety.

Capacity dimensions: parcel count, mass, volume, vehicle type/handling, stop/time budget, shift end and hub reception window. Evaluate load at every route leg, including reserved but uncollected work and actual onboard items. Capacity is not simply count of open orders. Unknown dimensions require approved conservative class or manual verification; do not assume zero. No unsafe overbooking.

Proposed reservation model: one short-lived soft reservation per active offer, counted against driver limits; acceptance converts it atomically to committed assignment capacity, no double counting. Decline/expiry/revocation releases only offer reservation. Assignment cancellation before custody releases its uncollected reservation; actual onboard capacity is released only by confirmed physical handoff/delivery. Route time is recalculated as stops change. Cash exposure includes actual held cash plus expected COD of committed outbound work plus active offer reservations, deduplicated by shipment; only Finance-confirmed reconciliation reduces actual cash custody. D05/D07 define thresholds; no assumed numeric vehicle or cash limits.

## 8. Deterministic scoring

Shortlist spatially, then request bounded road matrix for top K eligible candidates and required insertion legs. K/radius/quota/time budget configurable, not frozen. Recheck hard eligibility after matrix and again on acceptance. Use fixed versioned normalization bounds across candidates, not min-max scaling per current shortlist; avoid unstable ranking.

Score lower is better: S = 0.35E + 0.25R + 0.15W + 0.15L + 0.10C.
All features in [0,1]. Proposed feature definitions:
- E: predicted time to reach ready pickup or relevant outbound stop from current feasible route state, normalized by configured ETA cap.
- R: incremental duration of best feasible insertion versus current committed route, including service, waiting and hub return, normalized by configured increment cap.
- W: projected bottleneck utilization across capacity dimensions (maximum valid utilization ratio); avoid double counting reservations.
- L: deadline risk from predicted minimum slack across affected stops and hub cutoff, using configurable risk horizon; hard infeasibility excluded before scoring.
- C: incremental operating cost from approved distance/time/handling coefficients, normalized by configured cost cap.

For nonnegative E/R/C use clip(x/cap,0,1) with cap >0; negative incremental estimate is clipped to zero for ranking, raw value retained. L proposal clip(1 - slack/risk_horizon,0,1) with positive horizon; no claim of calibrated probability. W uses nonnegative ratios with positive limits. Missing essential routing data is not zero ETA; block automatic ranking and follow fallback. All weights nonnegative and sum positive; normalize to sum 1, reject invalid policy. Exact fixed precision and rounding defined in 0.3H; stable tie-break by greater deadline slack then driver ID, route insertion tie by stop index. Record raw and normalized features, candidate reasons, route/version, telemetry age, policy and provider quality; redact PII. No LLM assignment authority.

Illustrative fixture with E/R/W/L/C respectively:
A [0.20,0.80,0.80,0.50,0.70] -> 0.5350;
B [0.35,0.20,0.30,0.10,0.25] -> 0.2575;
C [0.50,0.35,0.15,0.25,0.30] -> 0.3525.
B wins despite A having lower ETA factor. These are synthetic normalized inputs, not measured Baghdad travel times or approved operating coefficients.

## 9. Greedy feasible insertion

Freeze completed/active-stop prefix and any non-reorderable commitments. For each candidate, enumerate permissible insertion positions in remaining route, or merge same-location compatible pickup stop with revised manifest. Propagate arrival = prior departure + road travel; service start = max(arrival, allowed window start); departure = start + service duration. Include waiting, loading, handoff, hub receiving cutoff, return and shift end. Reject any violation of hard windows, load profile, custody dependencies or cash constraints. Include actual and reserved load changes on each leg. Choose feasible plan with lowest configured score; record alternate feasible/rejected reasons. If no feasible insertion, consider new trip only if vehicle/shift/hub feasible; otherwise queue and escalate. Do not change driver navigation mid-maneuver; defer nonurgent updates to safe stop and require route-version synchronization.

Route matrix fetched outside database locks. Planning snapshot includes task, manifest, capacity, route, location and policy versions. On commit revalidate; stale result discarded/replanned. Bound shortlist, insertion search, provider requests and retries. Do not promise global optimality. Future route optimizer (OR-Tools or evaluated provider) requires comparative evidence and preserves same hard constraints.

## 10. Offer and assignment protocol

Logical task lifecycle: queued -> offered -> assigned -> en_route -> arrived -> collected/loaded -> handover/delivered -> completed. Declined/expired offers return eligible work to queue; failures and returns are explicit branches, not deletion. Separate task lifecycle from parcel custody and route status.

Offer creation: reserve one candidate/task at a time, create opaque actor-scoped expiring offer and short capacity lease in a guarded transaction; commit before push. Proposed 45-second expiry, field-calibrated. Offer delivery does not prove driver saw it; late push cannot extend lease implicitly. Driver accepts or declines from authorized session; safe interaction, no required action while moving.

Atomic accept: validate actor, offer token and server expiry, current offer/task/manifest/readiness or release versions, active shift, scope, route and capacity including cash. Lock in one global deterministic resource order (exact lock design in 0.3H). Convert reservation, create assignment and new route version, mark offer accepted, emit TaskAssigned and persist idempotent result in same transaction. Reject stale or conflicting acceptance without changing custody. Concurrent expiry versus acceptance has one outcome; expiry worker may not undo accepted assignment. Retried same command returns original result even if token later expired. Decline/expiry releases lease once, avoids immediate repeated offer to same driver within policy, reranks if snapshot stale. Bounded attempts, queue aging, dispatcher escalation. No indefinite retry loop.

Manual assignment uses same atomic guards and records actor, reason and verified facts; no direct row edit. Reassignment before physical custody requires revoke old assignment/offer, release uncollected reservations and notify parties with version checks. After any parcel collected, preserve actual custodian and remaining manifest; use explicit physical handover/return or recovery workflow, never simple agent_id swap. Uncertain offline handover blocks reassignment until reconciled.

## 11. Routing provider adapter and fallback

Proposed interface: geocode/validate location, matrix( origins, destinations, mode, departure ), directions( ordered stops, mode, departure ), optional optimize. Response includes provider/version, travel mode, duration/distance, timestamp, traffic/quality indicator where supported, per-leg errors and request correlation. No promise of motorcycle or live traffic coverage. Google Routes is candidate only (D08); benchmark verified Baghdad merchant/hub/customer points, both river banks, bridge crossings, peak/off-peak, cars and motorcycles. Compare against actual observed travel, quota, latency, cost and licensing/cache rules before choosing. No external research/paid calls performed in this task.

On timeout/429/quota/service outage, bounded retry with jitter, circuit breaker and alert; use permitted recent valid estimates only if freshness/quality policy allows. Straight-line shortlist may support manual dispatch but is not a road ETA. Manual fallback shows unknown ETA and records dispatcher verification; do not bypass hard constraints or fabricate times. Provider dispatch (Jenni) distinct from routing provider; exclusive shipment ownership, no automatic switch/double dispatch. D13 fallback policy pending.

## 12. Durable execution, interfaces and security

Worker leases and bounded retries, unique business keys, dead-letter and reconciliation of stuck tasks/offers. State and outbox commit together. Worker crash before acknowledgement may replay but cannot duplicate assignment or capacity. Lease expiration not a physical custody change. Event ordering per aggregate version; revalidate current state. Realtime/push is a projection signal, authoritative API recovery mandatory.

Proposed API (relative to existing prefix): GET /driver/v2/offers, POST /driver/v2/offers/:id/accept or decline, GET /driver/v2/route, POST /driver/v2/location, POST /driver/v2/tasks/:id/arrive, GET /ops/v2/dispatch/queue, POST /ops/v2/tasks/:id/assign or replan, GET /ops/v2/dispatch/decisions. Handover/scan commands remain custody domain contracts. API/DTO collision audit in 0.3H. Commands carry idempotency and expected versions, actor-derived identity and correlation; no client-trusted driver ID or arbitrary route edits. Typed errors: OFFER_EXPIRED, OFFER_STALE, CAPACITY_EXCEEDED, CASH_LIMIT_EXCEEDED, LOCATION_STALE, ROUTE_INFEASIBLE, TASK_ALREADY_ASSIGNED, CUSTODY_CONFLICT, ROUTING_UNAVAILABLE. Preserve legacy order/agent/Jenni routes and roles.

Events: PickupTaskQueued, DeliveryTaskQueued, DispatchOfferCreated, OfferExpired, OfferDeclined, TaskAssigned, AssignmentRevoked, RoutePlanUpdated, DriverArrived, DispatchExceptionOpened/Resolved. PackagePickedUp and ShipmentDelivered emitted by custody/delivery authority, not dispatch scoring. Common envelope from 0.3B/C. RLS plus backend object scope, no unrestricted live location read. Audit decision and override access. Flags default off; disable new automatic assignment independently while preserving active tasks and manual recovery.

## 13. Calibration, metrics and field evaluation

Shadow mode produces recommendations with no assignment, reservations, customer promises or provider dispatch side effects. Compare to dispatcher baseline under same eligible workload. Then controlled opt-in pilot and progressively expand only on approved gates. Track assignment latency p50/p95 (eligible queue to accepted assignment), offer acceptance (accepted/valid offers), route incremental time and predicted-versus-actual ETA error, on-time pickup/delivery (due eligible tasks including misses), parcels per pickup stop, utilization by dimension, cost per delivered master, empty travel, stale telemetry rate, queue aging, provider cost/error/latency, custody or duplicate assignment incidents. Report denominators, time window and exclusions; no fabricated efficiency gains. D12 sets samples, peak load and thresholds; any critical custody/cash/authorization violation pauses rollout. Use actual field observations for weight and normalization version updates; audit and rollback configuration.

## 14. Acceptance requirements

| ID | Scenario | Expected result |
|---|---|---|
| DS01 | accepted but unready child | shadow plan only |
| DS02 | replayed ready event / withdrawn revision | no duplicate or stale active task |
| DS03 | inactive, wrong mode/company/hub driver | excluded before score |
| DS04 | closest driver across river or congested route | rank using valid road ETA |
| DS05 | synthetic A/B/C fixture and stable ties | B wins; reproducible decision |
| DS06 | invalid weights/caps or missing ETA | reject policy or manual fallback |
| DS07 | compatible parcels at same merchant | one feasible stop, exact manifest |
| DS08 | incompatible handling/hub/windows | no unsafe batch |
| DS09 | insertion delays committed stop or hub cutoff | reject insertion |
| DS10 | weight/volume/time cap exceeded | no assignment |
| DS11 | concurrent offers/acceptance for same parcel | one active assignment, no overbooking |
| DS12 | acceptance races expiry/withdrawal | one guarded outcome |
| DS13 | duplicate acceptance after lost response | original result, one reservation conversion |
| DS14 | decline/expiry | release lease exactly once and progress queue |
| DS15 | reassign after partial collection | custody preserved, explicit handover required |
| DS16 | stale or out-of-order GPS | no fresh-location overwrite or unsafe auto-assignment |
| DS17 | routing timeout/429 | bounded retry, no invented ETA, audited manual queue |
| DS18 | outbound COD exposure exceeds approved limit | deny assignment |
| DS19 | hub shipment incomplete or resolution pending | no outbound release/assignment |
| DS20 | worker crash before event ack | no duplicate task or capacity effect |
| DS21 | route update with stale version | reject/replan, preserve completed prefix |
| DS22 | cross-driver/merchant/location access | denied at API and DB |
| DS23 | V2 disabled with active custody | no new automation, recovery retained |
| DS24 | shadow evaluation | no physical or financial side effects |
| DS25 | legacy Jenni and order assignments | no regression or double dispatch |
| DS26 | shift end with onboard parcel/cash | explicit safe handover/remittance exception, no silent clear |

Requirements, not executed tests. Relate to MF01–MF20, CB01–CB16 and master T05–T23. ED-01 before DDL, clean full DB suite before implementation acceptance.

## 15. Open decisions and handoff

D03 hub hours, capacity and receiving windows; D05 fleet/vehicle/shift/compensation; D07 cash limits; D08 routing provider and field accuracy; D09 driver stack/device evidence; D10 SLA/cutoff/retry/acceptance/wait policy; D11 location privacy and retention; D12 pilot/load targets; D13 delivery provider fallback all unresolved. Initial weights, 45-second offer and GPS interval are test hypotheses. No claim of optimized production performance. Next package 0.3E Hub & Parcel Management must define intake, bin/packing/release, manifest and custody facts that gate outbound dispatch; 0.3F device protocol and 0.3G finance exposure; 0.3H exact schema/API/locks. G0 stays OPEN. No implementation or live operations authorized.
