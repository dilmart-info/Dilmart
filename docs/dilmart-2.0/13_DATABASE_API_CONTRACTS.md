# DilMart 2.0 — Unified Database & API Contracts (Phase 0.3H)

Date: 2026-11-26
Baseline: cd5ec61975f680ee92e86eb309df93b92daf83d8
Status: owner-approved DB01–DB25 direction; unified logical contract proposed for review. Physical schema freeze BLOCKED by ED-01; G0 OPEN.
Scope: documentation only. No executable DDL, migrations, database access, dependency changes, provisioning, deployment or activation.

## 1. Authority, evidence and limitations

Read [Master Spec](00_MASTER_SPEC.md), [repository audit](01_PHASE_0_REPOSITORY_AUDIT.md), [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md), [architecture](06_SYSTEM_ARCHITECTURE.md), [commerce](07_COMMERCE_ORDER_CONTRACTS.md), [merchant](08_MERCHANT_FULFILLMENT.md), [dispatch](09_INTELLIGENT_DISPATCH.md), [hub](10_HUB_PARCEL_MANAGEMENT.md), [driver](11_DRIVER_APPLICATION.md), [finance](12_FINANCIAL_ARCHITECTURE.md) and CURRENT_PHASE. PRs #55–61 merged. This document reconciles proposed names and interfaces; it does not silently override approved business rules.

Phase 0.2a evidence: 175 local applied migrations, 62 public tables, 80 policies, 66 functions, 56 SECURITY DEFINER, 6 without configured search_path, 62 PKs, 108 FKs, 22 unique constraints, 93 checks, 229 indexes, 17 noninternal triggers, 3 views. Fresh production table count/RLS coverage matched 62; full structural equivalence unproven. The full DB suite exited 1; partial reruns passed applicable failures, one TODO remained. PostGIS available but not installed. No new database queries in 0.3H.

Source inspection at baseline: src/integrations/supabase/types.ts lists only 16 table entries (admin_notifications, categories, coupons, delivery_companies, delivery_prices, desktop_quick_links, governorates, merchants, merchant_settings, merchant_users, order_items, orders, products, profiles, regions, stock_movements). It is incomplete relative to the 62-table catalog; not schema authority. backend/src/main.ts sets global prefix api. Inspected checkout/orders/merchants/admin/shipping controllers use corresponding legacy roots; no explicit v2/master-orders routes found in those five controllers. Full registered route collision audit remains required; repository-wide controller enumeration alone is not proof. No runtime tests performed.

## 2. Decisions DB01–DB25

| ID | Direction |
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

Logical names below are canonical within the design package, not approved physical names or migration statements. UUID applies to new IDs, not conversion of legacy PKs.

## 3. Existing-object reuse matrix

| Existing object/group evidenced in source or audit | Classification | Conditions |
|---|---|---|
| profiles, merchant_users | KEEP/REUSE | verified auth identity, role and membership; no duplicated accounts |
| merchants, merchant_settings | KEEP/EXTEND candidate | operational activation/location separate; legacy eligibility unaffected |
| products, categories, coupons, governorates, regions | KEEP/REUSE | prove stock, eligibility, promotion and location semantics; D02 |
| orders, order_items | EXTEND candidate | nullable master link and version discriminator; single merchant child; prove all writers/legacy constraints before reuse |
| stock_movements | REUSE candidate | exact movement conservation and effect uniqueness with legacy writers |
| existing checkout attempts/atomic place_order RPCs | LEGACY/REUSE patterns | separate namespace; no mixed cart via legacy RPC |
| delivery_companies, delivery_prices, order delivery fields | LEGACY/REUSE reference | company/provider association retained, no order-level V2 custody authority |
| existing delivery views and delivery transition RPCs | LEGACY/PROJECT candidate | verify grants and V2 exclusion; no dual dispatch |
| merchant_ledger_entries, courier_ledger_entries, order_finance_events, payout structures | LEGACY/PROJECT or REUSE only after proof | no duplicated V2 posting; reconcile existing statements; no historical conversion |
| notification_outbox | KEEP/REUSE pattern | general domain outbox not assumed equivalent to notification delivery queue |
| existing cancellation/return RPCs | LEGACY/REUSE guarded patterns | custody-aware V2 quantities and financial effects must be proven |
| retired store_carts/store_federated/handoff and delivery_recommendations | DO NOT RESTORE | Stage B and prior removal preserved |

