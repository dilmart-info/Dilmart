# DilMart 2.0 — Commerce & Order Contracts (Phase 0.3B)

Date: 2026-11-26
Baseline: ad530229943f99e2afa724a9242ff00218586444
Status: C01–C12 approved by owner in planning; detailed design submitted for review. G0 OPEN.
Scope: documentation only. No runtime changes, migrations, deployments, production access or activation.

## 1. Authority and evidence

Read [Master Spec](00_MASTER_SPEC.md), [database proof](05_PHASE_0_2A_DATABASE_PROOF_REPORT.md), [system architecture](06_SYSTEM_ARCHITECTURE.md), and governance/CURRENT_PHASE.md. PR #55 merged. The following evidence is from the baseline source, not newly executed tests.

| Existing source | Evidence | V2 treatment |
|---|---|---|
| src/lib/cart-store.ts:133–134, 298–306 | Single merchant guard and persistence sanitation | Separate versioned V2 cart; preserve legacy |
| backend/src/modules/checkout/checkout.controller.ts | preview, authenticated submit, actor-scoped attempt status | Add versioned V2 contracts |
| backend/src/modules/checkout/checkout.service.ts:109–113 | Reject mixed merchants | Preserve for legacy; new grouped validation |
| checkout.service.ts:187–232 | Coupon validation and direct Jenni pricing | Scope promotions; independent provider pricing |
| checkout.service.ts:241–247, 349–403 | Optional attempt key; existing single-order RPC | Mandatory V2 key and single atomic master command |
| checkout.service.ts:273–340 | Points, discounts and financial snapshot | Preserve applicable rules only after D02/D06 approval |
| backend/src/modules/finance/order-finance.service.ts:42–112 | Commission types, fees and rule snapshots | Versioned integer-IQD V2 contract; no retroactive recalculation |
| 05_PHASE_0_2A_DATABASE_PROOF_REPORT.md | Stock rollback, idempotency concurrency, returns tested cumulatively | ED-01/02 and clean full DB suite remain open |

No restoration of Stage B retired federated/cart tables. No new schema names are guaranteed to exist or be conflict-free until 0.3H and ED-01.

## 2. Owner-approved direction

| ID | Decision |
|---|---|
| C01 | Multi-merchant customer cart |
| C02 | One master order, merchant-specific child orders |
| C03 | Reuse existing orders for children subject to structural and compatibility proof |
| C04 | Atomic master checkout, including all child stock and snapshot effects |
| C05 | Decrement saleable stock at successful checkout; compensating movements on eligible cancellation |
| C06 | Mandatory idempotency for V2 checkout |
| C07 | One customer delivery charge for the default consolidated shipment |
| C08 | Exact integer-IQD allocation and conservation |
| C09 | Rejection/cancellation via audited compensating commands |
| C10 | Master status derived from child and fulfillment facts |
| C11 | Preserve historical orders and snapshots; no forced conversion |
| C12 | Default-off V2 flags; preserve legacy paths |

Specific policies and thresholds remain unapproved: D02 promotion/loyalty rules, D06 fees/commission/funding/refunds, D10 resolution and SLA windows, D13 fallback provider. C05 approves stock strategy, not all of D02. No illustrative price is a live tariff.

## 3. Aggregate and entity model

| Logical entity | Grain / identity | Required relationships |
|---|---|---|
| master_orders | One checkout, one customer, one currency, one delivery destination snapshot | At least one child; one successful attempt |
| orders | One child per master and merchant at initial launch | Nullable master link for legacy; exactly one merchant; one approved pickup location at launch |
| order_items | Product snapshot and quantity within child | Product merchant must equal child merchant |
| checkout_quotes | Versioned quote owned by customer/session | Canonical cart hash, expiry, rule versions, allocation snapshot |
| checkout_attempts | Actor-scoped operation key and request hash | At most one committed master result; legacy namespace separate |
| stock_movements | Product/line/effect/reason | Unique effect key, original movement reference on compensation |
| order_allocations | Monetary component by master/child/line as applicable | Stable allocation key, funding and beneficiary dimensions |
| order_adjustments | Immutable commercial delta and reason | Original snapshot, resolution version, approving actor |
| order_state_events | Ordered aggregate version and event ID | Actor, reason, correlation and causation |
| outbox_events | Durable event and business dedupe key | Created in same transaction as authoritative change |

Names are logical proposals, not DDL. Multiple pickup locations per merchant may require child grouping by merchant+location later; initial rollout restricts checkout to a verified single pickup location per merchant. No mixing currencies, no negative quantity, no cross-merchant child lines. Package and shipment allocation belongs to logistics contracts; one line may span packages without exceeding ordered quantity. Master reference is opaque, not authorization.

