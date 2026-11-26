# DilMart 2.0 — Driver Application (Phase 0.3F)

Date: 2026-11-26
Baseline: ff9cee62c1528f44d506d3e2a5d3604419401126
Status: DRV01–DRV24 proposed for owner review; D09 OPEN; G0 OPEN.
Scope: documentation/design only. No app scaffolding, dependency installation, device execution, DDL, provisioning, production access, distribution or deployment.

## 1. Authority and baseline

Read [Master Spec](00_MASTER_SPEC.md) section 11, [architecture](06_SYSTEM_ARCHITECTURE.md), [commerce](07_COMMERCE_ORDER_CONTRACTS.md), [merchant fulfillment](08_MERCHANT_FULFILLMENT.md), [dispatch](09_INTELLIGENT_DISPATCH.md), [hub contracts](10_HUB_PARCEL_MANAGEMENT.md), [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md) and CURRENT_PHASE. PRs #55–59 merged. Root package.json verifies Capacitor core/android/ios 8.4.2, secure-storage 8.0.0 and network 8.0.1 in current customer toolchain. This is not evidence that background GPS, scanner or push requirements are satisfied. Existing AgentOrders is a legacy UI reuse reference, not a proven independent native driver app. Preserve legacy and customer mobile boundaries. No new runtime/device tests executed.

## 2. Decision register

| ID | Proposed direction |
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

No final logo, app identifier, plugin purchase, app-store account or distribution method selected.

## 3. Product scope and authority

One independent app with server-authorized pickup/delivery/hybrid modes; no separate apps per mode. Pickup: assigned merchant stops, parcel scanning, merchant handover, hub inbound receipt; no customer COD. Delivery: hub loading, customer stops, delivery proof, COD evidence, return and remittance. Hybrid permits both capabilities only if explicitly authorized; no automatic mixing of first/last-mile stops at launch per 0.3D. Mode changes require server approval and safe handling of existing custody/cash. Driver cannot self-grant roles or override shift, assignment, price or custody.

Identity owns actor/session/device; Dispatch owns offers/routes/assignment and capacity; Logistics owns custody/delivery; Hub owns receipt/release; Finance owns cash, due and earnings; Commerce owns resolution. App is a scoped command client, never source of authoritative business truth. No direct privileged Supabase writes or service-role key. Use server DTOs and versioned projections. Customer app, merchant/admin portals and Jenni paths remain unchanged.

## 4. Screen and interaction contracts

| Screen | Required information/actions |
|---|---|
| Sign in/device | approved auth flow, device registration, session status, support |
| Shift home | authorized mode, active shift, availability, GPS/network health, own custody and task summary |
| Offers | task scope, approximate verified ETA/unknown, stops, load, server expiry, accept/decline |
| Route | current route version, ordered stops, current/next stop, navigation, safe update indicator |
| Pickup stop | merchant contact/location, readiness, exact parcel manifest, arrival, scan, handover |
| Hub handoff | inbound/outbound manifest, parcel/shipment result, counterparty acknowledgement |
| Delivery | assigned destination/contact, shipment, due/version, proof, failure reasons |
| Cash | confirmed held cash, pending evidence, confirmed remittance, exposure alert |
| Returns | authorized reverse task, condition, custody acknowledgements |
| Earnings | finance-authoritative own accruals/payments, distinct from held cash |
| History/support | scoped task timeline, sync conflicts, contact support, privacy/settings |

Arabic RTL first, readable IQD totals, explicit status text, large controls, screen-reader labels and low-bandwidth fallback. No color-only critical state. Navigation deep links to approved apps only; show unknown ETA honestly. Avoid showing unnecessary merchant/customer data on offers, notification lock screen or history. Route changes presented at safe stop; no acceptance countdown interaction required while moving. Static UI examples are not final branding or an implemented app.

## 5. Identity, device and shift

Use existing identity infrastructure only after auth contract review; driver account provisioned/approved by operations. Explicit driver role, company, mode, hub/zone and device permissions. Device registration binds authenticated actor and installation identifier with revocation capability; possession of device ID alone is not authentication. Session tokens in platform secure storage; short-lived access and controlled refresh; TLS; no raw credentials in logs, analytics or barcode. Lost device/revoked actor blocks new protected operations and triggers dispatcher reconciliation of actual custody. Exact device limit/attestation policy pending D09/D11.

