# DilMart 2.0 — Security, Privacy and Legal Policy
Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D11
Status: PRIV-01–22 owner-approved design principles in project conversation. Legal, retention, insurance and implementation evidence remain open. G0 OPEN / BLOCKED.
Authority: 07_COMMERCE_ORDER_CONTRACTS.md, 08_MERCHANT_FULFILLMENT.md, 09_INTELLIGENT_DISPATCH.md, 11_DRIVER_APPLICATION.md, 12_FINANCIAL_ARCHITECTURE.md, 14_SECURITY_STAGING_QA.md, 17_G0_APPROVAL_GATE.md. HOP-17 in pending PR #76 and OPS-11 in pending PR #77 are independent related owner decisions.

## 1. Approved principles
| ID | Policy |
|---|---|
| PRIV-01 | Mandatory prohibition of merchant access to customer personal information. |
| PRIV-02 | No customer PII disclosure through merchant API, database or reports. |
| PRIV-03 | No customer PII on merchant-origin parcel labels. |
| PRIV-04 | Customer communication, returns and warranty coordination through DilMart. |
| PRIV-05 | Contractual controls against misuse of customer data and circumvention, subject to lawful proportionate terms. |
| PRIV-06 | Delivery data scoped to assigned task and necessary duration. |
| PRIV-07 | No off-shift GPS tracking. |
| PRIV-08 | Isolate merchant, employee and driver permissions. |
| PRIV-09 | Independent financial maker/checker. |
| PRIV-10 | MFA for sensitive administrative and finance accounts. |
| PRIV-11 | No shared employee accounts. |
| PRIV-12 | Audit sensitive administrative and financial operations. |
| PRIV-13 | Purpose-limited, legally reviewed retention. |
| PRIV-14 | Protect credentials, secrets and infrastructure. |
| PRIV-15 | Isolate development, staging and production. |
| PRIV-16 | Independent security tests before release. |
| PRIV-17 | Incident response and affected-path pause. |
| PRIV-18 | Separate agreements for each participant. |
| PRIV-19 | Liability determined by evidence, custody facts and contracts. |
| PRIV-20 | Study insurance and legal risk coverage. |
| PRIV-21 | Prevent external provider misuse of customer data. |
| PRIV-22 | Iraqi legal compliance review before commercial operation. |

## 2. Customer identity isolation
HOP-17 is a mandatory architecture and release constraint across single/multi-merchant orders, legacy paths, returns, warranty, settlement and external carriers. Merchant and pickup-only driver cannot receive customer name, phone, email, address, coordinates, account identifiers or persistent customer pseudonyms, history or other merchant data. Merchant receives own items, quantities, safe packing instructions, opaque scoped child/parcel references and own financial facts only. No master basket or master COD. Last-mile actor receives minimum assigned delivery details and current COD only during authorized task window; masked/relayed communication preferred, capability unverified. Hub/support/finance access task- and purpose-scoped, audited. Merchant cannot use support as a bypass. No customer PII on inbound labels, barcodes or QR; hub produces necessary outbound label, removes/covers identifying labels and redacts proof before merchant return. Customer remains free to shop independently. Contractual anti-circumvention must not restrict consumer rights or authorize surveillance. Any mandatory statutory disclosure requires legal review and explicitly approved narrow lawful procedure before affected service activates; no ad hoc bypass.

## 3. Technical and organizational controls
Explicit server-side DTO field allowlists plus RBAC, object authorization, RLS, restricted columns/views/RPC grants and definer search_path review. RLS alone is not field isolation. Deny joins and direct customer/profile/address reads by merchants. Audit REST/PostgREST, RPC, realtime, GraphQL if present, reports/exports/invoices, notification templates, search, errors, logs, cache, browser network payloads, offline queues, signed URLs, attachments and physical labels. Opaque identifiers are not credentials. No raw customer data sent then hidden by UI. Scope cache by identity and task, revoke and purge on authorization change; preserve unresolved critical evidence only through restricted recovery. No secrets or actual business records in public repo.
Separate super admin, operations, dispatch, receiver/inspector/packer, cashier, finance maker/checker/executor/reconciler, support, auditor, merchant owner/staff and assigned driver. No shared identities. MFA enforced for privileged administration and finance; recovery and service account controls tested. Maker cannot approve own payment/adjustment, including privileged override; independent review remains mandatory. Least privilege, session/device revocation, TLS, approved CORS/CSRF controls as applicable, rate limits, safe uploads, authenticated provider callbacks, dependency triage, secret rotation and isolated staging. Exact permission matrix, DTOs and grants PRE-G0-10; ED-03/04 evidence and remediation required before affected exposure.
Driver tracking active only on authorized shift, visibly indicated; stop on logout/end/revocation, no merchant location history or unrelated customer destinations. GPS not proof of handover. Minimize history and role-scope map access. Privacy-safe monitoring with correlation IDs and no raw contacts/GPS/OTP/secrets.

