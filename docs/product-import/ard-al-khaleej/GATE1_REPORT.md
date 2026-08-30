# Gate 1 Report (post-review corrections) — DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001

```text
Task ID: DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001
Gate: 1
Status: PASS (technically + governance approved)
Reviewed head: 93a920da7711699256711fa01937209ebab9deeb
PR: #65 (Draft — merge NOT authorized)
Remote migration authorization: NO
GitHub review: Comment #4835307728 — GATE 1 APPROVED (self-approve blocked by GitHub)

Repository: https://github.com/cylendralabs-blip/DilMart-Store
Branch: feat/ard-al-khaleej-pilot-import
Base SHA: 6e829ab4bc7e275f74f5fa8b859a463f42460e58
Code head at CI green: fbae60242265797a169d9d6d18a805f519e28c68
Approved head: 93a920da7711699256711fa01937209ebab9deeb

CI workflows: Native Foundation Android/iOS PASS; Launch Critical Build/Lint/Test/Guard PASS

Supabase project ref: ztplxqlthuqkuktbznbo
Merchant ID: ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7
Bucket: products
Draft PR: https://github.com/cylendralabs-blip/DilMart-Store/pull/65
```

## Carry-forward blockers (next gates — separate authorization required)

1. Clean 123 alarsh duplicate SKU groups before unique index.
2. Restrict Storage public INSERT/UPDATE/DELETE before Gate 3.
3. Do not apply RPC/RLS migrations remotely until explicitly authorized.
4. No production Preview / Confirm / images / product creates / merchant activation.
5. Keep PR #65 Draft — no merge yet.

## Second-review corrections (CI failure root cause + fixes)

### Root cause of CI failure (advisory-lock DB-integration test)

`backend/tests/db-integration/product-import-confirm-atomic.test.mjs` generated
`sharedSku = SHARED-${randomBytes(4).toString('hex')}` (lowercase hex) but then looked the
product up in Postgres with `.eq('merchant_sku', sharedSku)` — still lowercase. The RPC always
persists `upper(btrim(sku))`, so the lookup queried for a row that could never match
(`SHARED-fa1ef5ce` vs. the stored `SHARED-FA1EF5CE`), producing a false "0 rows" failure. **This
was a test-lookup bug, not a persistence/atomicity bug.** Fixed by normalizing to
`normalizedSku = sharedSku.toUpperCase()` for every lookup/assertion, plus a full diagnostic dump
(merchant id, both RPC results, both session statuses, product rows before/after) that is logged
unconditionally so any future regression is diagnosable from CI output alone. The test now also
asserts the product id is stable across the create-then-update pair (no duplicate row was
silently created).

### Migration hardening (`20260801190000_product_import_confirm_atomic.sql`, still NOT applied)

- **Ambiguous-SKU guard**: pre-existing duplicate `(merchant_id, merchant_sku)` rows used to be
  resolved by an unordered `SELECT … LIMIT 1 FOR UPDATE`, which could silently update the wrong
  row. Now counts matches first; `>1` raises `IMPORT_SKU_AMBIGUOUS` and writes nothing.
- **Constraint-specific `unique_violation` handling**: the slug-collision retry (merchant-hash
  suffix) now only fires when `GET STACKED DIAGNOSTICS … CONSTRAINT_NAME` is `products_slug_key`;
  any other unique-constraint violation re-raises unchanged instead of being masked by a blind
  retry.
- **Payload integrity pre-pass** (new, runs before any product write): row count vs.
  `session.total_rows`/`valid_rows`, `invalid_rows=0`, per-row `status`, non-empty/non-duplicate
  SKU within the batch, `price>0`, `stock>=0`, `discount_price` range, `category_id` existence,
  `visibility_status` enum, and `image_url` Storage-prefix check. Any failure raises a specific
  `IMPORT_ROW_INVALID_*` / `IMPORT_PAYLOAD_INTEGRITY_FAILED` exception with zero writes —
  defense-in-depth against a tampered/replayed session payload, independent of the TS-side checks.
- **Draft-merchant safety at the RPC layer**: if `merchants.status <> 'active'`, every write is
  forced to `is_active=false, is_published=false, visibility_status='private', stock=0`
  regardless of what the payload requested, so a draft merchant can never be published via a
  crafted import payload even if the TS layer were bypassed.

### New RLS migration (`20260801200000_products_public_read_triple_state.sql`, still NOT applied)

Replaces the public product-read policy with the full triple-state contract
(`is_active=true AND is_published=true AND visibility_status='public' AND merchants.status='active'`)
and adds explicit `GRANT SELECT` to `anon`/`authenticated` on `products`/`merchants` (required for
a from-scratch local/CI database; Supabase-hosted projects provision this base grant outside of
migration history). Admin and merchant-member policies are preserved unchanged.

### TypeScript (`product-import.service.ts`)

- CSV parsing is now strict: `relax_column_count` removed (row length must equal header length),
  duplicate/blank header names rejected, and headers restricted to a known-columns allowlist.
- Admin preview/confirm forces the same draft-merchant defaults as the RPC and now **rejects**
  (rather than silently downgrading) any row that tries to set `is_active`/`is_published=true` or
  `visibility_status=public` for a non-active merchant.
