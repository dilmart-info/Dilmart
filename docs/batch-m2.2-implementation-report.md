# Batch M2.2 — Listing Ranking & Sort Layer  
## Implementation report

**Decision:** Option A — **copy/label alignment only** (no homepage query changes, no `is_featured` switch for `featuredProducts`, no composite ranking).

### Summary

- Added **`marketplace-ranking.contract.ts`**: surface matrix (default sort, user sorts, signals, Arabic label guidance), glossary separating **merchant featured**, **product featured** (DB only / not home bucket), **best seller**, **new**, **offer**.
- Cross-linked **`marketplace-home.contract.ts`**, **`marketplace-list.contract.ts`**, **`marketplace-stores.contract.ts`**, **`marketplace.controller.ts`**.
- **User-facing copy:** home “best seller” section and **`ProductCard`** badge no longer imply generic “luxury/مختار” for `is_best_seller`; **new** section subtitle clarifies flag-based “new”; **merchants** strip subtitle clarifies featured-first ordering.

### Files touched

| File | Change |
|------|--------|
| `backend/src/modules/marketplace/marketplace-ranking.contract.ts` | **New** — ranking/sort reference + glossary |
| `backend/src/modules/marketplace/marketplace-home.contract.ts` | Note on `featuredProducts` + `@see` ranking |
| `backend/src/modules/marketplace/marketplace-list.contract.ts` | `@see` ranking |
| `backend/src/modules/marketplace/marketplace-stores.contract.ts` | `@see` ranking |
| `backend/src/modules/marketplace/marketplace.controller.ts` | Doc pointer |
| `src/pages/Index.tsx` | Section titles/subtitles (merchants, best seller, new) |
| `src/components/ProductCard.tsx` | Best-seller badge text |
| `src/lib/marketplace-home.types.ts` | Comment on `featuredProducts` |

### Not changed (per plan)

- Homepage bucket **queries**, section **order**, storefront **sort** UI, **`/offers`** API behavior.
- No search/relevance/M2.3 scope.

### Manual verification matrix

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Home «الأكثر مبيعاً» reflects `is_best_seller` copy | Section title/subtitle match signal | | Pending QA |
| Home «وصل حديثاً» clarifies `is_new` | Subtitle mentions flag-based new | | Pending QA |
| Home merchants subtitle | Mentions featured-first ordering | | Pending QA |
| Product card badge for best seller | «الأكثر مبيعاً» visible when flag set | | Pending QA |
| `/products` / `/stores` sorts unchanged | Same controls and API defaults | | Pending QA |
| Backend contract compiles | `nest build` clean | Pass (local `npm run build` in `backend/`) | Pass |
| Frontend build | `vite build` clean | Pass (repo root `npm run build`) | Pass |

### Regression notes

- JSON key `featuredProducts` unchanged; only labels and docs.
- Merchants with `is_featured` were already ordered first; copy now states it clearly.
