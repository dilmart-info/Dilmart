# Closure Report — DilMart-STORE-PRODUCT-READINESS-INVARIANT-001

## Implementation Report

**PASS WITH NOTES.** One authoritative product-readiness definition governs every server-side
path that can leave a product `is_active` / `is_published` / `visibility_status = public`, and
the closure pass shuts the remaining publication-state holes found in review of PR #116:
`updateProduct` no longer persists the client's raw publication triple, every exposure
transition runs the FULL readiness gate, deactivation writes a canonical private triple, the
content-bulk live-description guard is now enforced inside the atomic RPC, and import preview
agrees with the confirm RPC on `active + archived`.

Notes (details below): the two new migrations are **created and verified on a local ephemeral
database only — not applied anywhere else**; the Node `db-integration` suite could not be
executed in this environment (no PostgREST endpoint for this project's local stack), so the
database gates were proven with a committed psql verification script instead; and one
pre-existing, unrelated frontend suite (`src/lib/deep-link/app-link-associations.test.ts`) still
fails to parse under the default vitest config.

## Root causes

Initial pass:

1. `ProductsService.quickAddProduct` carried its own publication logic
   (`payload.is_active ?? true` → `is_published` / `visibility_status`) and never consulted the
   readiness rules every other activation path used. The rules lived in a private method, so no
   shared definition existed that an alternate path could be forced through.
2. `ProductImportService` enforced draft-merchant safety but not readiness, so an active
   merchant's CSV row could publish with no image and no description.

Closure pass (from PR review):

3. `updateProduct` copied `is_active`, `is_published` and `visibility_status` from
   `UpsertProductDto` straight into the update payload. Contradictory rows were therefore
   reachable — `is_active=false` + `is_published=true` + `public`, or `false/true/private` — and
   an already-active product could be published/publicized while only the weaker
   "did this edit newly break something" comparison ran, so a legacy active-but-unready product
   could still be newly exposed.
4. `updateProductStatus(false)` and the bulk `deactivate` action wrote only `is_active=false`,
   leaving `is_published=true` / `visibility_status=public` behind on a product that is off.
5. The content-bulk live-description guard was a service-side pre-read: a concurrent activation
   between the read and `product_content_bulk_update_atomic` could still clear the description of
   a live product, and the exact `.in()` SKU match did not mirror the RPC's
   `upper(btrim(merchant_sku))` normalization.
6. Import preview accepted `is_active=true` + `visibility_status=archived`, which the confirm RPC
   then rejected deterministically — a preview that could never be confirmed.

Second review round (on the closure commit):

7. The first canonicalization still carried `is_published` and `visibility_status` as independent
   axes for an active product, so `is_published=false` + `visibility_status=public` (and the
   mirror image) remained persistable, and an activation transition overrode an explicitly
   requested `private` / unpublished state with published+public — exposing a product more than
   the caller asked for.
8. Archive was sticky only against `is_active`, not against visibility: a generic edit that
   merely carried `visibility_status: "private"` (or `"public"`) took an archived product OUT of
   the archive as a side effect.
9. `backend/tests/db-integration/product-readiness-db-gates.test.mjs` probed
   `product_import_confirm_atomic` with only two named arguments. PostgREST resolves overloads by
   the exact named-argument set, so a correctly migrated database would answer `PGRST202` — the
   suite would have skipped everything, and the anon privilege assertion would have passed for
   the wrong reason.

## What was implemented

### Shared readiness / publication contract

- `backend/src/modules/products/product-readiness.ts` (pure, no I/O) is the single definition of
  readiness (`buildProductReadiness`, `getBlockingActivationChecks`, `isReadyForActivation`,
  `toMissingChecks`, `findNewlyBrokenActivationChecks`) and of the publication triple.
- Closure pass additions:
  - `resolveUpdatePublicationState(existing, requested)` — the canonical triple for an update.
    Archived wins; a product that is not active is always `false / false / private`; an
    inactive→active transition publishes (`true / true / public`); an already-active product
    keeps its own axes (`active + private` private-catalog and `active + unpublished` states are
    preserved) unless the request changes them explicitly.
  - `increasesPublicExposure(existing, target)` — activation, publication or publicization.
  - Second round: for an active product `is_published` and `visibility_status` are ONE coupled
    exposure decision. Once a request touches either axis, exposure requires both, and a request
    that disagrees with the other axis resolves to the LESS exposed combination — so
    `active + published + private` and `active + unpublished + public` can no longer be written.
    A request that touches neither axis leaves an existing (possibly legacy) row untouched, so an
    unrelated edit never silently exposes or hides a product. An activation transition honors
    explicitly pinned axes and only defaults to published+public when they are omitted.
  - Archive is sticky in both directions: an archived product leaves the archive only on an
    explicit `is_active: true` **together with** an explicit target visibility (or through
    `updateProductStatus`), never as a side effect of a request that just carries a `private` /
    `public` visibility value. Asking `updateProduct` to activate an archived product without
    naming the target visibility is refused with a structured `PRODUCT_ARCHIVED` error rather
    than succeeding as a silent no-op.
  - `requestsMorePublicExposure(existing, requested)` — an exposure _ask_ that canonicalization
    turns into a no-op (e.g. `is_published: true` on an `active + private` product) still runs the
    readiness gate, so an unready product's publish attempt fails loudly with `PRODUCT_NOT_READY`
    instead of silently doing nothing.

### `ProductsService`

- One `assertReadyForActivation()` gate for create / update / status / bulk activate / quick add.
- `updateProduct` now: canonicalizes the triple (the client's `is_active` / `is_published` /
  `visibility_status` are deleted from the update payload and only the resolved axes that
  actually change are written); runs the FULL readiness gate on any exposure increase; falls back
  to the "no newly broken check" rule only for an edit that keeps the product at the same
  exposure. Archive stays sticky — `updateProduct` cannot silently un-archive; the explicit
  restore path is `updateProductStatus(is_active=true)`, which is readiness-gated.
- `updateProductStatus` loads the row in both directions and writes the whole triple:
  activation → `true/true/public` (after the gate), deactivation → `false/false/private`, and a
  deactivation of an archived product stays `false/false/archived`.
- Bulk `deactivate` writes the same canonical triple, splitting archived products so they stay
  archived. Bulk `archive` and `activate` unchanged in behavior, now expressed through the shared
  resolver.
- Quick Add activates only when ready, otherwise creates a draft; an explicit `is_active: true`
  on an incomplete payload returns `PRODUCT_NOT_READY`. Duplicate resets `is_published` too.

### Import

- Preview rejects a publish row that fails readiness, a row that sets `is_published`/`public`
  without `is_active`, and (closure pass) `is_active=true` + `visibility_status=archived` — the
  same rule the confirm RPC enforces.

### Content bulk

- The authoritative guard now lives in the RPC (migration below): the matched product row is
  selected `FOR UPDATE` inside the same transaction as the write, and clearing `description` for
  an active/published/public row raises `CONTENT_BULK_PRODUCT_NOT_READY`.
- The service-side check remains as documented fail-fast UX, and now matches SKUs
  case-insensitively (`ilike`) instead of exactly, mirroring the RPC's normalization as closely
  as PostgREST allows (a padded stored SKU still falls through to the RPC, which `btrim`s).

### Frontend (no UI redesign)

- Quick Add toast distinguishes "created as draft" from "created and live"; the API client type
  carries the returned publication triple.

## Files changed

```text
backend/src/modules/products/product-readiness.ts                        (new)
backend/src/modules/products/products.service.ts
backend/src/modules/products/product-import.service.ts
backend/src/modules/products/product-content-bulk.service.ts
backend/scripts/verify-product-readiness-db-gates.sql                    (new)
backend/tests/product-readiness-invariant.test.mjs                       (new)
backend/tests/db-integration/product-readiness-db-gates.test.mjs         (new)
backend/tests/product-publication-activation-sync.test.mjs
backend/tests/product-import-safety.test.mjs
backend/tests/product-content-bulk-update.test.mjs
backend/package.json                                                     (test scripts)
src/components/scoped/ProductsPage.tsx
src/components/scoped/ProductsPage.test.tsx
src/lib/api/merchant.ts
supabase/migrations/20260819120000_product_import_confirm_readiness.sql  (new, NOT applied)
supabase/migrations/20260819130000_product_content_bulk_live_description_guard.sql (new, NOT applied)
governance/CLOSURE_REPORT.md
governance/CURRENT_PHASE.md
governance/phases/DilMart_STORE_PRODUCT_READINESS_INVARIANT_001.md
```

## Migrations (created, NOT applied to Production)

1. `20260819120000_product_import_confirm_readiness.sql` — extends the Phase 2.5 integrity
   pre-pass of `product_import_confirm_atomic` with the readiness gate (`IMPORT_ROW_NOT_READY`),
   including the `active + archived` rejection. Same signature, same `SECURITY DEFINER`,
   same `REVOKE`/`GRANT` block (service_role only).
2. `20260819130000_product_content_bulk_live_description_guard.sql` — `product_content_bulk_update_atomic`
   selects the matched product `FOR UPDATE` and raises `CONTENT_BULK_PRODUCT_NOT_READY` when the
   locked row is active/published/public and the item clears `description`. Same signature and
   `SECURITY DEFINER`; the `REVOKE ... FROM PUBLIC` / `GRANT ... TO service_role` block is kept
   and additionally revokes `anon` and `authenticated` explicitly.

**Rollback (verified by diff, both files):** each migration is a `CREATE OR REPLACE FUNCTION`
with an unchanged name, argument list and return type, followed by the same COMMENT/REVOKE/GRANT
statements. Re-running the immediately preceding migration therefore restores the previous
definition exactly:

- `20260819120000_…readiness.sql` → re-run `20260802140100_product_import_confirm_short_description.sql`
- `20260819130000_…live_description_guard.sql` → re-run `20260802140200_product_content_bulk_update_atomic.sql`

Both predecessors re-issue the full function body plus their own COMMENT/REVOKE/GRANT, so no
privilege or comment residue is left behind. The only asymmetry is the extra
`REVOKE ... FROM anon/authenticated` on the content-bulk function, which the predecessor does not
re-grant — i.e. rolling back leaves those roles without EXECUTE, which is the safe direction.

## Database verification actually executed

Environment: a **local, ephemeral** Supabase Postgres container (`supabase start` for this
project). Nothing remote was touched.

- **Migration replay** — the whole `supabase/migrations` chain (161 files) was replayed into the
  local database in a single psql session: 159 files executed, both new migrations applied with
  **zero errors**. The replay surfaced 35 errors in 41 older files, all environment-caused rather
  than repo defects: `storage.buckets` / `storage.objects` and `auth.users` columns do not exist
  because this project's storage/auth services never finished starting (another local Supabase
  stack already occupies the default ports 54321/54322 on this machine), plus a few
  "policy … already exists" from an earlier partial run on the same database. A pristine
  end-to-end replay is therefore **not fully verified** — see Known limitations.
