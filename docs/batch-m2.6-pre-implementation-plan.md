# Batch M2.6 — Storefront Conversion (`/store/:slug`)  
## Pre-implementation plan only (no code in this document)

**Status:** For review before coding.  
**Scope boundary:** **`Storefront.tsx`** (and **storefront-specific** copy/components colocated there) — **hero clarity**, **CTAs**, **product grid presentation**, **empty products**, **simple trust/conversion cues**. **No** ratings/reviews, **no** homepage or **PDP** redesign, **no** merchant search, **no** new marketplace APIs unless explicitly approved.

---

## 1. Binding constraints (non-negotiable)

| In scope | Out of scope |
|----------|----------------|
| UX/copy/layout for **`/store/:slug`** only | `Index.tsx`, `ProductDetail.tsx` layout overhauls |
| **Trust** via copy + existing fields (`description`, branding assets) | Review stars, trust scores, external widgets |
| **Grid** density, headings, loading skeleton style | New product recommendation engine |
| **Empty** storefront product list recovery CTAs | Admin/merchant console |

**Default:** **No API / DTO changes** — `GET /marketplace/merchants/:slug` allowlist and `GET /marketplace/products?merchant_id=` behavior stay as today unless a **separate** decision approves expanding the storefront contract.

---

## 2. Audit — current behavior (`Storefront.tsx`, contracts)

### 2.1 Data flow

1. `GET /marketplace/merchants/:slug` → `MarketplacePublicMerchant` (allowlist in `marketplace-storefront.contract.ts`).
2. `GET /marketplace/products?merchant_id=&limit=48&offset=0` — **no** user sort on storefront; API default **newest** (`marketplace-ranking.contract.ts`).
3. **Hard cap:** `STOREFRONT_PRODUCT_LIMIT = 48` — **not** surfaced in UI; users may assume full catalog.

### 2.2 Loading

- **Merchant loading:** full-page skeleton (title bar + 8 card placeholders).
- **Products loading:** 4 skeleton cards in grid (after hero visible).
- **Gap:** Two distinct skeleton patterns; no single “page-level” rule (unlike M2.5) — optional harmonization **within** `Storefront.tsx` only.

### 2.3 Hero

- Optional **banner** + gradient overlay.
- **Logo** / initials, **display_name**, optional **description**.
- **No** explicit subheading (“متجر نشط على المنصة”), **no** primary/secondary CTA row (conversion relies on scrolling to grid).
- **Gap:** Brand story is text-only; **trust** is implicit (user landed from marketplace).

### 2.4 Product grid

- **ProductCard** reuse — consistent with rest of site.
- **No** section title (“منتجات هذا المتجر”), **no** count (“عرض n منتجاً”).
- Grid `2/3/4` cols — OK; optional spacing/heading tweaks only.

### 2.5 Empty products

- Single dashed **paragraph** only — **no** links to `/products`, `/stores`, or home.
- **Gap:** Dead-end for empty inventory.

### 2.6 Error state (invalid/inactive merchant)

- Message + **العودة للرئيسية** only.
- **Gap:** Optional **المتاجر** or **`/products`** for recovery — product decision (still storefront-adjacent).

### 2.7 Cross-route note (`/products`)

- Public **`Products.tsx`** **strips** `merchant_id` from the URL as a **legacy** key — storefront **cannot** deep-link to “all products from this merchant” on `/products` **without** a coordinated change to listing behavior. **Not** assumed in M2.6 unless explicitly added to scope.

---

## 3. Target UX / contract plan (exact — implementation phase)

### 3.1 Hero — clarity & trust (copy + layout only)

- Add a **short subline** under the name, e.g. that this is an **active store on the marketplace** (aligned with API: only active merchants resolve).
- Keep **description** prominent when present; when **absent**, optional one-line **placeholder** (“لم يُضف وصف بعد”) — **only** if product approves (avoid looking broken vs intentional minimalism).
- **Optional:** single **secondary** text link row: **تصفّح المنتجات** → `/products`, **المتاجر** → `/stores` — **navigation**, not “merchant search”.

### 3.2 CTAs (conversion)

| CTA | Target | Notes |
|-----|--------|--------|
| Primary mental model | Scroll / grid | Already implicit; optional **anchor** or “انتقل للأسفل” only if usability testing asks |
| Secondary (recommended) | `/products` | Broader catalog escape hatch |
| Secondary (recommended) | `/stores` | Peer discovery |
| **`merchant_id` on `/products`** | Filtered global list | **Requires** listing URL policy change — **optional** batch slice; default **out** |

### 3.3 Product grid

- Add a **section heading** + optional **count** when `!productsLoading && products.length > 0` (e.g. «منتجات المتجر» + «عرض n من …» capped at 48 or total from API if returned — `total` exists on listing response).
- Harmonize **loading** skeleton with **one** grid-level pattern **or** keep merchant vs product phased loading — **pick one** in implementation (no backend change).
- **Disclose cap** in copy if `total > 48` or when API returns `total` &gt; displayed — **if** `getMarketplaceProducts` returns `total` for this query (verify in implementation).

### 3.4 Empty products

- Replace single line with a **panel**: explanation + **تصفّح المنتجات** (`/products`) + **المتاجر** (`/stores`) — **no** forced home redirect as sole path (align with M2.5 spirit).
- Optional line that stock may update later — **product tone** approval.

### 3.5 Trust / conversion cues (simple)

- One **trust strip** under hero or above grid: e.g. “متجر موثّق على المنصة” / “دفع عند الاستلام متاح للطلبات عبر الموقع” — **only** if statements are **always true** for all storefronts; otherwise **omit** or use **generic** marketplace positioning from `storeConfig` — **no** fabricated claims.

### 3.6 Contract documentation

- Add **`marketplace-storefront.contract.ts`** (or companion) **“Storefront `/store/:slug` UX — M2.6”** subsection: hero elements, grid heading, empty CTAs, 48-cap disclosure rule, **no** reviews.

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Claiming **trust** that is not universally true | Legal/product review of any fixed phrase |
| **merchant_id** scope creep | Keep default plan to `/products` / `/stores` only |
| **48-cap** confusion | Short copy + optional `total` from API |

---

## 5. Definition of Done (implementation phase)

1. **Hero** reads clearly (name + context + description handling per §3.1).  
2. **Grid** has heading + optional count; loading/empty states match approved pattern.  
3. **Empty** storefront has **recovery CTAs** (minimum `/products`; **`/stores`** recommended).  
4. **No** reviews UI; **no** homepage/PDP file edits except shared imports if unavoidable — call out in PR.  
5. **Implementation report** + manual matrix: with/without banner, empty grid, error state, mobile.

---

## 6. Explicitly deferred

- **M2.7** — PDP conversion.  
- **M2.8** — Performance caps / payload tightening.  
- **Merchant search** — future batch.

---

## 7. Approval gate

Proceed when:

- Product approves **trust** copy (or confirms **generic** marketplace line only).  
- Decision on **`merchant_id`** deep link to `/products` (in vs out).  
- Decision on **48-cap** disclosure style.
