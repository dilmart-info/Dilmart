# DilMart 2.0 — Phase 0 Repository Audit & Gap Analysis

Date: 2026-11-25
Baseline: main @ 10d11c0d79cf8e3597723fbf296b9cf90bcb2979
Reference: [00_MASTER_SPEC.md](00_MASTER_SPEC.md)
Verdict: STATIC REVIEW COMPLETE FOR INSPECTED SCOPE; G0 NOT CLOSED; IMPLEMENTATION NOT AUTHORIZED BY THIS REPORT.

## Method and limitations
Read-only GitHub tree inventory and targeted source inspection, including governance, checkout, orders, finance, shipping, Jenni, event processing, native boundary, and CI configuration. Tree returned 2,290 entries without truncation, 31 backend module directories, 185 blobs under migrations including rollback files, and 248 matching test filenames. These are inventory counts, not pass counts. No local checkout/build/test execution, live DB inspection, deployment verification, full migration replay, or real-device QA performed. No production writes. Findings about missing capabilities mean not established in inspected files; confirm full schema before introducing tables. Main does not yet contain the V2 master spec at the baseline; documentation PR is separate. Source links below refer to main at audit time; use baseline SHA for reproducibility.

## P0 governance and environment blockers
- [governance/MASTER_SPEC.md](../../governance/MASTER_SPEC.md) section 4, [ai/AGENTS.md](../../ai/AGENTS.md) section 4 and [ai/QA_CLOSURE_GATE.md](../../ai/QA_CLOSURE_GATE.md) Gate 2 enforce single-merchant launch. [CLAUDE.md](../../CLAUDE.md) prioritizes existing governance; [governance/CURRENT_PHASE.md](../../governance/CURRENT_PHASE.md) says no active implementation phase. Owner-approved governance alignment is required: preserve single-merchant invariant per child order and allow multi-merchant master checkout exclusively under V2 flag. Preserve legacy tests, environment and all safety rules. Do not silently override existing instructions.
- [ai/ENVIRONMENT_SOURCE_OF_TRUTH.md](../../ai/ENVIRONMENT_SOURCE_OF_TRUTH.md) and [AGENTS.md](../../AGENTS.md) explicitly state Store has no separate staging. Never use main booking-platform staging or production for Store. Provision isolated Store staging only with approval; local disposable Supabase for initial checks. Verify repository, branch, Render, host, project ref and role privately before any remote change.
- Public repository: avoid publishing PII, contracts, credentials or infrastructure identifiers. Existing governance contains identifiers; recommend separate exposure review, not a claim of leaked credentials.

## Evidence-based reuse matrix
| Domain | Evidence | Decision | Priority |
|---|---|---|---|
| Identity and scope | auth, profiles, merchant-users, scope-resolver modules; orders.controller.ts L92–98 | reuse; add driver/hub/cashier scopes | P0 |
| Merchant and catalog | merchants, products, inventory, commercial agreement tests | reuse; pickup-location readiness and activation extensions | P0 |
| Cart | src/lib/cart-store.ts L133–134 rejects different merchant; persisted activeMerchantId | extend grouped cart with versioned persistence, coupon scope; preserve legacy | P0 |
| Checkout | backend/src/modules/checkout/checkout.service.ts L99–113 single merchant, L217–232 Jenni pricing, L241–247 conditional attempt requirement | retain server validation; new atomic parent+children command; mandatory V2 idempotency | P0 |
| Stock/RPC | supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql L195–255 row locking and stock decrement, L362+ idempotent RPC | reuse validated logic; deterministic lock ordering across merchants; new transaction wrapper, never N independent RPC calls | P0 |
| Merchant decision | orders.service.ts L499–514 acceptance update; rejection L533+ | adapt accepted vs ready and durable ready event; confirm exact notification/stock side effects | P0 |
| Delivery | shipping/delivery-operations.service.ts L35–47 transition rules, L73–77 order grain, L130–143 RPC, L195+ assignment | retain legacy path; separate parcel/task/custody/shipment domain | P0 |
| Driver | src/pages/AgentOrders.tsx; orders.controller.ts L92–98 and L185–215 | reuse scope and UX patterns, new task-grain driver app | P0 |
| External provider | jenni-dispatch.service.ts L35–39 flag, L267+ dispatch, L375+ local failure recovery; checkout pricing hardwire | provider adapter, explicit fulfillment selection; prevent dual dispatch | P0 |
| Cancellation and returns | order-cancellation.service.ts L29–59 atomic cancellation call; order-returns.service.ts L106–199 Jenni-specific checks | adapt to physical custody and partial item allocations | P0 |
| Merchant finance | order-finance.service.ts L198–242 keys, L254–279 accrual, L393–440 payable transition | reuse commercial snapshots and ledger principles; verify atomicity and reconcile shipment allocation | P0 |
| Courier finance | courier-finance.service.ts L124–171 order accrual, L389–452 batch writes | adapt job-based earnings; audit multi-write recovery/concurrency; no duplicate liabilities | P0 |
| Events | domain-event-bus.service.ts L7–29 in-memory handlers; jobs.service.ts L225–296 notification outbox; outbox-worker.test.mjs | reuse durable pattern; logistics event outbox, not merely in-memory bus | P0 |
| Admin | DeliveryOps.tsx, DeliveryIntelligence.tsx, Agents.tsx, FinanceReconciliation.tsx and admin finance pages | extend control tower and hub operator surfaces | P0 |
| Mobile | package.json Capacitor 8.4.2; scripts/mobile/check-mobile-bundle-boundary.mjs L76–80 excludes AgentOrders/admin/merchant | preserve customer boundary; independent driver artifact, choose stack after device spike | P0 |
| GPS/dispatch | no complete dynamic dispatch/geofence/route system established in inspected tree | new PostGIS shortlist, provider ETA, offers, batching, manual fallback | P0 |
| Hub/package | no complete physical parcel custody/consolidation workflow established | new scan/manifest/bin/packing domain | P0 |
| Finance cash custody | existing order COD is not proof of driver shift cash custody | add custody and allocation on verified ledger foundation | P0 |
| Intelligence | admin/delivery-intelligence.service.ts and M21 migrations | reuse read-only analytics; deterministic dispatch metrics, no LLM for assignment | P0/P1 |
| CI | .github/workflows/ci.yml, package scripts, DB integration tests | retain all guards; add V2 test matrix | P0 |

