# 06 — Implementation Plan (Phase B — Option C+)

**Authorization:** `CATEGORY_TAXONOMY_PHASE_B_APPROVED`  
**Architecture:** `OPTION_C_PLUS_REUSE_EXISTING_EMPTY_ROOTS`  
**Freeze:** `APPROVED_TAXONOMY_OPTION_C_PLUS.md`

## Still forbidden

Merge · remote migration apply · production writes · Render/Netlify deploy · product/merchant activation · full 2204 import

## Phase B sequence

1. Freeze Arabic names + slugs (Option C+).
2. Local/CI migration `20260802120000_ard_al_khaleej_category_taxonomy.sql`:
   - Rename fragrance root `fc662e9f-…` → العطور والمعطرات / `fragrances-and-scents`.
   - Reuse empty `d7df20e8-…` → العناية الشخصية والتجميل / `personal-care-beauty`.
   - Insert **10** children (6 fragrance + 4 personal-care including `skin-care`).
   - Move Pilot 10 → `perfumes` (exact-10 or skip-if-0).
   - Soft-assert similar merchant unchanged.
3. Backend `isAssignableCategory` + grandfather **without** DB flag (skip assert when `category_id` unchanged).
4. Importer hierarchical paths (`Parent > Child`); fail closed on ambiguity / parent-only.
5. Admin tree badges + ProductForm / ProductsPage **leaf-only** selection.
6. Storefront hide empty active children in `getCategories` / `getCategoryPage`.
7. Tests L1–L8 + docs preflight/postflight.

## Required tests — legacy parent product

| # | Test |
|---|------|
| L1 | Product already on parent with children: UPDATE name/price succeeds without category change |
| L2 | Same product: changing `category_id` to a leaf succeeds |
| L3 | Same product: changing `category_id` to another parent-with-children fails `CATEGORY_PARENT_NOT_ASSIGNABLE` |
| L4 | NEW product create with parent-with-children fails |
| L5 | Import preview path parent alone fails once children exist |
| L6 | Import preview `العطور والمعطرات > العطور` succeeds |
| L7 | Pilot confirm moves only target merchant SKUs; similar merchant unchanged (migration assert) |
| L8 | No permanent grandfather DB flag; docs state permission is `category_id` unchanged only |

## Pilot reclassification

Exact 10 SKUs on `arth-al-khaleg` → slug `perfumes` under fragrance root. No other field changes in this task.
