# Batch M2.0 — Search & Sort Current Behavior Map

Binding reference for **current** behavior before M2.1+ changes. Source: `backend/src/modules/marketplace/marketplace.service.ts`, `marketplace.controller.ts`, frontend `*.types.ts` and pages.

---

## 1. Global product listing — `GET /marketplace/products`

Used by **`/products`** (`Products.tsx` → `apiClient.getMarketplaceProducts`).

### 1.1 Query parameters (relevant to public UI)

| Param | Public `/products` | Backend handling |
|-------|-------------------|------------------|
| `offset` | Derived from `page` (24 per page) | `Math.max(0, offset)` |
| `limit` | Fixed `24` | Clamped to `1…100` |
| `category_slug` | From `?category=` | Resolves slug → `category_id`; invalid slug → no extra filter (empty result set possible) |
| `search` | From `?search=` | See §1.2 |
| `sort` | From `?sort=` | See §1.3 |
| `merchant_id` | **Not** set by `/products` page | Storefront uses it for `/store/:slug` grid |
| `filter`, `min_price`, `max_price` | **Stripped** from URL on load (`Products.tsx`) | Still accepted by API for other clients |

### 1.2 Search semantics (today)

- **Column:** `products.name` only.  
- **Operator:** `ILIKE '%' || search || '%'` (substring, case-insensitive per Postgres default for ILIKE).  
- **Empty / whitespace-only:** Passed through; empty string typically adds **no** `ilike` filter (falsy check). **No** minimum length enforced server-side.  
- **No** full-text, ranking, fuzzy match, or search on description/merchant name.

### 1.3 Sort semantics (today)

| `sort` value | Default if omitted | Order |
|--------------|-------------------|--------|
| `newest` | **Yes** (client omits param when newest) | `created_at` DESC |
| `price-asc` | — | `price` ASC |
| `price-desc` | — | `price` DESC |

Invalid values on API: controller passes through; service uses `params.sort ?? "newest"` — **unknown strings fall back to newest**.

**Client:** `parseMarketplaceListSort` in `src/lib/marketplace-list.types.ts` — only accepts `newest` \| `price-asc` \| `price-desc`; anything else → `newest`.

### 1.4 Header search → listing

`Header.tsx`: on submit, if `searchQuery.trim()`, `navigate(/products?search=...)`. **Whitespace-only** does not navigate.

---

## 2. Home — `GET /marketplace/home`

**Not** driven by user sort. Per-bucket queries:

| Bucket | Filter | Order | Limit |
|--------|--------|-------|-------|
| `featuredProducts` | `is_active`, `is_best_seller`, active merchant | `created_at` DESC | 8 |
| `newProducts` | `is_active`, `is_new`, active merchant | `created_at` DESC | 8 |
| `offerProducts` | discount candidates then **client-side** filter `discount_price < price` | fetch `created_at` DESC then filter | ≤8 |
| `featuredMerchants` | `status = active` | `is_featured` DESC, `created_at` DESC | 8 |

**Note:** `categories` returned in full list (same as categories endpoint).

---

## 3. Storefront grid — `GET /marketplace/products?merchant_id=`

**`/store/:slug`** passes `merchant_id`, `limit=48`, `offset=0`, **no** `sort` param.

- **Effective sort:** `newest` (default) → `created_at` DESC.  
- **No** pagination in UI — second page of merchant catalog **not** accessible.

---

## 4. Merchant discovery — `GET /marketplace/merchants`

**`/stores`** uses `parseStoresSort` (`marketplace-stores.types.ts`).

| `sort` | URL default | Backend |
|--------|-------------|---------|
| `featured` | Omitted in URL when selected | `is_featured` DESC, then `created_at` DESC |
| `newest` | `?sort=newest` | `created_at` DESC |
| `name` | `?sort=name` | `display_name` ASC |

Invalid → `featured`.

**No** `search` / `q` parameter (M1.5).

---

## 5. Product suggestions — `GET /marketplace/suggested`

**`/product/:slug`**: `category_id` + `exclude_id`; order `created_at` DESC, limit 8. Not user-sortable.

---

## 6. Ambiguities to resolve in M2.1 / M2.2

1. **API vs UI** on invalid `sort` — both default to newest; good, but should be **documented** as the contract.  
2. **Empty search** — behavior differs between header (no navigation) and API (no filter if empty).  
3. **Home “featured” copy** vs **`is_best_seller`** — sorting/label issue, not search.  
4. **Storefront** implicit `newest` only — user-facing sort labels absent.

---

## 7. Quick reference — frontend parsers

| Surface | Parser | File |
|---------|--------|------|
| `/products` sort | `parseMarketplaceListSort` | `src/lib/marketplace-list.types.ts` |
| `/stores` sort | `parseStoresSort` | `src/lib/marketplace-stores.types.ts` |

Backend contracts: `marketplace-list.contract.ts`, `marketplace-stores.contract.ts`, `marketplace-home.contract.ts`.
