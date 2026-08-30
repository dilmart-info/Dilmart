# M1.6 — `getCatalog*` & related legacy client call-site audit

**Audit scope:** entire repo (`src/`, `scripts/`) for usages of `apiClient.getCatalog*` and `getCatalogCategories`.  
**Method:** ripgrep `getCatalog` / `getCatalogCategories` (2026-04-21 codebase).

## Summary

| Metric | Value |
|--------|--------|
| **Call sites outside `api-client.ts`** | **0** |
| **CatalogModule / `/api/catalog` backend** | **Retained** — no removal; external or future consumers may still call HTTP API |

**Conclusion:** The storefront **does not** invoke any `getCatalog*` method at runtime. Methods remain on `apiClient` for **optional** integrations; new code must use **`getMarketplace*`** per `docs/canonical-routing.md`.

---

## Per-method audit

| Client method | Defined at | In-repo callers | Public-facing UI? | Runtime-active in app? | Decision |
|---------------|------------|-----------------|-------------------|-------------------------|----------|
| `getCatalogCategories` | `api-client.ts` | **None** | N/A (unused) | **No** | **Keep temporarily** — maps to `GET /api/catalog/categories`; **replace** with `getMarketplaceCategories` if ever needed |
| `getCatalogHome` | `api-client.ts` | **None** | N/A | **No** | **Keep temporarily** — legacy `GET /api/catalog/home` |
| `getCatalogProducts` | `api-client.ts` | **None** | N/A | **No** | **Keep temporarily** |
| `getCatalogProductsByIds` | `api-client.ts` | **None** | N/A | **No** | **Keep temporarily** |
| `getCatalogOffers` | `api-client.ts` | **None** | N/A | **No** | **Keep temporarily** |
| `getCatalogProductBySlug` | `api-client.ts` | **None** | N/A | **No** | **Keep temporarily** |
| `getCatalogSuggested` | `api-client.ts` | **None** | N/A | **No** | **Keep temporarily** |
| `getCatalogCategoryPage` | `api-client.ts` | **None** | N/A | **No** | **Keep temporarily** |

**Related (non-catalog but legacy merchant discovery):**

| Method | Callers in `src/pages` | Decision |
|--------|------------------------|----------|
| `getStorefrontDefaultMerchant` | **None** | **Keep temporarily** — `GET /merchants/storefront-default` |
| `getActiveMerchantBySlug` | **None** (only re-export wrapper in `marketplace.ts`) | **Keep temporarily** — prefer `getMarketplaceMerchantBySlug` for storefront (see `marketplace.ts` JSDoc) |

**CatalogModule removal:** **Not done** — audit shows **no** in-app callers of client wrappers, but **HTTP** `/api/catalog/*` may still be used outside this repo; removing the module requires a broader integration audit.
