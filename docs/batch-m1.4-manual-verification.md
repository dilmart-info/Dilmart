# Batch M1.4 — manual verification log

Fill **Environment / Date / Tester** and the **Actual** / **Pass/Fail** columns when you run checks in a **real** deployment (local API + DB, staging, or production).

> **Note:** Automated CI does not substitute for these checks. Values below marked **— pending —** are placeholders until QA records results.

**Environment:** _______________  
**Date:** _______________  
**Tester:** _______________

## Matrix

| # | Scenario | Expected | Actual | Pass/Fail |
|---|----------|----------|--------|-----------|
| 1 | `/products` — no query params | Paginated grid (or empty state); sort default **newest**; only **category** chips + **sort** control (no merchant/price UI) | — pending — | — |
| 2 | `/products?category=<slug>` | Filtered listing; contextual empty if none; pagination uses `GET /marketplace/products` only | — pending — | — |
| 3 | `/products?search=<term>` | Name `ILIKE` search; empty state mentions search term; no dedicated `/search` route | — pending — | — |
| 4 | `/products?sort=price-asc` / `price-desc` / `newest` | Order matches contract (price asc/desc, `created_at` desc for newest) | — pending — | — |
| 5 | Legacy URL with `filter`, `merchant_id`, `min_price`, or `max_price` | Params **stripped** from URL (replace); listing still works | — pending — | — |
| 6 | `/category/:slug` | Landing only: title, subcategory links, **no** product grid; primary CTA → `/products?category=<slug>` | — pending — | — |
| 7 | `/offers` | Still dedicated offers page (not replaced by `/products?filter=offers`) | — pending — | — |
| 8 | Home «عرض الكل» (new block) | Links to `/products?sort=newest` (not `filter=new`) | — pending — | — |

## Focus checks (copy observations into **Actual** above)

### Sort ordering (#4)

- Call API or use UI: compare first/second row IDs or prices when `sort=newest` vs `price-asc` vs `price-desc`.
- **Expected:** `newest` = `created_at` desc; `price-asc` / `price-desc` = `price` asc/desc per `marketplace-list.contract.ts`.

### Legacy query-param stripping (#5)

- Open `/products?filter=offers&merchant_id=00000000-0000-0000-0000-000000000001&min_price=1&max_price=999999`.
- **Expected:** After load, URL no longer contains those keys; grid still loads (or empty state) without errors.

### `/category/:slug` landing (#6)

- Open a valid category slug.
- **Expected:** No product card grid; visible CTA to `/products?category=<same slug>`; subcategory pills only if data has children.

### `/offers` consistency (#7)

- Open `/offers` from nav or direct URL.
- **Expected:** Still uses offers-specific UX (`GET /marketplace/offers` or equivalent); not redirected to `/products?filter=offers`.
