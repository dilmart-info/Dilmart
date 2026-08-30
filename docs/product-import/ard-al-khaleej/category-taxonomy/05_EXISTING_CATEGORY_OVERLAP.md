# 05 — Existing Category Overlap (Corrections)

## Reuse map

| Existing production category | Role after Option C | Action |
|------------------------------|---------------------|--------|
| `fc662e9f-…` عطور و معطرات جسم | Fragrance root (rename → العطور والمعطرات) | **Reuse + rename** |
| `العناية بالبشرة` (0 products) | Candidate merge target vs new `personal-care-beauty` | Decide in Phase B (prefer new root OR rename this empty root — do not silently duplicate) |
| `pro-hair-color-care` | Host ARD-2575 كريم سحب لون | **Reuse as-is** (1 product) |
| Barber / salon tool roots | No Ard retail overlap | Untouched |

## Do not duplicate

- Do not create a second “عطور” root beside renamed `fc662e9f-…`.
- Do not put powder under salon pro-color.
- Do not create merchant-branded categories.

## False-overlap fixed in corrections

| Pattern | Wrong prior bucket | Corrected to |
|---------|--------------------|--------------|
| عطر/سبلاش/معطر … مكياج | powder-makeup | perfume / mist / home |
| مخمرية مكياج | powder-makeup | musk-oils-mukhammaria |
| مسك … مكياج | powder-makeup | musk-oils-mukhammaria |
| كريم سحب لون | hair-care-fragrance (Excel) | `pro-hair-color-care` |
| عطر … 80مل labeled mini | mini | perfumes |

## Legacy overlap

Similar merchant product on `fc662e9f-…` creates parent-with-children assignability tension → **grandfather** (see `03_TAXONOMY_PROPOSAL.md`), not silent move.