- **Gate behavior** — `backend/scripts/verify-product-readiness-db-gates.sql` (committed) ran
  against that database. All 10 assertions passed:
  1. confirm refuses a publish row with no image/description (`IMPORT_ROW_NOT_READY`);
  2. zero product writes after the refusal;
  3. the import session rolls back to `previewed`;
  4. confirm refuses `active + archived`;
  5. a fully ready publish row imports as active/published/public;
  6. content bulk refuses to clear a live product's description — matched through the RPC's
     normalized (case-insensitive) SKU comparison;
  7. the live description is unchanged after the refusal;
  8. a draft product's description can still be cleared;
  9. `service_role` can execute both RPCs;
  10. `anon` and `authenticated` cannot execute either RPC.
- **Node `db-integration` suite** — `backend/tests/db-integration/product-readiness-db-gates.test.mjs`
  was added (skips cleanly when the RPCs/gates are absent) but **was not executed**: it talks to
  PostgREST at `SUPABASE_URL`, and the only endpoint listening locally belongs to a different
  project's stack. Running it there would have read/written that unrelated database, so it was
  deliberately not run. This is the one remaining verification blocker.

## Tests status

```text
backend  build (nest build)                                                    PASS
backend  readiness-invariant + publication-activation-sync + import-safety
         + content-bulk-update                                       157/157 pass
backend  npm run test:product-import                                 251/251 pass
backend  hardening + policy-matrix + policy-endpoints + product-create-identity
         + marketplace-public-visibility + cart-purchase-integrity
         + product-purchase-eligibility + golden10 + short-description 124/124 pass
backend  eslint on every changed file             at or below baseline (products.service.ts
                                                  20 pre-existing `no-explicit-any` errors on
                                                  origin/main, 17 now; the two new backend
                                                  files report 0)
DB       migration replay + backend/scripts/verify-product-readiness-db-gates.sql
                                                          10/10 assertions pass (local only)
frontend npx vitest run                     598 pass / 1 pre-existing failed suite
frontend ProductsPage.test.tsx                                          21/21 pass
frontend tsc -p tsconfig.app.json --noEmit    51 errors — identical with and without
                                              this branch's changes (pre-existing)
frontend npm run build / arch:guard / auth:guard                              PASS
```

