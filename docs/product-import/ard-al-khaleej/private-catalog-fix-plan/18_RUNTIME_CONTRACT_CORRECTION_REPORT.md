# Runtime Contract Correction Report

execution_status = NOT_EXECUTED
production_storage_writes = NO
production_db_writes = NO

This report documents corrections made to the private-catalog FIX EXECUTION runtime
contract after review. No production Storage upload or DB write has occurred as a result
of this change. `13_STORAGE_UPLOAD_RESULT.csv`, `14_DB_APPLY_RESULT.csv`,
`15_POSTFLIGHT_110.csv`, and `16_FIX_EXECUTION_FINAL_REPORT.md` remain `NOT_EXECUTED`.

## Why this correction was needed

The prior runtime (`17_RUNTIME_IMPLEMENTATION_TEST_REPORT.md`) resolved products during
DB apply via `adapters.admin.getProductBySku(sku)` — a method that does not exist on the
production admin adapter contract. The only way to resolve a SKU against the live Admin
API is `GET /api/products?merchant_id=…` (optionally filtered by `search=`, which the
Backend implements as `ILIKE` on **`products.name` only** — see
`backend/src/products/products.service.ts` around line 358). `search` never matches
`merchant_sku`. Relying on a name-search-shaped call for SKU resolution during a write
path is exactly the fuzzy-matching risk this fix execution must avoid.

## Corrections made

1. **Product resolution — GET-by-id only, never search.**
   `runFirstExecutePreflight` builds the exact `merchant_sku → product` map from the
   *full* live catalog fetch (`fetchLiveCatalog()`), asserts cardinality `1` for every one
   of the 30 affected SKUs (`requireExactSku`), and persists `{ id, frozen_baseline }` per
   SKU onto the journal (`journal.resolved_products`). `runDbUpdates` and
   `runResumePreflight` read products exclusively via `adapters.admin.getProductById(id)`
   using that persisted id. `createHttpContractAdapters.admin.resolveSkuViaNameSearch` is
   kept **only** as a test double proving the backend `search=` contract (name `ILIKE`,
   never SKU) — it is never called by the runtime itself.

2. **First-execute vs resume preflight are now separate, explicit functions.**
   - `runFirstExecutePreflight`: refuses to run if the journal already has `completed`
     entries (must use `--resume`); verifies all 30 target Storage paths are absent;
     verifies frozen `current_value` for all 30 SKUs; verifies exact SKU cardinality;
     resolves the active `perfumes` category Leaf (no active children); computes
     `FULL_CATALOG_BASELINE_SHA256` over all 110 live products; persists resolved ids +
     per-SKU frozen baselines to the journal **before** any write.
   - `runResumePreflight`: journal is mandatory; validates `journal.manifest_sha256`
     against the resolved manifest SHA and `journal.head_sha` against the frozen
     `QA_HEAD_SHA`; re-verifies `completed` entries still match proposed values and
     `pending` entries still match frozen values; reconciles every `indeterminate` entry
     via a fresh `GET` by the persisted id (`classifyIndeterminateLive`) into:
     - **A** (all fields match proposed) → safe to mark `completed`,
     - **B** (all fields match frozen) → safe to mark `pending` and retry,
     - **C** (mixed / any field matches neither) → **conflict**, resume is blocked.
     For SKUs with an `image_url` change, the DB classification must be corroborated by
     the journal's Storage `upload_status` (A requires `uploaded_verified`; B requires it
     is **not** `uploaded_verified`); a mismatch is a corroboration failure and blocks
     resume.
   - `runLivePreflight` is now a thin dispatcher over the two, selected by `mode`.

3. **Collateral-diff protection on every Admin update payload.**
   `buildAdminUpdatePayload` now builds the unmodified payload from the live product,
   applies only the requested field changes, and calls `assertOnlyAllowedPayloadDiffs`
   (from `private-catalog-fix-catalog.mjs`) to guarantee no other payload key changed.

4. **Write accounting is tracked on the journal, not invented at output time.**
   `runStorageUploads` and `runDbUpdates` both accumulate
   `{ storage_upload_attempted, storage_upload_succeeded, storage_verified,
   db_update_attempted, db_update_succeeded, db_update_verified, indeterminate,
   conflicts }` on `journal.write_accounting`. The CLI's `fail()` and success paths derive
   `production_storage_writes` / `production_db_writes` from
   `summarizeWriteAccounting(journal.write_accounting)` — **never hardcoded** — including
   on uncaught exceptions, which reload the last-saved journal from disk.

