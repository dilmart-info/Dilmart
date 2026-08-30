# Batch M2.5 — Merchant Discovery (`/stores`)  
## Pre-implementation plan only (no code in this document)

**Status:** For review before coding.  
**Scope boundary:** **`/stores`** (`Stores.tsx`) — **discovery UX**, **card clarity**, **sort clarity**, **empty state**, **intro/context** for browsing merchants. **No** merchant search, **no** ratings/reviews, **no** storefront (`/store/:slug`) layout overhaul, **no** homepage changes.

---

## 1. Binding constraints (non-negotiable)

| In scope | Out of scope |
|----------|----------------|
| `GET /marketplace/merchants` **consumer** UX on `/stores` only | `search` / `q` on the API (remains **not** added in M2.5) |
| Copy, layout, optional **read-only** count/context lines | FTS, fuzzy search, relevance ranking |
| **Card** presentation using existing **card DTO** fields | **Reviews/ratings** UI or data |
| **Sort** labels + user-visible explanation of each mode | Changing sort **semantics** in `listMerchantsForDiscovery` (unless product explicitly approves a bugfix) |
| **Empty state** recovery paths | `/store/:slug` hero/grid redesign (M2.6) |

**Default:** **No API / DTO expansion** — if product later wants **description** or extra fields on cards, that becomes an explicit **contract bump** + migration note, not assumed in M2.5.

---

## 2. Audit — current behavior (`Stores.tsx`, `marketplace-stores.contract.ts`)

### 2.1 Data & URL

| Param | Behavior |
|-------|----------|
| `sort` | `featured` (default, often omitted in URL), `newest`, `name` — `parseStoresSort` |
| `page` | Pagination; `PAGE_SIZE` = 24 |
| API | `{ items, total, offset, limit }`; rows = **card DTO** only |

### 2.2 Page chrome

- **H1:** «المتاجر» + one **static** subtitle (discovers active merchants; visit store to browse).
- **Sort:** single `Select`, right-aligned; labels: مميز أولاً / الأحدث / الاسم (أ–ي).
- **No** dynamic line stating **current** sort or **total** merchant count (unlike M2.4 `/products`).

### 2.3 Cards (`MerchantDiscoveryCard`)

| Field | Use today | Gap |
|-------|-----------|-----|
| `logo_url` / initials | Hero image area | OK |
| `display_name` | Title | OK |
| `is_featured` | Badge «مميز» | Meaning (**merchant** featured) not spelled out for users who confuse with product “featured” |
| *(none)* | Subline «زيارة المتجر» | Generic; **no** differentiation beyond badge |

### 2.4 Non-empty list

- Grid + pagination «صفحة X من Y».
- **No** “عرض n من m متجراً” line.

### 2.5 Empty state

- Copy: no active stores; suggests come back or browse products from home.
- **Single** link: **الرئيسية** only.
- **Gap:** no **/products** CTA; no **sort** reset explanation (empty is data-empty, not filter-empty).

### 2.6 Loading

- Eight card-shaped skeletons — acceptable; optional alignment with **single** discover skeleton pattern **only** if it does not mix other batches’ scope (optional micro-tweak).

---

## 3. Target UX / contract plan (exact — implementation phase)

### 3.1 Intro & context (no API)

- **Subtitle** under H1: refine to state **what** the user is browsing (active merchants on the platform) and **what sort does** at a high level — **one** paragraph max.
- **Optional second line** (recommended): **dynamic** text reflecting **current `sort`** (mirror M2.4 pattern) using the same Arabic labels as the `Select`, e.g. «الترتيب الحالي: مميز أولاً».

### 3.2 Sort clarity

- Keep **three** options; ensure labels match **`marketplace-stores.contract.ts`** semantics:
  - **مميز أولاً** = `is_featured` desc, then `created_at` desc.
  - **الأحدث** = `created_at` desc.
  - **الاسم (أ–ي)** = `display_name` asc.
- Optional **microcopy** under the select (one line): e.g. «لا يؤثر على محتوى المتجر — ترتيب القائمة فقط.»

### 3.3 Results count (recommended)

- When `!isLoading && items.length > 0`: show **«عرض n من m متجراً»** (and page info if `totalPages > 1`), using existing `total` from API — **read-only**.

### 3.4 Merchant cards

- **Badge «مميز»:** optional clarification in **tooltip** or **abbreviated** subtitle for featured rows only — e.g. «متجر مميز» — **without** new data fields.
- **CTA line:** replace or supplement «زيارة المتجر» with clearer **action** language (e.g. «تصفّح المنتجات») while the whole card remains the link to `/store/:slug` — **copy-only**.

### 3.5 Empty state

- Keep **honest** message (no active merchants).
- **CTAs:** at minimum **الرئيسية** + **تصفّح المنتجات** → `/products` (align with recovery goals).
- Optional: short line that empty list is **not** caused by sort (sort does not filter merchants out).

### 3.6 Contract documentation

- Extend **`marketplace-stores.contract.ts`** (comment block) with a **“Storefront `/stores` UX — M2.5”** subsection: intro line, count line, empty CTAs, **no search** — mirroring M2.4 style.

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Request to add **merchant search** | Defer to a later batch with explicit API design |
| Request for **description** on cards | Requires DTO + API change — separate approval |
| Overlap with **M2.6** storefront | Touch only `Stores.tsx` (+ contract comments) unless agreed |

---

## 5. Definition of Done (implementation phase)

1. **`/stores`** has clearer **intro** and, if approved, **sort context** + **results count** when non-empty.  
2. **Cards** and **sort** labels do not contradict `marketplace-stores.contract.ts` or `marketplace-ranking.contract.ts`.  
3. **Empty state** includes **home** + **`/products`** (or equivalent) recovery.  
4. **No** search UI, **no** ratings, **no** storefront/home redesign.  
5. **Implementation report** + manual matrix: each sort mode, pagination, empty, mobile.

---

## 6. Explicitly deferred

- **M2.6** — Storefront conversion layer.  
- **M2.4 polish** — global empty CTA on `/products`, copy for «المجموعة» (optional follow-ups).  
- **Merchant search** — future batch.

---

## 7. Approval gate

Proceed when:

- Product approves **card copy** changes and optional **tooltip** for «مميز».  
- Decision on **results count** line (yes/no) and **dynamic sort line** (yes/no).  
- Confirmation **no** DTO expansion in M2.5.
