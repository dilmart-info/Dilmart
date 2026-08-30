# DilMart Store Integration — Architecture and Auth

## 1. Approved Architecture

```txt
Barber App Native Store Screens
        |
        | DilMart JWT
        v
DilMart Main Backend / Store Integration Module
        |
        | Internal signed service request
        v
DilMart Store Backend
        |
        v
Store DB
```

## 2. Core Decision

Unify identity, not databases.

```txt
Unified DilMart Identity + Separate Store Domain
```

## 3. Why Not Merge Databases Now

DilMart Main and Store are separate domains.

DilMart Main owns:

- users
- barbershops
- bookings
- services
- wallets
- staff
- subscriptions

Store owns:

- products
- categories
- merchants
- inventory
- carts
- orders
- coupons
- delivery
- checkout

A full DB merge now increases risk and slows delivery. It can be reconsidered only after the Store becomes deeply core to the whole platform.

## 4. Auth Model

DilMart Main Backend acts as the identity provider for users coming from DilMart apps.

The Store must trust a signed short-lived session issued by DilMart Main Backend.

## 5. Session Exchange Flow

```txt
1. Barber App has normal DilMart JWT.
2. Barber App calls POST /store-integration/session.
3. DilMart Main Backend validates user and salon context.
4. DilMart Main Backend signs a short-lived store session token.
5. Store Backend receives the token at POST /integrations/DilMart/session/exchange.
6. Store Backend verifies signature and TTL.
7. Store Backend creates/updates store_linked_profile.
8. Store Backend returns Store-side session/context.
```

## 6. Linked Store Profile

Suggested table:

```sql
create table store_linked_profiles (
  id uuid primary key default gen_random_uuid(),
  DilMart_user_id uuid null,
  DilMart_role text null,
  DilMart_barbershop_id uuid null,
  store_customer_id uuid null,
  segment text not null,
  display_name text null,
  phone text null,
  city text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

## 7. Data Sent from DilMart Main to Store

For Barber App users:

```json
{
  "DilMartUserId": "uuid",
  "role": "OWNER",
  "barbershopId": "uuid",
  "shopName": "Salon Name",
  "businessType": "men_barbershop",
  "city": "Baghdad",
  "address": "...",
  "phone": "...",
  "segment": "B2B_BARBER_OWNER",
  "sourceApp": "barber_app"
}
```

Do not send:

- customer names
- booking history
- salon revenue
- wallet balance
- full staff data
- sensitive operational information

## 8. Required Environment Variables

### DilMart Main Backend

```txt
STORE_API_BASE_URL
STORE_INTEGRATION_SECRET
STORE_FRONTEND_BASE_URL
STORE_SESSION_TTL_SECONDS
```

### Store Backend

```txt
DilMart_MAIN_API_BASE_URL
DilMart_INTEGRATION_SECRET
DilMart_SESSION_ISSUER
```

## 9. Security Rules

- Store integration secret must never be shipped to mobile apps.
- Store session tokens must be short-lived.
- Product visibility must be enforced backend-side.
- Store Backend must not trust mobile-provided role/business type blindly.
- Store order records should store `source_app`, `DilMart_user_id`, and `DilMart_barbershop_id` when available.
