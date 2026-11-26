# DilMart 2.0 — Phase 0.2a Database Proof & Baseline Hardening

Date: 2026-11-26
Task: DILMART-V2-P0.2A
Repository: https://github.com/dilmart-info/Dilmart
Verified baseline SHA: `11704d4f63d92dde3fd32fc3b5e1c1ccee59f9eb`
Baseline commit: `docs: record Phase 0.2 baseline verification. (#52)`
History includes PR #51 (`272b027`), PR #53 (`c4b1862`), then PR #52.
G0: **OPEN**
Phase 0.3 and V2-01: **not started**

## Executive verdict

Overall: **PASS WITH NOTES**.

| Gate | Result |
|---|---|
| Identity and governance | PASS |
| Local isolation | PASS WITH NOTES |
| Migration replay and schema gate | PASS |
| Database integration tests | PASS WITH NOTES |
| Final schema versus production metadata | PASS WITH NOTES |
| Financial transaction assessment | PASS WITH NOTES |
| Dependency and security assessment | PASS WITH NOTES |
| Lint baseline | PASS WITH NOTES |
| Infrastructure follow-up | PASS WITH NOTES |

No production database was opened or changed. No dependencies were upgraded. No lint rules were disabled. No runtime fix was applied.

## 1. Baseline identity

`git fetch origin main` moved `origin/main` to `11704d4f63d92dde3fd32fc3b5e1c1ccee59f9eb`. That SHA matches the expected commit. The dirty checkout at `D:\DilMart` stayed on `10d11c0` and was not reset, cleaned, or merged.

Verification worktree:

```text
Path: D:\DilMart-v2-p02a
HEAD: 11704d4f63d92dde3fd32fc3b5e1c1ccee59f9eb
Branch at start: detached
Remote: https://github.com/dilmart-info/Dilmart.git
```

Tools: Node v22.22.3, npm 11.17.0, Docker client and server 29.9.2, Supabase CLI invoked through `npx supabase` 2.177.1 (the npm package wrapper reported 3.4.0). Host `psql` is not installed. SQL ran with `docker exec` into the disposable database container.

Environment source of truth on this SHA names Store live as Render service `dilmart-store-api`, backend `https://dilmart-store-api.onrender.com`, Supabase ref `ztplxqlthuqkuktbznbo`. This task did not contact that project.

```text
Repository: dilmart-info/Dilmart
Git branch: documentation branch from the verified SHA
Render service: not contacted
Backend hostname: not contacted
Supabase project ref: none linked
Environment role: disposable local database
```

## 2. Isolation evidence

Before start, another Supabase stack named `oghivndlzlckoschjjfg` was already listening on 54321, 54322, 54324, and 54327. `maxhub-postgres` was on 55432. Those containers were not stopped or reset.

The repository `supabase/config.toml` sets `project_id` to the production ref. That file was not used and was not edited. A separate directory `D:\DilMart-p02a-sb` held a copy of the 175 forward SQL files and a config whose project id is `dilmart-p02a-disposable`, with API 55421, database 55422, shadow 55420, and SMTP 55424. Studio was disabled after the first start failed its Studio health check and rolled that attempt back. Analytics was disabled. No `supabase link` and no `--remote` flag were used.

`supabase status` and `supabase db reset` both reported target `127.0.0.1:55422`. Tests used `http://127.0.0.1:55421` and aborted if the URL was anything else. Docker still published those ports on `0.0.0.0` and `[::]` (listener pid 2412, the Docker engine). That is wider than loopback-only. The stack is unique by project id and port, and it is not the production project, but it is reachable on the machine's other interfaces while it is running.

The first `supabase start` applied the full migration chain, then failed with `HealthCheckTimeoutError` on `supabase_studio_dilmart-p02a-disposable` and stopped the containers it had created. The second start, with Studio disabled, exited 0 and left the database healthy. The pre-existing stack was still present afterward.

