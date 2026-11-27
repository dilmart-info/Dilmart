# DilMart 2.0 — PRE-G0-01 Schema Verification

Date: 2026-11-26
Task: PRE-G0-01
Repository: https://github.com/dilmart-info/Dilmart
Verified baseline SHA: `7428aea03f680e4c5bdb532b637986421baea5d1`
Baseline commit: `docs: Phase 0.3J implementation roadmap, decision register and G0 gate (#64)`
Worktree: `D:\DilMart-v2-pre-g0`
Branch: `docs/v2-pre-g0-01-02-evidence`
G0: **OPEN / BLOCKED**
Phase 0.3 runtime work, V2-01, and other Pre-G0 tasks: **not started**

## Verdict

**BLOCKED** for the required production fingerprint comparison.

Local migration replay and the local catalog inventory completed. The twelve-category comparison against production is **NOT VERIFIED**. The owner files were not present:

- `D:\DilMart-PreG0-Evidence\dilmart_pre_g0_01_fingerprint.sql`
- `D:\DilMart-PreG0-Evidence\dilmart_pre_g0_01_production_fingerprints.csv`

This task did not connect to production, did not modify the fingerprint query, and did not invent a substitute production export. Matching local counts are not structural equivalence. ED-01 stays open until an independent review of a real category-by-category comparison.

## 1. Identity and tools

`git fetch origin main` moved `origin/main` to `7428aea03f680e4c5bdb532b637986421baea5d1`. That matches the expected SHA. The dirty checkout at `D:\DilMart` stayed on `10d11c0d79cf8e3597723fbf296b9cf90bcb2979` and was not reset, cleaned, or edited.

```text
Git: 2.54.0.windows.1
Node: v22.22.3
npm: 11.17.0
Docker client and server: 29.9.2
Supabase CLI binary: 3.2.0
Host psql: not installed
```

SQL ran with `docker exec` into the disposable database as `postgres` or, for one database recreate attempt, `supabase_admin`.

```text
Repository: dilmart-info/Dilmart
Git branch: docs/v2-pre-g0-01-02-evidence from the verified SHA
Render service: not contacted
Backend hostname: not contacted
Supabase project ref: none linked
Environment role: disposable local database
```

## 2. Isolation

Existing stacks were left in place: Supabase project `oghivndlzlckoschjjfg` on 54321/54322/54324/54327, and MaxHub on 55432/6379/1025/8025. Prior disposable volumes named `dilmart-p02a-disposable` were not reset.

The repository `supabase/config.toml` still names the live Store ref. It was not used and was not edited. A separate directory `D:\DilMart-preg0-sb` held a copy of the 175 forward SQL files and a config whose project id is `dilmart-preg0-disposable`. API 56121, database 56122, shadow 56120, SMTP 56124. Studio and analytics were disabled. Seed was disabled because this baseline has no `supabase/seed.sql`. No `supabase link` and no `--remote` flag were used.

Docker can publish `127.0.0.1` when the host IP is set explicitly. Supabase CLI 3.2.0 publishes ports with an empty host IP, which Docker exposes on `0.0.0.0` and `[::]`. A custom bridge with `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` did not change that. The documented network option therefore did not establish loopback on this Docker Desktop host.

The published Kong, database, and mailpit containers were stopped and recreated with `127.0.0.1` host bindings and the container DNS names the other services use. `Get-NetTCPConnection` then showed listeners only on `127.0.0.1` for 56121, 56122, and 56124.

`supabase db reset` replaces the database container and publishes it on all interfaces again. That happened during the pre-Stage-B reset. The all-interface container was stopped immediately after that command returned, then republished on `127.0.0.1` before the Stage B SQL, the final schema gate, the catalog queries, and the integration tests. Tests were refused if any disposable published port was `0.0.0.0` or `[::]`.

## 3. Migration replay

The CI order in `.github/workflows/ci.yml` was followed against the disposable copy. Rollback files were not present in `supabase/migrations` and were not applied. Commands were local `supabase db reset` and `supabase migration up`. Gate SQL used `docker exec` and `ON_ERROR_STOP=1`.

