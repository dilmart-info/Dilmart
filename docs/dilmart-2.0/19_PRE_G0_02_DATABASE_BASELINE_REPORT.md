# DilMart 2.0 — PRE-G0-02 Database Integration Baseline

Date: 2026-11-26
Task: PRE-G0-02
Repository: https://github.com/dilmart-info/Dilmart
Verified baseline SHA: `7428aea03f680e4c5bdb532b637986421baea5d1`
Worktree: `D:\DilMart-v2-pre-g0`
Branch: `docs/v2-pre-g0-01-02-evidence`
G0: **OPEN / BLOCKED**
Application code, tests, lockfiles, and migrations: **not modified**

## Verdict

**FAIL.** No full-suite invocation exited 0. A failing full run is not a pass, and later reruns are not a substitute for that result.

## 1. Command that was verified

Root `package.json` has no `test:db-integration` script. Backend `package.json` does. Critical CI runs it from `backend/` after the stack is up:

```text
npm run test:db-integration
```

That script is:

```text
node --test --test-concurrency=1 tests/db-integration/*.test.mjs
```

There are 18 test files. `npm ci --ignore-scripts` in `backend/` used the committed lockfile. `npm run build` in `backend/` exited 0 before any suite, and `backend/dist/modules/marketplace/customer-entry/customer-entry.service.js` was present. No dependency was upgraded. No test was edited, skipped, or excluded.

Every run set `SUPABASE_URL` to `http://127.0.0.1:56121` and aborted if that URL differed. The service-role and anon keys were the local CLI demo keys for project `dilmart-preg0-disposable`. They are not recorded here. Published disposable ports were checked for `0.0.0.0` and `[::]` before the runs.

## 2. Full-suite runs

Private logs: `D:\DilMart-preg0-private\db-test.log`, `db-test-2.log`, and `db-test-3.log`.

| Run | Database state | Start | End | Exit | Tests | Pass | Fail | Skipped | TODO |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Fresh replay, before other suite writes | 2026-11-26T23:09:53+03 | 2026-11-26T23:20:23+03 | 1 | 116 | 103 | 12 | 0 | 1 |
| 2 | Same database after auth restart | 2026-11-26T23:32:07+03 | 2026-11-26T23:41:05+03 | 1 | 116 | 109 | 6 | 0 | 1 |
| 3 | Same database after runs 1 and 2 | 2026-11-26T23:43:16+03 | 2026-11-27T00:14:17+03 | 1 | 116 | 77 | 38 | 0 | 1 |

Run 1 is the only full invocation against the freshly replayed database. Its 12 failures were service errors, not SQL assertion mismatches in the place-order behavior file:

- `products-public-rls.test.mjs` case 6 ran about 110 seconds and failed with an empty error object.
- `products-storage-write-lockdown.test.mjs`: storage HTTP 504 `The upstream server is timing out`, plus follow-on storage assertion failures.
- `returns-refunds.test.mjs`: five cases failed in `GoTrueAdminApi.createUser` with `AuthRetryableFetchError`.

At that time `supabase_auth` and `supabase_realtime` were unhealthy after the loopback rebind. Storage was marked healthy and still timed out through the API.

Run 2 started after `supabase_auth` was restarted and reported healthy. All 6 failures were still `AuthRetryableFetchError` during user creation, in checkout-attempt concurrency, one commercial-terms case, and outbox worker recovery. That run is a second full invocation. It is not a pass, and its passes are not added to run 1.

Run 3 was another full invocation on a database that already held synthetic rows from the earlier runs. It failed more widely, including `orders_order_number_key` duplicate `DUK-261126-1266` and `orders_governorate_id_fkey` for a governorate id that was not present. Those results are recorded so they are not mistaken for a clean-database defect. They are not a fresh-schema proof.

## 3. TODO

`backend/tests/db-integration/product-import-confirm-atomic.test.mjs` still has one `t.todo`. The case is the non-slug `unique_violation` path. The test says `public.products` has no second unique constraint that can exercise it, and the SQL under `20260801190000_product_import_confirm_atomic.sql` is the intended behavior. The TODO was not removed and was not counted as a pass. Impact: the slug-collision retry can be tested; the "any other unique violation must re-raise" branch has no live fixture on this schema.

## 4. Integrity observations inside run 1

These statements use only tests that were not in the run 1 failure list. They are observations inside a suite that exited 1. They are not a suite pass and they are not fault-injection coverage.

Passed inside that failing run, because they were not among the 12 failures: the Stage B place-order behavior file, including stock decrement, insufficient-stock rollback, financial snapshot, and loyalty spend, and the outbox file as a whole. Run 2 then failed the outbox recovery case and the checkout concurrency cases on auth fetch, so those areas are not stable on this host. Returns and refunds did not get past auth user creation on run 1.

Not demonstrated: a crash between delivery status commit and finance accrual, COD collection, payout approval, ledger reversal, or cancellation fault injection. PRE-G0-03, PRE-G0-04, and PRE-G0-05 were not run.

Retired B2B and federated tables named in the local catalog query were absent. That catalog check is in the PRE-G0-01 report.

## 5. Environment cause and the fix that was not applied

The failures that repeat on a fresh database are local API timeouts and GoTrue fetch errors after the containers were recreated onto loopback. No application change was made. A separate task would need a disposable stack whose CLI reset keeps `127.0.0.1` bindings and whose auth and storage stay healthy for one uninterrupted suite. Until that run exits 0, PRE-G0-02 stays failed and the historical TODO stays open.

## 6. Cleanup

`supabase stop --workdir D:\DilMart-preg0-sb` exited 0. No container named `dilmart-preg0-disposable` remained. Ports 56121, 56122, and 56124 were not listening. The loopback network and the temporary Kong image were removed. Volumes `supabase_db_dilmart-preg0-disposable`, `supabase_edge_runtime_dilmart-preg0-disposable`, and `supabase_storage_dilmart-preg0-disposable` remain and are not published. The `oghivndlzlckoschjjfg` stack and MaxHub containers were still up. `D:\DilMart` remained at `10d11c0d79cf8e3597723fbf296b9cf90bcb2979`.

## 7. Independent review

A reviewer should repeat one `npm run test:db-integration` from `backend/` on a new disposable database, after `npm run build`, with auth and storage healthy before the first test, and with no earlier suite writes in that database. The required result is one exit 0, with the TODO still counted separately. This report does not provide that result.