## 4. Cart and quote

Cart is a customer convenience, not inventory or price authority. Version persisted state and isolate legacy/V2 namespaces; import eligible legacy items without silently discarding customer choices. Preserve original legacy cart when feature disabled. Display merchant groups, quantities, item price, discount, single delivery fee, promise window and ineligible reasons in Arabic/RTL. No customer-facing merchant commission details.

V2 quote input: item product IDs and positive integer quantities, destination/address pin reference, optional coupon codes, requested points, surface and cart version. Normalize duplicate product IDs or reject invalid duplicate input consistently. Resolve actor from trusted context; do not trust client merchant, price, eligibility, stock, fee or totals. Initial submit remains authenticated, consistent with existing checkout; anonymous browsing/cart may continue, guest checkout not assumed.

Quote response: quote_id, quote_version, expires_at, currency IQD, normalized item groups, immutable pricing/discount/funding preview, delivery quote/provider policy version, total, availability and typed blockers. Quote is not a reservation. Server revalidates eligibility, merchant active status, product visibility, quantity limits, price, promotion limits, points and destination at submit. Changed terms require explicit requote/confirmation; never silently charge higher. Expiry duration and quote caps are configurable and pending approval. No external routing call while holding transaction locks.

## 5. Atomic submit contract

Proposed command: POST /checkout/v2/submit with authenticated actor, Idempotency-Key, quote_id, quote_version and explicit accepted total. Bind address/policy/fulfillment choice in canonical request hash; do not accept client-side financial overrides.

Transaction requirements:
1. Acquire or resolve actor + operation + key uniqueness. Same key/hash and committed result returns original master even if quote has since expired. Same key/different hash returns conflict. Concurrent same-key requests serialize or return retryable in-progress state.
2. Lock/revalidate quote and authoritative rules; lock products and relevant promotion/loyalty records in deterministic order. All other writers (legacy checkout, stock edits, imports) must use compatible locking/atomic predicates; no read-then-write oversell.
3. Reject stale quote, changed price, insufficient stock, invalid merchant, unsupported destination or funding inconsistency with no business effects.
4. Create master, all children, lines and frozen price/commercial snapshots.
5. Decrement saleable stock exactly once; record line-level stock movements; consume coupon/points exactly once at approved scope.
6. Persist allocations, initial state facts and outbox events; store committed attempt result atomically.
7. Commit once. Any injected failure before commit rolls back business effects. A lost response after commit must be recovered through original key/status lookup.

Do not orchestrate separate child RPC commits from JavaScript. A failed transaction may be recorded outside the business transaction only as a diagnostic/retry status; it cannot claim a committed order. No external notification, provider dispatch or cash side effect before commit. No key reuse for a different basket. Retention and in-progress lease semantics to be specified in 0.3H; retries must not outlive dedupe protection silently.

## 6. Inventory contract (C05)

At successful checkout, reduce saleable quantity, not physical custody. Quote alone does not change stock. The merchant prepares committed items; inventory adjustment must not consume quantities already sold. Rejection or authorized pre-custody cancellation creates a compensating stock movement tied to original decrement and quantity. Concurrent cancel/reject commands must not double-restock. After physical pickup, no automatic return to saleable stock: return receipt, inspection and authorized disposition precede restock. Damaged/missing goods require explicit inventory disposition. Partial item quantity compensation cannot exceed original uncompensated quantity. Preserve existing stock semantics for legacy orders. Test last-unit concurrency across V1 and V2, merchant stock updates, failure after first child and repeated cancellation.

## 7. Lifecycle and resolution

Separate merchant commercial/preparation status, parcel custody, shipment status, customer resolution, and financial status. Names below are logical, not database enum migrations.

| Child command | Preconditions | Effect |
|---|---|---|
| accept | pending, authorized merchant, current version, deadline valid | accepted, estimated ready_at, durable event |
| begin preparation | accepted | preparing |
| ready | accepted/preparing, package expectations known | ready_for_pickup; emit readiness once per revision |
| reject | pending; reason required | rejected, eligible stock compensation, customer resolution needed |
| cancel | authorized policy and custody check | cancelled or cancellation request; no direct custody rollback |
| pickup/hub/fulfill | verified logistics facts | derived fulfillment progress; no merchant direct overwrite |
| return | approved return workflow | return facts, finance/inventory compensation only after guards |

