# DilMart 2.0 — Phase 0.2 Baseline & Environment Verification

Date: 2026-11-26
Task: DILMART-V2-P0.2
Repository: https://github.com/dilmart-info/Dilmart
Verified baseline SHA: `272b027a218b33798e5e5f54b3eeaf48d7214d7e`
Baseline commit: `docs: DilMart 2.0 master specification v1.0 (#51)`
Parent before that merge: `10d11c0d79cf8e3597723fbf296b9cf90bcb2979`
G0: **OPEN**
Phase 0.3 and V2-01: **not started**

## Verdict

| Gate | Result | Meaning |
|---|---|---|
| A — identity and safety | PASS WITH NOTES | Baseline SHA matches origin/main. No live target was linked, migrated, smoked, or provisioned. Local Docker daemon was down, so no disposable database was started. |
| B — local baseline validation | PASS WITH NOTES | Required builds, unit tests, architecture guard, auth guard, and mobile boundary passed. `npm run lint` failed on the existing tree. Local migration replay and `test:db-integration` were not run. |
| C — schema and code inventory | PASS WITH NOTES | Inventory is from migration and source text, plus CI evidence that GitHub replayed the local Supabase stack. It is not a locally queried catalog. |
| D — target contracts | PASS WITH NOTES | Contracts below are a proposal for owner review. Nothing was frozen and no DDL was authored or applied. |

Overall: **PASS WITH NOTES**. This report is evidence for independent review. It is not a release approval and it does not close G0.

## 1. How the baseline was isolated

The primary checkout at `D:\DilMart` was on `main` at `10d11c0d79cf8e3597723fbf296b9cf90bcb2979` with a large uncommitted working tree. After `git fetch origin main`, `origin/main` moved to `272b027a218b33798e5e5f54b3eeaf48d7214d7e`. That checkout was left untouched: no reset, no clean, no merge, and no discard of user changes. It remains behind `origin/main` by the PR #51 merge.

Verification ran in a separate detached worktree at the expected SHA:

```text
Worktree: D:\DilMart-v2-p02
HEAD: 272b027a218b33798e5e5f54b3eeaf48d7214d7e
Remote: https://github.com/dilmart-info/Dilmart.git
Working tree before this report: clean
```

The remote URL contains no embedded credentials.

### Environment classification recorded for this task

```text
Repository: dilmart-info/Dilmart
Git branch: detached verification worktree, then a documentation branch from that SHA
Render service: not contacted
Backend hostname: not contacted
Supabase project ref: none linked
Environment role: local read-only baseline
```

Authoritative live map, read and not modified, remains `ai/ENVIRONMENT_SOURCE_OF_TRUTH.md`:

| Role | Repository line | Render service | Supabase ref |
|---|---|---|---|
| DilMart Main staging | `cylendralabs-blip/DilMart` branch `staging` | DilMart-backend-staging | `zlmdwhuphuxppxznsgso` |
| DilMart Main production | `cylendralabs-blip/DilMart` branch `main` | DilMart-backend | `yssjhxeybitiycdviyrc` |
| DilMart-Store current/live | `dilmart-info/Dilmart` branch `main` | DilMart-store-backend | `ztplxqlthuqkuktbznbo` |

Store still has no separate staging branch, backend, or database. None of those three Supabase projects was used. No `.env` file and no `supabase/.temp` link existed in the worktree. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `DATABASE_URL` were unset in the shell. Database integration tests were not started, because their helper can fall through to `http://127.0.0.1:54321` or to a status file, and no isolated stack was proven up.

### Tool versions

| Tool | Result |
|---|---|
| Node | v22.22.3 |
| npm | 11.17.0 |
| Docker client | 29.9.2 |
| Docker daemon | unavailable (`dockerDesktopLinuxEngine` pipe missing) |
| Supabase CLI on PATH | not installed |
| `npx supabase --version` | 3.4.0 (version check only; no `supabase link`, `start`, or `db reset`) |

`npm ci` reported advisory counts and was not followed by `npm audit fix`:

