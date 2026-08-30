# Batch M1.5 — manual verification log

Fill **Environment / Date / Tester** and **Actual / Pass/Fail** when run against a real API + database.

**Environment:** _______________  
**Date:** _______________  
**Tester:** _______________

## Matrix

| # | Scenario | Expected | Actual | Pass/Fail |
|---|----------|----------|--------|-----------|
| 1 | `GET /api/marketplace/merchants?offset=0&limit=24&sort=featured` | `200`, `{ items, total, offset, limit }`; items are **card DTO** only (`id`, `slug`, `display_name`, `logo_url`, `is_featured`); **active** merchants only | — pending — | — |
| 2 | Sort `featured` | `is_featured` DESC, then `created_at` DESC (deterministic) | — pending — | — |
| 3 | Sort `newest` | `created_at` DESC | — pending — | — |
| 4 | Sort `name` | `display_name` ASC | — pending — | — |
| 5 | No `search` / `q` param | Ignored if manually added (or absent); not documented for M1.5 | — pending — | — |
| 6 | `/stores` | Renders; uses **only** `getMarketplaceMerchantsList` → `GET /marketplace/merchants` | — pending — | — |
| 7 | `/stores?page=2` | `offset` = `(page-1)*24` in API call; pagination controls work | — pending — | — |
| 8 | `/stores?sort=newest` / `name` | URL reflects sort; listing matches backend order | — pending — | — |
| 9 | No active merchants in DB | `/stores` still **200** page with **empty state** (not generic error page) | — pending — | — |
| 10 | Card click | Navigates to `/store/:slug` | — pending — | — |

## Focus checks (record concise **Actual** in the rows above)

### Featured sorting (#2)

- With multiple merchants where `is_featured` differs, confirm featured merchants appear before non-featured when `sort=featured` (and tie-break by recency).
- **Paste:** first two `display_name` + `is_featured` from API JSON if helpful.

### Pagination page mapping (#7)

- Open `/stores`, note `offset=0` in Network for `GET .../merchants`.
- Go to page 2; confirm request uses `offset=24` (with default `limit=24`).
- **Paste:** query string from DevTools for page 1 vs page 2.

### Empty-state behavior (#9)

- Use an environment with **zero** active merchants (or mock API empty list).
- **Expected:** Page loads; dashed empty message + link home — **not** `NotFound` and not a thrown error boundary.

### Card → storefront navigation (#10)

- Click a store card; URL must be `/store/<merchant-slug>` and storefront loads (or 404 if slug invalid — separate test).

---

*Replace **— pending —** after QA. This agent cannot fill **Actual** without your live stack.*