A full 62-table classification with actual columns/types/constraints, every reader/writer (RPC, triggers, backend, frontend, jobs, imports, providers), grants and impact tests is a separate ED-01 deliverable. No final count of new tables. If orders reuse cannot isolate V2 from legacy triggers/writers, choose separately approved additive child storage with compatibility read projection; do not force the candidate.

## 4. Canonical entity register and relationship contract

Notation: new business IDs UUID; FK targets logical unless legacy type proof required; v = nonnegative bigint version, timestamps UTC timestamptz, IQD integer bigint with safe range. Every scoped child must resolve its parent and tenant/actor through verified relation. Composite scope FK/unique constraints where practicable plus transaction guards; no trusting redundant merchant/hub IDs supplied by client. All entities below are design grains, not one table each by mandate.

| Domain / canonical entity | Key, parent and cardinality | Critical fields / invariant |
|---|---|---|
| master_orders | id; customer -> many masters | currency, destination snapshot, accepted quote, commercial revision, v; one committed master per submit |
| orders (V2 child candidate) | existing id; master -> 1..N children | merchant, pickup location/revision, contract version; unique master+merchant for initial cohort |
| order_items | existing id; child -> 1..N lines | frozen product/quantity/price; product scope matches child |
| checkout_quotes | id; actor -> many quotes | canonical hash, expiry, policy/quote version, accepted total |
| command_operations | id; unique actor+command namespace+key | canonical request hash, result reference, lifecycle/lease; checkout_attempts V2 specialization |
| stock_movements | existing key candidate; product/line | signed quantity, unique effect, original compensation reference |
| financial_snapshots | id; master+revision unique | accepted commercial facts; immutable |
| order_allocations | id; snapshot+component+stable allocation key unique | line/child/shipment, beneficiary/funder, amount; conserved |
| order_adjustments / customer_resolutions | id; master+revision | original links, delta, consent, reason, actor |
| merchant_pickup_locations | id; merchant -> many locations | verified WGS84, hours, hub, v; one active approved launch point |
| merchant_operational_activation | merchant/location scope | checklist evidence, approver, eligibility projection |
| merchant_fulfillment | child unique | decision, preparation, estimate, actual readiness revision, v |
| packages | id; child -> many | opaque unique active label, location snapshot, condition, custody/location projection, v |
| package_items | package+line unique | positive quantity; exact child scope and allocation conservation |
| handover_attempts | id; manifest/task, counterpart actors | versioned subject set, two acknowledgements, expiry, evidence |
| custody_events | id; subject+sequence unique | from/to verified custodian, event/effect key, condition, actor/time; append-only |
| service_zones / hubs / hub_zones | ids; zone/hub relationships | versioned coverage, hours, capacity, geography |
| driver_operational_profiles / driver_devices | driver ID; device installation unique in approved scope | modes, company, vehicle, authorization, revocation |
| driver_shifts | id; driver -> many | one active shift per driver, availability, mode, limits |
| driver_location_latest / history | driver+shift; history sequence | WGS84, accuracy, source, captured/received time; monotonic latest |
| driver_capacity / capacity_reservations | driver/shift; reservation effect unique | limits, reserved/onboard load; cash exposure from Finance |
| dispatch_tasks | id; task leg+hub | pickup/delivery/reverse, window, priority, v |
| task_parcels / task_shipments | task+subject+leg | no conflicting active assignment per physical leg |
| dispatch_offers | id; task+candidate+revision | one active offer per task, expiry, token digest, lease |
| task_assignments | id; task -> historical assignments | one active accepted assignment per task; actor/route version |
| route_plans / route_stops | route+version; stop sequence unique | completed prefix immutable, assignments and feasible load |
| dispatch_decisions | id; task+decision version | policy, raw/normalized score, exclusions, outcome |
| logistics_manifests | id; kind inbound/outbound/return, trip+version | hub, driver, expected/actual results, v |
| manifest_parcels / manifest_shipments | manifest+subject unique | expected, acknowledged, discrepancy result |
| hub_bins / bin_assignments | bin id; active bin assignment unique | group, physical capacity, location status |
| parcel_movements | id; parcel+sequence unique | from/to internal location, actor, effect, timestamp |
| consolidation_groups | id; master+hub+revision unique | expected set, completeness projection |
| packing_tasks | id; group+revision unique active | claim lease, verified package set, v |
| shipments / shipment_packages | shipment id; shipment+parcel unique | same master/destination, one active outbound allocation per parcel, release revision, seal |
| shipment_cod_versions / cod_receipts | shipment+revision; receipt effect unique | exact due, proof, actual amount, allocation, payment method |
| return_cases / return_manifest_items | id; original line/parcel links | authorized quantities, reverse custody/disposition |
| operational_exceptions | id; typed domain and scope | affected subject, owner, deadline, blocking flag, resolution; financial disputes distinct |
| financial_accounts | id; account family+owner+currency unique | approved chart, no mutable independent balance |
| financial_journals / financial_journal_lines | journal effect unique; line sequence | immutable balanced debit/credit, amount>0, linked reversal |
| financial_obligations | id; beneficiary+source effect unique | accrued/reserved/paid remaining projection |
| driver_cash_sessions / cash_desk_sessions | id; custodian+active session unique | opening/closing evidence; roll-forward derived |
| cash_transfers / transfer_allocations | transfer effect unique; receipt application | acknowledged actual amount, exact allocated sum |
| payout_batches / payout_items / payment_attempts | batch id; item reservation; attempt reference unique | approval revision, beneficiary, actual evidence, unknown outcome hold |
| financial_disputes / reconciliation_runs | id; scope+window | variance, owner, resolution, evidence |
| cost_allocations | expense+allocation key unique | actual/estimated distinction; conserved cost |
| outbox_events / event_deliveries / financial_effect_jobs | event id; consumer+effect unique | durable event, lease, retry, completion |
| domain_state_events / audit_records | aggregate+version+sequence / audit ID | actor, reason, correlation, append-only |