| Step | Result |
|---|---|
| Park migrations with timestamp >= `20260725090000` | 47 files moved, 128 left |
| First `supabase db reset` | exit 1 after applying migrations; storage health timed out while resolving the recreated database hostname. Applied head was `20260724170000` (128 rows). |
| `pre-final-patch-historical-state.sql` | exit 0 |
| Apply `20260725090000` and the restored later files with `migration up` | exit 0. Ports stayed on `127.0.0.1`. |
| Park migrations >= `20260831100000` | 5 files moved, 170 left |
| In-place `DROP DATABASE` as `postgres` | exit 3. `postgres` is not a superuser on this image. |
| In-place `DROP DATABASE` as `supabase_admin` | exit 0, then `migration up` exit 1: `storage.buckets` did not exist because the image init schemas were gone. |
| Second `supabase db reset` on the 170-file set | exit 1 on storage health after the container replacement. Catalog head was `20260830210000` (170 rows). Container was rebound to `127.0.0.1` before the next SQL. |
| `stage-b-rollback-and-upgrade-gate.sql` | exit 0 |
| Apply Migration A `20260831100000` | exit 0 |
| Assert Migration B absent | exit 0 |
| Apply Migration B `20260831120000` | exit 0 |
| Assert Migration B recorded once | exit 0 |
| `migration up` with no new file | exit 0 |
| Restore and apply the three post-Stage-B files | exit 0 |
| `final-schema-gate.sql` | exit 0 |
| `migration up` again | exit 0 |

Final local history: **175** rows in `supabase_migrations.schema_migrations`, first `20260214175155`, last `20260909170000`.

Private command logs, not committed: `D:\DilMart-preg0-private\replay.log`, `reset1.log`, `reset2.log`.

## 4. Local catalog

Queried from `pg_catalog` on the disposable database after the replay and before the integration suite. No business rows were exported.

PostgreSQL `17.12` on `x86_64-pc-linux-gnu`. Session `search_path` was `"$user", public, extensions`.

| Metric | Local result | Historical expected baseline |
|---|---|---|
| Applied migrations | 175 | 175 |
| Public ordinary tables (`relkind = r`) | 62 | 62 |
| Public partitioned tables | 0 | not separately stated |
| Public views | 3 | 3 |
| Public RLS policies | 80 | 80 |
| Public functions | 66 | 66 |
| Public indexes | 229 | 229 |
| Non-internal public triggers | 17 | 17 |
| RLS enabled | 62 of 62 | 62 of 62 |
| RLS forced | 1 table, `auth_hook_deliveries` | not in the count baseline |

Installed extensions: `plpgsql` 1.0, `pgcrypto` 1.3, `uuid-ossp` 1.1, `pg_stat_statements` 1.11, `supabase_vault` 0.3.2.

Available and not installed, among the names checked: `postgis`, `pg_trgm`, `vector`.

`store_carts`, `store_cart_items`, `store_linked_profiles`, and `delivery_recommendations` are absent.

Six `SECURITY DEFINER` functions in `public` have no `search_path` setting: `claim_pending_points`, `get_available_points`, `get_order_status`, `handle_order_status_points`, `handle_profile_points_claim`, `increment_coupon_usage`.

Public enums: 0. Public sequences: 0.

## 5. Production fingerprint comparison

| Category | Result |
|---|---|
| Relations | NOT VERIFIED |
| Columns | NOT VERIFIED |
| Constraints | NOT VERIFIED |
| Indexes | NOT VERIFIED |
| Policies | NOT VERIFIED |
| Functions | NOT VERIFIED |
| Triggers | NOT VERIFIED |
| Views | NOT VERIFIED |
| Relation grants | NOT VERIFIED |
| Function grants | NOT VERIFIED |
| Extensions | NOT VERIFIED |
| Migration versions | NOT VERIFIED |

No production CSV was available, so no category is MATCH or MISMATCH. Local counts that agree with the older 62-table reference are not a fingerprint match.

The supplied fingerprint query could not be reviewed. These coverage items remain unproven even after that query arrives, unless the query text includes them:

- Custom types, enums, and domains outside the relation/column fingerprints
- Sequence definitions
- Column-level privileges
- Default privileges
- Schema-level grants
- Role memberships
- Partition definitions
- Objects outside `public` that the application uses, including `auth`, `storage`, and `extensions`

## 6. What this report does not claim

ED-01 is not closed. Full structural equivalence is not established. Production PostgreSQL version and production `search_path` were not observed by this task, so deparsed-definition differences cannot yet be separated from real drift.

## 7. Independent review

Reviewer needs the two missing files, unchanged, and a rerun of that exact SQL against a fresh disposable database at SHA `7428aea03f680e4c5bdb532b637986421baea5d1` or a later owner-approved main. Until that diff exists, do not accept D01 or authorize DDL.

## 8. Private artifacts

Kept outside the repository under `D:\DilMart-preg0-private\`. They contain local CLI status output and must not be committed. Disposable volumes retained after stop:

- `supabase_db_dilmart-preg0-disposable`
- `supabase_edge_runtime_dilmart-preg0-disposable`
- `supabase_storage_dilmart-preg0-disposable`

No disposable container remained. Ports 56121, 56122, and 56124 had no listeners after stop. The pre-existing Supabase and MaxHub containers were still running.