Shift start requires active authorized driver, approved vehicle/mode, capacity profile, permission/network checks and Finance opening cash facts when applicable. Availability is separate from shift active; pause/new-offer block does not discard accepted work. End shift checks open assignments, actual parcel custody, unresolved cash, pending critical operations and remittance. If unresolved, controlled close exception/escalation; never silently zero balances or clear custody. Safe logout must stop GPS, revoke/clear access and purge normal cached sensitive data; preserve unresolved critical evidence through approved restricted recovery, inaccessible to next user. Do not force destructive reset with pending operations. Re-login reconciles authoritative state before new work.

## 6. Telemetry and route execution

Follow 0.3D WGS84 telemetry envelope: actor-derived driver, shift/device/session, sequence, captured/received time, accuracy, coordinates, optional speed/source. Proposed active task cadence 15–30 seconds, adaptive idle, off-shift disabled. Exact thresholds, OS permission flows and retention pending field/privacy validation. Start foreground/background service only during authorized shift, visibly indicate tracking, stop when shift authorization ends. Handle denied/revoked permission, approximate location, battery saver, background suspension, reboot and process termination without falsely reporting fresh GPS. Stale location blocks automated new assignment, not custody. GPS not sole proof of arrival or handover.

Push is an untrusted wake-up hint, not task authority. Fetch current offers/routes on resume, reconnect and relevant events; discard expired/stale offers using server time. Offer acceptance online, idempotent and guarded against task/route/readiness/capacity changes. Decline and expiry handled by Dispatch. Cache only current authorized route and minimum manifest/contact; version every projection, apply monotonic updates; no local reordering of committed stops. Navigation and arrival may be reported separately from proof. No route acceptance or reassignment offline.

## 7. Parcel scan and custody

Opaque parcel/shipment codes from 0.3C/E, not authentication credentials. Validate symbology/check format once selected, assigned manifest, current code/version, hub/merchant location and actual condition. Scanning collects evidence, not automatic transfer. Duplicate scans deduped locally and server-side; wrong, unknown, damaged or stale parcel creates exception. Manual lookup uses same server validation and records reason. No fabricated barcode or bypass of manifest.

Merchant pickup: driver and merchant acknowledge same attempt/parcel set; server atomically validates and commits per-parcel custody. Hub inbound: driver and receiver acknowledge exact received parcels; discrepancy retains truthful physical custody. Outbound: scan assigned release-approved manifest/shipments, verify release and COD versions, hub and driver acknowledgement, atomic custody transfer. Partial handover tracks confirmed and remaining separately. Acknowledgement method candidate: authenticated counterpart confirmation or short-lived server challenge bound to attempt, actor, parcel set and expiry; field test before selection. Never reuse delivery OTP as custody credential. Uncertain offline physical possession invokes hold/reconciliation, not automatic reassignment.

## 8. Delivery proof and COD

Last-mile only. Fetch current assigned shipment, customer destination and Finance-authoritative due/version. Confirm valid custody, no blocking resolution, approved payment method. Default COD: no unattended drop, no arbitrary driver discount, partial delivery or amount adjustment. Customer OTP generated and validated server-side, bound to shipment/attempt and purpose, expiring, single-use, rate-limited; no driver pre-access, no OTP in logs/push/cache. Alternative proof (authorized supervised process, optional privacy-controlled photo) must be approved and audited; no automatic OTP bypass. No final proof length/TTL selected. Minimize photo/PII, restrict access and retention; consent/legal policy pending D11.

Record actual collected amount, expected due/version, shipment, payment method, proof reference, attempt and idempotency key. Normal COD completion requires exact approved due; discrepancy opens controlled exception rather than marking paid. If real money already received, record truthful evidence and block duplicate collection while reconciling. Final delivery, cash custody and durable finance effects require atomic or demonstrably recoverable contract (ED-02/0.3G); app never assumes success from button tap or offline capture. Retry after lost response queries original result before repeating physical action. Payment alternatives only via approved licensed providers/policy, no direct wallet assumed.

Failure reasons: customer unreachable/refused, wrong address, damaged shipment, safety issue, payment discrepancy and other approved reason. Record attempt, time, reason and evidence without unnecessary PII; retain custody until approved retry or return. No manual price edit or false delivered state. Return to hub via assigned reverse manifest and acknowledged receipt; merchant returns follow authorized workflow. Never restore stock from driver app.

## 9. Cash and driver earnings

Show separate confirmed cash custody, pending collection/remittance evidence, exposure limit status and Finance-confirmed earnings. Illustrative: 350,000 IQD collected minus 200,000 acknowledged remittance = 150,000 held cash, separate 25,000 earnings. These are not tariffs or limits. Cash remittance: create request, count with authorized cashier, match receipt and driver acknowledgement, Finance commits reconciliation; discrepancies remain open. Cash handover request alone does not reduce held balance. Do not deduct driver pay from COD without approved accounting policy. Exposure includes committed expected COD and active offer reservations under 0.3D; limit and remittance frequency D07. Earnings rates/eligibility D05, calculation and payout 0.3G. No local balances as authoritative ledger.

