# Batch M2.0 — Discovery & Growth Audit Report

**Status:** Engineering audit (code-backed)  
**Scope:** Public marketplace surfaces `/`, `/products`, `/product/:slug`, `/store/:slug`, `/stores` only (plus cross-links touching them).  
**Out of scope:** M2.1+ implementation; admin/merchant consoles; finance; native apps.

---

## 1. Executive summary

The public marketplace is **wired to canonical `/marketplace/*` APIs** and no longer depends on legacy catalog routes for these surfaces. Discovery works end-to-end, but **signals are thin**: search is a single-column substring match, listing sorts are basic (newest/price), and **home bucket labels do not match underlying DB flags** in all cases (see §3.1). **Conversion paths** from home to `/stores` are weak (featured merchants strip has no “all stores” CTA). **Performance hotspots** include home (`getHome` aggregates multiple queries) and the documented in-memory **`filter=offers`** path in `listProducts` (not used by `/products` UI today).

---

## 2. Surface-by-surface audit

### 2.1 `/` — Home (`Index.tsx`)

| Aspect | Current behavior |
|--------|------------------|
| **Data** | `GET /marketplace/home` → `contractVersion`, categories, featured merchants, featured/new/offer product buckets. |
| **Sections** | Hero → (optional) featured merchants grid → categories grid → combined strip: featured products (“مختارات فاخرة”), new (“وصل حديثاً”), offers (“عروض مختارة”) → value props → editorial CTA. |
| **Navigation out** | Primary: `/products`, `/offers`, `/category/:slug`, `/store/:slug` from merchant cards. Footer/header: `/stores`, etc. |

**Where users may get lost**

- **Featured merchants** block has **no link to `/stores`**; user sees at most 8 merchants with no “browse all.”
- **“مختارات فاخرة”** is backed by `is_best_seller`, not a generic “featured” flag — label vs signal mismatch risks trust if merchants expect “editorial featured.”
- If **all** product buckets are empty and **no** categories/merchants, the mid-page can feel empty (loading skeletons mask briefly; empty state rules are minimal).

**Duplication**

- Categories fetched on home are the same catalog as `getMarketplaceCategories` used on `/products` and header — separate React Query keys (`marketplace-home` vs `marketplace-categories` / `marketplace-categories-header`), so **duplicate network work** on typical sessions.

**Sorting / signals**

- Bucket ordering on server: merchants `is_featured` then `created_at`; products per bucket use `created_at` desc (see `marketplace.service.ts`). No personalization.

**Priority gaps**

| ID | Gap | Priority |
|----|-----|----------|
| H1 | Home → `/stores` discovery path underdeveloped | P1 |
| H2 | Label/signal alignment (“luxury picks” vs `is_best_seller`) | P1 |
| H3 | Duplicate category fetches across surfaces | P2 |

---

### 2.2 `/products` — Global listing (`Products.tsx`)

| Aspect | Current behavior |
|--------|------------------|
| **Data** | `GET /marketplace/products` with `offset`, `limit` (24), `category_slug`, `search`, `sort`. |
| **URL** | `category`, `search`, `page`, `sort` (`newest` default; omitted in URL when `newest`). Legacy keys `filter`, `merchant_id`, `min_price`, `max_price` **stripped** on load. |
| **UI** | Category chips (incl. “الكل”), sort select (newest / price asc / price desc), pagination. |

**Where users may get lost**

- **Search** only matches **product name** substring; no description/merchant — users may not understand why queries fail.
- **Empty search submit** in header does nothing — no explicit “minimum length” UX on listing (backend accepts empty string as no filter).
- **Title** uses “المجموعة” for unfiltered browse — brand-consistent but abstract; search term visibility is in H1 only.

**Duplication**

- Category list loaded again (`marketplace-categories`) even if user arrived from home with same data in cache under a different key.

**Sorting / signals**

- Client: `parseMarketplaceListSort` — invalid/missing → `newest`.  
- Server: `sort` → `created_at` or `price` (see Search/Sort map doc).

**Priority gaps**

| ID | Gap | Priority |
|----|-----|----------|
| P1 | Search semantics undocumented in UI; weak / no-results UX (M2.4) | P1 |
| P2 | No “featured” or relevance sort on global listing | P2 |
| P3 | Query/cache duplication with home/header | P2 |

---

### 2.3 `/product/:slug` — Product detail (`ProductDetail.tsx`)

| Aspect | Current behavior |
|--------|------------------|
| **Data** | `GET /marketplace/products/slug/:slug` — deterministic multi-merchant slug resolution (documented in service). |
| **Secondary** | `GET /marketplace/suggested?category_id&exclude_id` — same-category suggestions, non-blocking on failure. |