5. **DB apply stops after the first indeterminate or 4xx outcome.**
   `runDbUpdates` halts further SKU processing (marking the rest
   `skipped_stopped_early`) as soon as a `GET`/`POST` call to the Admin API returns an
   indeterminate result (timeout / 5xx on write) or a definite 4xx, instead of silently
   continuing through the remaining 29 SKUs. This matches the "inspect before retry"
   requirement for anything ambiguous. Successful post-write reconciliation now performs
   a fresh `GET` (never search), explicitly re-enriches `category_slug` from the live
   category index, and asserts non-target baseline fields are unchanged
   (`assertNonTargetFieldsUnchanged`) before marking a SKU `completed`.

6. **Postflight performs exact, not approximate, reconciliation.**
   The prior postflight only checked the 30 proposed values and left a comment that
   "mutation detection requires baseline snapshot" for everything else. `runPostflight`
   now requires `journal.frozen_baselines` (persisted in step 2) and:
   - for all 30 affected SKUs: proposed match **and** non-target fields byte-for-byte
     unchanged from frozen baseline;
   - for all 80 unaffected SKUs: byte-for-byte identical to frozen baseline
     (`unaffected_checked` must equal 80, `unaffected_exact_matches` must equal 80);
   - explicit checks for the 4 HOLD SKUs (`hold_unchanged` must equal 4) and ARD-1191
     (`ard_1191_unchanged` must be `true`) — called out separately from the general
     unaffected-80 check for auditability;
   - category distribution checked exactly in both directions (`perfumes=98`,
     `home-linen-air=8`, `mini-travel-perfume=3`, `musk-oils-mukhammaria=1`, and no
     unexpected category present).

7. **Fake-adapter gating for write modes.**
   `execute-private-catalog-fix.mjs` now calls
   `assertFakeAdaptersAllowedForWrites(env)` before accepting
   `FIX_EXEC_FAKE_ADAPTERS_JSON` for `--execute`/`--resume`; fake adapters remain always
   available for `--preflight`/`--dry-run`/`--postflight`. Read modes may also build
   `createProductionAdapters({ readOnly: true, ... })` directly from credentials without
   `FIX_EXEC_AUTHORIZATION`/`FIX_EXEC_ALLOW_WRITES` — those two env vars are gates on
   **writes**, not on read-only inspection.

8. **Fake catalog generator category shape.**
   `generate-fix-exec-fake-catalog.mjs` categories now include `parent_id: null` (matching
   the production Admin category-list contract that `has_active_children` is computed
   from `parent_id` linkage, not a `has_children` flag) and the generator explicitly
   starts `ARD-775` in `cat-musk` (`musk-oils-mukhammaria`), matching its frozen
   `current_value`, so the category-reassignment fix (`musk-oils-mukhammaria → perfumes`)
   is exercised end to end by the test suite.

## Hard stop — unchanged

- `FIX_EXEC_AUTHORIZATION` / `FIX_EXEC_ALLOW_WRITES=1` are still required for
  `--execute`/`--resume`, are still env-only (bare `--auth` is rejected), and are still
  never set by this change.
- No production Storage upload, no production DB update, no PR merge occurred as part of
  this correction.
- `13_STORAGE_UPLOAD_RESULT.csv`, `14_DB_APPLY_RESULT.csv`, `15_POSTFLIGHT_110.csv`, and
  `16_FIX_EXECUTION_FINAL_REPORT.md` remain `NOT_EXECUTED` templates.

## Files changed

- `scripts/product-import/lib/private-catalog-fix-runtime.mjs` (rewritten)
- `scripts/product-import/execute-private-catalog-fix.mjs` (rewritten)
- `scripts/product-import/verify-private-catalog-fix-postflight.mjs` (rewritten)
- `scripts/product-import/generate-fix-exec-fake-catalog.mjs` (category shape correction)
- `scripts/product-import/private-catalog-fix-execution.test.mjs` (rewritten)
- `docs/product-import/ard-al-khaleej/private-catalog-fix-plan/18_RUNTIME_CONTRACT_CORRECTION_REPORT.md` (this file)

Not modified in this correction (already correct per prior task):

- `scripts/product-import/lib/private-catalog-fix-catalog.mjs`
- `scripts/product-import/lib/private-catalog-fix-adapters.mjs`
