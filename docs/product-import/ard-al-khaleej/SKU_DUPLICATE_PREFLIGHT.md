# SKU Duplicate Preflight — Gate 1

**Project:** `ztplxqlthuqkuktbznbo`  
**Date:** 2026-08-01  
**Verdict:** **BLOCKED** for unique index apply

## Query

```sql
select
  merchant_id,
  merchant_sku,
  count(*) as duplicate_count,
  array_agg(id order by created_at) as product_ids
from public.products
where merchant_sku is not null
  and btrim(merchant_sku) <> ''
group by merchant_id, merchant_sku
having count(*) > 1;
```

## Result summary

| Metric                                      |                                                     Value |
| ------------------------------------------- | --------------------------------------------------------: |
| Duplicate SKU groups                        |                                                   **123** |
| Merchants affected                          | **1** (`65575f7c-4204-44d0-99a0-fc1902e2ed91` / `alarsh`) |
| Pattern                                     | Each group has `duplicate_count = 3` (SKU prefix `S-A-*`) |
| Target pilot merchant `ac7c356b-…` products |                                       **0** (no conflict) |

## Decision

- Do **not** apply `products_merchant_sku_unique` until alarsh duplicates are cleaned with ops sign-off.
- Preflight SQL lives at:  
  `supabase/migrations/preflight/20260801180000_products_merchant_sku_unique.PREFLIGHT_BLOCKED.sql`
- Gate 1 import uses **application-level** upsert by `(merchant_id, merchant_sku)`.
