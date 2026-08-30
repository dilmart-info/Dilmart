# Final Safety Patch Report

execution_status = NOT_EXECUTED
production_storage_writes = NO
production_db_writes = NO

This report documents the FINAL SAFETY patch applied to the private-catalog FIX
EXECUTION runtime after `18_RUNTIME_CONTRACT_CORRECTION_REPORT.md`. No production
Storage upload or DB write has occurred as a result of this change.
`13_STORAGE_UPLOAD_RESULT.csv`, `14_DB_APPLY_RESULT.csv`, `15_POSTFLIGHT_110.csv`, and
`16_FIX_EXECUTION_FINAL_REPORT.md` remain `NOT_EXECUTED` templates.

## Why this patch was needed

The prior runtime bound resume authorization to a frozen historical constant
(`QA_HEAD_SHA`), never actually verified against the working tree's real Git HEAD;
computed final `ok` from a this-run-only tally rather than the durable journal state;
allowed a resume-only Storage verification to silently downgrade the canonical
`uploaded_verified` journal status; treated "DB still frozen" + "Storage independently
shows uploaded_verified" as a conflict (blocking a perfectly safe DB-only retry); relied
on basePayload↔nextPayload comparison for collateral protection (which shares the same
coercions on both sides and can mask a genuine semantic change); used a narrow
`BASELINE_FIELDS` whitelist that did not cover every field a POST could collaterally
touch; and verified ARD-775's category reassignment by `category_slug` alone, which
cannot distinguish two categories that happen to share a slug.

## Corrections made

1. **Execution bound to the actual Git HEAD, never `QA_HEAD_SHA`.**
   `getActualGitHead(cwd)` (`private-catalog-fix-execution.mjs`) shells out to
   `git rev-parse HEAD`. `assertFirstExecuteHeadBinding` requires
   `FIX_EXEC_APPROVED_HEAD_SHA` to equal the actual Git HEAD before a first `--execute`
   is allowed (`APPROVED_HEAD_REQUIRED` / `APPROVED_HEAD_MISMATCH`), and persists the
   verified SHA to `journal.execution_head_sha`. `assertResumeHeadBinding` requires,
   on every `--resume`, that the actual Git HEAD still equals
   `journal.execution_head_sha` (`RESUME_HEAD_MISMATCH` on drift) **and** that
   `FIX_EXEC_APPROVED_HEAD_SHA` still equals `journal.execution_head_sha`
   (`APPROVED_HEAD_MISMATCH`). `QA_HEAD_SHA` is kept exported only as historical QA
   metadata (`journal.head_sha`) and is never read by either gate.

2. **Resume completion accounting is canonical, not a this-run-only tally.**
   `summarizeJournalCompletion(journal, grouped)` (`private-catalog-fix-catalog.mjs`)
   counts `completed` / `pending` / `failed` / `indeterminate` / `conflict` plus
   `fields_verified` / `images_verified` directly from durable `journal.entries`
   status, so a `skipped_completed` SKU from a prior run counts toward completion
   exactly like one completed in this run. `runDbUpdates` now returns `ok: true` only
   when `completed === 30`, `pending === 0`, `failed === 0`, `indeterminate === 0`,
   `conflict === 0`, `fields_verified === 38`, and `images_verified === 9`, plus
   `metrics.{ db_updates_this_run, db_updates_total_verified, completed_before_resume,
   completed_after_resume }` for accurate before/after accounting across a resume.

3. **Storage journal `upload_status` is canonical and monotonic.**
   `runStorageUploads` now mutates the journal entry directly inside `uploadOne`; a
   resume-only verification (no re-upload) that succeeds is reported to the caller as
   `already_verified_resume` but never overwrites a durable `uploaded_verified` status
   on the journal — the canonical status can only be set by an actual successful
   upload + verify.

4. **Storage/DB corroboration is classification-aware, not a blanket conflict rule.**
   In `runResumePreflight`, an `indeterminate` image SKU reconciled to classification
   **A** (DB shows proposed) requires the journal to show `uploaded_verified` **and** an
   independent `adapters.storage.verifyObject` check to pass — the journal flag alone is
   never trusted. Classification **B** (DB still frozen) no longer requires or checks any
   Storage corroboration at all: the old rule that treated a frozen DB + Storage
   `uploaded_verified` as a conflict is removed, since that is exactly the expected
   in-flight state when a DB write failed after a successful upload — resume must retry
   the DB only and must never re-upload. Classification **C** remains a hard conflict.

5. **Pre-POST semantic collateral check compares the outgoing payload directly against
   the raw live product, never basePayload↔nextPayload.**
   `assertNoPreWriteCollateral(liveProduct, payload, fieldMap)`
   (`private-catalog-fix-catalog.mjs`) walks every payload key not targeted by this
   SKU's field map and compares `normalizeSemanticFieldValue(key, liveRaw)` against
   `normalizeSemanticFieldValue(key, payload[key])`, with explicit semantic-equivalence
   handling for `null` vs `""` (name/slug/description/short_description/brand/
   offer_ends_at), `null`/`""` vs `0` (purchase_price/low_stock_threshold/weight_grams),
   `null` vs `false` (is_active/is_featured/is_new/is_best_seller/
   loyalty_points_enabled), `null` vs `[]` (images/colors), `sizes` string-vs-array
   representation, trimmed `brand`, and `dimensions`. Any real semantic difference is a
   `PRE_WRITE_COLLATERAL_DIFF` and stops that SKU (`failed_pre_write_collateral_diff`)
   **before** any POST is attempted — `runDbUpdates` calls this immediately before
   `adapters.admin.updateProduct`.

