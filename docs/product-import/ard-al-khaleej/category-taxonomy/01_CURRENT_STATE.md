# 01 — Current State (Phase A, Read-only)

**Task:** `DilMart-ARD-AL-KHALEEJ-CATEGORY-TAXONOMY-001`  
**Phase:** A only — no production writes  
**Base SHA:** `60a21413ad92e1114d8ea5626fd009fa3a4228f0`  
**Production project:** `ztplxqlthuqkuktbznbo`

## Excel source used

| Field                                  | Value                                                                                                                |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Path                                   | `E:\Project\DilMart-Store\.tmp-product-import\ard-al-khaleej\Ard_Al_Khaleej_Catalog_Stage3_Pilot_Batches_AB_v4.xlsx` |
| Bytes                                  | 936956                                                                                                               |
| SHA-256                                | `44064E6B38FED755A9A860111AFFD200C1A59B1A88877980C662C970C2B3A239`                                                   |
| Committed to git                       | No (gitignored working copy)                                                                                         |
| Authoritative sheet for classification | `11_STAGE2_MASTER`                                                                                                   |
| Authoritative sheet for confidence     | `03_MASTER_CATALOG.category_confidence`                                                                              |

## Catalog counts (from Excel itself)

| Metric                                       |    Count |
| -------------------------------------------- | -------: |
| Total rows                                   | **2204** |
| Ready (`stage2_status=ready`)                | **2168** |
| Needs confirmation (`merchant_confirmation`) |   **34** |
| Duplicate primary                            |    **1** |
| Duplicate hold                               |    **1** |

Matches expected task baseline.

## Production categories (read-only)

Root count: **11**. Child count under any parent: **0**. Maximum depth: **1**.

| sort | name                              | slug                     | products | public | notes                           |
| ---: | --------------------------------- | ------------------------ | -------: | -----: | ------------------------------- |
|    1 | ماكينات حلاقة ومشابك كهربائية     | `barber-clippers`        |       63 |     51 | Salon tools — no Ard overlap    |
|    2 | مقصات وشفرات وموس احترافي         | `shears-razors`          |       39 |     36 | Salon tools                     |
|    3 | عناية باللحية والشارب             | `beard-mustache-care`    |       10 |      3 | Weak overlap only               |
|    4 | تجهيزات صالون حلاقة رجالي         | `men-barber-furniture`   |      387 |    127 | Furniture                       |
|    5 | أدوات تصفيف — صالون نسائي         | `women-salon-styling`    |      102 |     71 | Tools                           |
|    6 | تعقيم وقفازات ومناشف ولابس صحي    | `sanitation-disposables` |        3 |      0 | Hygiene                         |
|    7 | مجففات ومكاوي وفُرش احترافية      | `hair-dryers-tools`      |        6 |      3 | Tools                           |
|    8 | صبغة ومستلزمات صالون للشعر        | `pro-hair-color-care`    |       28 |     23 | Pro color — not retail perfume  |
|    9 | ملحقات صالون — بخاخات وروب وعبوات | `salon-accessories`      |        5 |      2 | Accessories                     |
|   10 | **عطور و معطرات جسم**             | `عطور-و-معطرات-جسم`      |   **11** |  **0** | **Pilot parent today**          |
|   11 | العناية بالبشرة                   | `العناية-بالبشرة`        |        0 |      0 | Empty; Arabic slug; no children |

### Focus category

- id: `fc662e9f-ea22-454e-bb29-cdb7bf5ea90c`
- name: عطور و معطرات جسم
- children: **0**
- products attached: **11**
  - Target `arth-al-khaleg`: **10** (all Pilot SKUs)
  - Similar `ardh-alkhaleej`: **1** (must not be moved in Phase B without separate decision)

## Target merchant safety (unchanged during Phase A)

| Check                   | Value                                  |
| ----------------------- | -------------------------------------- |
| merchant_id             | `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` |
| slug                    | `arth-al-khaleg`                       |
| status                  | `draft`                                |
| products                | 10                                     |
| stock total             | 0                                      |
| is_active               | all false                              |
| is_published            | all false                              |
| visibility_status       | all private                            |
| Storage objects         | 452                                    |
| Public visible products | 316                                    |

## Problem statement

1. Catalog has **9 semantic product families** already labeled in Excel (2204 rows).
2. Production has only a **flat** perfume parent with **no leaves**.
3. Parent Arabic name **عطور و معطرات جسم** is too narrow for home fragrance, incense, musk oils, body care, hair care, and powder/makeup (490 non-“عطور” rows).
4. Pilot 10 are all parked on that parent leaf-as-root — blocks correct storefront browsing once published.

## Phase A invariant

No production write performed. Baseline values above remain authoritative until Phase B approval.

## Corrections pass (same branch)

After `CATEGORY_TAXONOMY_PHASE_A_CORRECTIONS_REQUIRED`, classification was rebuilt from one final dataset. See `07_PHASE_A_REPORT.md` and `PHASE_A_STATS.json`. Preferred structure revised to **Option C**. Production still untouched.
