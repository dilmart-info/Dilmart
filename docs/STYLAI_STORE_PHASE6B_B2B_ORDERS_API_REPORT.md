# DilMart-Store Backend B2B Orders API Report — Phase 6B

---

## 1. Objective

Provide secure, authenticated B2B order list and detail retrieval APIs for the DilMart Barber App. This enables barbershop owners and managers to track their store orders directly from their native mobile application without needing to visit the Store web portal or the admin panel.

---

## 2. Scope

- **API endpoints**:
  - `GET /orders/b2b/my-orders`: Retrieve B2B orders list.
  - `GET /orders/b2b/:orderId`: Retrieve full B2B order details and items.
- **Checkout upgrade**:
  - Update `submitCartCheckout` to fetch the newly created order's UUID `id` from the database and return it inside the submit response payload.
- **Security enforcement**:
  - Verification of `X-Store-Session` token.
  - Asserting the request source is `barber_app`.
  - Asserting order ownership using the authenticated `store_linked_profile_id`.
  - Prevent routing conflict with general admin/customer endpoints (e.g. `orders/:id`).

---

## 3. Files Changed

1. `backend/src/modules/orders/orders.module.ts`:
   - Imported `StoreIntegrationModule` to enable session token verification.
2. `backend/src/modules/orders/orders.controller.ts`:
   - Injected `StoreIntegrationService`.
   - Implemented B2B endpoints with exact session validation and correct routing order to avoid conflicts.
3. `backend/src/modules/orders/orders.service.ts`:
   - Added `getB2BOrders` database query joining the `governorates` table.
   - Added `getB2BOrderDetail` database query verifying linked profile ownership and retrieving order items with product images.
4. `backend/src/modules/cart/cart-checkout.service.ts`:
   - Updated `submitCartCheckout` return signature and logic to query and return the order's UUID `id` alongside `order_number`.

---

## 4. API Specification & Security Rules

### 4.1 GET /orders/b2b/my-orders

- **Headers**:
  - `X-Store-Session`: `<storeSessionToken>` (JWT, HMAC SHA256 verified)
- **Filters**:
  - `channel = 'barber_app_checkout'`
  - `store_linked_profile_id = session.linkedProfileId` (claims derived server-side)
  - Ordered by `created_at DESC`
  - Limit: default/maximum 50 items.
- **Response**:
  ```json
  {
    "orders": [
      {
        "id": "uuid",
        "order_number": "DUK-260630-5515",
        "status": "pending",
        "delivery_status": "pending",
        "payment_method": "cod",
        "payment_status": "unpaid",
        "subtotal": 195000,
        "delivery_cost": 5000,
        "total": 200000,
        "governorate_name": "بغداد",
        "area": "الكرادة",
        "created_at": "2026-06-30T16:32:00Z"
      }
    ],
    "total": 1
  }
  ```

### 4.2 GET /orders/b2b/:orderId

- **Headers**:
  - `X-Store-Session`: `<storeSessionToken>`
- **Validation**:
  - Checks if `store_linked_profile_id = session.linkedProfileId`. Throws `404 Not Found` if the order does not exist or belongs to another account.
- **Response**:
  ```json
  {
    "order": {
      "id": "uuid",
      "order_number": "DUK-260630-5515",
      "status": "pending",
      "delivery_status": "pending",
      "payment_method": "cod",
      "payment_status": "unpaid",
      "subtotal": 195000,
      "delivery_cost": 5000,
      "discount": 0,
      "total": 200000,
      "customer_name": "Hussein Salon",
      "customer_phone": "07801234567",
      "governorate_name": "بغداد",
      "area": "الكرادة",
      "nearest_landmark": "ساحة كهرماء",
      "notes": "يرجى التوصيل بعد العصر",
      "created_at": "2026-06-30T16:32:00Z"
    },
    "items": [
      {
        "id": "uuid",
        "product_id": "uuid",
        "product_name": "اسم المنتج",
        "quantity": 1,
        "unit_price": 195000,
        "line_total": 195000,
        "image_url": "https://..."
      }
    ]
  }
  ```

### 4.3 Security Rules Enforcement

1. **Authentication**: Requests must include `X-Store-Session`.
2. **Access Control**: Validates `claims.sourceApp === 'barber_app'`. Reject calls from web sessions or guest sessions.
3. **Data Leaks Prevention**: The database filters exclusively by `store_linked_profile_id` parsed from the JWT. The client cannot send a custom `profile_id` or `user_id`.
4. **Log Security**: No token, session, or PII is printed to application logs.

---

## 5. Programmatic QA Verification

- **Build Check**: Verified by running `npm run build` in `backend` directory. Compilation passed with **0 errors**.
- **Route Conflict Check**: Added B2B endpoints _before_ the wildcard routes (e.g. `orders/:id` and `orders/:id/detail`) in `orders.controller.ts` which prevents routing issues.

---

## 6. Status

**Branch**: `feat/b2b-store-orders-api-phase6b`  
**Status**: `READY_FOR_MERGE` (Staging gate ready)
