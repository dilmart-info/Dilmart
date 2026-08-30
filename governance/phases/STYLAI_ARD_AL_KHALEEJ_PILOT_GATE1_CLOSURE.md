# Closure — Ard Al Khaleej Pilot Gate 1 (Import Safety Corrections)

**Task:** `DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001`  
**PR:** [#65](https://github.com/cylendralabs-blip/DilMart-Store/pull/65)  
**Branch:** `feat/ard-al-khaleej-pilot-import`  
**Status:** **GATE 1 PASS** · reviewed head `93a920d` · PR #65 remains **Draft / unmerged** · remote migrations **NOT applied** · Storage Gate 3 blocked · GitHub review comment `4835307728`

## What was implemented

- Dedicated `ProductImportService` with Admin draft-merchant import routes
- Atomic Confirm via unapplied migration `product_import_confirm_atomic` (session claim + advisory locks + product upserts + finalize + optional audit in one Postgres transaction)
- Invalid rows block entire Confirm (zero writes)
- `csv-parse` with BOM / multiline / quote support and upload/row/field limits
- Marketplace triple-state public visibility (`active + published + public`) on all product-returning surfaces
- Preflight SKU unique SQL moved out of `supabase/migrations/`
- Storage remediation plan documented (Gate 3 still blocked)

## Validation

- `npm run build` PASS
- `npm run test:product-import` **38/38 PASS**
- DB-integration suite present; skips until RPC migration is applied in a test environment

## Explicitly not done

- Migration not applied remotely
- Storage policies unchanged
- No image upload / Preview / Confirm / product creates / merchant activation / merge

## Dedicated evidence

- `docs/product-import/ard-al-khaleej/GATE1_REPORT.md`
- `docs/product-import/ard-al-khaleej/STORAGE_REMEDIATION_PLAN.md`
- `docs/product-import/ard-al-khaleej/preflight/products_merchant_sku_unique.sql`
