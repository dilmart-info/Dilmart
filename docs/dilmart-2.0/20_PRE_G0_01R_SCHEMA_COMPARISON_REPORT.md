# DilMart 2.0 — PRE-G0-01R Schema Comparison

Date: 2026-11-27
Task: PRE-G0-01R
Repository: https://github.com/dilmart-info/Dilmart
Current main SHA: `d43f48b75919a4ec7fd9a24f28be11a2e54759c1`
G0: **OPEN / BLOCKED**
Reports 18 and 19: unchanged
Production: not contacted

## Verdict

**BLOCKED.**

The production fingerprint files are not on disk, and no authorized environment can run the supplied SQL without a new CI workflow or a repeat of the unstable Windows Docker procedure. No category is MATCH or MISMATCH. ED-01 stays open.

## 1. Fingerprint files

Expected paths and SHA-256:

| File | Expected SHA-256 | Present |
|---|---|---|
| `D:\DilMart-PreG0-Evidence\dilmart_pre_g0_01_fingerprint.sql` | `a855f0562c4a33c20076eab34cfd1937b85ecbd5489639df4d97e65e90b5ff5f` | no |
| `D:\DilMart-PreG0-Evidence\dilmart_pre_g0_01_production_fingerprints.csv` | `6d270610390c1ea3d797b6fbc02590b3adbeee811ef15c63b0bf68894c213afb` | no |

`D:\DilMart-PreG0-Evidence` does not exist. No replacement fingerprints were created. The SQL was not edited because it was not available.

## 2. Why a local rerun was not started

Options, in the required order:

| Option | Result |
|---|---|
| A. Existing Linux CI | Run `45897529060` executed the migration upgrade and `npm run test:db-integration`. It did not execute the fingerprint SQL, and it did not upload a schema fingerprint artifact. |
| B. WSL2 | `wsl -e uname -a` returned `Wsl/Service/E_UNEXPECTED`. Installing or repairing WSL is not authorized. |
| C. New local Docker stack | Report 19 records that CLI `db reset` republished the database on all interfaces and that manual container replacement left auth, storage, and realtime unhealthy. That procedure is not repeated. |

Creating a temporary CI workflow would be a workflow change. It is not done in this task. The scope that would be required, for a later explicit authorization, is:

- Trigger: `workflow_dispatch` only. No `pull_request`, no `push`, no schedule.
- Runner: the same Ubuntu image family as the critical CI job.
- Permissions: `contents: read`. No production secrets, no `SUPABASE_ACCESS_TOKEN`, no service-role key from the hosted project.
- Steps: checkout the reviewed SHA, `supabase start` with the repository config only as a local project, run the owner SQL file unchanged through local `psql` against `127.0.0.1`, write `local_schema_fingerprints.csv`, upload that artifact, then `supabase stop`.
- The production CSV stays off the runner and off Git. Comparison happens in a private review workspace after the artifact is downloaded.
- The workflow is deleted, or left disabled, after one reviewed run. It does not change branch protection.

Until that workflow is separately authorized, local fingerprint collection stays stopped.

## 3. Category comparison

| Category | Production | Local | Result |
|---|---|---|---|
| Relations | file absent | not collected in this task | NOT VERIFIED |
| Columns | file absent | not collected in this task | NOT VERIFIED |
| Constraints | file absent | not collected in this task | NOT VERIFIED |
| Indexes | file absent | not collected in this task | NOT VERIFIED |
| Policies | file absent | not collected in this task | NOT VERIFIED |
| Functions | file absent | not collected in this task | NOT VERIFIED |
| Triggers | file absent | not collected in this task | NOT VERIFIED |
| Views | file absent | not collected in this task | NOT VERIFIED |
| Relation grants | file absent | not collected in this task | NOT VERIFIED |
| Function grants | file absent | not collected in this task | NOT VERIFIED |
| Extensions | file absent | not collected in this task | NOT VERIFIED |
| Migration versions | file absent | not collected in this task | NOT VERIFIED |

PostgreSQL version and session `search_path` for a paired comparison were not observed together. Report 18 recorded local PostgreSQL `17.12` and `search_path` `"$user", public, extensions` on an earlier disposable stack at parent SHA `7428aea`. The Linux CI job pulled image `public.ecr.aws/supabase/postgres:17.12.0.002` and did not print `server_version` or `search_path`. Those earlier local counts are not reused here as a production match.

## 4. Coverage still required

The missing SQL could not be reviewed. A later comparison still needs, if the query does not already emit them:

- Custom types, enums, and domains
- Sequence definitions
- Column privileges
- Default privileges
- Schema grants
- Role memberships that the application uses
- Partition definitions
- Relevant objects in `auth`, `storage`, `extensions`, and `app_private`

No business rows, credentials, or password hashes.

## 5. What remains visible

Report 18 remains the record of the Windows disposable replay: 175 migrations, 62 public ordinary tables, 80 policies, and a blocked production comparison. This report does not replace it and does not convert those counts into structural equivalence.

## 6. Independent review

Supply the two files at the paths and hashes in section 1, then authorize the workflow in section 2 or another loopback-stable Linux runner. Do not accept ED-01 from this report.
