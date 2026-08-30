# Batch M2.3 — Homepage Discovery Optimization  
## Pre-implementation plan only (no code in this document)

**Status:** For review before coding.  
**Scope boundary:** **`/` (`Index.tsx`) + home-adjacent navigation affordances** that improve discovery (section visibility, CTAs, flow into `/products`, `/stores`, `/category/...`, `/offers`, `/store/...`). **No** search relevance, **no** ranking/sort engine changes, **no** storefront/product-detail feature work.

---

## 1. Binding constraints (non-negotiable)

| In scope | Out of scope |
|----------|----------------|
| Section **usefulness**, **visibility rules**, **loading vs empty** behavior | M2.1 search semantics; M2.2 ranking contract edits (reference only) |
| **CTA clarity** and **consistent verbs** where helpful | “Ranking engine redesign” (new sorts, new home queries) |
| **Navigation flow** from home to marketplace surfaces | Storefront grid, PDP, `/products` listing implementation beyond links from home |
| **Bucket presence/absence** UX (avoid weak or dead sections) | Unrelated admin, payments, SEO |

Home **API** (`GET /marketplace/home`) and **bucket membership logic** remain **unchanged** unless this plan explicitly lists an API tweak — **default for M2.3 is UI/UX only.**

---

## 2. Audit — current homepage (`src/pages/Index.tsx` + `MarketplaceService.getHome`)

### 2.1 Section order (top → bottom)

1. **Hero** — brand, headline, subcopy; primary CTA → `/products`, secondary → `/offers`.
2. **Contract version warning** — if `contractVersion !== 1`.
3. **Merchants strip** — rendered **only if** `featuredMerchants.length > 0` (API: up to 8 active merchants, `is_featured` then `created_at`). Cards link to `/store/:slug`. **No** “all stores” / `/stores` link in-section.
4. **Categories** — **only if** `topCategories.length > 0` (first **12** categories from full taxonomy). Links → `/category/:slug` (landing), not directly `/products?category=`.
5. **Combined product buckets block** — wrapper visible if **`showFeaturedProducts \|\| showNewArrivals \|\| showOffers`** where each is `homeLoading \|\| bucket.length > 0`. Inside: three **independent** sub-blocks (best seller, new, offers) with the same pattern.
6. **Value props** (4 static cards) — always shown; marketing copy (“منتجات مختارة بعناية”, etc.).
7. **Editorial** — image + “تسوّق الآن” → `/products`.

**Footer** (not Index but part of journey): includes `/products`, `/stores`, `/offers`, etc.

### 2.2 Visibility / loading behavior (gaps)

| Issue | Detail |
|-------|--------|
| **Loading vs empty** | While `homeLoading`, each of `showFeaturedProducts`, `showNewArrivals`, `showOffers` is **true**, so the **combined section** mounts and may show **three** skeleton grids even if only one bucket will eventually have data. |
| **All buckets empty** | If all three product arrays are empty **after** load, the **entire** combined section **disappears** — acceptable, but the page can feel **thin** if merchants + categories are also sparse. |
| **Merchants hidden when zero rows** | If API returns **no** merchants (unexpected) or empty list, **whole strip hidden** — user loses an on-page path to `/stores` from home. |
| **CTA inconsistency** | Best seller → “كل المنتجات”; new → “عرض الكل”; offers → “صفحة العروض” — different verbs; “عرض الكل” points to ` /products?sort=newest` which is **not** the same semantic as home `is_new` bucket. |
| **Discovery depth** | Hero has **no** direct link to **`/stores`** or **category browse**; relies on scroll + merchants/categories sections. |
| **Category path** | Tiles go to **category landing** first — extra step vs `/products?category=`; may be intentional (M1.4); M2.3 can clarify CTA on landing vs grid (out of scope for Index only if we do not touch `Category.tsx`). |

### 2.3 Copy / trust (non-technical)

- Value props claim **curation** (“نختار الموردين…”) — may or may not match ops reality; **optional** softening or alignment in M2.3 if product approves (still homepage-only).

---

## 3. Homepage optimization plan (exact — implementation phase)

### 3.1 Goals (measurable in UX review)

1. User can **name** where to go for: all products, all stores, offers, browse by category — without relying only on footer.
2. **No** section looks like a mistake when data is missing (no huge blank combined area with a single empty sub-block without context — within reason).
3. **CTAs** use a **consistent pattern** (e.g. primary action + optional secondary) per section, documented in a short **CTA map** in the implementation report.