## 3. Migration replay

The CI sequence in `.github/workflows/ci.yml` was followed against the disposable copy only. Commands were local `npx supabase db reset --no-seed` and `npx supabase migration up`. SQL fixtures used `docker exec` and `ON_ERROR_STOP=1`.

| Step | Result |
|---|---|
| Park migrations with timestamp >= `20260725090000` | 47 files moved, 128 left |
| `supabase db reset --no-seed` | exit 0, target `127.0.0.1:55422`, last applied file `20260724170000_order_returns_system.sql` |
| `pre-final-patch-historical-state.sql` | exit 0 |
| Apply `20260725090000_launch_critical_final_runtime_patch.sql` | exit 0 |
| Restore and apply the remaining parked files | exit 0, through `20260909170000_update_dilmart_primary_support_phone.sql` |
| Park migrations >= `20260831100000` | 5 files moved |
| Second `db reset --no-seed` | exit 0, last applied file `20260830210000_lock_product_import_sessions_rls.sql` |
| `stage-b-rollback-and-upgrade-gate.sql` | exit 0 |
| Apply Migration A `20260831100000_stage_b_place_order_authority_refactor.sql` | exit 0 |
| Assert Migration B absent from `schema_migrations` | exit 0 |
| Apply Migration B `20260831120000_stage_b_legacy_destructive_cleanup.sql` | exit 0, one file applied |
| Assert Migration B recorded once | exit 0 |
| `migration up` again | exit 0, `applied: []` |
| Apply the three post-Stage-B files | exit 0 |
| `final-schema-gate.sql` | exit 0 |

Final catalog query: **175** rows in `supabase_migrations.schema_migrations`, first `20260214175155`, last `20260909170000`.

## 4. Database integration tests

`npm run test:db-integration` does not compile the backend. CI compiles it earlier in the same job. The first suite run was therefore missing `backend/dist`.

| Run | Command | Exit | Result |
|---|---|---|---|
| 1 | `npm run test:db-integration` with loopback URL and the local service-role key | 1 | 105 tests, 101 pass, 3 fail, 0 skipped, 1 todo |
| 2 | `npm run build` then the three failed files | 1 | build exit 0; 14 tests, 13 pass, 1 fail, 0 skipped |
| 3 | retry `customer-entry-eligibility.test.mjs` only | 0 | 1 pass, 0 fail |

The three first-run failures were `ERR_MODULE_NOT_FOUND` for compiled files imported by `customer-entry-eligibility.test.mjs`, `merchant-commercial-agreement-order-snapshot.test.mjs`, and `stage-b-migration-a-atomicity-and-behavior.test.mjs`. They are not database failures.

The remaining failure was `customer-entry categories + featured respect ViewerContext eligibility`: PostgREST returned `The upstream server is timing out` after 181 seconds. The same test passed on the immediate retry. That is a transient local API timeout, not a skipped test and not a schema assertion failure.

The single todo is inside `product-import-confirm-atomic.test.mjs`: a non-slug unique-violation retry path, marked todo because no second unique constraint on `public.products` exists to exercise it. It is not a pass.

Demonstrated on this database, among the passing tests: place_order stock decrement and full rollback on insufficient stock, mixed-merchant rejection, inactive merchant rejection, merchandise mismatch, financial snapshot persistence, coupon increment, loyalty spend, checkout-attempt idempotency under concurrency, return and refund RPCs including merchant scope, notification outbox worker recovery, commercial-agreement concurrency, anon and authenticated denial for selected SECURITY DEFINER RPCs, and product public-read RLS cases.

## 5. Final schema inventory

Queried from `pg_catalog` on the disposable database after the replay. No business rows were exported.