## 4. Retention and external processing
Define data inventory, purpose, owner, access, legal basis, retention, deletion/anonymization, backup expiry and legal hold. Orders and financial records subject to approved statutory/accounting retention; detailed GPS, delivery images, identity documents and security logs only justified duration. OTP short-lived, never raw in general logs. Account deletion must preserve mandatory records only in restricted form. Numeric periods and lawful procedures not yet approved. External carriers/payment/routing/hosting providers receive minimum necessary data, no independent marketing or onward merchant disclosure; contractual processing, subcontractor, cross-border, incident, access and deletion terms require review. No assertion of current compliance.

## 5. Legal documents required
LEG-DOC-01 customer terms; 02 privacy policy; 03 merchant agreement; 04 driver agreement; 05 external carrier agreement; 06 cancellation/return/refund policy; 07 COD/settlement policy; 08 employee confidentiality; 09 restricted products policy; 10 third-party data processing terms; 11 damage/loss liability policy; 12 security incident policy. These are proposed deliverables, not legal opinions or executed contracts. Iraqi counsel/accountant must verify applicable consumer rights, invoicing, tax, merchant-fund custody/payment licensing, employment/contractor classification, working hours, insurance, transport, data processing and cross-border requirements. No reliance on unverified law or waiver of mandatory rights.

## 6. Physical and financial liability
Operational custody follows verified merchant -> pickup driver -> hub -> last-mile driver or external carrier -> customer; returns have distinct chain. Custody is not automatic legal fault. Preserve evidence, investigate cause, apply approved contract and law. No automatic wage/COD deduction, arbitrary balance edit or broad unrelated hold. Merchant-owned funds segregated from company operating liquidity under approved legal/accounting arrangement. Study goods-in-transit, facility/contents, cash-in-transit, public liability, driver accident and cyber insurance; verify local availability, exclusions, limits and obligations. Driver-owned vehicle does not eliminate platform obligations. No policy purchased or legal finding made.

## 7. Incident and release controls
Critical unauthorized disclosure, financial/custody breach or privileged compromise: immediately restrict affected new access/activity, preserve evidence and safe recovery of existing parcels/cash, investigate, notify responsible roles and legally required parties under approved procedure, reconcile and independently approve resumption. No destructive reset or public disclosure of sensitive incident details. Test HP01–12 from HOP-17 with synthetic canaries; cover legacy/V2, merchant tokens, direct DB/API, reports, labels/returns, role switches, carrier scope and expired assignments. Supplemental tests: MFA/recovery and revoked sessions; maker self-approval denied; off-shift GPS stopped; secret/PII log scan; retention/deletion and lawful hold; provider scope/replay; isolated restore and reconciliation. Zero unauthorized disclosure and no unresolved critical/high security blockers at G5; operational legal/insurance and label checks at G6. Zero observed incidents alone not proof.

## 8. Gate disposition
PRIV-01–22 principles approved. D11 remains OPEN for actual legal counsel/accounting review, contracts, retention durations, insurance, provider terms and implementation evidence. Mandatory privacy constraint cannot be deferred for an exposed path. PRE-G0-10 exact contracts, PRE-G0-05/ED-03 and ED-04 security evidence, G5 tests and G6 legal readiness required. No code, DDL, production access, legal filing, insurance purchase, deployment or data processing change authorized. Next D08 mapping/routing constraints.
