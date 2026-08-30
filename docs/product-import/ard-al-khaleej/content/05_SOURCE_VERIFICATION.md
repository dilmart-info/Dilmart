# 05 — Source Verification

Golden file: `.tmp-product-import/ard-al-khaleej/DilMart_ARD_AL_KHALEEJ_GOLDEN10_CONTENT_v1.xlsx`  
SHA-256: `1FD708F7CC4CF829EF996BFB45E7E1BB2D4C7FBCCB0FEBDFF58FCCB463DAEA5E`  
Size: 14472 bytes  
Sheets: GOLDEN10_CONTENT, EDITORIAL_RULES, DATA_MODEL_100, SUMMARY

## Method

Re-validated SKU, store name, official name, brand, size, category path, and published notes from the Excel evidence sheet. Source URLs are Lattafa official product pages (manufacturer/catalog). Image identity for ARD-1191 remains **HOLD** pending visual match to official Oud Mood gold bottle.

## Per-SKU

| SKU      | Decision            | Identity          | Source                                                                    |
| -------- | ------------------- | ----------------- | ------------------------------------------------------------------------- |
| ARD-1015 | APPROVED_FULL       | VERIFIED          | lattafa.com Velvet Oud AR                                                 |
| ARD-1042 | APPROVED_FULL       | VERIFIED          | lattafa.com Lail Maleki                                                   |
| ARD-1065 | APPROVED_FULL       | VERIFIED          | lattafa.com Oud Mood Elixir AR (gender omitted due to page conflict note) |
| ARD-1172 | APPROVED_FULL       | VERIFIED          | lattafa.com Fakhar Men                                                    |
| ARD-1173 | APPROVED_FULL       | VERIFIED          | lattafa.com Fakhar Women                                                  |
| ARD-1191 | **HOLD**            | NEEDS_IMAGE_MATCH | lattafa.com Oud Mood — do not content-update until image match auth       |
| ARD-3270 | APPROVED_FULL       | VERIFIED          | lattafa.com Ameerat Al Arab Prive Rose (Asdaaf)                           |
| ARD-1826 | APPROVED_FULL       | VERIFIED          | lattafa.com Rave Now                                                      |
| ARD-2800 | APPROVED_SHORT_ONLY | VERIFIED          | lattafa.com Rave Now Intense — no official notes published                |
| ARD-3723 | APPROVED_FULL       | VERIFIED          | lattafa.com Rave Now Women                                                |

## Totals

- Checked links in workbook: **10**
- Verified for content readiness: **9**
- Failed / HOLD: **1** (ARD-1191 identity)
- Identity mismatches requiring hold: **1**

Source URLs remain in CSV evidence only — **not** written to `products` table.