| Metric | Local result |
|---|---|
| Applied migrations | 175 |
| Public base tables | 62 |
| Public tables with RLS | 62 |
| Public tables without RLS | 0 |
| Public views | 3 (`delivery_agent_performance_view`, `delivery_company_performance_view`, `delivery_open_orders_view`) |
| Public RLS policies | 80 |
| Public functions | 66 |
| SECURITY DEFINER functions | 56 |
| SECURITY DEFINER functions with no `search_path` setting | 6 |
| Primary keys | 62 |
| Foreign keys | 108 |
| Unique constraints | 22 |
| Check constraints | 93 |
| Indexes | 229 |
| Non-internal triggers | 17 |

Installed extensions: `plpgsql`, `pgcrypto` 1.3, `uuid-ossp` 1.1, `pg_stat_statements` 1.11, `supabase_vault` 0.3.2.

Available and not installed: `postgis` 3.3.7, `pg_trgm` 1.6, `vector` 0.8.2.

The six definers without `search_path` are `claim_pending_points`, `get_available_points`, `get_order_status`, `handle_order_status_points`, `handle_profile_points_claim`, and `increment_coupon_usage`.

Legacy B2B and federated tables dropped by Migration B are absent from the final table list: `store_carts`, `store_cart_items`, `store_linked_profiles`, `store_federated_*`, and the `dilmart_*handoff*` tables. `delivery_recommendations` is created by `20260426160000` and dropped by `20260427033500`, and it is absent after replay.

`place_order` privilege tests in `stage-b-migration-a-atomicity-rollback.test.mjs` passed in the first suite: service role can execute `place_order`, anon cannot. A later direct `has_function_privilege` query was not completed because the Docker API returned HTTP 500. The passing tests are the evidence used here.

## 6. Schema comparison

Production metadata supplied for this task, not re-queried:

| Item | Production reference | Local replay |
|---|---|---|
| Applied migrations | 175 | 175 |
| Public tables | 63 | 62 base tables |
| RLS on those tables | all 63 | all 62 |
| Public RLS policies | 80 | 80 |
| PostGIS | available, not enabled | available 3.3.7, not installed |

The policy count and migration count match. The table count does not. Local `information_schema` reports 62 `BASE TABLE` and 3 `VIEW`. Adding the views makes 65, which is not 63, and views are not the objects with RLS in this catalog. So the reference count is one base table higher than this replay.

`delivery_recommendations` does not explain it: the drop migration is inside the same 175 files. This task did not query production to name the extra table, and it did not add or drop anything to force the counts together.

## 7. Financial and transaction assessment

Demonstrated by passing tests on this database:

- Checkout attempt creation is idempotent for the same attempt id, including concurrent callers (`checkout-concurrency.test.mjs`).
- `place_order` decrements stock and writes the financial snapshot in one transaction. Insufficient stock, mixed merchants, an inactive merchant, and a merchandise total mismatch roll the transaction back (`stage-b-place-order-behavior.test.mjs`).
- Coupon usage increment and loyalty spend are part of that same behavior suite and passed.
- Return review, receipt, and refund completion enforce amount, idempotency, unique refund reference, and merchant scope (`returns-refunds.test.mjs`).
- Notification outbox claim and crash recovery passed (`outbox-worker.test.mjs`).
- Two concurrent first commercial agreements do not both stay open-ended.

Source risks that this run did not turn into a failing test:

- `delivery-operations.service.ts` line 151 calls finance handling after `transition_delivery_status` commits. A crash between those steps leaves delivery status and ledger accrual apart until a later retry. The comment calls the finance call idempotent. That idempotency was not re-proven by a fault-injection test in this phase.
- COD collection, payout batch approval, and ledger reversal live in admin services and SQL RPCs. This suite did not fail a payout or reversal case. Absence of a failure is not proof that a crash between the delivery RPC and the finance call is safe.
- `CHECKOUT_IDEMPOTENCY_REQUIRED` still defaults off in application code. The database idempotent RPC works when an attempt id is supplied. A submit without an attempt id still has a non-idempotent path.
- The in-process domain event bus still swallows handler errors. The durable outbox path is separate and the worker test passed.
- The six definers without `search_path` include coupon and loyalty helpers. That is a privilege-hardening gap, not a demonstrated double-spend in this run.

