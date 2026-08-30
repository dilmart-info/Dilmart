# Public leakage negative test

Task: `DilMart-ARD-AL-KHALEEJ-PRIVATE-CATALOG-QA-001`  
Authorization: `PRIVATE_CATALOG_QA_READ_ONLY_APPROVED`

## Before / after QA

| Metric                                                                 | Before | After |
| ---------------------------------------------------------------------- | ------ | ----- |
| Global public products (active merchant + active + published + public) | 311    | 311   |
| Target merchant products with public triple-state                      | 0      | 0     |
| Target merchant status                                                 | draft  | draft |

## Storefront / API probes

| Probe                                                                                     | Result                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `store.DilMart.org` search `ARD-4138` / `ARD-2511` / `ARD-1318` / `ARD-1191` / `ARD-1015` | HTTP 200 SPA shell; SKU strings **not** present in HTML |
| `store.DilMart.org/merchant/arth-al-khaleg`                                               | HTTP 200 shell; no target SKU/name leakage in HTML      |
| `GET /api/marketplace/products?merchant_id=ac7c356b-…&limit=50`                           | **items=[], total=0**                                   |
| `GET /api/marketplace/products?search=ARD-4138`                                           | **items=[], total=0**                                   |
| `GET /api/marketplace/products/by-slug/<target slugs>`                                    | **404**                                                 |
| `GET /api/marketplace/merchants/arth-al-khaleg`                                           | **404** (draft merchant not publicly exposed)           |

Note: `?merchant_slug=arth-al-khaleg` without id returned unrelated public catalog items from another merchant — treated as unsupported/ignored filter, **not** target leakage (verified none of those items belong to target merchant_id).

## Conclusion

**Public leakage = 0** for the target private catalog.
