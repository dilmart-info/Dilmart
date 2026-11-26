# DilMart 2.0 — Hub & Parcel Management (Phase 0.3E)

Date: 2026-11-26
Baseline: af11cb97a1a0576f8c233849d65c11325998f8f1
Status: proposed HUB01–HUB20 for owner review; G0 OPEN.
Scope: design/documentation only. No implementation, DDL, provisioning, live access, deployment, equipment purchase or activation.

## 1. Authority and boundaries

Read [Master Spec](00_MASTER_SPEC.md) section 10, [architecture](06_SYSTEM_ARCHITECTURE.md), [commerce](07_COMMERCE_ORDER_CONTRACTS.md), [merchant fulfillment](08_MERCHANT_FULFILLMENT.md), [dispatch](09_INTELLIGENT_DISPATCH.md), [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md) and CURRENT_PHASE. PRs #55–58 merged. Existing order-level delivery and finance structures are reuse candidates only; no existing hub capability asserted. ED-01–06 remain open. No runtime tests executed.

Hub owns intake, condition verification, internal movement, consolidation, packing and release approval. Logistics owns physical parcel/shipment custody and manifests; use coordinated atomic commands, not competing state stores. Dispatch owns assignment and routes; Finance owns COD version, cash custody and settlement; Commerce owns eligible item quantities and customer resolution. No hub operator can change price, stock or customer consent directly.

## 2. Proposed decision register

| ID | Direction |
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

These are design proposals for review, not a claim of approved physical premises, equipment, operating rules or completed implementation.

## 3. Physical operating model

Areas: inbound receiving; inspection; numbered consolidation racks/bins; quarantine and separately identified returns; packing/labeling; outbound staging; physically restricted cash desk. Layout is conceptual, not construction or safety certification. Confirm site, access, fire safety, insurance, handling classes, secure storage, staffing, hours and equipment under D03/D11. Initially reject unsupported handling classes; do not assume cold chain, oversized or dangerous goods are supported.

Cross-dock flow: merchant parcel -> pickup driver -> inbound receipt -> inspection -> assigned bin -> consolidation -> packing -> release-approved shipment -> outbound staging/load -> delivery driver -> customer or controlled return. Preserve each original parcel identity and order-item allocation inside shipment. Hub is responsible custodian after acknowledged receipt; internal bin/operator movement does not imply a new external custodian.

## 4. Logical model and constraints

| Entity | Grain and purpose |
|---|---|
| hubs / hub_zones | physical center and operating areas |
| hub_bins | numbered physical location, capacity and status |
| packages / package_items | existing V2 logical parcel and item allocations from 0.3C |
| inbound_manifests / manifest_parcels | driver trip intake expectations and parcel results |
| custody_events / handover_attempts | immutable transfer evidence and current-custody projection |
| parcel_movements | append-only internal from/to location history |
| consolidation_groups | master order and fulfillment revision, expected set |
| bin_assignments | exclusive active bin-to-group assignment, multiple bins allowed for one group |
| packing_tasks | one active task per valid group/revision |
| shipments / shipment_packages | outbound unit, immutable versioned parcel membership |
| outbound_manifests / manifest_shipments | trip load list, version and individual outcomes |
| hub_exceptions | typed issue, custody evidence, owner, deadline and resolution |
| return_cases / return_manifest_items | authorized reverse-flow references |

Names are logical candidates, not SQL. Reconcile duplicates with 0.3C/D and existing catalog in 0.3H. Each physical parcel has one current custodian and one current physical location or explicit unknown-location exception. At most one active outbound shipment allocation per parcel. Every parcel in a shipment belongs to the same master and authorized destination. Every active bin assignment belongs to one consolidation group; a group may span multiple bins. No arbitrary deletion or duplicate active packing/release. Quantity conservation from order items to parcel allocations remains binding.

## 5. Inbound receiving and condition inspection

1. Identify assigned hub, driver, active manifest and version; verify authorized receiver.
2. Scan manifest and individual parcel IDs; match expected membership, current custody, hub and condition/seal.
3. Record driver acknowledgement and receiver acknowledgement linked to the same handover attempt. Finalize each parcel transfer atomically with custody event, manifest result, capacity release for driver and durable event; coordinate capacity projection with Dispatch.
4. Separate physical receipt from inspection clearance. Record inspection actor, timestamp, outcome, condition and evidence; do not equate received with sellable/eligible.
5. Assign verified consolidation bin or quarantine, scan parcel plus location and persist movement.