- New RPC error codes (`IMPORT_SKU_AMBIGUOUS`, `IMPORT_PAYLOAD_INTEGRITY_FAILED`, and the
  `IMPORT_ROW_INVALID_*` family) are mapped to `400`/`409` HTTP exceptions instead of surfacing as
  unhandled `500`s.

## Transaction / RPC design

Migration (NOT applied): `supabase/migrations/20260801190000_product_import_confirm_atomic.sql`

Function: `public.product_import_confirm_atomic(p_import_id, p_merchant_id, p_actor_id, p_actor_role, p_write_audit)`

Single Postgres transaction performs:

1. Conditional session claim `previewed → processing`
2. Invalid-row guard (zero product writes if any invalid)
3. Per-SKU `pg_advisory_xact_lock(hashtextextended(merchant_id||':'||sku, 0))`
4. SELECT … FOR UPDATE + INSERT/UPDATE products
5. Session finalize `processing → confirmed` + `confirm_result` in payload
6. Optional `audit_logs` insert when `p_write_audit=true` (admin path)

On any error: full ROLLBACK (claim included) → session remains `previewed` and retryable.

## Session claim mechanism

```sql
UPDATE product_import_sessions
SET status = 'processing'
WHERE id = … AND merchant_id = … AND status = 'previewed' AND expires_at > now()
RETURNING *;
```

Zero rows → `IMPORT_SESSION_CLAIM_FAILED` or `IMPORT_SESSION_EXPIRED`.

## SKU concurrency mechanism

Transaction-scoped advisory lock per `(merchant_id, normalized SKU)` because the global unique index is still blocked by 123 alarsh duplicates.

## Invalid-row behaviour

- TS pre-check: `invalid_rows > 0` → 400, RPC never called
- RPC guard: same check + row-level `status='invalid'` → `IMPORT_HAS_INVALID_ROWS`
- Result: zero product writes

## Visibility surfaces covered

Shared helper `applyPublicProductFilters` applied to:

- getCategoryPage, getProductsByIds, getOffersList, getBrands
- listProducts, getSuggested, getProductBySlug
- web_store home buckets
- barber_app segmented home carousels (all product queries)

Rule: `is_active=true AND is_published=true AND visibility_status='public'` (+ active merchant where already required).

## CSV library and limits

- Library: `csv-parse` (sync)
- Max upload: 1 MB
- Max rows: 500
- Max field chars: 5000
- Supports BOM, quoted commas, escaped quotes, multiline fields

## Tests and results

```text
npm run build → PASS

npm run test:product-import → 49/49 PASS
  - product-import-safety.test.mjs (expanded: strict CSV column-count/header rules,
    draft-merchant reject-on-publish-attempt cases)
  - marketplace-public-visibility.test.mjs

npm run test:db-integration → 39 PASS / 0 FAIL / 1 TODO (40 total), against a local
Supabase instance rebuilt from a clean `supabase db reset` (fresh replay of every
migration, including the two new/rewritten ones below — not a patched-in-place DB):
  - product-import-confirm-atomic.test.mjs (8 tests, 1 todo):
      invalid-row zero-write guard; same-session double-confirm race (exactly one
      winner); advisory-lock cross-session serialization on shared SKU (fixed —
      see root-cause note above); IMPORT_SKU_AMBIGUOUS on pre-existing duplicate
      SKUs (zero writes); tampered-payload duplicate-SKU and out-of-range-price
      and non-existent-category integrity failures (zero writes each); global
      slug-collision retry with merchant-hash suffix. TODO: non-slug
      unique_violation re-raise — no second unique constraint exists on
      `public.products` today to exercise live; verified by code review of the
      GET STACKED DIAGNOSTICS CONSTRAINT_NAME branch instead.
  - products-public-rls.test.mjs (new, 7 tests): anon cannot read
    inactive/unpublished/private/draft-merchant products; anon CAN read
    triple-state-public products under an active merchant; a merchant member
    can still read their own private/draft product; service role bypasses RLS.
  - plus the 4 pre-existing DB-integration suites (checkout concurrency,
    notification outbox, returns/refunds, auth-action token saga) — unaffected,
    still green.
```

## Governance

- Restored repository-wide `governance/CLOSURE_REPORT.md` index
- Dedicated: `governance/phases/DilMart_ARD_AL_KHALEEJ_PILOT_GATE1_CLOSURE.md`
- One new pointer row added to the index

## Preflight SQL new location

```text
docs/product-import/ard-al-khaleej/preflight/products_merchant_sku_unique.sql
```

Removed from `supabase/migrations/preflight/`.

## Remaining blockers

1. Unique `(merchant_id, merchant_sku)` index still blocked (alarsh duplicates)
2. Storage anonymous INSERT/UPDATE/DELETE — Gate 3 blocked (see STORAGE_REMEDIATION_PLAN.md)
3. Atomic RPC migration (`20260801190000`, now hardened per above) and the new triple-state RLS
   migration (`20260801200000`) are proven against a local Supabase instance only — **neither has
   been applied to any shared/CI/staging/production database.** CI must still run these
   DB-integration tests against its own migrated database and go green before this is considered
   closed.
4. No production Preview/Confirm/image upload until subsequent gate approvals

## Not authorized / not done

- Apply migrations
- Change Storage policies
- Upload images
- Production Preview/Confirm
- Create products
- Change merchant status
- Merge PR
