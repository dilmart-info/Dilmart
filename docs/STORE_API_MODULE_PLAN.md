# Store API Module Plan

## Backend package

- Path: `backend/`
- Framework: Nest-style module architecture
- Prefix: `/api`

## Implemented modules (active)

- `health`
- `supabase-admin`
- `checkout`
- `orders`
- `coupons`
- `loyalty`
- `inventory`
- `products`
- `categories`
- `merchants`
- `shipping`
- `uploads`
- `catalog`
- `admin`

## Implemented endpoints (current)

### Health
- `GET /api/health`

### Checkout / Cart / Pricing
- `POST /api/checkout/preview`
- `POST /api/checkout/submit`

### Coupons
- `POST /api/coupons/validate`
- `GET /api/coupons`
- `POST /api/coupons`
- `DELETE /api/coupons/:id`

### Orders
- `POST /api/orders`
- `POST /api/orders/manual`
- `GET /api/orders`
- `GET /api/orders/:id`
- `GET /api/orders/:id/detail`
- `POST /api/orders/:id/cancel`
- `POST /api/orders/:id/status`
- `POST /api/orders/:id/notes`
- `POST /api/orders/:id/agent`
- `GET /api/orders/agents/list`
- `GET /api/orders/agents/:agentId/orders`
- `POST /api/orders/track`

### Loyalty
- `POST /api/loyalty/preview`
- `POST /api/loyalty/redeem`

### Inventory
- `GET /api/inventory`
- `POST /api/inventory/adjust`

### Products
- `GET /api/products`
- `GET /api/products/:id`
- `POST /api/products`
- `POST /api/products/:id`
- `POST /api/products/:id/status`

### Categories
- `GET /api/categories/admin-list`
- `POST /api/categories`
- `POST /api/categories/:id`
- `DELETE /api/categories/:id`

### Merchants
- `GET /api/merchants`
- `GET /api/merchants/active`
- `GET /api/merchants/storefront-default`
- `GET /api/merchants/active-by-slug`
- `GET /api/merchants/:id`
- `GET /api/merchants/:id/dashboard-stats`
- `POST /api/merchants`
- `POST /api/merchants/:id`
- `POST /api/merchants/:id/status`
- `POST /api/merchants/:id/assign-owner`
- `GET /api/merchants/settings`
- `POST /api/merchants/settings`

### Shipping / Delivery
- `GET /api/shipping/companies`
- `POST /api/shipping/companies`
- `GET /api/shipping/governorates`
- `GET /api/shipping/companies/:companyId/prices`
- `POST /api/shipping/companies/:companyId/prices`

### Uploads
- `POST /api/uploads/products/image`

### Catalog (public read layer)
- `GET /api/catalog/categories`
- `GET /api/catalog/home`
- `GET /api/catalog/products`
- `GET /api/catalog/products/by-ids`
- `GET /api/catalog/products/:slug`
- `GET /api/catalog/offers`
- `GET /api/catalog/suggested`
- `GET /api/catalog/category/:slug`

### Admin analytics / data
- `GET /api/admin/analytics/overview`
- `GET /api/admin/customers`

## Security hardening (implemented baseline)

- Global `RolesGuard` registered in `AppModule` via `APP_GUARD`.
- Role metadata via `@Roles(...)` added to sensitive controllers/endpoints:
  - `orders`
  - `products`
  - `merchants`
  - `admin`
  - `inventory`
  - `coupons`
- Frontend API client now sends bearer token (`Authorization`) from Supabase session.
- Backend guard resolves actor identity/role from verified token + profile role lookup.
- Server-side merchant scope resolution active for:
  - `orders`
  - `products`
  - `merchants`
  - `inventory`
  - `coupons`
  - `admin/customers`
- Policy matrix + endpoint policy tests added (run via `npm run test:policy`):
  - `backend/tests/policy-matrix.test.mjs`
  - `backend/tests/policy-endpoints.test.mjs`
  with:
  - endpoint-level guard denial checks,
  - merchant missing-identity denial checks,
  - allow/deny resolver matrix checks across scoped services,
  - endpoint-level own-scope allow and cross-scope deny checks.

## Next endpoint/security batch

1. Add endpoint-level audit logging for mutation calls.
2. Expand policy tests to include seed-backed DB e2e paths (beyond in-memory/mock).
3. Add integration tests for order integrity and cross-merchant write rejection.
4. Refactor controllers to consume guard-attached actor context directly instead of header propagation.

## Auth context cleanup status

- Controllers now consume guard-attached actor context through `@CurrentActor()` decorator.
- Header-based actor propagation has been removed from controller method signatures.

## Frontend integration rule

- `src/lib/api-client.ts` is the only frontend integration entry point for business/data operations.
- Any new business feature must ship backend endpoint first, then consume it from frontend.