Partial receipt records received, missing, refused and disputed parcels individually. Driver retains custody of unreceived parcels unless another verified physical fact demands controlled correction. Unknown parcel held physically at hub receives a temporary exception identity and truthful custody record; never invent merchant/order linkage. Damaged parcel can be accepted into quarantine with condition evidence, not accepted as normal consolidation-ready. Do not silently mark manifest complete while unresolved parcels remain. Duplicate scan returns original result; same ID at unexpected location opens conflict. Lost response recovers authoritative state before retrying physical action. No external side effect before transaction commit.

## 6. Bins and movements

Allocate numbered bins dynamically by group and physical fit, not merchant. Reserve capacity atomically; do not assign same active bin to unrelated groups. Oversized group may use linked bins, all verified by scan. Movement requires scoped actor, expected current location/version, destination eligibility and capacity; update current-location projection and append history in one transaction. No negative occupancy, orphan parcel, or silent relocation. Bin release only after verified empty and all relevant movements committed. Quarantine is separate from eligible consolidation. Cycle checks and discrepancy reconciliation record physical count and expected count; supervised correction is an event, never overwrite history.

## 7. Consolidation completeness contract

Compute expected surviving quantity from authoritative accepted/eligible commerce facts and current resolution revision. Pending merchant decisions or unresolved partial cancellation prevent readiness; do not define expected set merely as parcels that happened to arrive. Resolve all surviving required line quantities into valid parcel allocations. For group revision r, readiness requires:
- all required merchant decisions resolved and all surviving required quantities fully allocated;
- nonempty expected parcel set E, exact valid allocation coverage, no missing/extra active membership;
- every parcel in E physically received at this hub, inspection cleared, located in approved group bins or approved packing staging, and held by hub;
- no blocking custody/quality/commerce exception or unresolved customer consent;
- current destination and commercial revision valid.

Compute using authoritative facts under a guarded transaction; recompute on receipt, inspection, movement, adjustment, readiness correction or exception resolution. Create at most one active packing task for the eligible revision, with a stable business key. Two workers reaching completeness concurrently cannot create duplicate tasks. If state changes, invalidate stale task or reopen via audited revision; retain history. Never release an empty all-rejected master. A split shipment is not a default escape hatch; requires explicit approved policy, customer consent, separate allocations and revised COD before release. No automatic partial delivery.

## 8. Packing and shipment release

Packing task claims an authorized operator lease; expiry may permit reassignment of work but never changes custody. Operator scans expected original parcels, verifies set, condition, destination and package requirements, creates stable shipment ID and distinct outbound label, records seal/weight/volume as required. Reprints preserve identity with audit. Retain original parcel IDs and item allocations; outer packaging is not an additional sellable parcel. No PII or cash amount encoded in barcode. Physical labels disclose minimum approved delivery information.

Separate states:
- consolidation_ready: eligible to pack, not eligible for dispatch;
- packed: verified shipment created, still hub custody;
- release_approved: authorized release gate confirms current manifest, inspection, no blocking exception, customer consent/destination revision and Finance-authoritative COD revision; emits ShipmentReleaseApproved for dispatch;
- assigned/staged: dispatch assignment and loading preparation, still hub custody;
- handed_over: verified outbound transfer to assigned driver; emits custody event and ShipmentHandedOver;
- delivered/returned: logistics outcome, not a hub manual status edit.

Release approval is not physical departure. Revalidate release/manifest/COD/assignment versions at handover, with capacity and scope checks. Changed due, address, consent, missing parcel or seal discrepancy invalidates release before custody; revoke stale offers via durable event. After handover, use explicit exception/return workflow, not state rollback. Duplicate release, packing or load commands must return original effect. Default one consolidated shipment per master; multiple only under approved policy. Finance owns final due and adjustment amounts.

## 9. Outbound manifests and custody

Dispatch proposes route with release-approved shipments. Hub sees assigned trip and exact versioned load manifest. Scan manifest, each shipment and required underlying parcel membership; where sealed outer package verification substitutes individual rescan, require approved verified packing evidence and intact seal. Receiver/operator and assigned driver acknowledge same transfer attempt. Commit shipment and component parcel custody coherently, manifest outcome, load capacity and durable event; no intermediate contradictory custodian. Partial load records exact loaded and remaining shipments; never mark omitted shipment as onboard. Driver route update respects completed stops, safe interaction and current route version. Cash exposure is checked by Finance/Dispatch before assignment and handover. No pickup-driver COD. No financial accrual from packing or loading.

