# DilMart 2.0 — PRE-G0-02R Linux CI Database Baseline

Date: 2026-11-27
Task: PRE-G0-02R
Repository: https://github.com/dilmart-info/Dilmart
Current main SHA: `d43f48b75919a4ec7fd9a24f28be11a2e54759c1`
Tested commit SHA: `5a077e846d049f96798fbe76a96588b605f46928`
G0: **OPEN / BLOCKED**
Reports 18 and 19: unchanged

## Verdict

**PASS WITH NOTES, proposed for independent review.** This task does not accept the gate. The owner and an independent reviewer still have to accept it.

The notes are the existing product-import TODO, the historical Windows suite failures in report 19, and the GitHub-hosted runner publishing local Supabase ports on `0.0.0.0` inside that ephemeral job. None of those points change the TAP result below.

## 1. Evidence source

Verified from the GitHub Actions API and the downloaded job log. The reviewer summary was not copied as the source.

| Item | Verified value |
|---|---|
| Workflow | DilMart Store Launch Critical PR Quality & Security CI |
| Run | [45897529060](https://github.com/dilmart-info/Dilmart/actions/runs/45897529060) |
| Job | Build, Lint, Test & Guard Baseline, id `140175014002` |
| Job URL | https://github.com/dilmart-info/Dilmart/actions/runs/45897529060/job/140175014002 |
| Event | `pull_request` |
| Branch | `docs/v2-pre-g0-01-02-evidence` |
| Head SHA | `5a077e846d049f96798fbe76a96588b605f46928` |
| Job conclusion | success |
| Job window | 2026-11-26T21:21:10Z to 2026-11-26T21:26:26Z |

Runner: GitHub-hosted Ubuntu 26.04.1 LTS, image `ubuntu-26.04` version `20261122.9.1`, runner `2.338.2`, region `centralus`.

## 2. Build, migrations, and target

`Build Backend` completed with conclusion success before the database step.

`Setup Supabase CLI` used `supabase/setup-cli@v1` with `version: latest`. The action checkout recorded in the log is `1dedf2c611547ede7232d26866dd3c56ab903bbb`. The log does not print `supabase --version`. The database image pulled and started is `public.ecr.aws/supabase/postgres:17.12.0.002`. The log does not contain a `SELECT version()` line.

`Start Supabase Local Stack and Verify Upgrade Path` completed with conclusion success. The log shows both `supabase db reset` runs finishing, Migration A `20260831100000` applied, the pre-B `DO` check, Migration B `20260831120000` applied, the single-row `DO` check, an idempotent `migration up` that reported `Local database is up to date`, the three post-Stage-B files applied, and the `final-schema-gate.sql` `DO` statements. The next job step started immediately after those statements, which is the success path for `bash -e`.

Database target printed by the CLI: `127.0.0.1:54322`. API target exported to the test step: `SUPABASE_URL=http://127.0.0.1:54321`. Keys in the log are masked.

The same startup log prints: `All services bind to 0.0.0.0 (network-accessible, not just localhost)`. That is the CLI default on this runner. The tests still called `127.0.0.1:54321`. This job is an ephemeral GitHub runner, not the Windows Docker host used in report 19.

## 3. Canonical suite

The step is exactly:

```text
cd backend
npm run test:db-integration
```

The script printed:

```text
node --test --test-concurrency=1 tests/db-integration/*.test.mjs
```

The glob is every `*.test.mjs` in that directory. Current main has 18 such files, and the tested tree is the same runtime tree as current main. The log contains no `--test-name-pattern`, no file skip, and no `not ok` line inside this step. TAP ends at `1..23` top-level tests.

```text
# tests 116
# suites 1
# pass 115
# fail 0
# cancelled 0
# skipped 0
# todo 1
# duration_ms 7902.898408
```

The step uses `bash -e`. The following step, Commercial & Security Policy Tests, started at `2026-11-26T21:25:20Z`, so this command exited 0.

## 4. TODO

One TODO remains, and the log quotes it:

`non-slug unique_violation re-raises unchanged instead of retrying — verified by code review of GET STACKED DIAGNOSTICS CONSTRAINT_NAME handling (no second unique constraint exists on public.products today to exercise this live`

Source: `backend/tests/db-integration/product-import-confirm-atomic.test.mjs`. Node reports it as TODO, not as a pass. The slug-collision path is what the live tests cover. The other unique-violation branch has no second unique constraint on `public.products` to hit.

## 5. Tree equivalence

`git diff 5a077e846d049f96798fbe76a96588b605f46928 d43f48b75919a4ec7fd9a24f28be11a2e54759c1` is empty. The tested PR commit and current `main` have the same tree.

`git diff 7428aea03f680e4c5bdb532b637986421baea5d1 d43f48b75919a4ec7fd9a24f28be11a2e54759c1` contains only:

- `docs/dilmart-2.0/18_PRE_G0_01_SCHEMA_VERIFICATION_REPORT.md`
- `docs/dilmart-2.0/19_PRE_G0_02_DATABASE_BASELINE_REPORT.md`

No application, migration, test, configuration, or lockfile change landed between the parent of the tested commit and current main. The runtime sources CI executed are the runtime sources on current main.

## 6. Historical Windows result

Report 19 stays in force. Three Windows full-suite invocations exited 1. Those failures are not withdrawn. They are a different environment: a manually rebound Docker Desktop stack whose auth, storage, and realtime services were unhealthy or flaky. This Linux job is the clean full-suite evidence. It does not require another Windows run.

## 7. Independent acceptance

A reviewer should open the job log, confirm the TAP block in section 3, and confirm the empty tree diff in section 5. Acceptance of PRE-G0-02R does not close the TODO, does not close ED-01, and does not open G0.
