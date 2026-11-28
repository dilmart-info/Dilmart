# DilMart 2.0 — Logistics Hub Capacity and Operations Policy

Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D03 and mandatory D11 customer privacy constraint.
Status: HOP-01–17 approved in project conversation. Physical site, staffing, throughput and legal details remain open. G0 OPEN / BLOCKED.
Authority: 07_COMMERCE_ORDER_CONTRACTS.md, 08_MERCHANT_FULFILLMENT.md, 09_INTELLIGENT_DISPATCH.md, 10_HUB_PARCEL_MANAGEMENT.md, 11_DRIVER_APPLICATION.md, 12_FINANCIAL_ARCHITECTURE.md, 14_SECURITY_STAGING_QA.md, 17_G0_APPROVAL_GATE.md. Related policy documents 25–30 pending independent PRs.

## 1. Approved principles
| ID | Policy |
|---|---|
| HOP-01 | Cross-docking and consolidation, not speculative inventory storage. |
| HOP-02 | One hub at launch. |
| HOP-03 | Design for future multi-hub support. |
| HOP-04 | Select site by merchant/customer distribution, routes and cost. |
| HOP-05 | Distinct operational zones. |
| HOP-06 | Digitally numbered racks and bins. |
| HOP-07 | Barcode-based parcel movement evidence. |
| HOP-08 | Allocate consolidation positions by capacity and availability. |
| HOP-09 | Packing only after complete eligible consolidation. |
| HOP-10 | Separate quarantine and returns areas. |
| HOP-11 | Restricted cash desk separate from parcel flow. |
| HOP-12 | Integrate hub capacity with Dispatch. |
| HOP-13 | Unsupported special handling classes excluded until qualified. |
| HOP-14 | Expand according to measured demand and capacity. |
| HOP-15 | Measure stage performance and costs. |
| HOP-16 | Field validation before site, space and equipment commitment. |
| HOP-17 | Mandatory customer identity protection and merchant isolation; no customer personal information disclosed to merchants. |

## 2. Hub operating concept
Internal pickup -> inbound dual acknowledgement -> inspection -> numbered consolidation group -> packing -> release approval -> outbound staging -> verified handover to exclusive assigned carrier -> delivery or controlled return. Scan is evidence, not custody transfer by itself. Preserve actual possession and original parcel IDs. No release until required eligible quantities are complete, inspected, customer decisions resolved, and shipment/COD versions current. One active bin allocation per group relationship, linked multiple bins when required, no unrelated group mixing. Release bins only after verified empty. Preserve quarantine, returns and exceptions independently.

## 3. Illustrative facility and staffing
Candidate 150 square metres, not a minimum or engineered floor plan:
| Zone | m2 |
|---|---:|
| Inbound | 20 |
| Inspection | 12 |
| Quarantine | 8 |
| Consolidation | 40 |
| Packing | 16 |
| Outbound | 18 |
| Returns | 8 |
| Cash desk | 8 |
| Operations | 10 |
| Facilities | 10 |
| Total | 150 |

Verify actual aisles, fire exits, access, safe loading, electrical/network reliability, security, accessibility, sanitation, insurance and applicable regulations before lease. Candidate site scoring: merchant travel 30%, customer travel 25%, road access 15%, cost 15%, security 10%, expansion 5%; hard safety/legal constraints precede scoring. No site selected. Use verified merchant points and representative customer demand, privacy-preserving aggregation, Baghdad river/bridge travel constraints and observed traffic.

Illustrative staff: hub manager 1, dispatcher 1, inbound/inspection 2, consolidation/packing 2, outbound/returns 1, cashier 1, support/exception 1; total 9 excluding drivers. Validate shifts, relief, segregation of duties, independent financial checker, safe workload and labor requirements. No hiring authorized. Candidate equipment: numbered shelves/bins, barcode scanners, label printers, scales, packing stations, protected cash counting/storage, computers, network/UPS and legally approved monitoring. No purchases or quotes obtained.

## 4. Capacity and backpressure
Measure orders, parcels, shipments, stops, volume, mass and handling class separately. Example: 200 masters/day x 2.5 parcels = 500 parcels/day; 10 hours = 50 parcels/hour average; 4-hour average dwell x 1.5 planning factor = 300 equivalent parcel positions; 40 positions/rack implies 8 racks rounded up. Illustrative steady-flow approximation, not peak proof or building sizing. Measure arrivals, dwell distribution, overnight backlog, quarantine/returns, fit and staging separately. Throughput is limited by slowest eligible stage, staffing and actual pickup/final-mile capacity. Reserve receiving capacity atomically and revalidate at assignment; stale or unknown capacity blocks unsafe new assignments. Preserve already collected custody and controlled recovery. Candidate pilot 25–75 masters/day, 80–120 m2; launch 100–250, 120–200 m2; growth 300–600, 250–500 m2; later multiple hubs if justified. These are hypotheses, not approved commitments.

## 5. HOP-17 — Customer identity protection and merchant isolation (mandatory D11 constraint)
The merchant must not receive or be able to retrieve customer personal information, directly or indirectly, through any DilMart-controlled merchant-facing channel. This protects customer privacy and the platform relationship. Applies to single-merchant and multi-merchant orders, pickup, delivery, external providers, returns, warranty/support and settlement. No merchant role, staff role, merchant API credential or support workflow may bypass this boundary. Mandatory legal disclosures, if any, require documented legal review and a separately approved narrowly scoped lawful procedure before affected service activation; no silent exception.