## 10. Exceptions and returns

| Exception | Required handling |
|---|---|
| unexpected parcel / wrong hub | quarantine, truthful custody, identity reconciliation |
| missing parcel at intake | manifest discrepancy, driver custody investigation |
| damaged seal / damage | condition evidence, quarantine, authorized disposition |
| bin mismatch or lost parcel | suspend affected packing/release, physical reconciliation |
| merchant rejection after another parcel arrived | retain actual custody; await approved commercial resolution |
| stale packing/release version | invalidate and recheck; no duplicate shipment |
| capacity exhausted | block new unsafe reservations; escalate intake planning, preserve safe custody |
| refused/failed delivery | authorized return manifest, driver-to-hub receipt and inspection |
| customer return | authorized return case and custody trail, distinct identifiers linked to original |
| merchant return receipt | verified handover and approved inspection/disposition before stock restoration |
| offline/unconfirmed transfer | pending evidence and conflict hold, no silent reassignment |

Each exception records affected IDs, actual known custody, actor, type, severity, owner, opened_at, deadline, evidence and resolution. Quarantine does not automatically refund, cancel or restock. Finance owns reversals, Commerce owns stock compensation, Logistics owns physical custody. No disposal without authorized recorded disposition. Retain original forward history; returned parcel/label identity linked to original without pretending a second outbound sale.

## 11. Capacity and operating metrics

Capacity has several dimensions: inbound appointments and arrival peaks, staffed receiving/inspection/packing rates, parcel count/volume/weight per zone/bin, dwell, outbound staging and driver handover windows. Use common units when comparing stage throughput; packing measured per shipment must convert with observed parcels/shipment. Illustrative 150/120/140/90/110 parcels/hour yields bottleneck 90 parcels/hour before downtime; not a verified capacity target. Estimate average occupied parcel positions from arrival rate times average dwell (steady-state illustration), then separately model peak occupancy, heterogeneous size and exception stock. Never infer physical building size from this example.

Expose authoritative capacity snapshot with version, observed occupancy, reserved inbound capacity, estimated arrivals, staffed hours and freshness. Dispatch checks feasible hub receiving windows and capacity; no claim that an estimated arrival guarantees space. Atomic reservations prevent overbooking where applicable; reconcile actual arrival variance. Backpressure may delay new pickup plans or restrict new intake under approved policy; never abandon parcels already collected. D03/D05/D10/D12 define caps, service windows, staffing, dwell and alert thresholds.

Metrics: receipt accuracy = matched parcels / attempted receipts; inspection clearance and quarantine rates; dwell p50/p95 from confirmed receipt to outbound transfer; consolidation delay from first valid receipt to ready; packing cycle time; on-time release / shipments due including misses; bin occupancy by count/volume; unmatched/missing parcels and custody discrepancies; parcels per outbound shipment; return cycle time; queue age and capacity forecast error. Report cohort, time window, denominator, unknowns and exclusions. No fabricated SLA or throughput.

## 12. Portal, equipment, security and events

Existing admin portal extension proposed: inbound queue, scan station, inspection, bin map, consolidation board, packing station, outbound staging/load, exceptions/returns and capacity dashboard. Arabic/RTL first; clear scan result, manual lookup with same authorization, accessible large controls, low-bandwidth recovery. USB/Bluetooth scanner, camera and label printer are candidates; test actual devices and label readability before selecting standards. Offline evidence is pending until server confirms; local display must not falsely authorize release.

Roles: hub receiver, inspector, sorter/packer, release approver, dispatcher, assigned driver, returns operator, supervisor and cashier. Separate high-risk release/exception approval where staffing permits, never shared logins. Cashier cannot edit parcel status; hub operator cannot edit cash. Scope by hub, assigned task and actor; server validation and RLS, not UI only. Audit role/override, no unrestricted PII. Physical cash desk details in 0.3G.