**Where users may get lost**

- Error state offers **back to `/products`** only — no store link unless present in product card area (merchant context exists on product).
- Suggested block is **newest-in-category**, not “similar” or purchase Complementary — fine for M1, limited for discovery.

**Priority gaps**

| ID | Gap | Priority |
|----|-----|----------|
| D1 | Conversion hierarchy (price, CTA, trust) can be tightened (M2.7) | P1 |
| D2 | Suggested products: no diversity signal | P2 |

---

### 2.4 `/store/:slug` — Storefront (`Storefront.tsx`)

| Aspect | Current behavior |
|--------|------------------|
| **Data** | `GET /marketplace/merchants/:slug` then `GET /marketplace/products?merchant_id=&limit=48&offset=0`. |
| **UI** | Banner, logo, name, description, grid up to 48 products; empty state if none. |

**Where users may get lost**

- **No sort** on storefront grid — order follows API default (`newest`). Large catalogs are **capped at 48** with no pagination — power buyers hit a ceiling silently.
- **No** link to global `/products` filtered by merchant in UI (API supports `merchant_id`; public page does not expose it).

**Priority gaps**

| ID | Gap | Priority |
|----|-----|----------|
| S1 | 48-product cap + no pagination = discovery ceiling | P1 |
| S2 | No in-store sort/filter (M2.6) | P1 |

---

### 2.5 `/stores` — Merchant discovery (`Stores.tsx`)

| Aspect | Current behavior |
|--------|------------------|
| **Data** | `GET /marketplace/merchants` with `offset`, `limit` (24), `sort` (`featured` \| `newest` \| `name`). |
| **UI** | Cards (logo, name, “مميز” badge, “زيارة المتجر”); pagination; empty state with link home. |

**Where users may get lost**

- **No merchant search** (by plan for later).  
- Card body has **no description** — only name + logo; discovery depth is visual + name only.
- **Count/total** not shown (“صفحة X من Y” only when multiple pages) — first-time users don’t see marketplace size.

**Priority gaps**

| ID | Gap | Priority |
|----|-----|----------|
| M1 | Thin card information vs M2.5 goals | P1 |
| M2 | No total merchant count in header | P2 |

---

## 3. Cross-cutting findings

### 3.1 Featured vs best-seller vs new vs offers (label clarity)

| UI label (home) | Backend signal |
|-----------------|----------------|
| “مختارات فاخرة” | `is_best_seller = true` |
| “وصل حديثاً” | `is_new = true` |
| “عروض مختارة” | `discount_price` not null and `< price` |

**Risk:** Users may interpret “مختارات فاخرة” as editorial/curation, not “best seller.” Aligning copy or signals is a **ranking/copy** task (M2.2 / M2.3).

### 3.2 Related route: `/category/:slug`

Not in the five-path list but **feeds** `/products?category=` — landing-only; avoids duplicate grid logic. **Gap:** category landing uses category list client-side; invalid slug handled gracefully.

---

## 4. Performance-sensitive endpoints (read models)

| Endpoint | Why sensitive |
|----------|----------------|
| `GET /marketplace/home` | Multiple parallel product queries + merchants + categories. |
| `GET /marketplace/products` | Broad scans with `ILIKE` when `search` set; count + range. |
| `GET /marketplace/products` with `filter=offers` | **In-memory** pagination after loading capped list — documented as not scalable (backend comment). |
| `GET /marketplace/merchants` | Paginated; generally lighter than product joins. |
| `GET /marketplace/products/slug/:slug` | Can return multiple rows internally for collision resolution (then deterministic pick). |

---

## 5. Discovery / conversion / performance matrix

| Area | Discovery gaps | Conversion gaps | Performance notes |
|------|----------------|-----------------|-----------------|
| **Home** | Weak path to `/stores`; bucket copy vs signals | CTAs mostly to `/products` / `/offers` | Heavy home payload |
| **Products** | Search narrow; no relevance | Empty states basic | `ILIKE` search |
| **Product** | Suggested = recency in category | CTA/trust (M2.7) | +1 suggested query |
| **Store** | 48 cap, no sort | Store → PDP path OK | Second request per store |
| **Stores** | Thin cards; no search | Clear CTA to store | Pagination |

---

## 6. Definition of Done (M2.0)

- [x] All five public routes audited with concrete code references and gap lists.  
- [x] Duplication and confusion points (labels/sorts) identified with priority.  
- [x] Performance-sensitive endpoints called out for M2.8.  
- [x] Companion docs: Search/Sort behavior map, Growth opportunity map.  

**Next batch:** M2.1 — Search Contract Stabilization (formalize semantics already partially implemented).