- Frontend: 35 advisories (16 moderate, 13 high, 6 critical).
- Backend: 15 advisories (6 moderate, 8 high, 1 critical).

These counts are installer output, not a triaged vulnerability assessment.

## 2. Gate B — commands and results

Commands ran in `D:\DilMart-v2-p02` on SHA `272b027`. Database commands were inspected and then skipped.

| Command | Exit | Actual result |
|---|---|---|
| `npm ci` (repo root) | 0 | Dependencies installed. Advisory count above. |
| `npm ci` (`backend/`) | 0 | 408 packages added. Advisory count above. |
| `npm run build` | 0 | Vite 5.4.21 production build, 3674 modules, built in 12.54s. |
| `npm test` | 0 | Vitest: 123 files, 1259 tests passed, 40.02s. |
| `npm run arch:guard` | 0 | Architecture guard passed. Current violations (temporary baseline): 0. |
| `npm run auth:guard` | 0 | Auth lifecycle boundary guard passed. |
| `npm run lint` | 1 | ESLint: 482 problems (449 errors, 33 warnings). Dominant rule: `@typescript-eslint/no-explicit-any`. |
| `npm run build:mobile` | 0 | Mobile bundle written to `dist-mobile`. |
| `npm run mobile:boundary` | 0 | Forbidden modules: none. Content marker hits: none. |
| `npm run test:policy` (`backend/`) | 0 | Includes `nest build`. 91 tests, 0 failed. |
| `npm run test:commercial` (`backend/`) | 0 | Includes `nest build`. 8 tests, 0 failed. |
| `npm run test:launch-critical` (`backend/`) | 0 | Includes `nest build`. The four baseline files exist. 26 tests, 0 failed. The script did not fall through to `test:policy`. |
| `supabase start` / `supabase db reset` | not run | Blocker: Docker daemon down. No loopback database was verified. |
| `npm run test:db-integration` | not run | Blocker: no proven disposable database. Not labeled PASS. |

### Lint root cause

`npm run lint` fails on this SHA without any application edit in this task. The critical CI workflow (`.github/workflows/ci.yml`) does not invoke `npm run lint`. A green CI run therefore does not mean the lint script passes. No lint rules or source files were changed.

### Database tests root cause

`backend/tests/db-integration/db-client-helper.mjs` builds a Supabase client from `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, or from `supabase_status.json`, and otherwise defaults the URL to `http://127.0.0.1:54321`. Several files warn that the same suite follows whatever project those variables name. With the daemon down and no status file, starting the suite would either fail closed or risk an ambiguous local port. It was not started. This is a local evidence gap, not a claimed schema defect.

## 3. Independent post-merge CI

All runs are for head SHA `272b027a218b33798e5e5f54b3eeaf48d7214d7e`. This machine did not re-execute CI.