6. **`BASELINE_FIELDS` expanded to the full catalog surface.**
   Added `colors`, `dimensions`, `weight_grams`, `offer_ends_at`, `target_audience`,
   `business_type_tags`, `product_use_cases`, `visible_in`, `purchase_mode`,
   `is_b2b_offer`, `requires_verified_salon`, `min_order_qty`, `max_order_qty` to the
   existing whitelist, so every field a POST could collaterally touch is part of the
   exact unaffected-80 / HOLD / ARD-1191 postflight reconciliation, not just the
   narrower original set. `updated_at` remains recorded on every snapshot but explicitly
   excluded from every equality comparison (`exactBaselineMismatches`,
   `assertNonTargetFieldsUnchanged`); computed/joined fields (`readiness`, joined
   `categories`/`merchants` objects) are never part of the whitelist.

7. **ARD-775 postflight verifies `category_id`, not just `category_slug`.**
   `matchProposedAgainstProduct` now checks `extras.category_id` (the
   `journal.perfumes_category_id` resolved during first-execute preflight) alongside the
   `category_slug` field itself whenever a `category_slug` reassignment is proposed —
   closing a real gap where two categories could share the same slug and slug-only
   verification would silently accept the wrong category id. `runPostflight` passes
   `journal.perfumes_category_id` as `extras.category_id` for exactly this check.

## Tests added

17 new tests (`45`–`61`) were added to
`scripts/product-import/private-catalog-fix-execution.test.mjs`, covering: actual
Git-HEAD retrieval; first-execute head-binding `APPROVED_HEAD_REQUIRED` /
`APPROVED_HEAD_MISMATCH` / success (`journal.execution_head_sha` persisted); resume
head-binding `RESUME_HEAD_MISMATCH` (actual-vs-journal drift) and `APPROVED_HEAD_MISMATCH`
(approved-vs-journal drift); a full 12-completed / 13th-indeterminate / resume-completes-
remaining-18 accounting scenario asserting `ok=true`, `completed=30`,
`fields_verified=38`, `images_verified=9`, exact `metrics`, and no duplicate update of the
original 12; canonical image-journal preservation across two resumes with an intervening
DB failure, asserting total `uploadCalls === 9` throughout; classification-B DB-only retry
with no re-upload despite Storage independently showing `uploaded_verified`;
classification-A corroboration failing closed when the journal flag is not backed by an
actual Storage object; `assertNoPreWriteCollateral` unit tests for both a genuine
collateral diff and full null/0/false/[] + trim tolerance; an end-to-end
`runDbUpdates` test proving a malformed live field that the payload builder would
silently coerce away is still caught pre-POST; `BASELINE_FIELDS` content; the
`matchProposedAgainstProduct` `category_id` corroboration unit test; an end-to-end
postflight test proving a decoy category sharing the `perfumes` slug is rejected by
`category_id` mismatch even though `category_slug` matches; and a
`summarizeJournalCompletion` unit test. The full suite (66 tests, `1`–`61` plus 5
CLI-spawn/unit subtests) passes.

## Hard stop — unchanged

- `FIX_EXEC_AUTHORIZATION` / `FIX_EXEC_ALLOW_WRITES=1` were never set by this change.
- No production Storage upload, no production DB update occurred.
- PR #74 was not merged.
- `13_STORAGE_UPLOAD_RESULT.csv`, `14_DB_APPLY_RESULT.csv`, `15_POSTFLIGHT_110.csv`, and
  `16_FIX_EXECUTION_FINAL_REPORT.md` remain `NOT_EXECUTED` templates.

## Files changed

- `scripts/product-import/lib/private-catalog-fix-catalog.mjs` (expanded
  `BASELINE_FIELDS`; added `assertNoPreWriteCollateral` + semantic-equivalence helpers;
  added `summarizeJournalCompletion`)
- `scripts/product-import/lib/private-catalog-fix-execution.mjs` (added
  `getActualGitHead`)
- `scripts/product-import/lib/private-catalog-fix-runtime.mjs` (head-binding gates;
  canonical Storage journal mutation; classification-B corroboration removal;
  pre-POST collateral gate; canonical completion accounting; ARD-775 `category_id`
  postflight check)
- `scripts/product-import/execute-private-catalog-fix.mjs` (threads
  `enforceHeadBinding: true` + `env` into `runLivePreflight` for write modes; reports
  `completion_summary` + `metrics`)
- `scripts/product-import/private-catalog-fix-execution.test.mjs` (17 new tests,
  `writeAuthEnv` now binds CLI-spawned write tests to the actual Git HEAD)
- `docs/product-import/ard-al-khaleej/private-catalog-fix-plan/19_FINAL_SAFETY_PATCH_REPORT.md`
  (this file)
- `docs/product-import/ard-al-khaleej/private-catalog-fix-plan/20_PRODUCTION_PREFLIGHT_STATUS.md`
  (placeholder — see that file)

Not modified in this patch:

- `scripts/product-import/lib/private-catalog-fix-adapters.mjs` (no change required —
  existing fake/HTTP-contract adapter shapes already support every new test)
