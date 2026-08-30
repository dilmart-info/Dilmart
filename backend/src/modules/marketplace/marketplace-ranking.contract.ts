/**
 * # Marketplace ranking & sort — team reference (M2.2)
 *
 * **Scope:** Surfaces, **default order**, **user-selectable sorts**, **internal selection signals**, and **storefront
 * copy alignment**. This file does **not** implement queries — see `MarketplaceService`. No search relevance or
 * fuzzy ranking — see M2.1 for search.
 *
 * ---
 *
 * ## Glossary — separate meanings (do not conflate)
 *
 * | Term | Where it lives | Meaning in this codebase |
 * |------|----------------|---------------------------|
 * | **Merchant featured** | `merchants.is_featured` | Merchant-level flag. Used to **sort** merchants (e.g. featured first) on `/stores` and in the home merchant strip query ordering — **not** the same as “product featured”. |
 * | **Product featured** | `products.is_featured` | Exists on the product row for merchandising/admin. **Not** used for the `GET /marketplace/home` → `featuredProducts` bucket (that bucket uses **best seller** — see below). |
 * | **Best seller** | `products.is_best_seller` | **Drives** the home API field `featuredProducts` (key name is historical). User-facing copy must say “best seller” / الأكثر مبيعاً, not generic “luxury curation”. |
 * | **New** | `products.is_new` | Flag-driven “new” bucket (`newProducts` on home). Not the same as “newest by date” on `/products` sort. |
 * | **Offer** | `discount_price` set and **&lt;** `price` | True discount; home `offerProducts` and `GET /marketplace/offers` apply this rule (see `marketplace-home.contract.ts`). |
 *
 * ---
 *
 * ## Surface matrix
 *
 * | Surface | Route / API | Default ranking or sort | User-selectable sorts | Internal signal / ordering notes | User-facing label (AR) — aligned to signal |
 * |---------|-------------|---------------------------|------------------------|-----------------------------------|---------------------------------------------|
 * | Global product listing | `GET /marketplace/products`, `/products` | **`newest`** (`created_at` DESC) | `newest`, `price-asc`, `price-desc` | Active products, active merchants; optional category, M2.1 search on `name` | Page title “المجموعة” / search / category; sort control matches API |
 * | Global listing + search | same | **`newest`** (sort independent of search) | same | Same as above | M2.1: no relevance sort |
 * | Merchant discovery | `GET /marketplace/merchants`, `/stores` | **`featured`** (`is_featured` DESC, `created_at` DESC) | `featured`, `newest`, `name` | Active merchants only | “مميز أولاً” = merchant **featured** flag |
 * | Storefront grid | `GET /marketplace/products?merchant_id=`, `/store/:slug` | **`newest`** (default; no storefront sort UI) | *(none in UI)* | Single merchant, limit as implemented | — |
 * | Offers page | `GET /marketplace/offers`, `/offers` | **`created_at` DESC** (fixed list) | *(none)* | True discount filter | “عروض” = discount rule |
 * | Home — merchants strip | `GET /marketplace/home` → `featuredMerchants` | `is_featured` DESC, `created_at` DESC, limit 8 | n/a | Active merchants; **not** exclusively featured merchants | “متاجر” + subtitle clarifies ordering |
 * | Home — “featuredProducts” bucket | same | `created_at` DESC, limit 8 | n/a | **`is_best_seller === true`** | **الأكثر مبيعاً** (not “فاخر” curation) |
 * | Home — new bucket | same → `newProducts` | `created_at` DESC, limit 8 | n/a | **`is_new === true`** | “وصل حديثاً” + subtitle: flag-based “new” |
 * | Home — offers bucket | same → `offerProducts` | fetch then filter | n/a | Discount rule | “عروض مختارة” + discount subtitle |
 * | Suggested products | `GET /marketplace/suggested` | `created_at` DESC, limit 8 | n/a | Same category, exclude id | PDP block |
 *
 * ---
 *
 * ## API field names vs semantics
 *
 * - **`featuredProducts`** (response key): populated from **`is_best_seller`**, not from `products.is_featured`.
 * - Renaming the JSON key would be breaking; **labels** must match **best seller** until a future major version.
 *
 * @see marketplace-home.contract.ts
 * @see marketplace-list.contract.ts
 * @see marketplace-stores.contract.ts
 */

/** Placeholder export so the file is a valid module alongside comment-only contracts. */
export const MARKETPLACE_RANKING_CONTRACT_VERSION = 1 as const;
