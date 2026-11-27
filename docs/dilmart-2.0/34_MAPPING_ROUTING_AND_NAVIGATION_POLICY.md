# DilMart 2.0 — Mapping, Routing and Navigation Policy
Date: 2026-11-27
Baseline: 920e2c8b6a0311ca6ca139a37b87bb274e562170
Scope: PRE-G0-11 / D08
Status: MAP-01–18 owner-approved design principles; provider, costs and field validation remain open. G0 OPEN / BLOCKED.
Authority: 09_INTELLIGENT_DISPATCH.md, 11_DRIVER_APPLICATION.md, 14_SECURITY_STAGING_QA.md, 17_G0_APPROVAL_GATE.md. HOP-17 and PRIV policies are related pending PRs.

## 1. Approved principles
| ID | Policy |
|---|---|
| MAP-01 | DilMart owns logistics decision authority independent of map provider. |
| MAP-02 | PostGIS for geospatial operations subject to technical approval. |
| MAP-03 | Unified map/routing adapter boundary. |
| MAP-04 | Google Routes first benchmark candidate, not exclusive commitment. |
| MAP-05 | Versioned configurable geographic zones. |
| MAP-06 | Geospatial shortlist before paid road-routing calculations. |
| MAP-07 | Driver selection by ETA, capacity, route impact and cost. |
| MAP-08 | Batch compatible ready parcels in pickup routes. |
| MAP-09 | Event-driven bounded replanning. |
| MAP-10 | Separate first-mile and final-mile routes at launch. |
| MAP-11 | Distinguish motorcycle and car routing constraints. |
| MAP-12 | Monitor routing API usage and cost. |
| MAP-13 | Safe fallback for routing outage. |
| MAP-14 | No customer locations or full delivery routes disclosed to merchants. |
| MAP-15 | GPS tracking only during authorized shift. |
| MAP-16 | Baghdad field benchmark of routes and travel times. |
| MAP-17 | Shadow dispatch before active automation. |
| MAP-18 | Select final provider from measured quality and cost. |

## 2. Architecture and provider boundaries
PostgreSQL/PostGIS candidate for WGS84 points, polygons, indexed shortlist and coverage; extension availability previously observed, activation not authorized. Road routing adapter provides geocode/validate, matrix, directions, optional optimization with explicit supported modes, timestamps, quality/errors, distance and travel duration. DilMart owns assignment, eligibility, capacity, route insertion, custody and financial constraints. Navigation client consumes approved route or opens authorized external navigation; no third-party assignment authority. Google Routes first candidate; Mapbox, HERE, OSM/OSRM and OSM/Valhalla comparison candidates; OR-Tools potential future optimizer, not map provider. No current coverage, price, motorcycle or traffic feature independently verified in this task. Provider licensing, caching, data processing, quotas, SLA and hosting cost require verification.

## 3. Geographic eligibility and scoring
Versioned merchant/pickup/delivery/pricing/hub/restricted/external zones; define overlaps, boundaries, handling and operating calendar policy. Verified points, accuracy/freshness, active shift, vehicle mode, coverage, ready/release revision, available capacity, hub windows, cash exposure and committed stops are hard gates. Spatial distance is shortlist only, not road ETA. Preserve DIS weights hypothesis 35% ETA, 25% insertion impact, 15% workload, 15% deadline risk, 10% cost with normalized fixed bounds and stable tie break; no automatic selection with missing essential input. Sequential offers with soft reservations atomically converted on acceptance. Do not change actual custody by reassignment. No automatic mixed first/last-mile routes at launch.

## 4. Cost and resilient operation
Receive telemetry inside authorized backend; validate actor, shift, device, sequence, time and quality. Replan on relevant task/route/readiness/capacity/exception events, not every GPS update. Fetch bounded matrix outside DB locks and revalidate snapshot versions on commit. Proposed cost illustration 300 tasks/day * 50 candidates * 2 cycles * 30 days = 900,000 matrix elements; shortlist five = 90,000, 90% reduction in this simplified element model, not invoice or measured efficiency. Additional route legs, retries, geocoding, SKU and caching terms affect cost. Set provider quotas, budget alerts and bounded retry/circuit breaker; actual limits pending. On outage use permitted fresh evidence only or audited manual dispatch with unknown ETA, never fabricated road duration or bypass hard gates. Do not conflate routing fallback with carrier reassignment.

## 5. Privacy and device scope
HOP-17/PRIV mandatory. Merchant sees own location and relevant pickup progress only; never customer coordinates, delivery address or full route. Pickup driver sees assigned merchant/hub points, final-mile actor sees assigned destinations and necessary contact only in authorized window. Customer sees own progress, not other stops. Dispatcher scoped by operation. External map/carrier receives minimum necessary data under approved processing terms; no customer names/phones in routing requests unless separately justified and approved. No off-shift tracking; stop on logout/revocation, protect device queue and restrict location history under D11. No raw PII in logs or public repo.

## 6. Benchmark plan (proposed)
30–50 representative verified points, 100–200 routes, both banks of Baghdad, bridge crossings, peak/off-peak, car/motorcycle modes. Use approved synthetic/public points where feasible and authorized field participants; protect actual customer locations. Compare predicted to observed travel (absolute error, bias, p50/p95, sample coverage), route feasibility, mode restrictions, API error/latency/quota, total cost per task/order, privacy/licensing and operational burden. Same route/time/mode cohorts across candidates; no unsafe road trials or fictitious actual travel. Shadow mode no assignment, reservation, external dispatch or customer promise; compare eligible workload to manual baseline then separately approved pilot. Exact sample, thresholds, budget and devices pending.

## 7. Acceptance and gate
Test zone boundaries, stale GPS, incorrect mode, missing ETA, capacity/cash exclusion, concurrent offers, stale route versions, outage/manual recovery, no off-shift tracking, no merchant location disclosure and bounded cost. D08 design principles approved; provider choice, PostGIS activation, benchmarks, navigation integration, quotas and numeric telemetry criteria remain OPEN. G0 design contracts and safe deferrals required; actual field evidence at G3. D09 device spike, D11 privacy and D12 capacity dependencies remain open. No runtime, DDL, paid calls, provisioning or production operations.
