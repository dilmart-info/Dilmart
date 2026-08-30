# 03 — Taxonomy Proposal (Phase A Corrections)

**Source of truth:** `PHASE_A_STATS.json` + `02_FULL_CATALOG_CLASSIFICATION.csv` (single final dataset)  
**Status totals reconciliation:** **PASS**  
`2204 = 2168 ready + 34 merchant_confirmation + 1 duplicate_primary + 1 duplicate_hold`

**Taxonomy approval:** `CATEGORY_TAXONOMY_PHASE_B_APPROVED` → **Option C+** (`OPTION_C_PLUS_REUSE_EXISTING_EMPTY_ROOTS`)  
**Phase B:** AUTHORIZED (local/CI only — see `APPROVED_TAXONOMY_OPTION_C_PLUS.md`)

> **Supervisor freeze (C+):** Reuse empty root `d7df20e8-…` as personal-care parent (rename to العناية الشخصية والتجميل / `personal-care-beauty`) and add **4** care children including `skin-care`. Expected **10** new children total. Prior Option B = NO-GO.

## Final category counts (post-correction)

| Final category                   | Slug                    |    Count | Notes                                                |
| -------------------------------- | ----------------------- | -------: | ---------------------------------------------------- |
| العطور                           | `perfumes`              | **1435** | Includes Pilot 10                                    |
| معطرات الجسم والبودي مست         | `body-mist-splash`      |  **289** |                                                      |
| معطرات المنزل والمفارش والجو     | `home-linen-air`        |  **248** |                                                      |
| المسك والمخمريات والعطور الزيتية | `musk-oils-mukhammaria` |   **72** | Explicit oil/musk/mukhammaria only                   |
| العطور الصغيرة والميني           | `mini-travel-perfume`   |   **67** | Explicit mini/travel **or** ≤30ml; not 55/75/80/110  |
| البخور والمعمول                  | `incense-maamoul`       |   **41** |                                                      |
| العناية بالجسم والاستحمام        | `body-bath-care`        |   **17** |                                                      |
| العناية بالشعر وعطور الشعر       | `hair-care-fragrance`   |   **17** | Hair mist / عطر شعر                                  |
| البودرة ومنتجات التجميل          | `powder-makeup`         |   **17** | **True powder only** (بودره مربعه/بوري)              |
| صبغة ومستلزمات صالون للشعر       | `pro-hair-color-care`   |    **1** | **Existing production root** (ARD-2575 كريم سحب لون) |
| **Sum**                          |                         | **2204** |                                                      |

### Corrections that changed the prior proposal

- **مكياج scent line ≠ makeup:** `عطر مكياج` → perfumes; `مخمرية مكياج` → musk; mist/home with مكياج → mist/home.
- **powder-makeup:** old Excel bucket (13) was mostly scent-line false positives → corrected out; **17 true powders** restored into leaf.
- **Mini:** no size-only for 55/75/80/110; `مينيرفا` no longer matches `ميني`; sets not auto-mini.
- **Musk token** inside standard EDP names does not force oils leaf without زيتي/دهن/مخمر/مسك-form cues.
- **كريم سحب لون** → existing `pro-hair-color-care` (not a new fragrance child).

## Option comparison (revised)

### Option A — One broad root: العطور والعناية الشخصية

```text
العطور والعناية الشخصية (rename fc662e9f-…)
├─ 6 fragrance leaves (2152)
└─ 3 personal-care leaves (51)
```

| Dimension            | Assessment                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| Product counts       | 2203 under one family + 1 on existing pro-hair-color                      |
| Overlap              | Renames current perfume parent; weak overlap with empty `العناية بالبشرة` |
| Storefront           | One mega-root mixes scent shopping with lotion/powder                     |
| Legacy product       | Same grandfather need once children added                                 |
| Migration complexity | Medium (rename + 9 children + Pilot move)                                 |
| Recommendation       | Acceptable fallback                                                       |

### Option B — Narrow root: العطور والمعطرات; personal care uses other roots

```text
العطور والمعطرات (rename fc662e9f-…)
├─ perfumes / mini / body-mist / home / incense / musk-oils  (2152)

Personal care:
- reuse/extend العناية بالبشرة OR new children under it for body/hair/powder (51)
- ARD-2575 → existing pro-hair-color-care
```