No fix was applied.

## 8. Dependency and security assessment

`npm audit` was read-only. Exit code 1 means advisories exist. `npm audit fix` was not run.

Backend, 15 advisories: 1 critical, 8 high, 6 moderate. 3 direct, 12 transitive. Direct high: `@nestjs/platform-express`. Critical transitive: `proxy-addr`. Other highs include `body-parser`, `multer`, `ws`, `js-yaml`, `fast-uri`, `brace-expansion`, `browserslist`. Fixes that force a Nest major upgrade are breaking-risk. Transitive patches inside the current Nest line are the compatible option to evaluate later, not in this phase.

Frontend, 35 advisories: 6 critical, 13 high, 16 moderate. 9 direct, 26 transitive. Direct critical: `@capacitor/android` and `@capacitor/ios` in `>=8.3.5 <8.4.3`, with a non-major fix at 8.6.3. That bump is still deferred with the Android rebuild. Direct high: `@capacitor/assets` (major 4.0.0), `vite` (fix reported at 8.3.8, major), `zod` (fix 4.6.7, major). Direct critical: `vitest` (fix 5.1.2, major). Transitive criticals include `tar`, `handlebars`, and `tinypool`. These are build-time or mobile-tooling reachability more than the storefront runtime, except `zod` if it validates request payloads in the app. No advisory was treated as permission to upgrade.

The local catalog adds a concrete finding: six public SECURITY DEFINER functions have no `search_path`. Supabase advisor output from the hosted project was not re-fetched. Those six names are the local assessment items.

## 9. Lint baseline

`npx eslint "src/**/*.{ts,tsx}" "scripts/**/*.mjs" -f json` exit 1.

483 files reported, 449 errors, 33 warnings.

| Severity | Rule | Count |
|---|---|---|
| error | `@typescript-eslint/no-explicit-any` | 446 |
| warning | `react-refresh/only-export-components` | 25 |
| warning | `react-hooks/exhaustive-deps` | 8 |
| error | `@typescript-eslint/no-empty-object-type` | 2 |
| error | `no-control-regex` | 1 |

Critical CI on this repository does not run `npm run lint`. A green CI run is not a lint pass.

No-new-errors strategy for later V2 work: keep the rule set, record this 449/33 baseline, and fail a future CI lint job only when the count for a rule increases or a changed file adds a new diagnostic. Do not turn the rules off and do not mass-rewrite `any` inside a feature phase.

## 10. Infrastructure follow-up

Independent GitHub evidence for SHA `11704d4`:

