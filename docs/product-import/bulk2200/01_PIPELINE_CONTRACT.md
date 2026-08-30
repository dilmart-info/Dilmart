# Bulk2200 Pipeline Contract

## Purpose

Reusable importer for the Ard Al Khaleej ~2200-product corpus. First operational batch target: **Batch001 ≤ 200** valid creates.

## Commands

```text
node scripts/product-import/bulk-catalog/run.mjs inventory --config <file>
node scripts/product-import/bulk-catalog/run.mjs prepare --config <file> [--batch <id>]
node scripts/product-import/bulk-catalog/run.mjs dry-run --config <file> --batch <id>
node scripts/product-import/bulk-catalog/run.mjs execute --config <file> --batch <id>
node scripts/product-import/bulk-catalog/run.mjs resume --config <file> --batch <id>
node scripts/product-import/bulk-catalog/run.mjs postflight --config <file> --batch <id>
```

## Config keys

| Key | Meaning |
|---|---|
| `merchant_id` / `merchant_slug` | Exact merchant isolation |
| `source_file` | Normalized CSV corpus |
| `source_workbook` | Optional upstream Excel path (outside git) |
| `image_directories` | Local image roots for SKU matching |
| `batch_size` | Cap (200 for Batch001) |
| `batch_selection_rule` | Deterministic selection policy |
| `default_product_state` | Must be private / inactive / unpublished / stock 0 |
| `category_mapping_file` | Allowed category slug map |
| `existing_catalog_snapshot` | Read-only SKU collision baseline |

## Safe defaults (non-negotiable)

Every **create** defaults to:

- `visibility_status = private`
- `is_active = false`
- `is_published = false`
- `stock = 0`

Never auto-activate, publish, set positive stock, create discounts, modify existing prices, or update existing products.

Existing SKU collision → **`SKIP_EXISTING_SKU`** (never silent update).

## Row statuses (exactly one per row)

`READY` · `SKIP_EXISTING_SKU` · `REJECT_DUPLICATE` · `REJECT_REQUIRED_FIELD` · `REJECT_CATEGORY` · `REJECT_IMAGE` · `HOLD_REVIEW`

## Selection (Batch001)

Stable source order, then require: valid SKU, no catalog collision, allowed category, required fields, usable local image. Cap at `batch_size` READY rows.

## Writes

`inventory` / `prepare` / `dry-run` perform **zero** Storage/DB writes.

`execute` / `resume` require later authorization:

- `BULK2200_EXEC_AUTHORIZATION=BULK2200_PIPELINE_EXECUTION_APPROVED`
- `BULK2200_ALLOW_WRITES=1`

Reuse Batch100 Storage compatibility helpers at execution time (not re-architected here).

## Reuse from PR #74 / Batch100

- Storage compatibility client + server-key probe
- Merchant isolation
- Immutable Storage paths
- Journal / resume semantics
- Exact SKU handling
