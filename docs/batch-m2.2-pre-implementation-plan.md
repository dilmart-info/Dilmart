# Batch M2.2 — Listing Ranking & Sort Layer  
## Pre-implementation plan only (no code in this document)

**Status:** For review before coding.  
**Scope boundary:** **Ranking defaults**, **sort semantics by surface**, and **label/signal honesty** for listing-related behavior. **No** search relevance, fuzzy matching, FTS, homepage layout redesign, storefront grid redesign, or PDP changes except **copy** that explains sort/ranking where unavoidable.

---

## 1. Binding constraints (non-negotiable)

| In scope | Out of scope |
|----------|----------------|
| Document + align **defaults** and **user-visible sorts** per public surface | Search-engine behavior beyond existing M2.1 contract |
| Clarify **featured vs best seller vs new vs offers** (signals + copy) | Fuzzy search, relevance ranking, typo correction |
| Single **team reference** for ordering rules (contracts + optional thin code comments) | New `/search` route, merchant search, category entity search |
| Minimal **label/copy** changes where labels contradict DB flags | Large homepage/storefront/product **layout** or **conversion** projects (those are M2.3+ / M2.6+ / M2.7) |

---

## 2. Audit — current behavior (code-backed)

### 2.1 `GET /marketplace/home` — buckets (`marketplace-home.contract.ts`, `MarketplaceService.getHome`)

| Response key | Selection signal | Order within bucket | Limit |
|--------------|------------------|----------------------|-------|
| `featuredMerchants` | `merchants.status = active` | `is_featured` DESC, `created_at` DESC | 8 |
| `featuredProducts` | `is_best_seller = true` (not `is_featured` on product) | `created_at` DESC | 8 |
| `newProducts` | `is_new = true` | `created_at` DESC | 8 |
| `offerProducts` | `discount_price` set, then **post-filter** `discount_price < price` | fetch `created_at` DESC then filter | ≤8 |
| `categories` | full taxonomy | `sort_order` | all |

**UI (`Index.tsx`):**

- Section title **«مختارات فاخرة»** + subtitle implies curation/luxury; **API uses `is_best_seller`** — **label/signal mismatch** (P1 for M2.2).
- **«وصل حديثاً»** aligns with `is_new` (flag), not “newest by date only” — subtitle can clarify.
- **«عروض مختارة»** aligns with true discount rule — OK if users understand “discount < original.”
- **Featured merchants** strip has no “all stores” CTA — **discovery** gap (defer to M2.3 unless copy-only fix is agreed).

### 2.2 `GET /marketplace/products` — global listing (`/products`)

| Control | Values | Default |
|---------|--------|---------|
| User `sort` | `newest`, `price-asc`, `price-desc` | `newest` (omitted in URL when newest) |
| Search | M2.1 normalized `name` `ILIKE` | — |
| Category | `category_slug` | none |

**Internal default:** `created_at` DESC for `newest`; price asc/desc for price sorts. **No** “featured” or “best seller” sort on this endpoint today.

### 2.3 `GET /marketplace/merchants` — `/stores`

| User `sort` | Server order |
|-------------|--------------|
| `featured` (default) | `is_featured` DESC, `created_at` DESC |
| `newest` | `created_at` DESC |
| `name` | `display_name` ASC |

### 2.4 Storefront `/store/:slug` — `GET /marketplace/products?merchant_id=…`

- **No** user sort in UI; **effective default** `newest` (`sort` omitted → `newest` in service).
- **Limit** 48, **no** pagination — **ceiling** is ranking-adjacent but fixing pagination is **out of M2.2** unless listed as explicit stretch (recommend **defer**).

### 2.5 `GET /marketplace/offers` — `/offers`

- **Fixed** list: `getOffersList()` — `created_at` DESC, capped list, filtered to true discounts. **No** user sort.

### 2.6 `GET /marketplace/suggested` — product detail