## 10. Offline queue and synchronization

Offline-first means usable read/evidence capture with safe recovery, not offline authority for assignment, cash or custody finalization.

| Operation | Offline behavior |
|---|---|
| Read current cached route/manifest | allowed within scope and expiry, visibly stale |
| Scan/evidence/attempt capture | encrypted pending evidence only |
| GPS samples | bounded queue with quality/time metadata; old samples do not replace fresh |
| Offer accept/decline, route reassignment | online authoritative command required |
| Final custody, OTP delivery, COD/remittance | online or separately approved supervised recovery; no automatic offline finalization |
| Price/amount adjustment, role grants | never a driver operation |

Queue envelope: operation UUID/idempotency key, actor/device/shift, command type, aggregate ID, expected version, canonical payload/hash, captured timestamp, local sequence, dependencies, status and retry metadata. Store minimum encrypted records; credentials separately in secure storage; choose DB encryption implementation after spike. Persist operation before network attempt; restore after process death. States: captured/pending, sending, acknowledged, retryable, conflict, rejected; no local confirmed before authoritative acknowledgement. Enforce ordered dependencies per aggregate, not indefinite global blocking. On reconnect refresh authorization and authoritative versions, query committed outcome when uncertain, then retry same key with bounded exponential backoff/jitter. Same key/different payload conflicts. 401/revocation stops sync pending authorized recovery, 409 becomes conflict, 429/503 bounded retry. Never silently rewrite stale physical evidence or drop unresolved critical operations when cache expires. Noncritical telemetry may be bounded/coalesced with declared loss; critical evidence capacity exhaustion blocks new work and escalates.

Offline physical action exception: do not instruct driver to proceed normally without required online confirmation. If possession or collection already occurred, preserve evidence, actual known physical facts and contact support; hold conflicting reassignment/collection until reconciliation. Recovery process must be approved by operations/finance and tested. Pending evidence not an authoritative ledger or proof. Encryption keys, backups and migration of queue across app update must preserve recoverability without exposing prior user's records.

## 11. Proposed APIs and events

Relative to existing API prefix; exact DTOs/collision audit in 0.3H. Reuse 0.3D/E and common command envelope rather than duplicate endpoints.

| Interface | Purpose |
|---|---|
| POST /driver/v2/devices/register | approved installation binding |
| GET /driver/v2/session | actor/mode/scope and current work |
| POST /driver/v2/shifts/start or end | guarded shift lifecycle |
| POST /driver/v2/availability | pause/resume new work |
| GET /driver/v2/offers | authoritative current offers |
| POST /driver/v2/offers/:id/accept or decline | expiring offer resolution |
| GET /driver/v2/route | current versioned route and manifest projection |
| POST /driver/v2/location | validated telemetry batch |
| POST /driver/v2/tasks/:id/arrive | arrival evidence |
| POST /driver/v2/handovers/:id/acknowledge | counterpart-bound scan/acknowledgement |
| POST /driver/v2/shipments/:id/delivery-proof | verified proof and COD command coordinated with Finance |
| POST /driver/v2/shipments/:id/failure | controlled failed attempt |
| GET /driver/v2/cash and /earnings | separate scoped finance projections |
| POST /driver/v2/remittances | request and evidence; not automatic settlement |
| GET /driver/v2/operations/:id | actor-scoped idempotent result recovery |

Use actor-derived identity, expected versions, server timestamps, correlation ID, stable error codes from prior contracts. Additional candidates DEVICE_REVOKED, SHIFT_NOT_ACTIVE, GPS_PERMISSION_REQUIRED, PROOF_INVALID, PROOF_EXPIRED, CASH_DISCREPANCY, SYNC_CONFLICT. Do not expose other drivers' payloads. Events: DriverShiftStarted/Ended, AvailabilityChanged, DispatchOfferCreated, RoutePlanUpdated, PackagePickedUp, PackageReceivedAtHub, ShipmentHandedOver, ShipmentDelivered, DeliveryFailed, ReturnReceived, CashCollected, CashHandedOver, CashReconciled. Domain owners emit authoritative events, not client. Push/realtime only signals; recover from API. RLS and backend scope both required.

## 12. Technology decision and technical spike (D09)

