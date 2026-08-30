# Description

This PR implements **Phase 6B — Store Orders History & Details** backend APIs in DilMart-Store to enable B2B order tracking from the native Barber App.

## Changes Introduced

1. **New Controller Endpoints**:
   - `GET /orders/b2b/my-orders`: Lists B2B orders placed by the current profile. Filtered by channel `barber_app_checkout` and ordered by `created_at DESC`.
   - `GET /orders/b2b/:orderId`: Retrieves details of a single B2B order including full shipping info and items with product image URLs.
2. **Security & Validation Rules**:
   - Requests are verified against the `X-Store-Session` header.
   - Enforced `sourceApp === 'barber_app'` and profile ownership logic.
   - Prevented route conflicts by placing B2B endpoints before general wildcard routes.
3. **Checkout Response Expansion**:
   - Updated `submitCartCheckout` to query the order's database UUID `id` and return it to the client for direct routing upon successful placement.
4. **Testing**:
   - Added `backend/tests/phase6b-b2b-orders-smoke.test.mjs` verifying all endpoints, invalid sessions, PII security, and route conflicts (10/10 tests passed).

## Deployment Notice

After merging this PR into `main`, Render will automatically deploy the changes to:
`https://DilMart-store-backend.onrender.com/api`
