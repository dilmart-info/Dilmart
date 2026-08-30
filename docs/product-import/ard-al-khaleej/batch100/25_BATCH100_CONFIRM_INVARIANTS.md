# Batch 100 Confirm — Invariants Postflight

Task: `DilMart-ARD-AL-KHALEEJ-BATCH100-CONFIRM-001`  
Token: `BATCH100_CONFIRM_APPROVED`  
Confirm import_id: `ff3274c4-7f65-455b-8bda-549c4ecd3fad`  
Confirmed at (UTC): `2026-08-04T13:24:09.253741+00:00`

## Confirm execution

| Check                                        | Result                                 |
| -------------------------------------------- | -------------------------------------- |
| Confirm requests issued                      | **1**                                  |
| Confirm retries                              | **0**                                  |
| Preview re-run                               | **NO**                                 |
| HTTP                                         | **201**                                |
| total / created / updated / skipped / failed | **100 / 100 / 0 / 0 / 0**              |
| Session status after                         | `confirmed`                            |
| `confirmed_at` present                       | YES                                    |
| Confirm audit rows (merchant window)         | **1**                                  |
| Audit totals.created                         | **100**                                |
| Confirming admin user id (safe)              | `ac4e1f4f-1fcf-4eb5-aea4-fdb6ec29f327` |

## Target merchant

| Field         | Before | After     |
| ------------- | ------ | --------- |
| Product count | 10     | **110**   |
| Status        | draft  | **draft** |

## Approved SKU set (exact)

| Metric                                | Value   |
| ------------------------------------- | ------- |
| Approved SKUs found                   | **100** |
| Missing approved SKUs                 | **0**   |
| Unexpected new SKUs (vs approved CSV) | **0**   |
| Duplicate SKUs on merchant            | **0**   |
| New product rows                      | **100** |

## New product state (all 100)

| Field                                      | Count matching |
| ------------------------------------------ | -------------- |
| stock = 0                                  | 100            |
| is_active = false                          | 100            |
| is_published = false                       | 100            |
| visibility_status = private                | 100            |
| discount_price = null                      | 100            |
| short_description populated (40–280 chars) | 100            |
| Exact duplicate short descriptions         | 0              |
| HOLD / HOLD_MISMATCH                       | 0              |
| Internal workflow phrases                  | 0              |
| Detailed descriptions (CSV = DB)           | **59 = 59**    |
| Size match vs final CSV                    | 100            |

## Category distribution (new 100)

| Slug                  | Count   |
| --------------------- | ------- |
| perfumes              | 87      |
| home-linen-air        | 8       |
| mini-travel-perfume   | 3       |
| musk-oils-mukhammaria | 2       |
| **Total**             | **100** |

## Special identity checks

| SKU                    | Expected             | Observed             |
| ---------------------- | -------------------- | -------------------- |
| ARD-4138               | عطر اكلاير 100 مل    | عطر اكلاير 100 مل    |
| ARD-2511               | عطر انا الابيض بودري | عطر انا الابيض بودري |
| ARD-1318 / 1319 / 1320 | mini-travel-perfume  | mini-travel-perfume  |

## Existing-data invariants

| Check                                                        | Result                                               |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| Golden 10 count                                              | 10 (unchanged)                                       |
| Golden 10 stock/active/published/visibility                  | all stock=0, inactive, unpublished, private          |
| Golden 10 content updates via Confirm                        | **none** (updated=0; no product update/delete audit) |
| ARD-1191 short_description                                   | empty                                                |
| ARD-1191 description                                         | empty                                                |
| Similar merchant `1689ae4a-41f5-425b-bebe-c99c74880008`      | status=`suspended`, products=**15** (unchanged)      |
| Public marketplace products (triple-state + active merchant) | **311** before / **311** after                       |
| Storage batch WebP objects (`…/ac7c356b…/*.webp`)            | **100** (unchanged during Confirm)                   |

## Forbidden writes

| Action                                           | Occurred? |
| ------------------------------------------------ | --------- |
| Merchant activation                              | NO        |
| Product activation                               | NO        |
| Product publication                              | NO        |
| Stock updates                                    | NO        |
| Price/content corrections outside Confirm create | NO        |
| ARD-1191 modification                            | NO        |
| Second Confirm                                   | NO        |
| New Preview                                      | NO        |

## Evidence artifacts

- `23_BATCH100_CONFIRM_RESPONSE_SAFE.json`
- `24_BATCH100_CONFIRM_DB_POSTFLIGHT.csv`
- `24_BATCH100_CONFIRM_DB_POSTFLIGHT_SUMMARY.json`
- `25_BATCH100_CONFIRM_INVARIANTS.md` (this file)
- `26_BATCH100_FINAL_EXECUTION_REPORT.md`

## Judgment

**PASS** — Confirm once; postflight exact SKU + invariants verified.