Existing expectations updated because this work deliberately changes the contract they pinned
(none weakened to make new code pass):

- `QuickAddProduct active vs inactive states` asserted Quick Add publishes a product with no
  image and no description — that assertion _was_ the bypass. Replaced by five tests covering the
  new contract, keeping the unchanged `is_active: false` → draft half.
- `admin import for an ACTIVE merchant is unaffected by the draft-merchant safety check` had a
  fixture row publishing with no image/description; the fixture gained both. The assertion it
  exists to make is unchanged.
- `Single product deactivation sets is_active=false …` asserted that `is_published` and
  `visibility_status` are NOT written on deactivation — exactly the hole in root cause 4. It now
  asserts the full `false/false/private` triple, and a sibling test covers archived products.
- `Inactive-to-active transition still publishes and updates status flags` sent a payload that
  echoed the row's `private` / unpublished values and asserted they were overridden to
  published+public — root cause 7. It is split into three tests: activation with the axes omitted
  (what the admin Product form actually submits) still publishes; activation with the axes pinned
  is honored; and pinned-private activation still runs the readiness gate.

## Edge cases handled

- Contradictory client input (`false/true/public`, `false/true/private`, `false/false/public`) is
  canonicalized to `false/false/private` — proven for both an active and an inactive existing row.