### 5.1 Data access matrix
| Data | Merchant | Pickup driver | Assigned last-mile driver/carrier |
|---|---|---|---|
| Customer name, phone, email, account ID, persistent customer identifier | Denied | Denied | Minimum necessary name/contact only; masked or relayed contact preferred; no email/account ID |
| Customer address, GPS, landmarks and delivery instructions | Denied | Denied | Necessary assigned delivery details only |
| Customer history, other merchant items, master basket | Denied | Denied | No unrelated history or competitor details |
| Own merchant items, quantities, SKU, safe packing instructions | Allowed scoped | Minimum operational information | Minimum operational information |
| Opaque scoped child/parcel reference | Allowed scoped | Assigned scope | Assigned scope |
| Merchant settlement and commission | Own only | Denied | Denied |
| Shipment COD | No master COD or cross-merchant totals | Denied | Current assigned amount only |

Hub and support roles receive strictly necessary task-scoped data; outbound labeling roles separately authorized. Finance receives only necessary financial evidence; privileged access audited. Customer identity not encoded in reference or barcode. No stable customer pseudonym enabling cross-order tracking by merchants. Merchant-facing dates, free-text and analytics must not expose identifiers or enable practical reidentification; use approved aggregation and suppression where needed.

### 5.2 Technical enforcement
Server-side explicit field allowlists for every merchant projection; backend object authorization, database RLS and restricted column/view/RPC grants together. RLS alone is not field isolation. Deny direct reads of customer/profile/address/payment records and joins through master orders, nested relations, storage or privileged functions. Never send raw customer data to merchant clients and hide it only visually. Check REST/PostgREST, GraphQL if present, RPC, realtime, exports, PDFs/invoices, notifications, search, error messages, logs, analytics, support attachments, cache, offline storage, browser network payloads and signed URLs. Scope cache keys, invalidate on role/session changes, revoke delivery access on assignment end; prevent stale access. Privacy-safe logs and audit without raw PII. No unrestricted service-role credentials in clients. Opaque IDs are not authorization.

### 5.3 Physical operations and communication
Merchant-origin parcel labels contain opaque parcel reference, merchant/origin reference and DilMart hub routing only; no customer name, phone, address, GPS, master COD or customer identity in printed text or barcode/QR. Final-mile label produced at hub after consolidation with minimum approved information; no merchant access to outbound labels. Remove or cover customer-identifying outbound labels and redact return evidence before merchant handback. Customer communications, disputes, returns and warranty coordination routed through DilMart support; no direct customer contact details passed to merchant. Screen free-text and attachments for unintended PII; do not rely on automated redaction alone. External carriers receive only necessary assigned shipment data under approved contract, no onward disclosure to merchant, no independent marketing use; retention/revocation controls and evidence required. No assumption masked calling is available; verify capability and use approved safe fallback before activation.

### 5.4 Acceptance and release gate
| ID | Scenario | Required result |
|---|---|---|
| HP01 | Merchant opens own child order | permitted operational fields only; no customer PII |
| HP02 | Merchant attempts master join, profile/address lookup, another merchant object or guessed ID | denied without revealing existence or PII |
| HP03 | Direct DB/API/RPC/realtime access under merchant token | no customer fields or unauthorized rows |
| HP04 | Export, invoice, push, email, error, search, attachment or report | no merchant-visible customer identifiers |
| HP05 | Merchant prints/scans/reprints inbound label | opaque reference only; lookup remains scoped |
| HP06 | Return label, proof photo or support note | customer identifiers removed before merchant disclosure |
| HP07 | Pickup driver accesses destination/contact | denied |
| HP08 | Assigned last-mile actor accesses unrelated or completed shipment | denied after authorized access window |
| HP09 | Merchant switches role/session or reuses cached URL | no stale cross-role or customer data exposure |
| HP10 | External carrier attempts merchant onward disclosure | prohibited by contract and tested controls where technically enforceable |
| HP11 | Single-merchant versus multi-merchant flow | identical identity-protection boundary |
| HP12 | Canary synthetic customer PII across every merchant surface | zero unauthorized disclosure; any failure blocks release |

No real customer data in QA fixtures. PRE-G0-10 must specify exact allowlists, grants, DTOs and route audit. PRE-G0-05/ED-03 must review database exposure. G5 independent security/negative-access proof and G6 operational label/return checks required. Any confirmed customer disclosure to merchant is a critical privacy incident: restrict affected access, preserve evidence, investigate and reconcile, approve resumption only after independent proof. No claim that current legacy or V2 implementation already meets this policy; legacy exposure must be audited, and affected launch paths must not be accepted without remediation.

## 6. Gate disposition
HOP-01–17 approved design principles. D03 site, capacity, staffing, equipment and hours remain OPEN pending field evidence. HOP-17 is binding input to D11, PRE-G0-10, security and acceptance gates; D11 legal, retention, provider and privacy implementation evidence still open. D12 targets pending. No runtime changes, DDL, production access, property lease, purchases, hiring or deployment. G0 OPEN / BLOCKED.
