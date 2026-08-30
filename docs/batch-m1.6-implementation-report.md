# Batch M1.6 — implementation report

## Deliverables

| Item | Location |
|------|----------|
| Canonical route table & path rules | [`docs/canonical-routing.md`](canonical-routing.md) |
| `getCatalog*` call-site audit | [`docs/batch-m1.6-getcatalog-audit.md`](batch-m1.6-getcatalog-audit.md) |
| JSDoc alignment | `src/lib/api-client.ts` (legacy catalog + storefront-default helpers) |
| Config clarification | `src/config/store.ts` (`defaultMerchantSlug`) |
| Helper deprecation note | `src/lib/marketplace.ts` (`getActiveMerchantBySlug`) |

**Not in scope (per plan):** CatalogModule removal; speculative Netlify redirects; HashRouter/deep-link code; trailing-slash normalization (documented only).

---

## Manual verification matrix

Fill **Actual** / **Pass/Fail** in a real environment (web + optional Capacitor build).

| # | Scenario | Expected | Actual | Pass/Fail |
|---|----------|----------|--------|-----------|
| 1 | Open each **canonical** path from [`canonical-routing.md`](canonical-routing.md) table | Page loads (or auth guard for protected routes); no accidental 404 for known routes | — pending — | — |
| 2 | No new links use `getCatalog*` | Grep / code review: no new imports of catalog helpers | **Pass** (0 call sites) | Pass |
| 3 | Marketplace pages load data | Home, products, product detail, store, stores use `getMarketplace*` only | — pending — | — |
| 4 | Trailing slash | `/products` vs `/products/` — document behavior (SPA + host) | — pending — | — |
| 5 | Hash build | Capacitor: `/#/products` works | — pending — | — |
| 6 | Legacy API | `GET /api/catalog/categories` still responds if backend running (compat) | — pending — | — |

---

## Audit conclusion

- **Zero** `getCatalog*` usages outside `api-client.ts` → **no** CatalogModule removal.
- **Canonical policy** enforced in documentation + deprecation JSDoc; storefront already uses marketplace APIs.