| Workflow | Run | Conclusion | Notes |
|---|---|---|---|
| DilMart Store Launch Critical PR Quality & Security CI | [45759466275](https://github.com/dilmart-info/Dilmart/actions/runs/45759466275) | success | Push to `main`. The job succeeded, including Supabase CLI setup, local stack upgrade-path replay, database integration tests, policy, commercial, and product-publication steps. |
| Native Foundation CI | [45759466222](https://github.com/dilmart-info/Dilmart/actions/runs/45759466222) | success | Android Foundation and iOS Foundation both succeeded. |
| Netlify Production Deploy | [45760025444](https://github.com/dilmart-info/Dilmart/actions/runs/45760025444) | success | Gate job succeeded. Publish job skipped. Timestamp matches the earlier of the two required CI completions (Native finished first). |
| Netlify Production Deploy | [45760194959](https://github.com/dilmart-info/Dilmart/actions/runs/45760194959) | failure | Gate job succeeded. Publish job ran and failed in `Validate the Production frontend target` with `backend binding check: HTTP 503` and `No Production artifact may be built from this environment.` Failure is before artifact build. No successful publish was observed. |

Render deployment state for this SHA was not queried. It remains unverified. No production smoke was run from this task.

CI database success is evidence that GitHub's Ubuntu runner could replay migrations on its own local Supabase. It does not replace a catalog query on a database controlled in this session.

## 4. Gate C — schema inventory

Method: static scan of the 175 forward SQL files in `supabase/migrations/` (first `20260214175155_init.sql`, last `20260909170000_update_dilmart_primary_support_phone.sql`) plus source reads. Nine rollback files under `supabase/migrations/rollback/` were not treated as applied history. Claims are marked source, local, or CI.

Regex limits: `CREATE TABLE` / `CREATE FUNCTION` / `ENABLE ROW LEVEL SECURITY` counts are textual. They include objects later dropped or replaced. They are not `pg_catalog` output. Local catalog: unverified.

| Metric | Source count |
|---|---|
| Forward migration files | 175 |
| Rollback files (sibling directory) | 9 |
| Distinct `CREATE TABLE` names seen | 74 |
| Tables whose name also has an `ENABLE ROW LEVEL SECURITY` statement somewhere in history | 74 of those 74 |
| `DISABLE ROW LEVEL SECURITY` in forward migrations | none found |
| `CREATE POLICY` statements | 111 |
| `DROP POLICY` statements | 104 |
| Distinct function names from `CREATE [OR REPLACE] FUNCTION` | 89 |
| `CREATE FUNCTION` statements (includes replacements) | 145 |
| `geography` / `geometry` / `postgis` mentions | 0 |

### Tables named by CREATE TABLE

`account_deletion_requests`, `admin_notifications`, `audit_logs`, `auth_action_operations`, `auth_action_tokens`, `auth_hook_deliveries`, `auth_otp_challenges`, `categories`, `checkout_attempts`, `collection_event_log`, `commercial_rules`, `coupons`, `courier_ledger_entries`, `courier_payout_batch_items`, `courier_payout_batches`, `customer_addresses`, `customer_phone_identities`, `customer_profiles`, `delivery_companies`, `delivery_events`, `delivery_prices`, `delivery_provider_sync_events`, `delivery_recommendations`, `desktop_quick_links`, `dilmart_barber_handoff_audit_events`, `dilmart_barber_handoffs`, `dilmart_barber_web_sessions`, `dilmart_customer_handoff_audit_events`, `dilmart_customer_handoffs`, `governance_tasks`, `governorates`, `jenni_cities_reference`, `jenni_merchant_provisioning_locks`, `jenni_store_provisioning_locks`, `loyalty_settings`, `loyalty_transactions`, `marketplace_banners`, `merchant_commercial_terms`, `merchant_ledger_entries`, `merchant_notifications`, `merchant_payout_batch_items`, `merchant_payout_batches`, `merchant_plan_assignments`, `merchant_plans`, `merchant_policy_assignments`, `merchant_push_deliveries`, `merchant_push_subscriptions`, `merchant_settings`, `merchant_users`, `merchants`, `notification_outbox`, `order_cancellation_operations`, `order_cancellation_requests`, `order_delivery_integrations`, `order_finance_events`, `order_items`, `order_return_requests`, `orders`, `outbound_dead_letters`, `outbound_dispatch_attempts`, `product_import_sessions`, `products`, `profiles`, `regions`, `stock_movements`, `store_cart_items`, `store_carts`, `store_federated_refresh_tokens`, `store_federated_session_audit_events`, `store_federated_session_families`, `store_linked_profiles`, `user_notifications`, `whatsapp_intents`, `whatsapp_otp_daily_dispatches`.

### Objects removed from the forward path

`20260831120000_stage_b_legacy_destructive_cleanup.sql` drops these legacy B2B/federated tables after a zero-row preflight: `dilmart_barber_handoff_audit_events`, `dilmart_barber_handoffs`, `dilmart_barber_web_sessions`, `dilmart_customer_handoff_audit_events`, `dilmart_customer_handoffs`, `store_cart_items`, `store_carts`, `store_federated_refresh_tokens`, `store_federated_session_audit_events`, `store_federated_session_families`, `store_linked_profiles`.

Expected final presence: absent, if Migration B applied. CI: the upgrade-path step on run 45759466275 succeeded, and that step applies Migration B. Local: not replayed.

`place_b2b_cart_order_idempotent` remains in the historical function-name set. Its survival after Migration B was not queried locally.

### Checkout, stock, idempotency, money, delivery (source)

| Concern | Evidence | Classification |
|---|---|---|
| Single-merchant order | `place_order` counts distinct product merchants and rejects a count other than 1 (`20260831100000_stage_b_place_order_authority_refactor.sql`). Checkout service throws if `merchantIds.size !== 1` (`backend/src/modules/checkout/checkout.service.ts`). Cart store returns `DIFFERENT_MERCHANT` (`src/lib/cart-store.ts`). | source; behavior covered by local unit tests, not by a local DB replay |
| Stock lock | Same migration locks product rows with `FOR UPDATE OF p` before decrement. | source |
| Idempotency | `checkout_attempts` table. `place_order_idempotent(p_checkout_attempt_id, p_checkout_request_hash, ...)`. Submit uses that RPC only when `checkout_attempt_id` is present. `CHECKOUT_IDEMPOTENCY_REQUIRED=true` is what rejects a missing attempt id (`checkout.service.ts`). Default-off means a no-attempt submit still calls `place_order`. | source |
| Financial snapshot | `place_order` parameters include merchandise, discount, delivery fee, commission, merchant net, gross collected, platform net, currency, and snapshot version. Tables include `order_finance_events`, merchant and courier ledgers, and payout batches. | source |
| Coupon and loyalty | `coupons`, `validate_coupon`, `increment_coupon_usage`, `loyalty_settings`, `loyalty_transactions`, `handle_order_status_points`. | source |
| Merchant scope | `merchant_users`, `enforce_order_item_merchant_consistency`. API merchant routes take an explicit merchant id. | source |
| Order and delivery status | `orders` plus `delivery_events`. Service allow-list is order-grain: pending assignment, company, agent, picked up, in transit, delivered, failed, returned (`delivery-operations.service.ts` lines 35–45). Transition RPC is `transition_delivery_status`. | source |
| Jenni | Tables `jenni_cities_reference`, provisioning locks, `order_delivery_integrations`. Dispatch is behind `JENNI_ALLOW_SHIPMENT_DISPATCH` (`jenni-dispatch.service.ts`). Checkout delivery price currently calls `resolveJenniDeliveryPrice` directly (`checkout.service.ts` `resolveDeliveryCost`). | source |
| Cancellation and returns | `cancel_order_atomic`, `review_cancellation_request_atomic`, `review_return_request_atomic`, `mark_return_item_received_atomic`, `complete_return_refund_atomic`. | source; launch-critical unit file passed locally |
| Payout | `create_payout_batch_atomic` granted toward `service_role` in the M11/M20 migrations. Later grant changes were not exhaustively diffed. | source, final ACL unverified locally |
| Notification outbox | `notification_outbox`, `claim_notification_outbox_batch`. Separate from the in-process `DomainEventBusService`, which keeps handlers in a `Map` and logs handler failures without rethrow (`domain-event-bus.service.ts`). | source |
| Geo | `latitude` / `longitude` double-precision arguments on `place_order`, plus `governorates` and `regions`. No PostGIS type and no `merchant_pickup_locations` table. | source |
| Money write boundary | After `transition_delivery_status`, finance status handling is invoked in application code with the comment that it runs after commit, outside the database transaction (`delivery-operations.service.ts` lines 151–160). | source; concurrency of that split was not load-tested here |

### RLS and authorization matrix (current money path)

Final policy text was not dumped from a database. What the Stage B migration states, and what later `202609*` migrations do not revise for these two functions:

| Function | PUBLIC / anon / authenticated | service_role |
|---|---|---|
| `place_order(...)` current signature | `REVOKE ALL` | `GRANT EXECUTE` |
| `place_order_idempotent(...)` current signature | `REVOKE ALL` | `GRANT EXECUTE` |
| `cancel_order_atomic(...)` | historical grant target is `service_role` | `service_role` |
| `transition_delivery_status` | an earlier migration granted `authenticated`; later M20 files re-grant `service_role` and the final lockdown migration executes a service_role grant | treat final ACL as CI-verified only through the schema gate that ran in CI, not locally queried |

`final-schema-gate.sql` asserts selected signatures and that `user_notifications` has zero INSERT policies. CI applied that file successfully. It is not a full RLS matrix.

Application authority observed in controllers: NestJS is the business API. Customer, merchant, admin, and agent routes are separate. Merchant child operations are scoped by merchant id. This phase did not re-audit every guard. Thirty `@Controller` classes were enumerated under `backend/src`.

### API surface actually present

There is no `POST /checkout/v2/quote` or `POST /checkout/v2/submit`. Current checkout is `POST /checkout/preview`, `POST /checkout/submit`, `GET /checkout/attempts/:attemptId`.

Other route families present: `auth`, `customer`, `marketplace`, `catalog`, `products`, `merchant/products`, `orders` (including merchant accept/reject and delivery status posts), `merchants/:id/*`, `coupons`, `loyalty`, `inventory`, `shipping`, `admin` finance and delivery operations, `admin/orders/:id/delivery/dispatch-jenni`, Jenni webhook `POST /v2/push/update-status`. The `v2` prefix here is the provider webhook, not DilMart 2.0 checkout.

Frontend callers live under `src/lib/api/` (`checkout.ts`, `customer.ts`, `marketplace.ts`, `merchant.ts`, `products.ts`). The customer mobile bundle boundary excludes admin, merchant, and `AgentOrders` module ids (`scripts/mobile/check-mobile-bundle-boundary.mjs`). Local `mobile:boundary` passed.

B2B/federated cart tables are on the Migration B drop list. `isFederated` is hard-coded `false` in `checkout.service.ts` `submit`. Do not treat historical federated tables as the V2 master-order model.

### Dependencies relevant to mobile

`package.json` depends on Capacitor 8.4.2 (`@capacitor/core`, `android`, `ios`, CLI). There is no `expo` dependency. Native Foundation CI already builds Android and iOS for this customer app.

### Order-related function names seen in migrations

`acknowledge_merchant_notification_atomic`, `admin_override_delivery_status`, `cancel_order_atomic`, `claim_notification_outbox_batch`, `clear_order_agent_atomic`, `complete_return_refund_atomic`, `create_payout_batch_atomic`, `enforce_order_item_merchant_consistency`, `generate_order_number`, `get_order_status`, `handle_order_status_points`, `increment_coupon_usage`, `jenni_provisioning_advisory_lock`, `mark_return_item_received_atomic`, `notify_agent_assignment`, `notify_low_stock`, `notify_merchant_new_order`, `notify_new_order`, `notify_user_order_status`, `place_b2b_cart_order_idempotent`, `place_order`, `place_order_idempotent`, `process_cod_remittance_to_platform`, `review_cancellation_request_atomic`, `review_return_request_atomic`, `set_orders_updated_at`, `transition_delivery_status`, `validate_coupon`.

Names are historical. Overloads and later drops are not resolved without a catalog query.

## 5. Reuse / adapt / build

| Domain | Decision | Why |
|---|---|---|
| Identity, profiles, merchant_users, auth context | Reuse | Server-owned actor context already exists. Add driver, hub, and cashier scopes later. |
| Merchants, products, stock decrement, commercial terms | Reuse and adapt | Single-merchant stock lock is real. Pickup-location readiness and multi-merchant lock ordering do not exist. |
| Legacy cart and `POST /checkout/submit` | Reuse behind the current flag | Must keep rejecting mixed merchants until a default-off V2 command exists. |
| `place_order` / `place_order_idempotent` | Adapt, do not call N times | Row lock, snapshot, and service-role ACL are the pattern. A parent checkout needs one transaction, not one RPC per merchant. |
| Orders, order_items, merchant accept/reject | Adapt | Child order can stay the merchant financial grain. Accepted and ready-for-pickup are not separate states today. |
| Delivery status machine and agent orders UI | Reuse for legacy; build parcel/task/custody beside it | Current machine is one order, one assignment. |
| Jenni dispatch and pricing | Adapt | Keep the explicit dispatch flag. Remove pricing as an implicit provider choice when V2 fulfillment selection exists. |
| Cancellation and returns RPCs | Adapt | They are atomic at order grain. Custody and partial allocations are new. |
| Ledgers, COD collection events, payout batch RPC | Reuse principles; adapt atomicity | Post-commit finance call is a known split. Cash drawer and shipment allocation are absent. |
| `notification_outbox` | Reuse pattern | In-memory domain bus must not become the logistics bus. |
| Admin delivery ops and delivery intelligence | Adapt | Read models can grow into a control tower. Intelligence must not assign or move money. |
| Customer Capacitor app | Reuse | Boundary guard passed. Do not put driver or backoffice into that artifact. |
| Driver app | Build separate artifact | No Expo app exists. Recommendation in section 7. |
| PostGIS, hubs, parcels, offers, cash sessions | Build | Not in the migration text. |
| Store staging | Build only after approval | Not present. Do not reuse the three existing Supabase refs. |

## 6. Gaps

### P0 — blocks contract freeze or safe V2 implementation

1. G0 decisions D01–D13 in `00_MASTER_SPEC.md` are still unresolved. This report supplies D01 evidence only.
2. No isolated Store staging exists. Local disposable replay was blocked in this session.
3. Multi-merchant checkout is intentionally rejected in cart, API, and `place_order`. There is no master order.
4. No parcel, pickup task, hub, bin, consolidation, offer, assignment token, or cash-custody tables.
5. No PostGIS. Coordinates are unconstrained doubles.
6. No merchant pickup-location entity.
7. Delivery finance is applied after the delivery RPC commits.
8. Checkout idempotency is optional unless `CHECKOUT_IDEMPOTENCY_REQUIRED=true`.
9. Checkout price lookup is hard-wired to Jenni pricing while dispatch itself is flag-gated. Those are different switches.
10. Domain event handlers can fail without failing the caller.

### P1 — should be closed before implementation scale-up

1. `npm run lint` fails (449 errors) and is outside critical CI, so baseline "green" does not include lint.
2. npm audit advisories were not triaged.
3. Final RLS/GRANT catalog was not queried locally; policy history has almost as many drops as creates.
4. The primary `D:\DilMart` checkout is dirty and one commit behind `origin/main`. Agents must keep using a clean worktree at `272b027` or later until the owner reconciles that tree.
5. Netlify's second gate attempted production validation and stopped on backend binding HTTP 503. Publish did not succeed. The live backend health was not probed from this task.
6. Render deployed SHA remains unverified.
7. B2B function leftovers after Migration B need a catalog query on the next disposable database.

### P2 — after the V2 core is specified

1. Historical federated/B2B tables are dropped; any future B2B surface needs a new design, not a revival of those tables.
2. Customer mobile stack is Capacitor. A driver-stack spike on devices is still required before D09 is closed.
3. Advisory dependency upgrades are out of scope until a dedicated maintenance phase.

## 7. Proposed V2 transaction boundaries

Not DDL. Not approved. One database transaction per command unless a line says otherwise. Idempotency key is `(actor, command, key)` plus a request hash; the same key with a different hash returns conflict and writes nothing. Locks are taken in deterministic order: merchant id, then product id, then parcel id.

| Command | Single transaction must include | Must not do inside that transaction |
|---|---|---|
| Quote | Read-only. Persist quote version, expiry, groups, integer IQD allocations. No stock mutation. | Provider side effects. |
| Submit master checkout | Insert master order, one child order per merchant, items, immutable money snapshots, stock decrement or reservation using the current `FOR UPDATE` product lock, outbox rows `CheckoutSubmitted`. All merchants succeed or none do. | Jenni HTTP, push, or a second independent `place_order` call. |
| Merchant accept | Child order only. Record ready estimate. Do not create a pickup task. | Stock change if already decremented at submit, unless the frozen inventory policy says reserve-at-accept. Policy is D02, still open. |
| Merchant ready | Child order `ready_for_pickup` plus one outbox `MerchantOrderReady`. | Driver assignment. |
| Merchant reject | Release that child's reservation once, financial reversal rows for that child, customer projection update. Other children stay. | Cancelling the whole master order unless policy says so. |
| Create pickup offer | Eligible ready parcels at one pickup location, one offer row, capacity hold, expiry. Unique active offer per parcel. | Changing parcel custody. |
| Accept offer | Compare-and-set one assignment. Losing accepts get conflict. | A second active assignment for the same parcel. |
| Pickup scan | Custody moves to that driver and shift. Idempotent if the same scan repeats. | Marking the customer order delivered. |
| Hub receive | Custody moves to hub bin. Duplicate scan is a no-op or a quarantine, with an audit row. | Outbound release. |
| Pack / release | All required parcels for the consolidation are in hub custody, one outbound shipment, manifest rows. | Partial release of an incomplete required set. |
| Deliver and COD | Proof, shipment delivered, one cash collection ledger row for the exact amount. | Editing price on the device. Driver earnings are a separate ledger entry in the same transaction or a durable outbox that cannot double-post. |
| Cash handover | Driver session and cashier confirmation. Discrepancy row blocks only the affected payouts. | Silent adjustment. |
| Payout approve / settle | Existing batch RPC grain, extended so a child cannot sit in two open batches. | Allocating COD that is still held by the driver. |

Failure and rollback:

- Submit failure rolls back master, children, stock, and outbox together.
- A provider timeout after local custody is not a reason to dispatch the same parcel to a second provider. Provider ownership is a unique column: `internal` or `jenni`, set before the external call, with an idempotency key on the outbound attempt table that already exists (`outbound_dispatch_attempts`).
- Crash after commit and before worker success is recovered from outbox, not from the in-memory bus.
- Code rollback must not delete custody or ledger rows. Schema changes stay additive.

### Proposed RLS actor matrix (new tables only)

| Actor | master order | child order | parcel / task | cash / payout |
|---|---|---|---|---|
| Customer | own master projection | own items, no other merchant private notes | tracking state only | own COD total, no driver ledger |
| Merchant user | denied across merchants | own merchant only | own pickup location and labels | own payable statement |
| Pickup driver | denied | pickup contact for assigned task | assigned tasks only | denied |
| Delivery driver | own assigned shipment | customer contact required for that stop | assigned outbound tasks | own custody session |
| Hub role | denied | scan payload only | parcels at assigned hub | denied |
| Cashier | denied | denied | denied | handover confirm |
| Finance approver | read | read | read | approve / settle |
| Platform admin | audited override | audited override | audited override | audited adjustment |
| service_role worker | outbox consumer | same | same | no ad hoc payout from the client |

EXECUTE on new SECURITY DEFINER functions follows the Stage B pattern: revoke from `PUBLIC`, `anon`, and `authenticated`; grant to `service_role`; the API uses the service role only after its own actor check. That pattern is proposed, not re-proven by a local catalog query.

### Financial and logistics invariants to freeze

1. Legacy checkout stays single-merchant. V2 master checkout is a different command, default off.
2. Each child order has exactly one merchant.
3. Integer IQD allocations of discount, fee, and COD sum to the parent amounts. Remainder distribution is deterministic. Delivery fee is not copied onto every child.
4. Stock decrement or release happens once per unit.
5. Order, parcel, pickup task, outbound shipment, assignment, custody, and payout are different rows.
6. Physical handoff is a custody event. Reassignment after pickup does not move custody by itself.
7. One active assignment per parcel. One active outbound shipment per required parcel set.
8. Internal and Jenni dispatch cannot both own the same parcel.
9. Delivered is not the same as payable. Payable waits for the frozen cash policy.
10. Duplicate submit, scan, webhook, or payout retry does not create a second money or custody effect.
11. Merchant users cannot read another merchant's child on the same master order.
12. Customer mobile artifact stays free of admin, merchant, and driver-task modules.

## 8. Driver app comparison

| Option | Local evidence | Consequence |
|---|---|---|
| Capacitor, already 8.4.2 | Customer app, Android and iOS projects, Native Foundation CI success on this SHA, `mobile:boundary` pass | A second Capacitor workspace can share the API and keep the customer bundle guard intact. |
| Expo | No dependency in `package.json` | Would be a new toolchain, a new CI path, and a new release process. No device evidence in this phase. |

Recommendation for the owner, not a freeze: build the driver app as a separate Capacitor artifact. Preserve the customer app boundary. Close D09 only after a device matrix spike. This phase did not flash a device.

## 9. Staging infrastructure proposal

Approval is requested. Nothing was created.

Create, only after a written yes:

1. A new Supabase project that is not `zlmdwhuphuxppxznsgso`, `yssjhxeybitiycdviyrc`, or `ztplxqlthuqkuktbznbo`.
2. A new Render web service that is not `DilMart-store-backend`, `DilMart-backend`, or `DilMart-backend-staging`.
3. Synthetic merchants, products, and coordinates only. No production backup restore and no copy of live profiles, phones, or orders.
4. Feature flags default off, including any future V2 checkout and internal-dispatch flags.
5. No DNS change and no Netlify production publish as part of staging creation.

Resource sketch, without a price quote: one small dedicated Postgres (Auth and Storage only if the tests need them), PostGIS only when a later phase's migration enables it, one staging API instance, and short retention for proof images. Dollar cost was not estimated because current vendor prices were not fetched. The owner should price the project before approval.

Until that approval, database work stays on a disposable local Supabase (`127.0.0.1` only) after Docker is running and `supabase status` shows a loopback API URL.

## 10. Architecture freeze decision register

| ID | Proposed disposition from this evidence | Status |
|---|---|---|
| D01 | Baseline SHA, environment map, and reuse matrix in this report | Evidence recorded. Owner acceptance still open. |
| D02 | Keep current submit-time stock decrement until finance and commerce choose reserve-versus-decrement. Idempotency must become mandatory for V2 even if the legacy flag stays optional. | Open |
| D03 | Hub location, hours, capacity | Open. No operational data collected. |
| D04 | Merchant readiness | Open. No merchant list in this public report. |
| D05 | Driver roster and pay | Open |
| D06 | Fee, commission, partial refund | Open. Integer conservation rule is proposed above. |
| D07 | Cash limit and settlement cadence | Open. Custody tables do not exist yet. |
| D08 | Map provider | Open. No PostGIS and no routing client audit beyond the absence of those types. |
| D09 | Driver stack | Prefer separate Capacitor app. Not frozen. |
| D10 | Promise, cutoff, merchant timeout | Open |
| D11 | Privacy, insurance, licensing | Open |
| D12 | Load targets | Open. No forecast was verified. |
| D13 | External fallback | Proposed: explicit provider owner, no automatic second dispatch after custody. Not frozen. |

No item in this register is an architecture freeze.

### Contract-freeze agenda for a future Phase 0.3

1. Accept or correct this inventory against a local `pg_catalog` dump.
2. Choose stock timing (D02) and write the submit transaction as one RPC shape.
3. Choose IQD remainder rules (D06) and COD custody (D07).
4. Choose provider exclusivity (D13) and driver packaging (D09).
5. Name the migration owner and the staging project names.
6. Only then authorize additive DDL. This phase does not.

## 11. Blockers and recommendations

1. Start Docker and rerun migration replay plus `test:db-integration` on a loopback project before Phase 0.3 treats the schema inventory as locally proven.
2. Leave the dirty `D:\DilMart` worktree alone until the owner decides what those uncommitted edits are.
3. Do not point Store V2 work at Main staging or Store production.
4. Do not treat CI success as a local lint success.
5. Do not start V2-01 from this report. G0 stays open until the owner accepts the freeze agenda.
6. Investigate the Netlify HTTP 503 binding failure in an authorized operations task. This phase did not retry it.

## 12. What this phase did not do

No production mutation, remote migration, live smoke, remote provisioning, feature implementation, runtime bug fix, dependency upgrade, security-guard bypass, or credential disclosure. No Phase 0.3 and no V2-01.
