# Batch M2.4 — Search Results UX (`/products`)  
## Implementation report

### Summary

Listing page now has a **dynamic context line** (M2.4), **weak-query** guidance without Header changes, **branched empty states** with CTAs, and a **results count** when data exists and the query is not weak. **No API changes.**

### Files

| File | Change |
|------|--------|
| `src/pages/Products.tsx` | `ProductsContextLine`, `ProductsEmptyState` branches, `EmptyCtaRow`, weak detection, title rules, results count |
| `backend/src/modules/marketplace/marketplace-list.contract.ts` | M2.4 storefront UX subsection (comments) |

### Behavior

| Topic | Rule |
|-------|------|
| Weak query | `searchParams.has("search") && !effectiveSearchTerm` |
| Context line | Search phrase from **effective** term only; category «منتجات ضمن»; combined line when both |
| Guidance | «اكتب حرفين على الأقل للبحث» (context + weak empty) |
| Results count | `!isLoading && products.length > 0 && !isWeakSearch` |
| Filters | Chips unchanged — search and category coexist |

### Manual verification matrix

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| `?search=test` | Context + search empty/search results | | Pending QA |
| `?search=a` | Weak guidance, browse, no count line | | Pending QA |
| `?category=x` | منتجات ضمن … | | Pending QA |
| Combined empty | Message + 3 CTAs where applicable | | Pending QA |
| Header | Still submits short queries | | Pending QA |
