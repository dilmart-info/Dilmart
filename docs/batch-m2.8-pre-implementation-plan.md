# Batch M2.8 — Pre-implementation plan (browse performance & query discipline)

**Status:** Pre-implementation only — **no code in this batch step.**  
**Scope:** Browse performance, payload size, repeated query patterns, caps/limits/list discipline, DTO/select hygiene **where needed**.  
**Explicitly out of scope for M2.8:** Caching architecture expansion (Redis, CDN layers, new server-side cache stores), search/ranking expansion (FTS, new search surfaces, relevance), product features, UX copy, cross-batch M2.x mixing.

---

## 1. Goal

Make marketplace **browse** paths cheaper and more predictable: fewer redundant queries, smaller JSON where listing grids do not need full detail payloads, enforced limits on list-style endpoints, and DB-level pagination for paths that currently materialize large sets in memory. **Behavioral parity** for storefront users unless a stricter cap intentionally surfaces “truncated” semantics (must be documented in contracts).

---

## 2. Current-state audit

### 2.1 Backend — `MarketplaceService` / controller

| Area | Finding | Evidence |
|------|---------|----------|
| **Categories on every product list** | `listProducts` calls `getCategories()` whenever `category_slug` is present, loads **all** rows with `select("*")`, then resolves slug → `id` in memory. | `marketplace.service.ts` — `getCategories()`, `listProducts()` branch `params.category_slug`. |
| **Home + categories** | `getHome()` calls `getCategories()` again (full `*`), plus three capped product queries (8 each) and an offers candidate query (limit 8, then JS filter). | `getHome()`. |
| **Product row shape** | All marketplace product selects reuse **`MARKETPLACE_PUBLIC_PRODUCT_SELECT`**, which includes **`description`** and many merchandising flags. List grids carry full text descriptions for every card. | `marketplace-product-detail.contract.ts` — `MARKETPLACE_PUBLIC_PRODUCT_SELECT`; composed as `MARKETPLACE_PRODUCT_WITH_MERCHANT_SELECT` in `marketplace.service.ts`. |
| **`filter=offers` + listing** | Documented **non-scalable**: loads offer list via `getOffersList()` (DB limit **200**), filters in JS, then **`slice`** for pagination. | `listProducts` `filter === "offers"`; `getOffersList()`. |
| **`GET /marketplace/category/:slug`** | Returns **all** products for a category **and** subcategories — **no limit**, **no pagination**. | `getCategoryPage()`. |
| **`GET /marketplace/products/by-ids`** | No **cap** on number of `ids`; unbounded `in(...)` and full product+merchant embed per id. | `MarketplaceController.getProductsByIds`, `getProductsByIds()`. |
| **Offers endpoint** | Returns full `getOffersList()` (same 200-row cap + client filter). | `getOffers()`. |
| **Limits** | `listProducts` / `listMerchantsForDiscovery` clamp `limit` to **100** server-side; controller defaults **24**. | `listProducts` (`Math.min(..., 100)`), `listMerchantsForDiscovery`. |

### 2.2 Frontend — repeated fetches & keys

| Area | Finding | Evidence |
|------|---------|----------|
| **Duplicate category requests** | **`Header`** uses `queryKey: ["marketplace-categories-header"]`**; **`Products`** and **`Category`** use `["marketplace-categories"]`. Same HTTP endpoint, **different keys** → React Query does **not** dedupe; every page with Header + another consumer can **double-fetch** categories. | `Header.tsx`, `Products.tsx`, `Category.tsx`. |
| **Home** | Single `getMarketplaceHome()` — good aggregation pattern; large payload but **one** round trip. | `Index.tsx`. |
| **Storefront** | Merchant + products list (`limit: 48` client-side); no pagination beyond first page — **discipline** issue if merchant has huge catalogs (payload capped only by server max). | `Storefront.tsx` — `STOREFRONT_PRODUCT_LIMIT`. |
| **Wishlist** | `getMarketplaceProductsByIds(items)` — id list length = local wishlist size; **unbounded** from API perspective. | `Wishlist.tsx`. |
| **Unused heavy API** | `getMarketplaceCategoryPage` exists on `apiClient` but **no in-repo callers**; backend `getCategoryPage` still exposes unbounded products. | `api-client.ts` grep vs `src/`. |

### 2.3 Cross-cutting observations

- **ILIKE** on `products.name` for search is already bounded by M2.1 min length; M2.8 does **not** expand search — only notes that listing payload slimming reduces cost **per row** when search is active.
- **Featured merchants** on home uses `select` including `description` — card strip may not need full description (select hygiene candidate).

---

## 3. Exact performance & query discipline plan (implementation order)

Work packages are ordered by **impact / risk** ratio. Each should land with **contract file updates** where the HTTP shape or column allowlist changes.

### WP-A — Category resolution without full table scans (backend)

- **Change:** For `listProducts` with `category_slug`, resolve `category_id` with a **single-row** query: `categories` filtered by `slug`, `select("id")` (or join from products if refactored to subquery — prefer minimal change first).
- **Stop:** Loading `getCategories()` inside `listProducts` for this path.
- **Optional follow-on:** If `getCategories()` remains for other callers, narrow `select` from `*` to **public columns** actually needed (id, name, slug, parent_id, sort_order — align with a typed allowlist).
- **Contracts:** Update `marketplace-list.contract.ts` only if error semantics change (e.g. unknown slug → empty result vs current behavior when slug missing from in-memory list).

### WP-B — List vs detail product selects (backend + contracts)