- Same-category, `created_at` DESC, limit 8 — **not** a “listing surface” in M2.2; only mention if copy references “recommended” incorrectly.

### 2.7 Schema note (products)

Migrations show **`is_featured`** on `products` exists in the schema; **home `featuredProducts` currently keys off `is_best_seller` only.** M2.2 must **decide** whether to align **naming**, **selection signal**, or **both** (product decision — see §3.2).

---

## 3. Target ranking / sort plan (exact)

### 3.1 Documentation artifact

Add **`marketplace-ranking.contract.ts`** (backend) — **single table**:

- **Surface** (route or API)
- **What the user can sort** (if anything)
- **Default order** (field + direction)
- **Selection signal** for curated buckets (home only)
- **Stable tie-breakers** (e.g. `created_at`, `id`)

Mirror a **short** pointer in `docs/` or frontmatter if the team prefers markdown — **source of truth** should live next to other marketplace contracts.

### 3.2 Featured vs best seller vs new vs offers — **IMPLEMENTED: Option A**

| Concept | Current signal | Decision |
|---------|----------------|----------|
| **Home hero product bucket** (`featuredProducts` key) | `is_best_seller` | **Option A — copy/label only:** UI and docs aligned to best seller; **no** query change. |
| **“New”** | `is_new` | Subtitle clarifies flag-based “new”. |
| **Offers** | `discount_price < price` | Unchanged behavior; documented in ranking contract. |
| **Merchants “مميز”** | `is_featured` on **merchant** | Glossary + home strip subtitle clarifies ordering. |

Options B/C (switch to `is_featured` or composite rules) were **not** implemented in M2.2.

### 3.3 Defaults by surface (binding once approved)

| Surface | User sort | Default order |
|---------|-----------|---------------|
| `/products` | newest / price | **newest** |
| `/products` + search | same | **newest** (already M2.1) |
| `/stores` | featured / newest / name | **featured** |
| `/store/:slug` grid | none (M2.2) | **newest** (documented; no UI change required) |
| `/offers` | none | **newest** (`created_at` desc) |
| Home buckets | n/a | Per bucket queries as today unless §3.2 changes selection |

### 3.4 Implementation surface (minimal)

- **Contracts + comments** — primary deliverable.
- **Copy** — `Index.tsx` section titles/subtitles only as needed for §3.2 (no new sections).
- **Backend** — change selection query **only** if Option B/C approved; otherwise **no** query change.
- **Explicitly not in M2.2:** new sort options on `/products` (e.g. “featured”) unless §3.2 introduces a **clear** product-level field and contract; if added, it must be **deterministic** (column sort), not relevance.

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Changing home bucket query (`is_featured` vs `is_best_seller`) changes merchandising | Require **product/ops sign-off**; feature-flag or release note. |
| Over-scoping into M2.3/M2.6 | Review checklist: only contracts + agreed copy + optional one query change. |
| Duplicate “featured” word for merchants and products | Glossary in `marketplace-ranking.contract.ts` (merchant featured vs product flags). |

---

## 5. Definition of Done (implementation phase)

1. **`marketplace-ranking.contract.ts`** (or equivalent) exists with the full surface × default × user-sort matrix and signal glossary.  
2. **Home labels** match the **chosen** option in §3.2 (copy and/or query — as approved).  
3. **No** new relevance/fuzzy/search behavior; **no** new routes.  
4. **Implementation report** with short regression notes (“what we call each bucket vs DB column”).  
5. **Manual verification matrix** (optional but recommended): home section titles vs API; `/products` / `/stores` default sorts; `/offers` order.

---

## 6. Explicitly deferred

- **M2.3** — Homepage section order, CTAs, empty bucket strategy.  
- **M2.6** — Storefront sort controls / pagination.  
- **M2.8** — Performance/index work for sort columns.

---

## 7. Approval gate

Proceed to implementation only after:

- Decision on **§3.2** (A / B / C).  
- Confirmation that **no** additional sorts or surfaces are added beyond this plan.
