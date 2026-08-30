# Batch M2.4 — Search Results UX & Empty States (`/products`)  
## Pre-implementation plan only (no code in this document)

**Status:** For review before coding.  
**Scope boundary:** **`/products`** listing UX when `search` (and related query params) are present or weak — **headings**, **context**, **empty states**, and **search × category × sort** interaction. **No** FTS, fuzzy matching, relevance ranking, new API search fields, or work on home/storefront/PDP beyond inbound links.

---

## 1. Binding constraints (non-negotiable)

| In scope | Out of scope |
|----------|----------------|
| Copy, layout, and **clarity** of the listing page for search/browse | M2.1 normalization **rules** (already shipped); only **UX explanation** of min length if needed |
| **Empty / weak-query** messaging and recovery CTAs | Search-engine expansion, typo correction, multi-column search |
| **Subhead / context line** reflecting active `search`, `category`, `sort` | Backend sort semantics change (M2.2 matrix is reference only) |
| Optional **active filter chips** or **“clear”** affordances (URL-only) | New routes; changing `GET /marketplace/products` contract shape |

**URL remains** `/products?search=...&category=&sort=&page=` — no `/search` route.

---

## 2. Audit — current behavior (`Products.tsx`, M2.1 helpers)

### 2.1 Data & URL

| Param | Role |
|-------|------|
| `search` | Passed raw to API; server applies trim/collapse + **min length 2** (`marketplace-search.normalize.ts`). |
| `category` | Maps to `category_slug` on API. |
| `sort` | `newest` (default, often omitted in URL), `price-asc`, `price-desc`. |
| `page` | Pagination offset. |

`useEffect` strips legacy keys (`filter`, `merchant_id`, `min_price`, `max_price`).

### 2.2 Title & hero copy

| State | H1 today | Gap |
|-------|----------|-----|
| Effective search (≥2 chars after normalize) | `نتائج البحث: {term}` | Subtitle **static** — does not state category/sort; user may not see full context. |
| Browse (no effective search) | `المجموعة` or category name | OK; subtitle still generic. |
| **Weak URL** (`?search=a` or whitespace) | Treated as **browse** for title (`effectiveSearchTerm` null) | **Mismatch risk:** URL still shows `search=` but page reads like generic browse — user may not understand why results are broad. |

### 2.3 Empty state (`ProductsEmptyState`)

| Branch order | Behavior | Gap |
|--------------|----------|-----|
| 1. `effectiveSearchTerm` | “لا توجد نتائج للبحث عن «…»” | If **`category` is also set**, message **does not mention** the category filter — user cannot tell if emptiness is search vs category vs both. |
| 2. `categorySlug` only | Category-specific empty | OK. |
| 3. Default | Global empty | OK. |

Secondary line “جرّب كلمات مختلفة أو أزل عوامل التصفية” is vague — no **concrete** actions (clear search, clear category, open `/products`).

### 2.4 Controls interaction

- **Category chips:** “الكل” clears `category` and `page` only — **`search` is preserved** (intentional: search within all categories).
- **Category selection:** sets `category`, clears `page` — **`search` preserved** (search within category).
- **Sort:** updates `sort`, clears `page` — **`search` and `category` preserved** (M2.1: sort independent of search).

**Gap:** No inline summary that “you are viewing: search X + category Y + sort Z”.

### 2.5 Header search (`Header.tsx`)

- Submit navigates to `/products?search=…` when trimmed non-empty.
- **No** client-side min-length block — user can land on `?search=a` (weak query UX on listing).

### 2.6 QA note (M2.3 follow-up)

**`/offers` discoverability:** After M2.3, hero no longer links to offers; discovery is via home bucket, footer, and direct URL. **M2.4 does not change offers** — QA should confirm offers remain findable; optional **single line** in listing subtitle linking to `/offers` is **out of scope** unless pulled into M2.4 explicitly.

---

## 3. Target UX / contract plan (exact — implementation phase)

### 3.1 Context strip (below H1)

Replace or supplement the **single static** subtitle with **one** of (pick in implementation; recommend **A + B**):

- **A)** **Dynamic one-liner** when any of: effective search, category, or non-default sort — e.g. “البحث: {term} · القسم: {name} · الترتيب: {label}” (Arabic labels matching `Select` options).
- **B)** **Weak-query notice** when `search` is in URL but `effectiveSearchTerm` is null — e.g. “لم يُطبَّق البحث: يلزم حرفان على الأقل في اسم المنتج.” (Copy must match M2.1; no new rules.)

**Do not** change API; weak-query is **display-only** explanation.

### 3.2 Empty states — hierarchy

Refine `ProductsEmptyState` (or split into small helpers) so that:

1. **Search + category + no results:** Message acknowledges **both** constraints; offer **buttons/links**: “مسح البحث”, “مسح القسم”, “عرض كل المنتجات” (URL updates via `setSearchParams`).
2. **Search only, no results:** Keep “no results for «term»”; add **clear search** → `/products` or delete `search` param only.
3. **Category only, no results:** Keep current; optional link to clear category.
4. **Global empty (no effective search, no category):** Keep; optional link to `/` or categories.

**No** fuzzy suggestions; **no** “did you mean”.

### 3.3 Results count (optional but recommended)

When `!isLoading` and `products.length > 0`, show a compact line:  
**“عرض n من m منتجاً”** (or pagination-aware “صفحة k من j”) using existing `total` from API — **read-only**, no new endpoint.

### 3.4 Sort / search clarity

- Ensure **Select** label remains visible during search (already true).
- Optional: microcopy under sort: “الترتيب ينطبق على النتائج الحالية (بحث/قسم).” — **one line**, if product approves.

### 3.5 Header alignment (optional, same batch)

- If user types **1 character** and submits, either **same weak-query UX** on `/products** only** (preferred for M2.4 scope) **or** prevent navigate in Header when normalized length &lt; 2 — **pick one**; must stay consistent with M2.1 silent no-filter behavior.

### 3.6 Artifacts

- Short **`marketplace-list-ux.contract.ts`** or extend **`marketplace-list.contract.ts`** with a **“Storefront `/products` UX”** subsection: weak query, empty-state branches, CTA list — **documentation only**, mirroring code.

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Overwhelming users with filter text | Keep one line; use chips or collapsible on mobile if needed |
| Duplicating M2.1 docs | Reference M2.1 for **rules**; M2.4 only **explains** them in UI |
| Scope creep into M2.5/M2.8 | No `/stores`, no performance tuning |

---

## 5. Definition of Done (implementation phase)

1. **Context** for search/category/sort is visible without reading the URL bar (subtitle and/or weak-query notice).  
2. **Empty states** cover combined **search + category** and offer **clear** recovery paths.  
3. **No** API contract change for response shape; **no** fuzzy/FTS/relevance.  
4. **`/products`** remains the only search results surface.  
5. **Implementation report** + manual matrix: weak query, effective search, search+category+empty, sort+search, category only, browse.

---

## 6. Explicitly deferred

- **M2.5** — `/stores` discovery.  
- **M2.8** — query performance.  
- **Offers discoverability** — QA checklist item unless explicitly added to M2.4 scope.

---

## 7. Approval gate

Proceed when:

- Product approves **wording** for weak-query and combined empty states.  
- Decision on **Header** submit when query length &lt; 2 (block vs explain on page only).  
- Decision on **results count** line (yes/no).
