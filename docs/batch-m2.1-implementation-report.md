# Batch M2.1 — Search Contract Stabilization  
## Implementation report

**Engineering status:** Closed (approved).

### Summary

Public product listing search is **normalized on the backend** (trim + internal whitespace collapse), applies a **minimum length of 2** after normalization, and uses **silent no-filter** behavior (no `400`) when the query is empty-like or too short. **`/products`** title and empty states use **`getEffectiveMarketplaceSearchTerm`** so short/empty URL params do not show misleading “no results for your search” copy.

### Code / docs touched

| Item | Path |
|------|------|
| Server normalization + constants | `backend/src/modules/marketplace/marketplace-search.normalize.ts` |
| `listProducts` search branch | `backend/src/modules/marketplace/marketplace.service.ts` |
| Contract comments | `backend/src/modules/marketplace/marketplace-list.contract.ts` |
| Client helpers (must match server) | `src/lib/marketplace-search.ts` |
| Listing UX | `src/pages/Products.tsx` |
| API hint | `src/lib/api-client.ts` (JSDoc on `getMarketplaceProducts`) |

### Out of scope (per M2.1)

Relevance ranking, fuzzy matching, typo correction, FTS expansion, merchant/category search, dedicated `/search` route — **not** introduced.

### Regression notes

- Bookmarks with `?search=` or one-character `search` now **omit** the name filter; empty listings use **non-search** empty copy when no category filter applies.
- API clients sending `search` with whitespace-only or single character get **browse-like** results for the name dimension (still filtered by `category_slug` / `merchant_id` if set).

### Manual verification matrix

**Note:** Rows below combine **deterministic checks** (compiled `marketplace-search.normalize.js`, run at engineering close-out) with **integration** expectations. Re-run against your **deployed API + browser** for full operational sign-off (Supabase `ILIKE`, auth, CDN).

| Check | Expected | Actual (engineering close-out) | Pass/Fail |
|-------|----------|----------------------------------|-----------|
| Empty query | No name filter; browse title/empty when no category | `normalize("")` → `""`, `appliesFilter` **false** (Node on `dist/.../marketplace-search.normalize.js`). UI uses `getEffectiveMarketplaceSearchTerm` → null. | Pass (logic) |
| Whitespace-only query | Same as empty | `normalize("   ")` → `""`, `appliesFilter` **false**. | Pass (logic) |
| One-character query | No name filter; no misleading search empty state | `normalize("a")` → `"a"`, `appliesFilter` **false**. Arabic single grapheme `ف` → `appliesFilter` **false**. | Pass (logic) |
| Two-character query | Name filter applies when length ≥ 2 | `normalize("ab")` → `"ab"`, `appliesFilter` **true**. `normalize("فو")` → `"فو"`, `appliesFilter` **true**. | Pass (logic) |
| Normalized multi-space query | Internal spaces collapsed; filter if length ≥ 2 after normalize | `normalize("  x  y  ")` → `"x y"`, `appliesFilter` **true**. | Pass (logic) |
| Search + sort together | `sort` independent of search; both from `GET /marketplace/products` | **Code review:** `listProducts` applies `ILIKE` only when filter applies; `sort` branch unchanged (default `newest`). **HTTP:** confirm in staging, e.g. `?search=ab&sort=price-asc`. | Pass (code); Pending (staging) |
| No search query | Browse; default title / category flows | No `search` param → no `ILIKE`; listing as before M2.1 for browse. | Pass (logic) |

**Staging / production:** Fill **Actual** with observed row counts, H1 text, and empty-state copy from a real deployment if they must differ from logic-only verification.

**How to verify in browser:** open `/products`, `/products?search=`, `/products?search=a`, `/products?search=ab`, `/products?search=%20%20x%20%20y%20%20`, `/products?search=test&sort=price-asc`; confirm titles and empty blocks match expectations above.

### Deterministic script (optional re-run)

From repo root after `backend` build:

```bash
node -e "const m=require('./backend/dist/modules/marketplace/marketplace-search.normalize.js'); console.log(m.normalizeMarketplaceSearchQuery('  x  y  '), m.marketplaceSearchFilterApplies(m.normalizeMarketplaceSearchQuery('  x  y  ')));"
```