Reconciliation of aliases: pickup_batches are pickup dispatch_tasks with task_parcels grouped at one location; not second assignment authority. inbound_manifests/outbound_manifests are logistics_manifests kind projections, no duplicate trip truth. readiness_events/order_state_events use domain_state_events or outbox-derived audit with explicit retention, not independent mutable state. fulfillment_exceptions/dispatch_exceptions/hub_exceptions use operational_exceptions typed scope; financial_disputes retain financial approval. financial allocations in 0.3G refer to order_allocations; receipts mean cod_receipts. checkout_attempts V2 specialization of command_operations; legacy attempts separate. Return manifest items reuse manifest membership where compatible; no second custody trail. Exact polymorphic FK implementation must use typed references or enforceable subtype tables, not unchecked generic subject IDs.

## 5. Constraints, indexes and state authority

PK/FK, NOT NULL on required fields, bounded positive quantities, nonnegative monetary amounts where not signed deltas, valid currency/direction/status, valid coordinates and expiry ordering. Restrict deletes of referenced commercial/custody/journal history; explicit archival policy. Partial uniqueness for active shift, offer, assignment, bin, shipment parcel allocation and device scope as appropriate; enforce on authoritative membership rather than stale status projections. Cross-row totals (allocation, stock, capacity, journal balance, expected parcel set, outstanding obligations) require atomic command checks and concurrency-safe locking; CHECK alone cannot enforce sums. Unique effect keys include semantic scope and revision; immutable postings linked to original effect. No blanket ON DELETE CASCADE for evidence.

Indexes target scoped access and queue scans: master customer+created_at+id, child merchant+decision/status+created_at, package label and child, custody subject+sequence, ready task hub+state+deadline, offer expiry and driver, route driver+active version, manifests hub+status, bin group, outbox consumer/state+next_attempt_at, journal effect and account/time, obligations beneficiary+status, receipts shipment, reconciliation scope/time. Validate EXPLAIN and actual query load; avoid redundant index sets. PostGIS geography/GiST for verified locations and zone geometry only after extension approval and field need; no activation now. Use stable cursor pagination on timestamp+ID; no unbounded scans or cross-tenant caches.