Preferred candidate from Master Spec: React Native + Expo development builds, not Expo Go as a claim of background capability. Alternative: independent Capacitor application reusing verified React/TS conventions, not embedding merchant/admin/customer app routes. Existing customer stack is Capacitor 8.4.2. No final selection or library compatibility claimed. Android-first; iOS follows readiness. Distribution must be lawful, approved and securely signed; controlled internal/managed pilot candidate, not assumed store exemption.

Compare both using same synthetic tasks, backend mock/isolated environment, device set and measurement protocol after separate authorization. No production credentials or real driver/customer records. Proposed criteria: background GPS and screen lock; battery per hour; recovery after process death/reboot; offline queue encryption/durability; scan accuracy/latency; push and API recovery; low-end device responsiveness; permission/OS compliance; build reproducibility, dependency maintenance and licensing; development effort and operational support. Hard gates for no lost critical evidence, no unauthorized tracking, no duplicate custody/cash effect and secure session isolation. Numeric performance thresholds and device/OS matrix require D09/D12 approval. Do not score either candidate without evidence. Document failures and mitigations; choose lowest operational risk among candidates satisfying hard gates. No spike executed, dependency installed or device reset by this package.

## 13. Acceptance requirements

| ID | Scenario | Required result |
|---|---|---|
| DA01 | revoked/unapproved device or role | protected access denied |
| DA02 | pickup driver attempts COD | denied server-side |
| DA03 | unauthorized hybrid/mode change | denied, current custody retained |
| DA04 | start shift with missing operational prerequisite | typed blocker |
| DA05 | GPS on active shift, screen locked | measured permitted behavior, no invented freshness |
| DA06 | off shift or revoked tracking permission | tracking stops; safe automation block |
| DA07 | stale/out-of-order telemetry | no overwrite of newer location |
| DA08 | push missed or app resumed | recover current tasks through API |
| DA09 | expired offer or offline accept | no assignment |
| DA10 | lost response after offer acceptance | same assignment, no duplicate reservation |
| DA11 | stale route update | preserve completed prefix; reconcile |
| DA12 | duplicate/unknown barcode | no duplicate custody; exception where required |
| DA13 | missing counterpart acknowledgement | no normal final handover |
| DA14 | partial merchant/hub manifest | exact per-parcel custody |
| DA15 | stale outbound release/COD | no unauthorized loading |
| DA16 | invalid/expired/reused OTP | no normal delivery confirmation |
| DA17 | valid proof and exact COD | one delivery/cash effect |
| DA18 | cash discrepancy or stale due | controlled exception; no duplicate collection |
| DA19 | failed delivery/return | traceable reverse custody |
| DA20 | capture offline evidence | visible pending, not confirmed |
| DA21 | process death/reboot with queue | pending critical evidence recoverable |
| DA22 | duplicate sync/lost acknowledgement | original committed result |
| DA23 | stale offline custody conflict | hold and supervised resolution |
| DA24 | auth revoked during sync | no unauthorized effects; protected recovery |
| DA25 | local queue capacity exhaustion | preserve critical evidence; block unsafe work |
| DA26 | remittance pending cashier confirmation | held cash unchanged |
| DA27 | earnings versus held cash | separate projections, no silent netting |
| DA28 | end shift with open custody/cash | controlled exception, no silent clear |
| DA29 | cross-driver/device/merchant data access | denied, no cache leakage |
| DA30 | Arabic RTL, accessibility, safe driving | representative UX verification |
| DA31 | low-end Android/battery/network conditions | measured results against approved thresholds |
| DA32 | app upgrade with queued operations | recoverable, no data loss or duplicate effect |
| DA33 | disable V2 intake/automation | active recovery retained |
| DA34 | existing customer/legacy agent/Jenni paths | no regression |

Requirements only, not executed tests. Map with CB/MF/DS/HB and master acceptance matrix in 0.3H/I. ED-01–06 remain open.

## 14. Open decisions and handoff

D05 driver roster, vehicles, shift and earnings rates; D07 cash exposure, remittance, approval and discrepancy policy; D08 navigation/routing provider; D09 mobile stack, OS/device matrix, secure storage, distribution and background GPS evidence; D10 timeouts/retries/failure and offline recovery SOP; D11 privacy, location/photo retention and legal constraints; D12 field pilot/load targets; D13 external provider fallback remain open. Confirm acknowledgement method with merchant/hub operations. Next package 0.3G Financial Architecture must define COD collection, cash sessions, reconciliations, driver compensation, merchant liabilities, payouts and adjustments as separate authoritative accounting effects. 0.3H reconciles schema/API/event/lock contracts. G0 OPEN. No implementation or deployment authorized.
