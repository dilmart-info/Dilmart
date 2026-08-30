# Recommended Category Structure

**Task:** `DilMart-STOREFRONT-CATEGORY-HIERARCHY-AUDIT-FIX-001`  
**Status:** recommendations only — no production SQL / remaps in this task

## Keep as-is (launch-safe)

Retain the current 11-root / 10-child tree. It is structurally healthy (0 orphans, 0 invalid parents, 0 duplicate slugs).

```text
[9 legacy salon roots — flat leaves]
العطور والمعطرات (fragrances-and-scents)
  ├─ العطور (perfumes)
  ├─ العطور الصغيرة والميني (mini-travel-perfume)
  ├─ معطرات الجسم والبودي مست (body-mist-splash)
  ├─ معطرات المنزل والمفارش والجو (home-linen-air)
  ├─ البخور والمعمول (incense-maamoul)
  └─ المسك والمخمريات والعطور الزيتية (musk-oils-mukhammaria)
العناية الشخصية والتجميل (personal-care-beauty)
  ├─ العناية بالبشرة (skin-care)
  ├─ العناية بالجسم والاستحمام (body-bath-care)
  ├─ العناية بالشعر وعطور الشعر (hair-care-fragrance)
  └─ البودرة ومنتجات التجميل (powder-makeup)
```

## Storefront policy (implemented in code)

| Rule          | Behavior                                                     |
| ------------- | ------------------------------------------------------------ |
| Visibility    | `is_active=true` only — never prune by product occupancy     |
| Root browser  | roots only; children never appear as root cards              |
| Selected root | show all active children + aggregate products across subtree |
| Selected leaf | leaf products only; sibling nav + parent breadcrumb          |
| Images        | own image → icon → parent image/icon → neutral gradient      |
| Cache         | categories TTL **60s**                                       |

## Follow-up content tasks (separate approval)

1. **Images / icons** for all 10 children (and ideally icons for all 21).
2. **Remap** parent-assigned product `04e67079-…` → leaf `perfumes` when publishing is intended.
3. Prefer assigning future fragrance/personal-care SKUs to **leaves**, not roots.
4. Optional explicit admin cache invalidation if 60s TTL is insufficient for ops workflows.

## Do not do in this task

- Create/rename/delete categories in production
- Activate/publish products or merchants
- Apply migrations or production SQL
- Upload invented category imagery
