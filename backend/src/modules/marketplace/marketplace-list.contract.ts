/**
 * # `GET /api/marketplace/products` — canonical paginated marketplace listing (M1.4+)
 *
 * Cross-merchant browsing uses **only** this endpoint for paginated product grids in the storefront.
 * (`/category/:slug` is a **landing** surface; full grids use `/products?category=…`.)
 *
 * ## Sort (`sort` query param)
 * - **`newest`** — `products.created_at` **descending** (default when omitted).
 * - **`price-asc`** — `products.price` **ascending**.
 * - **`price-desc`** — `products.price` **descending**.
 *
 * **With or without `search`:** sort is user-controlled; default is **`newest`** when `sort` is omitted.
 * No relevance ranking — same sort semantics for browse and search.
 *
 * ## Search (`search` query param) — M2.1
 *
 * **Scope:** `products.name` only — case-insensitive substring via **`ILIKE`** (Postgres). No FTS, fuzzy match,
 * merchant/category search, or relevance scoring.
 *
 * **Normalization (server-side, authoritative):**
 * 1. Trim leading/trailing whitespace.
 * 2. Collapse consecutive internal whitespace to a single ASCII space.
 * 3. Other characters unchanged (no lowercasing step; `ILIKE` handles case-insensitivity).
 *
 * **When the name filter is applied:** normalized length **≥ `MARKETPLACE_SEARCH_MIN_LENGTH` (2)**.
 *
 * **Silent no-filter (HTTP 200, same response shape):** missing `search`, empty after normalization,
 * whitespace-only, or normalized length **&lt; 2** — listing omits the name predicate (behaves as browse for
 * search, still subject to `category_slug`, `merchant_id`, pagination, `sort`, etc.).
 *
 * Public URL may still contain e.g. `?search=` or `?search=a`; behavior matches no name filter.
 *
 * ## Out of scope for storefront UI
 * Query params `merchant_id`, `min_price`, `max_price`, and `filter` (e.g. `offers`) may exist for backward
 * compatibility or admin tools; the **public `/products` page** does not surface those controls.
 * Dedicated offers browsing remains **`GET /marketplace/offers`** / the `/offers` route.
 *
 * ## Offers filter discipline (M2.8)
 * When `filter=offers` is present, the API applies DB-level predicates (`discount_price IS NOT NULL` and
 * `discount_price < price`) with regular `count + range` pagination. No in-memory full-list slicing.
 *
 * ## Storefront `/products` UX — M2.4 (no API changes)
 *
 * - **Context line** under the heading reflects **effective** search (`getEffectiveMarketplaceSearchTerm`) and
 *   category only — combined when both apply.
 * - **Weak query** (`search` present in URL but normalized length **&lt; 2**): browse semantics; on-page guidance
 *   «اكتب حرفين على الأقل للبحث»; no Header blocking.
 * - **Empty states** branch: weak / search-only / category-only / combined; CTAs: مسح البحث، مسح القسم، كل المنتجات
 *   (URL updates only; search and category do not auto-clear each other).
 * - **Results count** line when `items.length > 0` and query is not weak.
 *
 * @see marketplace-ranking.contract.ts — defaults and user sorts vs other surfaces.
 */