Separate axes: commercial child decision/preparation, physical custody, task assignment, shipment release/execution, customer resolution, financial obligation. Master projection derives from current authoritative axes; cancelled only when no surviving required quantities and resolution settled; delivered only when all surviving shipments delivered and no blocking resolution; partial outcome independently identifies removed/returned quantities. Active exception separately visible. No direct master status edit. Return outcome and financial state remain distinct. Preserve V1 status semantics.

## 6. Transaction and locking contract

All critical mutations enter NestJS authorized command handler, then one database transaction/RPC or explicit durable workflow. No sequential independent JavaScript commits for checkout, physical custody, exact COD, cash transfer or balanced journal. External routing/payment calls outside DB locks; persist intention before call and verify result before authoritative effect. Commands re-read authoritative state after locking.

Proposed global resource order (all V2 writers and shared legacy writers must be audited): operation/idempotency guard -> commercial scope/rule and inventory rows -> master/child/resolution -> package/consolidation/bin/shipment/manifest -> driver/shift/route/task/offer/capacity -> cash sessions/receipts/transfers -> financial accounts/obligations/payout batches -> append-only events/journals/outbox. Within each class lock stable canonical PK ascending; acquire known full resource set before writes; if discovery requires earlier class, restart rather than invert. This ordering is a design candidate requiring verification against actual legacy RPC lock behavior; do not implement until conflict audit. Account lock before obligation/batch; no external call while held. Prefer guarded row locks and unique constraints; SERIALIZABLE where justified with bounded retry on serialization/deadlock and same idempotency key. Never retry physical actions blindly. Read-only planning snapshot versions revalidated before commit. Lock scope, timeout, retry bounds and contention benchmarks pending ED-01/D12.

| TX | Atomic boundary / preconditions | Commit effects |
|---|---|---|
| TX01 checkout | actor/key/quote/hash, eligibility, deterministic stock/rule locks | master, children, items, stock decrement, snapshots, allocations, result, outbox |
| TX02 cancel/adjust | authorized resolution, original movement, custody and current revision | eligible compensation once, delta/consent, expected-set revision, events |
| TX03 readiness | scoped accepted child, exact allocations, labels, location/revision | ready/withdraw revision, durable event, stale task invalidation signal |
| TX04 assignment | task/offer/server expiry, driver/shift, route/capacity/exposure versions | reservation convert, assignment, route version, event |
| TX05 merchant handover | verified counterpart attempt, parcel/manifest/custody versions | per-parcel custody, manifest result, capacity projection, event |
| TX06 hub receipt | driver+receiver acknowledgment, hub/manifest/parcel scope | custody receipt, discrepancy/result, release onboard load, event |
| TX07 internal move | current bin/location, destination capacity | movement history, location and occupancy projection |
| TX08 packing | expected set/revision, no blockers, unique task | shipment, membership, seal/packing record; no dispatch yet |
| TX09 release | packed, complete, approved consent/destination/COD version | release revision, ShipmentReleaseApproved; revoke on stale facts |
| TX10 outbound handover | assigned driver, release/manifest/COD/shift/capacity versions, dual ACK | coherent shipment and component custody, manifest load, event |
| TX11 delivery/COD | authorized proof, custody, exact due/version and payment method | delivery, receipt, cash custody journal, complete effects or durable pending accrual |
| TX12 cash remittance | driver/cashier count and ACK, exact receipt allocations | balanced transfer, receipt application, custody reduction, event |
| TX13 journal | approved effect, exact accounts/lines and unique key | balanced immutable journal and durable projection effect |
| TX14 payout reserve/approve | eligible obligation amounts, distinct maker/checker and revision | reservation/approval, no money movement |
| TX15 payment confirm | verified external/manual evidence, attempt/amount/beneficiary | journal liability reduction, payout result, event |
| TX16 return/reversal | authorized reverse proof and original effect/remaining quantity | physical return facts via custody command, eligible linked reversal/refund obligation via coordinated transaction or durable work |

