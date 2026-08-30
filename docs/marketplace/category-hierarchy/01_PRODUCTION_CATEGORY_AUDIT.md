# Production Category Audit

**Task:** `DilMart-STOREFRONT-CATEGORY-HIERARCHY-AUDIT-FIX-001`  
**Project:** `ztplxqlthuqkuktbznbo`  
**Audit date:** 2026-08-02  
**Mode:** read-only SQL (no production writes)

## Summary totals

| Metric                                      | Value |
| ------------------------------------------- | ----: |
| Total categories                            |    21 |
| Roots (`parent_id` null)                    |    11 |
| Children                                    |    10 |
| Orphans (parent missing)                    |     0 |
| Invalid `parent_id`                         |     0 |
| Duplicate slugs                             |     0 |
| Duplicate name under same parent            |     0 |
| Active child under inactive parent          |     0 |
| Missing `image_url`                         |    10 |
| Missing `icon_url`                          |    21 |
| Roots with children **and** direct products |     1 |

## Hierarchy shape

### Roots (11)

| sort | slug                     | name                              | children | direct products | direct public |
| ---: | ------------------------ | --------------------------------- | -------: | --------------: | ------------: |
|    1 | `barber-clippers`        | ماكينات حلاقة ومشابك كهربائية     |        0 |              63 |            51 |
|    2 | `shears-razors`          | مقصات وشفرات وموس احترافي         |        0 |              39 |            36 |
|    3 | `beard-mustache-care`    | عناية باللحية والشارب             |        0 |              10 |             3 |
|    4 | `men-barber-furniture`   | تجهيزات صالون حلاقة رجالي         |        0 |             387 |           127 |
|    5 | `women-salon-styling`    | أدوات تصفيف — صالون نسائي         |        0 |             102 |            71 |
|    6 | `sanitation-disposables` | تعقيم وقفازات ومناشف ولابس صحي    |        0 |               3 |             0 |
|    7 | `hair-dryers-tools`      | مجففات ومكاوي وفُرش احترافية      |        0 |               6 |             3 |
|    8 | `pro-hair-color-care`    | صبغة ومستلزمات صالون للشعر        |        0 |              28 |            23 |
|    9 | `salon-accessories`      | ملحقات صالون — بخاخات وروب وعبوات |        0 |               5 |             2 |
|   10 | `fragrances-and-scents`  | العطور والمعطرات                  |    **6** |           **1** |         **0** |
|   11 | `personal-care-beauty`   | العناية الشخصية والتجميل          |    **4** |               0 |             0 |

### Fragrance children (6) — parent `fc662e9f-ea22-454e-bb29-cdb7bf5ea90c`

`perfumes`, `mini-travel-perfume`, `body-mist-splash`, `home-linen-air`, `incense-maamoul`, `musk-oils-mukhammaria`

All active; all missing `image_url` and `icon_url`. Only `perfumes` has direct products (10 total / 0 public listable).

### Personal-care children (4) — parent `d7df20e8-011c-430e-a8a7-77b9506936ac`

`skin-care`, `body-bath-care`, `hair-care-fragrance`, `powder-makeup`

All active; all empty of products; all missing `image_url` and `icon_url`.

## Parent product assignment finding

Exactly **1** product is assigned directly to a parent that has children:

| Field               | Value                                  |
| ------------------- | -------------------------------------- |
| Product id          | `04e67079-aa3b-4fc5-a12c-da7de40f54d0` |
| Name                | عطر اكوا شهامه الليل /سيف الفارس100مل  |
| Category            | `fragrances-and-scents` (root)         |
| `is_active`         | false                                  |
| `is_published`      | true                                   |
| `visibility_status` | public                                 |
| Merchant            | `ardh-alkhaleej` (active)              |

Public-listable impact today: **none** (`is_active=false`). Still a taxonomy debt — prefer leaf `perfumes` when remapping (separate content task).

## Pre-fix marketplace behavior (production code before this task)

`MarketplaceService.getCategories()` pruned active children with zero publicly listable products.

**Effect:** fragrance + personal-care children (10) were hidden from storefront category APIs / drawers even though Admin showed them.

| Surface                         | Before (approx) |                  After expected |
| ------------------------------- | --------------: | ------------------------------: |
| Active categories returned      |   11 roots only | **21** (11 roots + 10 children) |
| Fragrance children returned     |               0 |                               6 |
| Personal-care children returned |               0 |                               4 |

## Cache

| Item               | Before                   | After (this task)                            |
| ------------------ | ------------------------ | -------------------------------------------- |
| Categories TTL     | 10 minutes               | **60 seconds**                               |
| Strategy           | long occupancy-ish cache | short TTL; optional admin invalidation later |
| Product list cache | keyed by slug + filters  | unchanged                                    |

## Public safety invariants (unchanged)

Storefront product queries still require:

- `products.is_active = true`
- `products.is_published = true`
- `products.visibility_status = 'public'`
- `merchants.status = 'active'`

Making empty categories visible must **not** leak Golden/pilot private drafts.

## Artifacts

- `02_CATEGORY_INVENTORY.csv` — all 21 rows
- `03_ADMIN_MARKETPLACE_PARITY.csv` — Admin vs Marketplace visibility gap
- `04_MISSING_IMAGES.csv` — 10 children without images (+ icon gap note)
- `05_PARENT_PRODUCT_ASSIGNMENTS.csv` — 1 parent-assigned product
- `06_RECOMMENDED_STRUCTURE.md` — taxonomy recommendations
- `07_IMPLEMENTATION_REPORT.md` — code/test status