- **Change:** Introduce a **`MARKETPLACE_LIST_PRODUCT_SELECT`** (or similarly named) subset: fields required for **cards and list rows** (e.g. omit **`description`**, and any columns unused by `ProductCard` / list UIs). Use it for:
  - `GET /marketplace/products` (paginated list),
  - `GET /marketplace/home` product buckets,
  - `GET /marketplace/offers` items,
  - `GET /marketplace/suggested`,
  - `getProductsByIds` (wishlist grids),
  - `getCategoryPage` products (if still supported),
  - Storefront list via `merchant_id` query.
- **Keep** full `MARKETPLACE_PUBLIC_PRODUCT_SELECT` for **`GET /marketplace/products/slug/:slug`** (PDP) only.
- **Frontend:** Adjust TypeScript types so list types do not claim `description` where omitted (narrowed DTOs / discriminated contexts).
- **Discipline:** Document the two shapes in `marketplace-product-detail.contract.ts` or a small `marketplace-list-product.contract.ts` fragment to avoid drift.

### WP-C — `filter=offers` path: DB-level predicate + count + range (backend)

- **Change:** Replace `getOffersList()` + `slice` with a **`listProducts`-style query**: predicates `discount_price IS NOT NULL`, `discount_price < price`, active merchant/product, **`count: "exact"`**, **`range(offset, offset+limit-1)`**, same sort as documented for offers elsewhere (`created_at` desc unless contract says otherwise).
- **Remove or narrow** `getOffersList()` to internal use only (e.g. shared predicate builder) to avoid two code paths.
- **Contracts:** `marketplace-list.contract.ts` / ranking doc — note offers filter is now **true pagination** with accurate `total`.

### WP-D — Hard caps & validation (backend)

- **`by-ids`:** Max **N** ids (proposal: **50–100**, pick one; reject or truncate with documented behavior). Optionally validate UUID format to avoid oversized strings.
- **`getCategoryPage`:** Either **deprecate** with 410/redirect story if unused, or add **`limit` + `offset`** (or a single **top-N** preview) and document. Prefer aligning with product listing route instead of duplicating grids.
- **Align** client `PAGE_SIZE` / storefront limits with server caps in contracts (24, 48, 100) so “silent clamp” is visible to integrators.

### WP-E — React Query key discipline (frontend only)

- **Change:** Use **one** `queryKey` for `getMarketplaceCategories()` (e.g. `["marketplace-categories"]`) in **Header**, **Products**, **Category**, and any other caller.
- **Out of scope for M2.8:** Introducing new global cache providers or staleTime policies as a “caching architecture”; unifying keys is **deduplication**, not a new cache layer.

### WP-F — Home payload hygiene (backend, optional if WP-B done)

- After list-select split, re-evaluate **`featuredMerchants`** select: drop columns not rendered on home merchant strip if any are heavy (e.g. long `description`).

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| **Breaking API consumers** omitting `description` on list endpoints | Version or document in contracts; grep external docs; keep PDP unchanged. |
| **Category slug resolution change** alters edge cases | Golden tests: unknown slug → same visible behavior as today (no matches). |
| **`filter=offers` refactor** changes totals vs old `slice` | Compare counts on staging with production-like data; fix sort parity. |
| **`by-ids` cap** breaks large wishlists | Cap wishlist client-side to N or batch requests in a **later** batch if needed; document max in contract. |
| **Scope creep** into search relevance or Redis | Reject in PR review; M2.8 checklist below. |

---

## 5. Definition of Done (M2.8)

- [ ] **No new** search features, ranking algorithms, or caching infrastructure beyond existing React Query usage.
- [ ] **Backend:** Category-scoped listing does not load full `categories` table per request for slug resolution (WP-A or equivalent measured win).
- [ ] **Backend:** List endpoints use a **documented** slim product select where `description` (and other unused heavy fields) are omitted from list JSON (WP-B).
- [ ] **Backend:** `filter=offers` path uses **database pagination** with correct `total`, not in-memory `slice` of a 200-row fetch (WP-C).
- [ ] **Backend:** `by-ids` has an explicit **maximum** length and documented behavior (WP-D).
- [ ] **Contracts:** `marketplace-*.contract.ts` (and frontend types) updated to match allowlists; no undocumented `*` on public product list paths.
- [ ] **Frontend:** Single React Query key for categories across Header + pages (WP-E), verified by network tab (one categories request per navigation where applicable).
- [ ] **Docs:** Short `docs/batch-m2.8-implementation-report.md` after implementation (separate batch step) with before/after notes and manual QA (home, `/products`, `/store/:slug`, wishlist, offers).

---

## 6. Before implementation checklist

1. **Baseline:** Capture current response sizes (DevTools or logging) for `GET /marketplace/home`, `GET /marketplace/products?limit=24`, and PDP for one heavy-description product.
2. **Inventory callers:** Confirm no external clients rely on `description` on list endpoints (internal grep + any published API notes).
3. **Decide N** for `by-ids` max and wishlist UX (truncate vs error) — product call, not engineering-only.
4. **Branch / PR** scoped to M2.8 only; reject drive-by refactors in unrelated modules.

---

## 7. References (in-repo)

- `backend/src/modules/marketplace/marketplace.service.ts` — core queries & known tech debt (`filter=offers`).
- `backend/src/modules/marketplace/marketplace-product-detail.contract.ts` — `MARKETPLACE_PUBLIC_PRODUCT_SELECT`.
- `backend/src/modules/marketplace/marketplace-list.contract.ts` — listing semantics.
- `src/components/Header.tsx`, `src/pages/Products.tsx`, `src/pages/Category.tsx` — category query keys.
- `src/pages/Storefront.tsx` — storefront product limit.
