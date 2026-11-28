# UI to API mapping (logical, NOT implemented route inventory)
Source: docs 11 and 13 at a661927fbfcb0e24e08feabc6c784c6a23ce6e23; existing global /api prefix. All relative paths below are proposed V2 contracts; route audit, DTO schema, auth and collision review remain open. No new API is authorized by this document.
| Screens | Proposed route in docs 11/13 | Notes |
|---|---|---|
| 07–10,43–44 | GET /driver/v2/session; POST /driver/v2/devices/register | auth/OTP mechanism, approval/update routes unresolved |
| 01,12–14 | POST /driver/v2/shifts/start; POST /driver/v2/shifts/end; POST /driver/v2/availability | shift eligibility, pause distinct; close exception unresolved |
| 02,15–16 | GET /driver/v2/offers; POST /driver/v2/offers/:id/accept or /decline | server expiry, TX04, online only |
| 19,26,28,51 | GET /driver/v2/route | scoped route/manifest projection; release/version guards |
| 11,13,52 | POST /driver/v2/location | telemetry sequence and actor scope; no stale replacement |
| 17,29 | POST /driver/v2/tasks/:id/arrive | arrival evidence separate from custody |
| 03,18,20–25,27,40 | POST /driver/v2/handovers/:id/acknowledge | counterpart-bound TX05/06/10; handover creation/manual lookup/return gaps |
| 04,30–33 | POST /driver/v2/shipments/:id/delivery-proof | TX11; OTP challenge, discrepancy handling and exact finance receipt schema pending |
| 38–39,47–48 | POST /driver/v2/shipments/:id/failure | only appropriate shipment failure; other exception/return/support endpoints open |
| 06,34–37,50 | GET /driver/v2/cash; GET /driver/v2/earnings; POST /driver/v2/remittances | TX12; receipt/history/earnings details unresolved |
| 05,41–42 | GET /driver/v2/operations/:id | own uncertain outcome recovery, no blind retry |
| 45–46,49,53–54 | session/route refresh where applicable | support/history/settings/device/push contracts open; local theme not authority |
Commands: actor from verified session, Idempotency-Key, canonical payload hash, expected_version and dependency versions, correlation ID, UTC timestamp. Exact IQD decimal strings, no JS float arithmetic. 200 replay original result; 201 create; 202 recoverable pending only; 400 malformed; 401 auth; 403/404 concealed unauthorized; 409 conflict; 422 business blocker; 429/503 bounded retry. Do not invent paths for missing routes. Backend owns financial/custody truth and durable effect identity separate from request UUID. Notifications and cache never override authoritative version. No direct Supabase privileged access.
