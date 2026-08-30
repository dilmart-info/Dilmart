# Batch M1.3 — manual verification log

Run against a **real** backend + database (staging or local with seeded data). Record **Actual** and **Pass/Fail** after each check.

**Environment (fill in):** _______________  
**Date:** _______________  
**Tester:** _______________

## Matrix

| # | Scenario | Expected | Actual | Pass/Fail |
|---|----------|----------|--------|-----------|
| A | Active product, active merchant, has `category_id`, suggested API **200** | Full product page; breadcrumb to `/store/:slug`; «قد يعجبك أيضاً» shows cards | | |
| B | Active product, **no** `category_id` | Full product page; **no** suggested section | | |
| C | Suggested API **fails** (simulate 500, bad network, or invalid query) | Product page still renders; **no** suggested strip (empty fallback) | | |
| D | **Unknown** slug / **inactive** product / **inactive** merchant | Same **404** UI: «المنتج غير موجود» + link back to `/products` | | |
| E | **Duplicate slug** (two active merchants, same `products.slug`) | Same resolved product on repeated loads (deterministic: `merchant_id` then `id`) | | |

## Procedures (focus cases)

### C — Suggested failure fallback

1. Open a valid product detail URL that normally shows suggestions.
2. Block or break `GET /api/marketplace/suggested` (browser DevTools → Offline after main product loads; or temporarily misconfigure API base URL for **suggested only** if you can split; or mock 500 on backend for `/marketplace/suggested`).
3. **Expected:** Main product content visible; suggested section absent or empty; no full-page error.

### D — Inactive product / inactive merchant → 404

1. **Inactive product:** set `products.is_active = false` for a known slug; request `GET /api/marketplace/products/slug/:slug` → **404**; UI shows not-found.
2. **Inactive merchant:** set merchant `status` to `suspended` (or non-`active`) while product remains `is_active`; same endpoint should return **404** (join excludes row).
3. **Unknown slug:** request a slug that does not exist → **404**; same UI as (1)–(2).

### E — Deterministic duplicate slug

1. Ensure two **active** products share the same `slug`, different `merchant_id`, both `is_active` and merchants `active`.
2. Call `GET /api/marketplace/products/slug/:sharedSlug` repeatedly; note `id` + `merchant_id` in JSON.
3. **Expected:** Identical body every time; winner matches contract (lexicographic `merchant_id`, then `id`).

---

*Automated CI does not substitute for the above; fill **Actual** when run in your environment.*
