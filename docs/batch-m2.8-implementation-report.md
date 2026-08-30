# Batch M2.8 — Implementation report

## Scope confirmation

Implemented only approved M2.8 core scope:

- WP-A category slug resolution via single-row lookup
- WP-B contract-first list/detail select split
- WP-C offers refactor to DB-level pagination with accurate totals
- WP-D by-ids guard (`max 100`)
- WP-E one canonical categories query key in frontend

Out of scope remained untouched: caching architecture expansion, search expansion, new features, later M2 batches.

## Structural before/after evidence

### 1) Contract-first payload split (WP-B)

- **Before:** one shared product allowlist (`MARKETPLACE_PUBLIC_PRODUCT_SELECT`) used by both detail and list/grid paths.
- **After:** explicit dual allowlists in `marketplace-product-detail.contract.ts`:
  - `MARKETPLACE_PUBLIC_PRODUCT_SELECT` (detail; includes `description`)
  - `MARKETPLACE_PUBLIC_PRODUCT_LIST_SELECT` (list/grid; excludes `description`)
- **Result:** `description` now remains detail-only on `/marketplace/products/slug/:slug`.

### 2) Query usage switched to list allowlist (WP-B)

- `marketplace.service.ts` now uses:
  - `MARKETPLACE_PRODUCT_WITH_MERCHANT_SELECT` for PDP slug detail only
  - `MARKETPLACE_PRODUCT_LIST_WITH_MERCHANT_SELECT` for list/grid endpoints:
    - `/marketplace/products`
    - `/marketplace/home` buckets
    - `/marketplace/suggested`
    - `/marketplace/offers`
    - `/marketplace/products/by-ids`
    - category page products

### 3) Category slug discipline (WP-A)

- **Before:** `listProducts` fetched full categories table and resolved slug in memory.
- **After:** `listProducts` resolves category with `getCategoryIdBySlug()` (`select("id").eq("slug", ...)`) and applies direct category filter.
- **Behavior:** unknown category slug returns empty page slice `{ items: [], total: 0, offset, limit }` without scanning full categories list in handler flow.

### 4) Offers pagination discipline (WP-C)

- **Before:** offers filter path loaded capped list, filtered in memory, then `slice`.
- **After:** DB-level offers predicates with `count + range` pagination:
  - `discount_price IS NOT NULL`
  - `discount_price < price`
  - ordered by `created_at DESC`
- `/marketplace/offers` now accepts `offset`/`limit` and returns accurate paginated totals.

### 5) by-ids guard (WP-D)

- **Before:** no hard request-size guard.
- **After:** `/marketplace/products/by-ids` enforces max 100 ids; above that returns HTTP 400.
- Contract note added in `marketplace-product-detail.contract.ts`.

### 6) Canonical categories query key (WP-E)

- **Before:** two keys for same endpoint:
  - `["marketplace-categories"]`
  - `["marketplace-categories-header"]`
- **After:** one canonical key only: `["marketplace-categories"]` across `Header`, `Products`, and `Category`.

### 7) Consumer updates for slim list payloads

Updated frontend types so list consumers align with M2.8 shape:

- Added `MarketplaceListProduct` (detail minus `description`)
- Updated list/grid API result types to use list product type:
  - storefront list
  - home buckets
  - suggested items
  - by-ids
  - offers

## Validation

- Frontend build: `npm run build` (root) ✅
- Backend build: `npm run build` (`backend`) ✅
- Lint diagnostics on edited files: no errors ✅
