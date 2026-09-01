# ENVIRONMENT_SOURCE_OF_TRUTH.md — DilMart / DilMart-Store

> **AUTHORITATIVE — owner-confirmed operational topology**
>
> Effective: **2026-09-01**
>
> This file is the canonical environment map for both `cylendralabs-blip/DilMart` and
> `dilmart-info/Dilmart`.
>
> **If any older README, runbook, closure report, test fixture, safety gate, or historical document
> conflicts with this file, this file wins until the product owner explicitly updates it.**
>
> Before any deployment, environment-variable mutation, database migration/write, or live smoke test,
> re-verify the live provider binding. A Git branch, a deployed service, and a Supabase project are
> separate concepts.

---

## 1. Canonical map

```text
                         DilMart MAIN

STAGING
  GitHub repository : cylendralabs-blip/DilMart
  Git branch        : staging
  Render service    : DilMart-backend-staging
  Backend URL       : https://DilMart-backend-staging.onrender.com
  Supabase project  : DilMart-Staging-3
  Supabase ref      : zlmdwhuphuxppxznsgso
  Supabase URL      : https://zlmdwhuphuxppxznsgso.supabase.co

PRODUCTION
  GitHub repository : cylendralabs-blip/DilMart
  Git branch        : main
  Render service    : DilMart-backend
  Backend URL       : https://DilMart-backend.onrender.com
  Supabase project  : DilMart2
  Supabase ref      : yssjhxeybitiycdviyrc
  Supabase URL      : https://yssjhxeybitiycdviyrc.supabase.co


                        DilMart-STORE

CURRENT / LIVE
  GitHub repository : dilmart-info/Dilmart
  Git branch        : main
  Render service    : DilMart-store-backend
  Backend URL       : https://DilMart-store-backend.onrender.com
  Supabase project  : DilMart-Store
  Supabase ref      : ztplxqlthuqkuktbznbo
  Supabase URL      : https://ztplxqlthuqkuktbznbo.supabase.co

  NO SEPARATE DilMart-STORE STAGING BRANCH
  NO SEPARATE DilMart-STORE STAGING RENDER BACKEND
  NO SEPARATE DilMart-STORE STAGING SUPABASE PROJECT
```

---

## 2. Critical identity rules

### DilMart Main

- `staging` means the **DilMart integration branch**.
- `DilMart-backend-staging` is the **DilMart staging Render backend**.
- `zlmdwhuphuxppxznsgso` (`DilMart-Staging-3`) is the **canonical DilMart staging Supabase project**.
- `main` is the **DilMart production code line**.
- `DilMart-backend` is the **DilMart production Render backend**.
- `yssjhxeybitiycdviyrc` (`DilMart2`) is the **DilMart production Supabase project**.

### DilMart-Store

- The product/system name may remain **DilMart-Store**.
- The **canonical GitHub repository** for this Store codebase is `dilmart-info/Dilmart`.
- `main` is the **current Store code line used by the live Store backend**.
- `DilMart-store-backend` is the current/live Store Render backend.
- `ztplxqlthuqkuktbznbo` is the current/live Store Supabase project.
- **There is currently no separate Store staging environment.**
- **Repository identity, branch, deployed service, and database are separate authority dimensions.**

---

## 3. Do not confuse the projects

These mappings are mandatory:

```text
zlmdwhuphuxppxznsgso  => DilMart MAIN staging only
yssjhxeybitiycdviyrc  => DilMart MAIN production only
ztplxqlthuqkuktbznbo  => DilMart-Store current/live only
```

Therefore:

- Never call `zlmdwhuphuxppxznsgso` a "DilMart-Store staging DB".
- Never point DilMart-Store runtime or Store migration work at `zlmdwhuphuxppxznsgso` merely because a
  Store safety test calls it a rejected/staging ref.
- A Store guard that rejects `zlmdwhuphuxppxznsgso` means **"do not accidentally target DilMart staging"**;
  it does **not** prove that Store has its own staging environment.
- Historical DilMart staging refs such as `iwaxckiiclzwkbcadgwg` or validation-only projects are not the
  current canonical staging target unless the owner explicitly changes this file.

---

## 4. Environment vs branch

Do not collapse these into one concept:

1. Git repository / branch
2. Render service
3. Supabase project
4. deployed commit
5. feature-flag state

For DilMart Main, `staging` and `main` have distinct deployed backends and databases.
For DilMart-Store, `main` is the only current code/deployment line; there is no separate Store staging stack.

A merge does not by itself prove that a particular Render service is running that commit. Always verify the
provider/deploy metadata before making a live-state claim.

---

## 5. Mandatory pre-mutation gate for every AI agent

Before any live operation, print/verify the intended target using non-secret metadata:

```text
Repository:
Git branch:
Render service:
Backend hostname:
Supabase project ref:
Environment role: STAGING / PRODUCTION / STORE CURRENT
```

Then apply these rules:

- DilMart staging mutation => must target branch `staging`, Render `DilMart-backend-staging`, Supabase
  `zlmdwhuphuxppxznsgso` unless a task explicitly separates code/deploy/DB actions.
- DilMart production mutation => must target branch `main`, Render `DilMart-backend`, Supabase
  `yssjhxeybitiycdviyrc`, and requires the normal production authorization gate.
- DilMart-Store mutation => targets Store `main` / `DilMart-store-backend` / `ztplxqlthuqkuktbznbo` only when
  explicitly authorized. **Do not invent a Store staging target.**

If any identifier conflicts with this map, **STOP and ask the owner to reconcile the environment source of
truth before writing anything**.

---

## 6. DilMart ↔ Store integration work

Because DilMart-Store has no separate staging stack:

- Main-side integration development and validation should use **DilMart Main staging** where applicable.
- Store-side feature flags remain default-off until a controlled live Store activation is explicitly authorized.
- Do not create a new Store staging service/database as an inferred prerequisite. That requires a separate owner
  infrastructure decision.
- Do not use the DilMart staging Supabase project as a substitute for Store data.

---

## 7. Update rule

This document must be updated whenever any of these change:

- canonical Git branch role
- Render service name/hostname
- Supabase project/ref
- introduction or retirement of a Store staging environment

Environment changes are not complete until this file (and the corresponding copy in the other repository) is
updated through a reviewed docs/governance change.