Master projection precedence proposal: terminal all-cancelled if no active/delivered quantity and all resolutions settled; delivered only when all surviving required shipments delivered and no blocking resolution; partial outcome if some original quantities were cancelled/rejected/returned; active exception or customer decision visible independently; otherwise derive pending confirmation/preparing/collecting/consolidating/ready/out-for-delivery from slowest blocking required stage. Represent progress and exceptions separately so a delayed child does not conceal physical custody of another. Exact mapping and terminal return semantics in 0.3H. Projection rebuild must be deterministic and replayable.

Merchant rejection: preserve accepted children, open resolution, notify customer of exact revised basket/price/fee/promise. Proposed customer choices are accept remainder or request full cancellation subject to custody; no silent substitution, split delivery or increased fee. Pause outbound release until required decision. Pickup already assigned or collected is managed via custody-aware logistics commands, not erased. Resolution deadline, defaults, whether preplanning/pickup may continue and compensation funding require D06/D10 approval. Safe unresolved behavior: block new outbound release and escalate to operations; no indefinite unattended state. All-rejected order cannot generate delivery or COD.

## 8. Money invariants and illustrative allocations

IQD amounts are integer in the V2 contract. Use exact arithmetic, bounded integers/decimal rate representation, no binary float money or independent per-child rounding that loses the total. Preserve historical numeric fields and snapshots. Rate, rounding mode, funding party, commission base, tax treatment and fee components are versioned policy inputs. Finance must approve before implementation.

Definitions: S = sum frozen item amounts after product-level price reductions; Dm = merchant-funded order discounts; Dp = platform-funded discounts including points if approved; F = customer delivery fee; T = applicable tax if configured. Customer due = S - Dm - Dp + F + T. No negative due or discount exceeding eligible base. Do not count product price reductions again. Commission, assisted fees, merchant delivery deduction, platform subsidy, courier cost, tax liability and merchant payable are distinct components, not aliases for customer due.

Illustrative deterministic largest-remainder rule for distributing a nonnegative integer component A over eligible weights w_i: compute floor(A*w_i/sum(w)); distribute remaining units in descending fractional remainder, ties by canonical stable line/child ID. Zero total weight with nonzero A is invalid. For discounts enforce remaining eligible-base caps, redistribute only within eligible lines or reject. Use exact integer fractions; sign of reversal is applied to original allocations, not a new arbitrary rounding. Example: three equal weights, 1000 IQD allocation => 334/333/333 with stable tie-break; sum is 1000.

Example without tax/discounts, purely illustrative: merchant subtotals 45,000 + 30,000 + 20,000 = 95,000; delivery fee 5,000; customer due 100,000. Uniform 10% commission gives 9,500 and merchant payable 85,500 before other deductions; operational cost 7,000; contribution 7,500 before other expenses. No rate or fee approved. Delivery fee is charged once, not once per child. Its allocation for internal reporting is not extra customer debt.

Original accepted quote and financial snapshot immutable. Rejection/cancel/refund creates versioned adjustment, links to original line allocations and retains original values. Do not recalculate historical commission with current terms. Changes affecting customer due require authorized resolution and revised COD version before shipment release. Partial allocation and coupon restoration rules, fee retention/refund and fixed commission reversal policy remain D06/D07 decisions. Cash collection, payable recognition, payouts and reversals must not occur on checkout creation; design their triggers in 0.3G. ED-02 requires atomic or durable recoverable ledger effects, reconciliation and fault injection.

## 9. Proposed API and error semantics

| Method/path (relative to existing API prefix) | Actor | Contract |
|---|---|---|
| POST /checkout/v2/quote | customer context | authoritative quote, typed validation blockers |
| POST /checkout/v2/submit | authenticated customer | idempotent master creation |
| GET /checkout/v2/attempts/:key | same actor | committed result / in progress / retryable failure, no other actor lookup |
| GET /master-orders | customer | paginated own summaries |
| GET /master-orders/:id | customer | own child/shipments and current due |
| POST /master-orders/:id/cancel | customer/authorized support | idempotent cancellation request, version |
| POST /master-orders/:id/resolve | customer | accepted resolution ID/version, explicit revised total |
| POST /merchant/orders/:id/accept, reject, ready | scoped merchant role | reuse existing compatible command routes or version them after route audit |

