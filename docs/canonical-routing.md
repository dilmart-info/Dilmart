# Canonical public routing & API (binding reference)

**Source of truth for route registration:** `src/App.tsx` (`Routes`).  
**API base:** `VITE_STORE_API_BASE_URL` + `/api` (see `src/lib/api-client.ts`).

This document is the team reference for **which paths are canonical**, which **API family** they use, and how to **build new links**. Update it when adding public routes.

---

## Path generation rules (new public links)

Use **only** these patterns — lowercase path segments, **no** trailing slash in `Link to=` / `navigate()` unless a route is explicitly registered with one (none today).

| Destination | Pattern | Notes |
|-------------|---------|--------|
| Home | `"/"` | |
| Merchant storefront | `` `/store/${slug}` `` | `slug` = `merchants.slug` (URL-encoded if needed) |
| Product (global) | `` `/product/${slug}` `` | Product slug; see product-detail contract for collision behavior |
| Marketplace listing | `"/products"` | Query: `category`, `search`, `sort`, `page` as per `Products` page |
| Merchant discovery | `"/stores"` | Query: `sort`, `page` |
| Category landing | `` `/category/${slug}` `` | Category taxonomy `slug` |
| Offers | `"/offers"` | |
| Cart, checkout, etc. | `"/cart"`, `"/checkout"`, … | Fixed paths |

**Do not** use for new code:

- `storeConfig.defaultMerchantSlug` as a **default route** (legacy; unused for storefront resolution in M1.6).
- **`getCatalog*`** client methods — use **`getMarketplace*`** (see `docs/batch-m1.6-getcatalog-audit.md`).

---

## Canonical route table (public storefront)

| Path | Purpose | Owning API family | Canonical vs legacy | Redirect |
|------|---------|-------------------|---------------------|----------|
| `/` | Home | `GET /marketplace/home`, `GET /marketplace/categories` | **Canonical** | — |
| `/products` | Paginated catalog | `GET /marketplace/products` | **Canonical** | — |
| `/product/:slug` | Product detail (global slug) | `GET /marketplace/products/slug/:slug` | **Canonical** | — |
| `/store/:slug` | Merchant storefront | `GET /marketplace/merchants/:slug`, `GET /marketplace/products?merchant_id=` | **Canonical** | — |
| `/stores` | Merchant discovery | `GET /marketplace/merchants` | **Canonical** | — |
| `/category/:slug` | Category landing | `GET /marketplace/categories` (taxonomy); listing via `/products?category=` | **Canonical** | — |
| `/offers` | Offers listing | `GET /marketplace/offers` | **Canonical** | — |
| `/cart`, `/checkout`, `/thank-you` | Commerce | Orders/checkout APIs | **Canonical** | — |
| `/privacy`, `/support` | Static/info | N/a | **Canonical** | — |
| `/auth`, `/profile` | Account | Auth/profile APIs | **Canonical** | — |
| `/track-order` | Order tracking | Track API | **Canonical** | — |
| `/wishlist` | Wishlist | Client + product APIs | **Canonical** | — |

**Legacy (HTTP API, not first-class SPA paths):**

| API prefix | Purpose | Status |
|------------|---------|--------|
| `GET /api/catalog/*` | Single-merchant catalog (requires `merchant_id` on many routes) | **Legacy** — kept for compatibility; **no** new storefront call sites |
| `GET /api/marketplace/*` | Multi-tenant marketplace | **Canonical** for public catalog |

**Redirects (hosting):** No inventory-backed legacy **public** paths were identified in-repo for M1.6. `netlify.toml` / `public/_redirects` use SPA fallback `/* → /index.html` (200). Add **explicit** redirects only when old public URLs are documented (e.g. marketing links).

---

## Trailing slash & case (M1.6)

- **Trailing slash:** React Router routes are registered **without** a trailing slash (e.g. `/products`). Requests to `/products/` depend on the host; **no** normalization was added in M1.6. Document **current** behavior: prefer links **without** trailing slash.
- **Case:** Paths are **case-sensitive** in the SPA as authored. Use **lowercase** segment names consistently.

---

## HashRouter vs BrowserRouter (support only)

- **Web:** `BrowserRouter` — URLs look like `https://host/products`.
- **Capacitor:** `HashRouter` — URLs may look like `https://host/#/products`.

No deep-link helper or native routing changes in M1.6; document for support/debugging only.

---

## Slug behavior (pointers)

- **Products:** Global `product.slug` — deterministic resolution when duplicated across merchants — see `backend/.../marketplace-product-detail.contract.ts`.
- **Merchants:** `merchants.slug` for `/store/:slug` — must match an **active** merchant or storefront shows not-found.