| Dimension            | Assessment                                                                      |
| -------------------- | ------------------------------------------------------------------------------- |
| Product counts       | Fragrance root 2152; personal 51 elsewhere                                      |
| Overlap              | Better fit with empty `العناية بالبشرة`; avoids stuffing lotions under “معطرات” |
| Storefront           | Cleaner scent navigation                                                        |
| Legacy               | Grandfather on fragrance root still required                                    |
| Migration complexity | Higher (two parent strategies + skin-care root design)                          |
| Recommendation       | Strong if supervisor rejects dual new roots                                     |

### Option C — Two roots (PREFERRED in Phase A; evolved to C+)

```text
1) العطور والمعطرات          fragrances-and-scents
   (rename current fc662e9f-…)
   ├─ العطور                      perfumes                 1435
   ├─ العطور الصغيرة والميني       mini-travel-perfume       67
   ├─ معطرات الجسم والبودي مست    body-mist-splash         289
   ├─ معطرات المنزل والمفارش والجو home-linen-air           248
   ├─ البخور والمعمول             incense-maamoul           41
   └─ المسك والمخمريات والعطور الزيتية musk-oils-mukhammaria  72
                                                    subtotal 2152

2) العناية الشخصية والتجميل     personal-care-beauty
   **APPROVED C+:** reuse empty id `d7df20e8-…` (do not create a third root)
   ├─ العناية بالبشرة             skin-care                 (empty leaf for future)
   ├─ العناية بالجسم والاستحمام   body-bath-care            17
   ├─ العناية بالشعر وعطور الشعر  hair-care-fragrance       17
   └─ البودرة ومنتجات التجميل     powder-makeup             17
                                                    care products 51 (+ skin-care leaf)

Existing (untouched structure):
└─ صبغة ومستلزمات صالون للشعر   pro-hair-color-care         1 (ARD-2575 mapping-only)
```

| Dimension            | Assessment                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Product counts       | 2152 + 51 + 1 = 2204 (+ empty `skin-care` leaf)                                            |
| Overlap              | Clear scent vs care/beauty; reuses empty skin-care category id                             |
| Storefront           | Best Iraqi retail IA                                                                       |
| Legacy               | Soft grandfather: allow non-category updates while `category_id` unchanged; **no** DB flag |
| Migration complexity | Medium (rename 2 roots + **10** children + Pilot move)                                     |
| **Recommendation**   | **APPROVED as Option C+**                                                                  |

## Legacy direct product (similar merchant)

| Field              | Value                                           |
| ------------------ | ----------------------------------------------- |
| merchant_id        | `1689ae4a-41f5-425b-bebe-c99c74880008`          |
| slug               | `ardh-alkhaleej`                                |
| category today     | `fc662e9f-…` (will become parent with children) |
| Move in this task? | **NO**                                          |
| Strategy           | **Grandfather** until separate task             |

### Technical decision (approved C+)

After children exist, `isAssignableCategory(parent)` becomes false for **new** assignments. The legacy product must remain:

1. **Readable/editable** without forced leaf migration in this task.
2. **Exempt** from parent-not-assignable validation when `product.category_id` is unchanged (soft grandfather — **no** permanent DB flag).
3. Tracked in a follow-up task: `DilMart-LEGACY-PARENT-CATEGORY-REASSIGN-001` (out of scope).

### Tests to add in Phase B plan

- Existing product on parent remains updatable for non-category fields.
- Changing legacy product to another leaf succeeds.
- New product create rejecting parent with children.
- Confirm import rejecting parent path when children exist.
- Similar merchant product count unchanged by Pilot migration.

## Pilot 10

All → leaf **`perfumes` / العطور** under fragrance root. Similar merchant untouched.

## Confidence (same dataset)

| High | Medium | Low |
| ---: | -----: | --: |
| 1998 |    205 |   1 |

## Review of prior focus 350

| Approved | Corrected | Unresolved |
| -------: | --------: | ---------: |
|      270 |        80 |          0 |

Focus file now also includes mandatory small-category 100% reviews → **465** rows (superset); all have `review_status` / `evidence_basis` / `reviewed_at`.