## Critical design invariants
1. One parent checkout, each child has exactly one merchant; stock and monetary snapshot creation atomic. Idempotency mandatory for V2, scoped to actor and request hash.
2. Existing child orders remain authoritative for merchant financial grain; no fake child delivery at pickup/hub receipt. Final shipment delivery allocates only fulfilled items, sum conserved.
3. Order, parcel, pickup job, outbound shipment, assignment, custody and payout are distinct states. Physical custody handoff cannot be simulated by reassignment.
4. Merchant acceptance may preplan; readiness event creates eligible pickup work. Batch parcels by physical pickup location and compatible time window.
5. Assignment must be transactional and concurrency safe; routing failure creates visible manual queue. No duplicate task, parcel release, COD or payout.
6. Explicit provider ownership and idempotency protect against simultaneous internal/Jenni dispatch. External fallback is not automatic when custody already acquired.
7. Finance transitions must be atomic or recoverable via durable reconciliation. Sequential service calls observed are review targets, not proven defects.
8. New V2 flags off; legacy paths remain operational; no destructive backfill or global rewrite.

## Proposed implementation slices and dependency graph
- G0-A governance PR: owner-approved V2 phase, explicit old/new invariants, QA gates and references; no runtime edits.
- G0-B local baseline and schema audit: full migration/RPC/RLS inventory, route/caller map, existing tests with disposable local environment, fixture and rollback plan. Staging provisioning separate authorized action.
- G0-C freeze contracts: parent/child, quantities/discount/fee allocation, inventory policy, readiness, parcel/shipment/custody, cash and provider state ownership. Close D01–D13 as applicable in master spec.
- V2-01 additive schema and contracts (single migration owner), feature flags, access policies.
- V2-02 atomic checkout and customer/merchant projections (depends V2-01).
- V2-03 provider abstraction + package/task/custody + readiness/outbox (depends V2-01).
- V2-04 dispatch, GPS and driver offers/batching (depends V2-03).
- V2-05 hub intake, consolidation and outbound manifests (depends V2-03).
- V2-06 driver mobile and control tower integration (contracts frozen; integrate V2-04/05).
- V2-07 finance allocation, COD cash custody, reversals, returns and payouts (depends V2-01/02/03; validate with 05/06).
- V2-08 end-to-end QA, field pilot, deployment authorization. No shortcut through failed money/custody/security gates.

## Verification plan (not executed)
First read root governance, domain skills, all scripts and environment guards. Use clean worktree pinned to baseline, no live credentials. Inspect install scripts and DB test setup before execution. Run frontend npm ci/build/test/arch:guard/auth:guard/lint, backend npm ci/build/test:policy/test:commercial/test:launch-critical, local-only migration replay and test:db-integration, mobile build and mobile:boundary. Existing test files include checkout-idempotency, checkout-concurrency, stage-b-place-order-behavior, p1-agent-delivery-scope, p1-2b-finance-invariants, p1-6-payout-batch-atomic, p1-6a-payout-eligibility, order-cancellation-atomic, returns-refunds, jenni-dispatch-gate and outbox-worker. Verify script presence and prerequisites. Do not execute tests named live or with remote credentials. Record exact commands, output, commit, target identity, baseline failures and reviewer. Add master spec T01–T23 coverage; include fault injection between financial writes and provider acceptance/local update, concurrent dispatch acceptance, duplicated scans, partial cancellation, stock contention and offline mobile recovery.

## Decisions and owners before G0
Product owner: authorize V2 governance transition, scope and launch cohort; policy for rejection/partial fulfillment, delivery fee/discount distribution and external fallback. Finance: confirm fee, commission, cash limit, collection allocation, driver earnings, payout and reversal rules. Operations: hub location and capacity, pickup points, driver staffing, hours and cutoffs. Engineering: schema inventory, migration owner, staging plan, routing field benchmark and mobile spike. QA: baseline evidence and performance targets. Actual merchant readiness and fleet numbers remain unverified.

## Closure
PASS for targeted static inventory and documentation deliverable only. G0 remains OPEN. No claim of production readiness, full code coverage or passing tests. No runtime code, database, deployment or governance changes included. Next action is approved governance alignment and isolated local baseline/schema verification; then revise master spec to v1.1 and freeze contracts. Public-safe report; sensitive operational details remain in authorized private systems.