| Run | Result |
|---|---|
| Critical CI [45783559002](https://github.com/dilmart-info/Dilmart/actions/runs/45783559002) | success |
| Netlify workflow_run [45784200688](https://github.com/dilmart-info/Dilmart/actions/runs/45784200688) | success |
| Netlify workflow_dispatch [45797758161](https://github.com/dilmart-info/Dilmart/actions/runs/45797758161) | success, including `Build and publish to Netlify` |

No Native Foundation run was listed for this SHA. Android rebuild stays deferred. This task did not call the production health URL.

`render.yaml`, `ai/ENVIRONMENT_SOURCE_OF_TRUTH.md`, and `scripts/ci/verify-store-production-build-env.mjs` point at `dilmart-store-api` / `https://dilmart-store-api.onrender.com`.

The retired host `dilmart-store-backend.onrender.com` is still an active default or instruction in:

- `backend/src/modules/health/health.controller.ts` service name `DilMart-store-backend`
- `backend/src/main.ts` operator text
- `src/pages/admin/JenniIntegration.tsx` webhook URL shown to admins
- `src/pages/admin/Login.tsx` Render dashboard instructions
- product-import scripts under `scripts/product-import/` (`EXPECTED_BACKEND_API` and hardcoded API constants)
- `backend/scripts/check-otp-production-readiness.mjs` and `check-otp-staging-readiness.mjs`
- `backend/scripts/test-render-auth.mjs`, `jenni-webhook-smoke.mjs`, `jenni-sync-reference.mjs`
- tests that default `STORE_BACKEND_URL` or `PUBLIC_BACKEND_URL` to the retired host, including `phase5a-checkout-live.test.mjs`

Historical docs and evidence JSON also mention the old host. The CI test `verify-store-production-build-env.test.ts` treats that host as retired. Auth hooks, CORS, and Jenni webhook acceptance remain pending operational checks. They were not changed here.

## 11. Blockers

### P0

1. G0 decisions D01–D13 remain open. This phase adds local catalog evidence. It does not freeze contracts.
2. One public table in the production reference count is not in the local replay. Naming it requires an owner-supplied list or a later authorized read. Do not reconcile by editing migrations.
3. No Store staging project exists. This disposable stack is not staging.

### P1

1. Six SECURITY DEFINER functions have no `search_path`.
2. Delivery finance still runs after the delivery RPC commits.
3. Checkout idempotency is optional unless the environment flag is on.
4. Lint fails with 449 errors and is outside critical CI.
5. npm audit has critical advisories. Capacitor 8.6.3 is a non-major fix but is tied to the deferred Android rebuild. Vite, Vitest, Zod, and Capacitor assets fixes are major.
6. Retired backend hostname remains in admin UI, health identity, import scripts, and smoke-test defaults.
7. Docker published the disposable database on all interfaces. Future local runs should bind `127.0.0.1` if the CLI allows it.
8. `test:db-integration` does not build `backend/dist`, so a clean worktree fails three files until `npm run build`.

### P2

1. PostGIS is available and not enabled. Do not enable it until a frozen schema needs it.
2. The product-import unique-violation retry remains a todo, not a live test.
3. Studio health check timed out on CLI 2.177.1 with the default Studio container. Studio was not required for this proof.

## 12. Decision register

| ID | Update from this phase | Status |
|---|---|---|
| D01 | Local replay confirms 175 migrations, 80 policies, PostGIS not installed, and a 62-versus-63 table difference | Evidence improved. Not accepted as freeze. |
| D02 | Submit-time stock decrement and rollback passed on the disposable database. Reservation-versus-decrement is still an open product choice. | Open |
| D03–D05, D08, D10–D12 | No new operational evidence | Open |
| D06 | Snapshot and coupon behavior passed for the single-merchant RPC. IQD split rules for a master order are still unwritten. | Open |
| D07 | No cash-custody tables. COD and payout crash behavior was not fault-injected. | Open |
| D09 | Customer app remains Capacitor. No device spike. | Open |
| D13 | Jenni pricing and dispatch are still separate switches in source. Provider exclusivity is not implemented. | Open |

## 13. Recommendations before Phase 0.3

1. Keep G0 open until the owner accepts the 62-versus-63 table difference or supplies the missing name from an authorized inventory.
2. Treat the disposable project id `dilmart-p02a-disposable` as the pattern for local proof. Do not start Supabase with the production ref as `project_id`.
3. Require `npm run build` before `test:db-integration` in the local runbook so missing `dist` is not mistaken for a database failure.
4. Add lint as a no-new-errors gate rather than a mass cleanup.
5. Schedule dependency upgrades in their own change, with the Capacitor patch held until the Android rebuild is authorized.
6. Plan a hostname sweep of admin copy and script defaults as an operational task, not as part of V2 schema work.
7. Do not enable PostGIS, do not author V2 DDL, and do not provision staging from this report.

## 14. What this phase did not do

No production mutation, no remote migration, no production query, no live smoke from this session, no webhook edit, no mobile rebuild, no dependency upgrade, no lint rewrite, no Phase 0.3, and no V2-01.