### 3.2 Proposed visibility rules (finalize before coding)

| Section | Show when | Empty / loading behavior (target) |
|---------|-----------|-------------------------------------|
| Hero | Always | N/A |
| Merchants | `featuredMerchants.length > 0` **or** (optional product decision) **always** with compact “explore stores” CTA when list empty — **pick one** |
| Categories | `topCategories.length > 0` | If zero categories, hide; optional footer-only discovery |
| Product buckets | Per-bucket: show skeleton **only** for buckets that are loading **or** expected to have data; **or** single shared loading state for the combined section — **pick one pattern** to avoid triple skeleton flash |
| Value props | Always | Optional: shorten if page is long |
| Editorial | Always | CTA target may add secondary link e.g. `/stores` if approved |

*Recommendation:* **One** loading skeleton strategy for the three buckets (e.g. one row of placeholders until `homeData` resolves, then render only non-empty buckets) — reduces visual noise; document in PR.

### 3.3 Navigation & CTA plan (minimal diff)

| From | Target surface | Plan |
|------|----------------|------|
| Hero | `/products`, `/offers` | Keep; **optionally** add tertiary text link “المتاجر” → `/stores` **or** a second row of buttons — **product decision** |
| Merchants strip | `/store/:slug` | Keep; add **section action** link “كل المتاجر” → `/stores` (aligns with M2.0 gap) |
| Best seller bucket | `/products` | Clarify CTA copy vs “browse all” (e.g. “تصفّح كل المنتجات”) |
| New bucket | `/products?sort=newest` | Add **tooltip or subtitle note** that global “newest” ≠ home `is_new` bucket **or** change link to `/products` only — **pick one** to reduce confusion |
| Offers bucket | `/offers` | Keep |
| Categories | `/category/:slug` | Keep; optional subtitle “القائمة الكاملة في المجموعة” linking to `/products` + category chip |

**No** new routes. **No** change to `GET /marketplace/home` unless a follow-up batch explicitly requires it.

### 3.4 Bucket absence — “poor homepage” guardrail

If **after load** `featured`, `news`, and `offers` are **all** empty:

- Show a **single** compact strip (not three headings) with one message + links to `/products` and `/offers` — **or** rely on hero + categories only — **choose** in implementation to avoid a silent gap.

### 3.5 Files likely touched (indicative)

- `src/pages/Index.tsx` (primary)
- Possibly `src/components/Footer.tsx` only if home defers discovery to footer (prefer **not** unless necessary)

**Explicitly not in scope:** `Storefront.tsx`, `ProductDetail.tsx`, `Products.tsx` listing logic (except inbound links from home).

---

## 4. Risks

| Risk | Mitigation |
|------|------------|
| **CTA to `/products?sort=newest`** confuses users vs `is_new` | Prefer copy fix or link target adjustment per §3.3 |
| **Hero clutter** if too many buttons | Limit to 2 primary + 1 text link |
| **Loading refactor** introduces layout shift | Test slow 3G / throttled fetch |
| Scope creep into M2.4/M2.5 | Review checklist before merge |

---

## 5. Definition of Done (implementation phase)

1. **Visibility rules** implemented as approved in §3.2–3.4 (documented in PR).  
2. **CTA map** updated in `docs/batch-m2.3-implementation-report.md` (or equivalent).  
3. **Manual verification matrix**: hero paths, merchants strip, categories, each bucket empty/non-empty, full empty home, mobile.  
4. **No** search expansion, **no** backend ranking changes, **no** storefront/PDP edits — or call out explicit exceptions in the report.  
5. **Regression note:** anything removed or reordered for analytics/SEO if applicable.

---

## 6. Explicitly deferred

- **M2.4** — Search results page empty states / search UX on `/products`.  
- **M2.5** — `/stores` card and sort UX beyond what home links to.  
- **Category.tsx** deep optimization — only if explicitly pulled into M2.3 scope in a follow-up approval.

---

## 7. Approval gate

Proceed when:

- Product approves **merchants strip** behavior when list is empty (hide vs CTA-only).  
- Decision on **new bucket** link semantics (`sort=newest` vs browse).  
- Decision on **single vs triple** loading skeletons for product buckets.