Each boundary includes operation result and outbox where applicable. TX08/TX09 and TX14 reserve/approve are separate commands, not one long transaction. TX16 may involve multiple physical steps, never one fictitious all-in-one external transaction. On failure rollback DB effects; if actual physical action or external money already occurred, preserve evidence and reconcile, not pretend rollback of reality. Financial completion requires all sub-effects, not merchant accrued marker alone (ED-02).

## 7. API conventions and canonical routes

Global /api prefix confirmed in main.ts. Retain prior domain version convention to minimize churn; use /checkout/v2, /master-orders/v2, /merchant/v2, /driver/v2, /ops/v2, /hub/v2, /finance/v2. Canonical customer master routes below replace unversioned proposals in 0.3B only; existing V1 routes unchanged. Merchant V2 uses fulfillment route family, not earlier /merchant/orders aliases. No duplicate handlers for same business command. Full Nest registered route audit and OpenAPI generation required before implementation; design route inventory not collision proof.

GET returns scoped projection with version, server timestamp and stable cursor where list. Mutating business commands POST with Idempotency-Key (opaque UUID recommended), X-Correlation-Id optional validated/generated, body expected_version and other dependency versions when applicable. Auth actor derived from verified session; reject caller-supplied unauthorized identity. Quote and initial create have cart/quote version rather than existing aggregate expected_version. Telemetry batch uses device/shift sequence dedupe, not business command semantics per sample. Strict allowlist DTO, unknown fields rejected where safe, exact integer IQD transport as decimal strings for V2 to avoid JS precision issues, positive bounded quantities, RFC3339 UTC, UUID IDs except existing typed legacy references. No secret or raw PII in diagnostics.

Response proposal: {data: typed projection, operation_id: UUID, version: integer-string, correlation_id: UUID, server_time: UTC timestamp}. Error: {code: stable business code, message: localized safe text, correlation_id, retryable: boolean, details: allowlisted fields}. 400 malformed, 401 auth, 403 unauthorized or consistent concealed 404, 409 stale/conflict/key reuse, 422 valid request blocked by business rule, 429 rate limit, 503 temporary dependency. 202 only for genuinely pending recoverable workflow; never implies delivery/payment complete. 200 replay returns same committed effect/reference; 201 initial create where applicable. Keep status and error mapping stable; do not expose internal SQL or another tenant's facts.