Exact DTOs and route collision audit in 0.3H. Writes carry idempotency and expected version where applicable; use correlation IDs. 400 malformed, 401 unauthenticated, 403 forbidden or consistent concealed 404 for inaccessible IDs, 409 stale quote/version/key conflict, 422 business validation, 429 throttle, 503 retryable dependency unavailable. Stable codes proposed: QUOTE_EXPIRED, QUOTE_CHANGED, STOCK_INSUFFICIENT, MERCHANT_UNAVAILABLE, IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD, RESOLUTION_REQUIRED, CUSTODY_BLOCKS_CANCEL, V2_DISABLED. Error must not expose other merchant/customer data. Existing legacy status and route contracts unchanged.

## 10. Events and integration

CheckoutSubmitted (master), MerchantOrderCreated (child), MerchantOrderAccepted, MerchantOrderRejected, MerchantOrderReady, CustomerResolutionRequired, CustomerResolutionAccepted, OrderAdjusted, OrderCancelled. Envelope: event_id, type, schema_version, aggregate_id/version, occurred_at UTC, correlation_id, causation_id, minimal payload. Unique effect key per consumer; retry and dead-letter handling. Order-created event does not authorize pickup: only valid ready event and logistics eligibility do. No automatic Jenni dispatch from V2 child status. Provider chosen exclusively at shipment level per D13. Consumers cannot write unrelated domain state directly. Notification failure does not undo committed checkout.

## 11. Authorization and legacy compatibility

Customer accesses own master and associated child summaries. Merchant accesses only own child and authorized location; never all children through master join, competitor data, global discount funding or customer details beyond role necessity. Drivers/hub receive only assigned fulfillment projection; finance and admin access by scoped role with audited overrides. RLS and backend object authorization both required, service-role RPC restricted. Avoid exposed views bypassing RLS; prove grants and SECURITY DEFINER behavior (ED-03).

Legacy orders retain null master reference and original behavior. V2 one-merchant checkout may still create a master when enabled. Explicit server-side version and cohort gate, default off; UI flag alone insufficient. Disabling intake preserves read/resolve/return for existing V2 orders. No fallback from failed V2 submit to V1 submit, no silently dropping other merchants. No migration/backfill of settled orders. Rollback preserves accepted order, stock and financial history.

## 12. Acceptance contracts

| ID | Test | Required evidence |
|---|---|---|
| CB01 | 1/2/5 merchants | one master, correct children, totals conserved |
| CB02 | invalid third child / injected mid-transaction fault | zero committed master/child/stock/coupon effects |
| CB03 | concurrent last unit across V1/V2 | no oversell |
| CB04 | retry after lost response / concurrent key | same master and exactly one stock effect |
| CB05 | same key changed payload / expired quote | conflict; original result still retrievable |
| CB06 | price, promo, points or eligibility changed | explicit requote; no silent acceptance |
| CB07 | integer rounding, zero weights, discount caps | exact deterministic sum, invalid cases rejected |
| CB08 | duplicate reject/cancel / partial quantities | compensates at most original stock amount |
| CB09 | merchant rejection with another collected parcel | resolution and custody preserved, no automatic restock |
| CB10 | all rejected / unresolved remainder | no outbound release or invalid COD |
| CB11 | cross-actor/merchant query and command | denied at API and DB boundaries |
| CB12 | outbox crash/retry | no lost readiness or duplicate business effects |
| CB13 | legacy cart/checkout/Jenni and historical order | unchanged; no duplicate provider dispatch |
| CB14 | disable V2 intake with active master | active orders remain recoverable |
| CB15 | projection replay and stale commands | deterministic progress and exception state |
| CB16 | reversal and revised COD | conserved allocations and no duplicate financial effect |

These are proposed acceptance requirements, not executed tests. Map to T01–T23 and G1/G4/G5. Structural schema proof ED-01 before DDL; clean full DB suite before implementation acceptance. No new runtime work authorized.

## 13. Open policy decisions and handoff

D02: stock decrement direction approved; coupon stacking/scope, funding and loyalty restoration unresolved.
D06: commission base/fixed charges, delivery fee pricing, subsidy, tax and partial/refund rules unresolved.
D07: financial accrual and custody recognition coordinated with 0.3G.
D10: merchant acceptance/readiness and customer resolution deadlines, cutoff, retry policy unresolved.
D13: external provider fallback/pricing/exclusivity details unresolved.
D01/D09 and remaining master decisions stay open.

Next package 0.3C: merchant fulfillment, pickup-location authority, package declaration, acceptance/readiness versioning, delay/reject/timeout policy and dispatch eligibility. It must honor C01–C12 and the custody/finance boundaries above. 0.3G and 0.3H reconcile allocations, schema and API contracts before G0. No V2-01 implementation, DDL, live mutation, provisioning or deployment until separately authorized.
