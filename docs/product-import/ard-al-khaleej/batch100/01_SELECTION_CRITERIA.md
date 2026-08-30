# 01 — Batch 100 Selection Criteria

**Task:** DilMart-ARD-AL-KHALEEJ-BATCH100-001 — Phase A  
**Merchant:** `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg`) — draft  
**Workbook:** `.tmp-product-import/ard-al-khaleej/Ard_Al_Khaleej_Catalog_Stage3_Pilot_Batches_AB_v4.xlsx`  
**SHA-256:** `44064E6B38FED755A9A860111AFFD200C1A59B1A88877980C662C970C2B3A239`  
**Size:** 936956 bytes

## Catalog totals (11_STAGE2_MASTER)

| Status                |    Count |
| --------------------- | -------: |
| ready                 |     2168 |
| merchant_confirmation |       34 |
| duplicate_primary     |        1 |
| duplicate_hold        |        1 |
| **Total**             | **2204** |

## Hard exclusions

- Existing Golden/Pilot SKUs (10)
- `merchant_confirmation`, `duplicate_primary`, `duplicate_hold`
- Missing/invalid price
- Brand `needs_review` / empty brand
- Taxonomy confidence ≠ high
- Non-target or unresolved leaf category
- Similar merchant `ardh-alkhaleej` never touched

## Target distribution (after documented redistribution)

| Slug                  | Count | Notes                        |
| --------------------- | ----: | ---------------------------- |
| perfumes              |    51 | +1 redistributed             |
| body-mist-splash      |    14 |                              |
| home-linen-air        |    12 |                              |
| mini-travel-perfume   |     6 |                              |
| musk-oils-mukhammaria |     5 |                              |
| incense-maamoul       |     4 |                              |
| body-bath-care        |     3 |                              |
| hair-care-fragrance   |     3 |                              |
| powder-makeup         |     2 |                              |
| pro-hair-color-care   |     0 | **no ready leaf candidates** |

**Redistribution:** 1 slot from `pro-hair-color-care` → `perfumes` because all `pro-hair-color-care` classification rows are `merchant_confirmation` only (not import-ready).

## Ranking inside each leaf pool

1. Preferred brands (Lattafa, RAVE, Asdaaf, Ard Al Zaafaran, Maison Alhambra / Alhambra)
2. Known size
3. Known Stage3 image candidate URL (rare outside Golden)
4. Stable SKU ascending

## Content rules applied

- `short_description` mandatory, 40–280 Unicode code points, unique exact text
- `description` only if Stage3 official verified text exists for that SKU (none in this batch)
- Fixed: stock=0, inactive, unpublished, private, discount empty

## Image reality (Phase A blocker)

Workbook `image_status=missing` for **all 2204** catalog rows. Stage3 image URLs cover mostly Golden SKUs only. Therefore local prepared images for Batch 100 = **0** and Phase A image gate is **NO-GO** until a separate image-research authorization provides candidate URLs.