| Method + path (relative to /api) | Owner / command |
|---|---|
| POST /checkout/v2/quote | Commerce authoritative quote |
| POST /checkout/v2/submit | Commerce TX01 |
| GET /checkout/v2/attempts/:key | own operation recovery |
| GET /master-orders/v2 | own master list |
| GET /master-orders/v2/:id | own master detail |
| POST /master-orders/v2/:id/cancel | Commerce authorized TX02 request |
| POST /master-orders/v2/:id/resolve | Commerce explicit consent and revised total |
| GET /merchant/v2/locations | own location and activation |
| GET /merchant/v2/fulfillment | scoped queue |
| GET /merchant/v2/fulfillment/:childId | scoped child |
| POST /merchant/v2/fulfillment/:childId/accept | owner/manager decision |
| POST /merchant/v2/fulfillment/:childId/reject | owner/manager TX02 |
| POST /merchant/v2/fulfillment/:childId/prepare | authorized preparation |
| POST /merchant/v2/fulfillment/:childId/estimate | revised estimated_ready_at |
| POST /merchant/v2/fulfillment/:childId/packages | exact package allocations |
| POST /merchant/v2/fulfillment/:childId/ready | TX03 |
| POST /merchant/v2/fulfillment/:childId/withdraw-ready | TX03 |
| POST /merchant/v2/packages/:id/label-reprint | audit same identity |
| POST /merchant/v2/handovers/:id/acknowledge | merchant side TX05 |
| POST /merchant/v2/fulfillment/:childId/exceptions | report issue |
| POST /driver/v2/devices/register | approved device |
| GET /driver/v2/session | own current scope |
| POST /driver/v2/shifts/start | shift gate |
| POST /driver/v2/shifts/end | custody/cash resolution gate |
| POST /driver/v2/availability | pause/resume |
| GET /driver/v2/offers | own active offers |
| POST /driver/v2/offers/:id/accept | TX04 |
| POST /driver/v2/offers/:id/decline | release lease |
| GET /driver/v2/route | own route/manifest |
| POST /driver/v2/location | telemetry batch |
| POST /driver/v2/tasks/:id/arrive | arrival evidence |
| POST /driver/v2/handovers/:id/acknowledge | driver side TX05/06/10 |
| POST /driver/v2/shipments/:id/delivery-proof | Logistics+Finance TX11 |
| POST /driver/v2/shipments/:id/failure | failure/reverse request |
| GET /driver/v2/cash | own cash projection |
| GET /driver/v2/earnings | own earnings |
| POST /driver/v2/remittances | transfer request/evidence |
| GET /driver/v2/operations/:id | own result recovery |
| GET /ops/v2/dispatch/queue | scoped control tower |
| POST /ops/v2/tasks/:id/assign | guarded manual TX04 |
| POST /ops/v2/tasks/:id/replan | versioned route |
| GET /ops/v2/dispatch/decisions | scoped audit |
| GET /hub/v2/inbound | hub manifest queue |
| POST /hub/v2/receipts/:id/confirm | receiver TX06 |
| POST /hub/v2/parcels/:id/inspect | condition |
| POST /hub/v2/parcels/:id/move | TX07 |
| GET /hub/v2/consolidations | group projection |
| POST /hub/v2/packing/:id/claim | lease |
| POST /hub/v2/packing/:id/complete | TX08 |
| POST /hub/v2/shipments/:id/release-approve | TX09 |
| POST /hub/v2/outbound/:id/handover | hub side TX10 |
| GET /hub/v2/exceptions | scoped queue |
| POST /hub/v2/exceptions/:id/resolve | guarded issue resolution |
| GET /finance/v2/merchants/:id/statement | authorized statement |
| POST /finance/v2/remittances/:id/confirm | cashier TX12 |
| POST /finance/v2/cash-sessions/start | verified opening |
| POST /finance/v2/cash-sessions/close | reconciliation |
| GET /finance/v2/reconciliation | scope/window |
| POST /finance/v2/payouts/create | TX14 reserve |
| POST /finance/v2/payouts/:id/approve | TX14 checker |
| POST /finance/v2/payouts/:id/confirm-payment | TX15 |
| POST /finance/v2/adjustments/request | authorized reason |
| POST /finance/v2/adjustments/approve | guarded checker/TX13 or TX16 |
| GET /finance/v2/operations/:id | scoped result recovery |

Additional required design gaps for 0.3H follow-up before freeze: operation lookup for merchant/hub/customer critical commands, explicit handover-attempt creation, customer proof challenge issue/verify, ops location/activation and capacity configuration, return case and manifest creation, payout execute/cancel and refund execution. Do not invent final DTOs for unapproved policies. Use same transaction coordinator, no duplicated COD endpoint. Endpoint inventory above is reconciled from B–G; not complete OpenAPI.

## 8. Critical DTO contracts and idempotency

| Command | Required semantic input beyond authenticated actor/key | Result invariant |
|---|---|---|
| quote | canonical item IDs/qty, destination, coupon/points request, cart version | quote ID/version/hash, expiry, frozen totals/allocations |
| submit | quote ID/version, explicit accepted total, canonical hash context | one master/children result, no fallback V1 |
| resolve | master, resolution ID/version, explicit choice and revised total | consent revision and guarded adjustment |
| ready | child/version, manifest revision, parcel allocations reference | readiness revision, exact set |
| offer accept | offer ID/token, task/route version | one assignment, reservation converted |
| handover ACK | attempt ID, expected subject/manifest/custody versions, evidence ref | ACK pending or confirmed transfer; never conflate |
| release | shipment/version, destination/consent/COD revisions | release-approved or blocked, not actual departure |
| delivery proof | shipment/version, COD version, proof token/ref, actual amount, method | verified receipt/custody or explicit discrepancy |
| remittance confirm | transfer/version, counted amount, receipt allocation, counterpart ACK | confirmed exact transfer or discrepancy |
| payout approve/confirm | batch revision, independent actor, verified attempt/evidence/actual amount | approved or verified item settlement, not assumed paid |

