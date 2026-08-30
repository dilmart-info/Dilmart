/**
 * # Public marketplace product surface — `GET /marketplace/products/slug/:slug` (M1.3+)
 *
 * ## Public HTTP 404 (single behavior)
 * The client must treat all of the following as **the same** “product not available” outcome
 * (no distinction is exposed on the public API):
 * - No row matches the slug under the visibility rules below.
 * - Product exists but **`is_active` is false** (inactive product).
 * - Product exists but its merchant is **not** `status = 'active'` (inactive / draft / suspended / archived).
 *
 * Implementation: the handler returns **404** when the resolver finds no qualifying row (`null`).
 *
 * ## Visibility rules (qualifying row)
 * - `products.is_active = true`
 * - `products.is_published = true`
 * - `products.visibility_status = 'public'`
 * - `merchants.status = 'active'` (enforced via `merchants!inner(...)` on the query)
 *
 * The `is_published`/`visibility_status` checks were added for
 * DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001 (Gate 1, hardened in Gate 2) so draft/pilot
 * merchant imports (which default to `is_active=false, is_published=false,
 * visibility_status=private`) can never leak onto public surfaces even if `is_active` is later
 * flipped without an explicit publish/visibility decision. See `public-product-visibility.ts`
 * for the shared predicate (`isPubliclyListableProduct`, in-process re-check) AND the shared
 * query helper (`applyPublicProductFilters`, DB-level `.eq(...)` chain) used to enforce this
 * rule identically everywhere.
 *
 * As of the Gate 2 correction, `applyPublicProductFilters` is applied to **every** public
 * `products` query in `marketplace.service.ts` — no exceptions: product detail (this file),
 * `listProducts` (grid/list), `getSuggested`, `getCategoryPage`, `getProductsByIds`,
 * `getOffersList`, `getBrands`, both `_buildWebStoreHome` and `_buildSegmentedHome`
 * home buckets. (Gate 1 had left `getCategoryPage`/`getProductsByIds`/`getOffersList`/
 * `getBrands`/the segmented home on the older `is_active`-only rule; that gap is closed now.)
 * Internal/merchant/admin product queries intentionally do NOT use this helper — a merchant
 * must still see their own unpublished/private products in their own dashboard.
 *
 * ## Global slug collision (deterministic resolution)
 * Product slugs are **not** guaranteed unique across merchants. When **multiple** rows match the same
 * `products.slug` and both satisfy the visibility rules above, the API returns **exactly one** row,
 * chosen **deterministically**:
 * 1. Sort candidates by **`merchant_id` ascending** (lexicographic string order).
 * 2. If still tied, sort by **`id` ascending**.
 * 3. Take the **first** row after sorting.
 *
 * This rule is stable across requests (not random). Prefer enforcing globally unique slugs in data (later batch) if collisions are unacceptable for UX.
 *
 * ## `merchants` embed (minimal, stable)
 * Embedded merchant rows on product payloads use **only**: `id`, `slug`, `display_name`.
 *
 * ## Client UX (M2.7) — product detail page
 * The storefront product detail route should surface merchant context as **«من متجر: {display_name}»** linking to
 * `/store/:slug` when the embed is present, keep **one primary** add-to-cart action, render other actions as
 * low-emphasis secondaries, use simple stock copy (**متوفر** / **المتبقي: n** / **غير متوفر**), and label suggested
 * items as same-category only (no personalization claims). These are presentation rules only; this endpoint’s shape
 * is unchanged.
 *
 * ## Public product column allowlists (M2.8)
 * - `GET .../products/slug/:slug` selects **detail** columns in {@link MARKETPLACE_PUBLIC_PRODUCT_SELECT}.
 * - List/grid surfaces (`/marketplace/products`, `/marketplace/home` product buckets, `/marketplace/suggested`,
 *   `/marketplace/offers`, `/marketplace/products/by-ids`) select **list** columns in
 *   {@link MARKETPLACE_PUBLIC_PRODUCT_LIST_SELECT}.
 *
 * `description` is intentionally detail-only (not present on list/grid payloads).
 * `short_description` is included on **list and detail** for product cards (may be null for legacy).
 * Both allowlists are explicit (never `*` on `products`).
 *
 * ## `GET /marketplace/products/by-ids` guard (M2.8)
 * `ids` accepts at most **100** values per request; higher counts are rejected with HTTP 400.
 */

/** Comma-separated `products` columns exposed on marketplace product JSON (no `*`). */
export const MARKETPLACE_PUBLIC_PRODUCT_SELECT =
  "id, merchant_id, category_id, slug, name, short_description, description, price, discount_price, images, stock, is_active, is_new, is_best_seller, is_featured, offer_ends_at, sort_order, created_at, loyalty_points_enabled, is_published, visibility_status, brand, colors, sizes, dimensions, weight_grams, target_audience, business_type_tags, product_use_cases, visible_in, purchase_mode, is_b2b_offer, min_order_qty, max_order_qty" as const;

/** Comma-separated `products` columns for list/grid endpoints (M2.8). Includes short_description; no long description. */
export const MARKETPLACE_PUBLIC_PRODUCT_LIST_SELECT =
  "id, merchant_id, category_id, slug, name, short_description, price, discount_price, images, stock, is_active, is_new, is_best_seller, is_featured, offer_ends_at, sort_order, created_at, loyalty_points_enabled, is_published, visibility_status, brand, colors, sizes, dimensions, weight_grams, target_audience, business_type_tags, product_use_cases, visible_in, purchase_mode, is_b2b_offer, min_order_qty, max_order_qty" as const;

/** Merchant object embedded on product rows — minimal stable fields only. */
export const MARKETPLACE_PRODUCT_MERCHANT_EMBED = "id, slug, display_name" as const;
