# DilMart Store Integration — API Contracts

## 1. DilMart Main Backend Module

Suggested module:

```txt
backend/src/modules/store-integration
```

## 2. DilMart Main Backend Endpoints

```txt
POST /store-integration/session
GET  /store-integration/barber/home
GET  /store-integration/products
GET  /store-integration/products/:id
POST /store-integration/cart/items
GET  /store-integration/cart
PATCH /store-integration/cart/items/:itemId
DELETE /store-integration/cart/items/:itemId
POST /store-integration/checkout
GET  /store-integration/orders
GET  /store-integration/orders/:id
```

## 3. `POST /store-integration/session`

Creates a store session for the authenticated DilMart user.

### Auth

Requires normal DilMart JWT.

### Response

```json
{
  "storeSessionToken": "signed-token",
  "expiresIn": 900,
  "segment": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop",
  "linkedProfileStatus": "ready"
}
```

## 4. `GET /store-integration/barber/home`

Returns the backend-driven store home layout for the current user.

### Response

```json
{
  "layoutVersion": 1,
  "segment": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop",
  "banners": [],
  "categories": [],
  "sections": []
}
```

## 5. `GET /store-integration/products`

Search/list products visible to the current user.

### Query params

```txt
q
categoryId
businessType
minPrice
maxPrice
sort
page
limit
```

### Response

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Professional Clipper",
      "price": 45000,
      "currency": "IQD",
      "imageUrl": "https://...",
      "badges": ["Professional", "B2B"],
      "merchantName": "Trusted Supplier",
      "isAvailable": true
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 100
}
```

## 6. Store Backend Endpoints

```txt
POST /integrations/DilMart/session/exchange
GET  /marketplace/home
GET  /marketplace/products
GET  /marketplace/products/:id
POST /cart/items
GET  /cart
PATCH /cart/items/:itemId
DELETE /cart/items/:itemId
POST /checkout/preview
POST /checkout/submit
GET  /orders/me
GET  /orders/:id
```

## 7. `POST /integrations/DilMart/session/exchange`

### Request

```json
{
  "token": "signed-store-session"
}
```

### Response

```json
{
  "storeAccessToken": "store-token",
  "linkedProfileId": "uuid",
  "segment": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop"
}
```

## 8. Required Context Fields

Store Backend APIs should accept or resolve:

```txt
source_app
segment
audience
business_type
DilMart_user_id
DilMart_barbershop_id
visible_in
```

## 9. Backend Enforcement

Product visibility must be enforced by backend, not only by mobile UI.

The Barber App should never be able to request hidden products by guessing IDs unless the Store Backend confirms visibility.
