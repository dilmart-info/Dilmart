# Source Manifest — Pilot 10

## Excel source

| Field | Value |
|-------|-------|
| Original filename | `Ard_Al_Khaleej_Catalog_Stage3_Pilot_Batches_AB_v4.xlsx` |
| Supplied path | `C:\Users\derma\Downloads\Ard_Al_Khaleej_Catalog_Stage3_Pilot_Batches_AB_v4.xlsx` |
| Working copy | `.tmp-product-import/ard-al-khaleej/` (gitignored) |
| Size bytes | 936956 |
| Committed to git | **No** |

## Sheets used

```text
14_PILOT_SEARCH_QUEUE
17_STAGE3_BATCH_A
18_IMAGE_UPLOAD_MANIFEST
19_STAGE3_BATCH_B
20_STAGE3_PROGRESS
```

## All sheets present in workbook

```text
00_SUMMARY … 20_STAGE3_PROGRESS (21 sheets total)
```

## Pilot products (authoritative)

| # | Source | SKU | Name | Brand | Size | Price IQD |
|---|-------:|-----|------|-------|------|----------:|
| 1 | 1015 | ARD-1015 | عطر فلفت عود | Lattafa | 100 مل | 23000 |
| 2 | 1042 | ARD-1042 | عطر ليل ملكي | Lattafa | 100 مل | 15000 |
| 3 | 1065 | ARD-1065 | عود مود إكسير | Lattafa | 100 مل | 19000 |
| 4 | 1172 | ARD-1172 | عطر فخر لطافة رجالي | Lattafa | 100 مل | 24000 |
| 5 | 1173 | ARD-1173 | عطر فخر لطافة نسائي | Lattafa | 100 مل | 24000 |
| 6 | 1191 | ARD-1191 | عطر عود مود ذهبي | Lattafa | 100 مل | 19000 |
| 7 | 3270 | ARD-3270 | عطر أميرة العرب برايف روز | Asdaaf | 100 مل | 16000 |
| 8 | 1826 | ARD-1826 | عطر ناو أسود | RAVE | 100 مل | 20000 |
| 9 | 2800 | ARD-2800 | عطر ناو إنتنس أزرق | RAVE | 100 مل | 20000 |
| 10 | 3723 | ARD-3723 | عطر ناو نسائي | RAVE | 100 مل | 20000 |

## Commit policy

Commit only: CSV, sanitized manifests, source URLs, checksums, reports, runbook, tests, migration/preflight files.

Do **not** commit: full Excel, original downloaded images, optimized binaries unless separately justified.