- For an active product, `published + private` and `unpublished + public` are equally
  unwritable once a request touches either axis; a contradictory request resolves to the less
  exposed combination, and an exposure ask that resolves to a no-op still runs the readiness gate.
- Legacy active-but-unready rows stay editable (and repairable) but cannot be published or made
  public until full readiness passes.
- `active + private` (private catalog) and `active + unpublished` are preserved by ordinary edits.
- Archive is sticky: neither an ordinary edit, nor a deactivation, nor a bulk deactivate turns an
  archived product into `private`; and no path turns an archived product public implicitly.
- Bulk activate still validates every product before any write.
- Import rows that keep the safe inactive/unpublished/private defaults are unaffected; an
  inactive archived row still imports as archived.
- Content bulk still clears descriptions for draft products.

## Known limitations

- The migrations are not applied to any shared environment. Until they are deployed, the DB-level
  gates do not exist in Production; the Nest layer is the enforcing layer there.
- Preview sessions created before the deploy (TTL ~1 hour) can still contain an unready publish
  row; the import RPC gate is what closes that window, so the migration should ship with (or
  before) the backend.
- A pristine full-chain migration replay was not achievable on this machine (ports for this
  project's local stack are taken by another Supabase project, so auth/storage service migrations
  never ran). Verified instead: both new migrations apply cleanly on a database carrying the rest
  of the chain, and every gate assertion passes.
- The Node db-integration suite for these gates has not been executed anywhere yet.
- The service-side content-bulk pre-read cannot express `btrim`, so a padded stored SKU is caught
  by the RPC rather than by the fast-fail check (covered by a test).
- `InventoryService.adjustInventory` can only move stock to `>= 0`, so it cannot break readiness
  and was left unchanged.
- Existing active-but-unready rows are not retro-corrected (no data migration was requested).

## Risks

- Merchant-visible: incomplete Quick Add lands as a draft; removing a live product's last image or
  description is refused; deactivation now also unpublishes and privatizes (previously a
  deactivated product could stay `is_published=true` + `public` in the row, which the storefront
  visibility helper treated as not listable, so the user-visible effect is a corrected DB state
  rather than a change of what shoppers see).
- Admin-visible: the content-bulk path cannot clear the description of a live product.
- Deploy order: apply both migrations before/with the backend deploy. Rollback is documented above.

## Confirmation

- `main` was not modified directly; work is on `fix/product-readiness-invariant` (PR #116),
  branched from the fetched `origin/main` (`8dc414c`).
- Nothing was deployed. No Production data, Supabase project, Render configuration, secrets,
  feature flags or external services were touched. Both migrations were run against a local
  ephemeral container only.