Operation scope = actor/tenant where applicable + command namespace + key; canonical normalized payload hash including path/resource and dependency versions. Same key/hash after commit returns original result even if quote/offer expired. Same key/different hash -> 409. In-progress state has bounded lease and recoverable outcome query. Durable effect keys independently protect business uniqueness across different operation keys. Retention must cover retry/offline/payment uncertainty and financial history; never silently expire critical dedupe while effect can replay. Exact schema, hashing canonicalization, token expiry and retention need approval in implementation-ready supplement. No OTP/token values in logs/outbox.

## 9. Event contract and worker reliability

Envelope: event_id UUID, type, schema_version positive integer, aggregate_type, aggregate_id, aggregate_version, event_sequence where multiple events per version, occurred_at UTC server, correlation_id, causation_id optional, minimal typed payload. Unique aggregate+version+sequence and business effect keys. Commit events with authoritative state; per-consumer delivery rows with unique consumer+event/effect, claim lease, attempts, next_attempt_at, completed_at and terminal error reference. At-least-once delivery, exactly-once business effect through guarded idempotent consumer; not exactly-once transport. Ordering per aggregate/version, gaps/stale versions trigger authoritative reconciliation. Workers claim bounded batches (candidate SKIP LOCKED), commit leases, process without long-held locks, renew/recover, retry bounded jitter, dead-letter and alert. No unbounded retry or silent handler failure. Replay cannot reapply cash or physical action. Notifications/realtime are hints, not source of truth.

| Event / producer | Required minimal references | Consumer / effect |
|---|---|---|
| CheckoutSubmitted / Commerce | master, snapshot revision | projections/notification |
| MerchantOrderCreated/Accepted/Rejected / Commerce/Merchant | child, decision revision | preparation/resolution; no pickup on accept |
| MerchantOrderReady/ReadinessWithdrawn / Merchant | child, readiness/location revision, parcel set ref, hub | Dispatch revalidate/queue/revoke |
| PickupTaskQueued/DeliveryTaskQueued / Dispatch | task, manifest revision | planning |
| DispatchOfferCreated/OfferExpired/OfferDeclined/TaskAssigned/AssignmentRevoked / Dispatch | task, offer/assignment, route revision | driver projection/notification |
| RoutePlanUpdated/DriverArrived / Dispatch | route/task revision | scoped projection |
| PackagePickedUp / Logistics | parcel, custody event, manifest | hub inbound projection |
| PackageReceivedAtHub/ParcelInspected/ParcelMoved / Logistics/Hub | parcel, hub, condition/location revision | consolidation recheck |
| ConsolidationReady/PackingTaskCreated/ShipmentPacked / Hub | group/packing/shipment revision | packing projection; no dispatch |
| ShipmentReleaseApproved/ShipmentReleaseRevoked / Hub | shipment, release, COD revision, manifest ref | outbound dispatch eligibility/revoke |
| ShipmentHandedOver/ShipmentDelivered/DeliveryFailed/ReturnReceived / Logistics | shipment/parcel, custody/proof ref, due revision where relevant | finance/recovery/notification |
| CashCollected/CashHandedOver/CashReconciled / Finance | receipt/transfer/session, journal effect ref | cash projection/payable gate |
| FinancialJournalPosted/MerchantAccrued/ObligationPayable/DriverEarningsAccrued / Finance | journal/obligation, beneficiary scope | statement/payout projection |
| PayoutReserved/PayoutApproved/PayoutPaymentConfirmed/RefundApproved/RefundPaymentConfirmed / Finance | batch/item/attempt, effect ref | reconciliation |
| FinancialEffectPending/FinancialEffectCompleted / Finance | expected effect set/ref, completion | reconcile all sub-effects |
| CustomerResolutionRequired/CustomerResolutionAccepted/OrderAdjusted/OrderCancelled / Commerce | master, resolution revision | eligibility/release/recovery |
| operational exception opened/resolved, financial dispute opened/resolved / domain owner | issue, affected scope, blocking flag | safe hold/reconciliation |
| DriverShiftStarted/DriverShiftEnded/AvailabilityChanged / Dispatch | driver/shift revision | eligibility |

