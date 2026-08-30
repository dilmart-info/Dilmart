# Store Backend Migration Audit

## Scope

This audit inventories direct frontend Supabase usage and classifies each path for API-first migration.

## Classification Legend

- **Operation type:** read / write / auth / storage / rpc
- **Sensitivity:** Critical / High / Medium / Low
- **Action:** Migrate now / Keep temporarily

## Inventory Table

| File | Module/Page | Supabase usage | Type | Public/Protected | Business logic in client | Sensitivity | Migration action | Target backend endpoint/module |
|---|---|---|---|---|---|---|---|---|
| `src/pages/Checkout.tsx` | checkout submit/quote | migrated to backend API | write/rpc/read | protected + guest checkout | no (critical logic server-owned) | Critical | **Migrated** | `/coupons/validate`, `/checkout/preview`, `/checkout/submit` |
| `src/pages/Cart.tsx` | cart coupon flow | migrated to backend API | rpc | public | no | High | **Migrated** | `/coupons/validate` |
| `src/pages/admin/OrderDetail.tsx` | admin order operations | migrated to backend API | read/write | protected admin | no | High | **Migrated** | `/orders/:id/detail`, `/orders/:id/status`, `/orders/:id/notes`, `/orders/:id/agent` |
| `src/pages/admin/ProductForm.tsx` | product create/update | migrated to backend API | read/write/storage | protected admin/merchant | no | High | **Migrated** | `/products`, `/products/:id`, `/uploads/products/image` |
| `src/components/admin/ManualOrderModal.tsx` | manual order creation | migrated to backend API | read/write | protected admin | no | High | **Migrated** | `/orders/manual`, `/products`, `/shipping/governorates` |
| `src/pages/AgentOrders.tsx` | agent delivery workflow | migrated to backend API | read/write | protected agent | no (client orchestration removed) | High | **Migrated** | `/orders/agents/:agentId/orders`, `/orders/:id/status` |
| `src/pages/admin/Dashboard.tsx` | analytics aggregation | migrated to backend API | read | protected admin | no (aggregation moved server-side) | High | **Migrated** | `/admin/analytics/overview` |
| `src/lib/scoped-queries.ts` | shared admin/merchant data | migrated to backend API client | read/write | mixed protected | no (frontend query layer now API-only) | High | **Migrated** | `/products`, `/orders`, `/coupons`, `/admin/customers` |
| `src/lib/marketplace.ts` | merchant helpers | migrated to backend API | read | mixed | low | Medium | **Migrated** | `/merchants/*`, `/products`, `/orders` |
| `src/pages/Products.tsx` | storefront listing | migrated to backend API | read | public | low | Medium | **Migrated** | `/catalog/products` |
| `src/pages/ProductDetail.tsx` | product detail | migrated to backend API | read | public | low | Medium | **Migrated** | `/catalog/products/:slug` |
| `src/pages/Index.tsx` | homepage collections | migrated to backend API | read | public | low | Medium | **Migrated** | `/catalog/home` |
| `src/pages/Offers.tsx` | offers listing | migrated to backend API | read | public | low | Medium | **Migrated** | `/catalog/offers` |
| `src/pages/Category.tsx` | category listing | migrated to backend API | read | public | low | Medium | **Migrated** | `/catalog/category/:slug` |
| `src/pages/Wishlist.tsx` | wishlist product hydration | migrated to backend API | read | public/protected | low | Low | **Migrated** | `/catalog/products/by-ids` |
| `src/pages/TrackOrder.tsx` | order tracking | migrated to backend API | read | public by order number | medium | Medium | **Migrated** | `/orders/track` |
| `src/pages/merchant/Settings.tsx` | merchant settings update | migrated to backend API | read/write | protected merchant | no | High | **Migrated** | `/merchants/settings` |
| `src/pages/admin/Merchants.tsx` | merchant management | migrated to backend API | read/write | protected admin | no | High | **Migrated** | `/merchants`, `/merchants/:id/status` |
| `src/pages/admin/MerchantDetail.tsx` | merchant + owner assignment | migrated to backend API | write | protected admin | no | High | **Migrated** | `/merchants/:id`, `/merchants/:id/assign-owner` |
| `src/components/Header.tsx` | auth/cart/profile summary | categories via backend API | auth/read | mixed | low | Medium | Mostly migrated | `/catalog/categories`, auth transitional |

## Phase grouping

### P0 (must migrate first)

1. Checkout + pricing + coupon + order creation
2. Inventory-affecting writes (product updates and stock operations)
3. Order state transitions (admin/agent/merchant actions)
4. Loyalty preview/redeem operations
5. Merchant settings writes

### P1

1. Admin analytics and dashboards
2. Merchant/admin operational CRUD wrappers
3. Upload orchestration

### P2

1. Public catalog reads (home/products/category/detail/offers)
2. Wishlist hydration / read-side optimizations
3. Track order public endpoint hardening

## Current migration status in this task

- Added backend foundation and broad API coverage across checkout/orders/coupons/loyalty/admin/catalog/shipping/uploads.
- Migrated critical writes + admin operations + major storefront reads to backend APIs.
- Direct frontend Supabase calls in `src/` are now eliminated for data/business flows (scan-based verification).
- Remaining architectural work is backend authz hardening and policy-depth improvements.