Proposed API relative to existing prefix: GET /hub/v2/inbound; POST /hub/v2/receipts/:id/confirm; POST /hub/v2/parcels/:id/inspect or move; GET /hub/v2/consolidations; POST /hub/v2/packing/:id/claim or complete; POST /hub/v2/shipments/:id/release-approve; POST /hub/v2/outbound/:id/handover; GET /hub/v2/exceptions; POST /hub/v2/exceptions/:id/resolve. Names/DTOs reconcile in 0.3H. Every mutation uses actor-derived scope, idempotency, expected version, correlation and server timestamps. Typed errors: MANIFEST_MISMATCH, CUSTODY_CONFLICT, INSPECTION_REQUIRED, BIN_CAPACITY_EXCEEDED, CONSOLIDATION_INCOMPLETE, RELEASE_STALE, COD_VERSION_MISMATCH, BLOCKING_EXCEPTION.

Events: PackageReceivedAtHub, ParcelInspected, ParcelMoved, ConsolidationReady, PackingTaskCreated, ShipmentPacked, ShipmentReleaseApproved, ShipmentReleaseRevoked, ShipmentHandedOver, HubExceptionOpened/Resolved, ReturnReceived. ShipmentReleaseApproved is the precise release eligibility event for 0.3D; do not confuse with actual handover. Common versioned envelope; durable outbox committed with state, dedupe and reconciliation. No provider dispatch directly from scan. Legacy Jenni order paths preserved.

## 13. Acceptance requirements

| ID | Scenario | Required result |
|---|---|---|
| HB01 | verified inbound handover | one transfer with accurate manifest |
| HB02 | duplicate scan/lost response | original result, no duplicate transfer |
| HB03 | wrong hub or unknown parcel | quarantine and truthful custody |
| HB04 | partial inbound manifest | received and missing tracked separately |
| HB05 | damaged parcel or failed inspection | blocks normal consolidation |
| HB06 | concurrent bin assignment | no conflicting active assignment |
| HB07 | wrong bin/duplicate move | reject conflict or return original result |
| HB08 | group spans multiple bins | exact location and capacity tracking |
| HB09 | two of three required parcels present | no packing eligibility |
| HB10 | merchant decision still pending | no false completeness |
| HB11 | all required parcels inspected and present | one packing task |
| HB12 | concurrent completeness workers | no duplicate active packing task |
| HB13 | cancellation changes expected set | guarded revision and consent |
| HB14 | all rejected / empty eligible set | no outbound shipment |
| HB15 | unknown extra parcel in packing | block and reconcile |
| HB16 | duplicate packing/label reprint | stable shipment/parcel identity |
| HB17 | packed but not release-approved | no outbound dispatch |
| HB18 | COD/address/manifest changed after approval | revoke stale eligibility |
| HB19 | concurrent release and cancellation | one consistent outcome |
| HB20 | two drivers attempt outbound transfer | one valid custody transfer |
| HB21 | partial outbound load | exact loaded and remaining manifest |
| HB22 | offline unconfirmed transfer | hold/reconcile, no fabricated success |
| HB23 | failed delivery returns to hub | traceable reverse custody |
| HB24 | damaged returned goods | no automatic saleable restock |
| HB25 | hub at capacity | backpressure, safe treatment of existing custody |
| HB26 | wrong hub role or unauthorized scan | denied by backend and DB |
| HB27 | outbox replay/crash | no duplicate packing/release/assignment |
| HB28 | disable V2 intake | active parcel/cash recovery preserved |
| HB29 | legacy order/Jenni paths | no regression or duplicate dispatch |
| HB30 | shift close with unresolved parcels | explicit discrepancy and supervisor escalation |

Requirements only, not executed tests. Map to MF01–MF20, DS01–DS26, CB01–CB16 and master T01–T23 in 0.3H/I. ED-01 before DDL and clean full DB baseline before implementation acceptance.

## 14. Open decisions and handoff

D03 physical premises, staffing, equipment, operating hours and measured capacity; D05 vehicle/load and driver staffing; D06 partial/refund fee policy; D07 cash custody and exposure; D10 SLA, cutoff, exceptions and customer resolution deadlines; D11 privacy, handling, insurance and retention; D12 pilot targets; D13 provider fallback remain open. Barcode symbology, scan devices, sealing and acknowledgement method require field validation. No claim of commercial readiness. Next package 0.3F Driver Application must consume pickup and outbound manifests, handle safe offline evidence and explicit custody/returns, and coordinate Finance's COD rules. 0.3H will reconcile logical entity names, physical schema, API/event contracts and global lock order. G0 OPEN; no implementation or live operations authorized.