Names in table use grouped notation only; actual types distinct PascalCase. Canonical MerchantReadinessWithdrawn retains 0.3C name. Domain-specific exception names from B–G retained as typed events sharing envelope. Full payload schema registry, version compatibility and producer/consumer tests required before coding. No PII/OTP/cash secrets in generic event payload; authorized consumers fetch scoped facts.

## 10. Security and migration boundary

RLS on every exposed new table; default deny, backend object-level scope even service role; restrict SECURITY DEFINER search_path/EXECUTE grants; no public privileged RPC. Validate views security invoker or explicitly restricted access. Scope actor membership, assignment, hub and beneficiary, reject cross-tenant joins and direct privileged writes. Immutable history access limited, audit and data retention approved under D11. See ED-03 and next 0.3I.

Migration plan: ED-01 structural diff and writer matrix first; after explicit G0 implementation authorization create additive isolated migrations, nullable compatible fields, constraints/indexes with measured lock impact, backfill only approved nonhistorical required projections, staged validation, RLS/grants/RPC authority, generated type refresh and CI replay. Do not recreate retired B2B objects. Test empty replay and upgrade from pre-V2 snapshot with synthetic data, lock/rollback rehearsal and schema diff. No production DDL now. Separate staging project/credentials from production; no live copying of PII. Flags server-side default off; gate new intake, auto-dispatch and provider routing separately; keep existing V2 recovery/cash/return/payout readable and operable when intake disabled. Rollback by disabling new behavior and forward-compatible repair, never drop active custody or journals. Production changes require separate approved release and verified backup/restore. Existing Netlify deployment gate must be disabled for docs-only merges unless owner explicitly approves deployment; current variable state not verified by this task.

## 11. Traceability and acceptance

| Master test | Domain requirements (representative, not execution) |
|---|---|
| T01–T03 | CB01–CB07; TX01/idempotency/stock concurrency |
| T04 | CB08–CB10, MF03/MF14/MF17; TX02 |
| T05–T08 | DS01–DS14/DS16–DS17, MF08–MF10 |
| T09–T12 | MF07/MF11–MF13, HB01–HB22, DS15 |
| T13 | DA20–DA25/DA32, MF15 |
| T14–T15 | DA16–DA19, FA06–FA08/FA23–FA25, HB23–HB24 |
| T16–T18 | FA11–FA25/FA31–FA32, DA26–DA28 |
| T19–T20 | domain scope and legacy tests CB/MF/DS/HB/DA/FA |
| T21–T22 | all durable replay/crash cases plus load/restore rehearsal in 0.3I |
| T23 | actual device/field operations and finance sign-off, D03–D12 |

Additional unified requirements: UA01 full catalog diff and no unexplained structural drift; UA02 all shared writers audited for lock order/legacy scope; UA03 route registration collision and DTO contract tests; UA04 FK/tenant integrity and negative direct RPC/RLS tests; UA05 concurrent stock/assignment/bin/cash/payout races; UA06 event schema compatibility and replay; UA07 exact integer serialization and rounding; UA08 no duplicate V1/V2 economic effect/provider dispatch; UA09 all active custody and liabilities survive flags/rollback; UA10 clean full DB suite with documented TODO disposition. These are proposed requirements, not executed tests or gate closure.

## 12. Freeze blockers and next steps

D01/ED-01: complete read-only metadata diff local versus production (schema objects, types, defaults, nullability, constraints, indexes, policies, functions/signatures/definitions/config/owners/grants, triggers, views, extensions, migration versions), normalize environment-only differences and document each; no business rows/secrets. Confirm exact legacy writer inventory and reusable PK/FK types. ED-02 fault-injection proof for existing finance sentinel/early-exit risk, new transaction tests when authorized. ED-03 grants/definer review, ED-04 dependency reachability, ED-05 lint baseline no-new diagnostics, ED-06 retired host and operational acceptance remain open. Full registered API route audit, precise DTO schemas, state transition matrix, lock compatibility and physical schema specification still required; this document is the unified logical contract, not complete physical freeze. D02–D13 unresolved as master decision register; no speculative operational values. Next 0.3I Security, Staging & QA designs gates, evidence tasks and isolated environment; 0.3J roadmap/decision register/G0 adjudication. No V2-01–08 implementation before explicit authorization. G0 OPEN.
