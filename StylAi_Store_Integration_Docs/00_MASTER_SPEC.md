# DilMart Store Integration Strategy

## B2B Barber First — Native Dynamic Segmented Marketplace

**Version:** 1.0  
**Status:** Product/Architecture Reference  
**Primary target:** DilMart Barber App  
**Future target:** DilMart Customer App  
**Date:** 2026-05-28

---

## 1. Purpose

This document defines the agreed product and technical strategy for integrating **DilMart Store** with the DilMart ecosystem.

The goal is not to add a simple store link inside the app. The goal is to build a deeply integrated marketplace experience that feels native to DilMart, while keeping the Store domain technically independent and scalable.

The first official integration must target the **Barber App** as a B2B marketplace for barbers, salon owners, and beauty-business operators.

---

## 2. Core Strategic Decision

### Decision

Start with:

```txt
B2B Barber Store Integration First
```

Do not start with the Customer App retail store.

### Rationale

Barbers and salon owners have higher business value than normal retail buyers because they need:

- salon equipment
- chairs
- mirrors
- machines
- scissors
- razors
- sterilization supplies
- towels and consumables
- wholesale offers
- trusted suppliers
- original/professional products
- salon setup packages

This makes the Store a strategic extension of the Barber App, not just an e-commerce add-on.

### Product positioning

For customers:

```txt
DilMart helps you book and care for yourself.
```

For barbers and salon owners:

```txt
DilMart helps you manage, grow, and equip your salon from trusted suppliers.
```

---

## 3. Store Surface Decision

### Rejected approach: External browser link

Do not implement:

```txt
Barber App -> external browser -> store.DilMart.org
```

This is rejected because it:

- pushes users out of the app
- weakens the sense of integration
- may require a second login
- reduces conversion
- creates a lower-quality experience
- makes the store feel separate from DilMart

### Temporary approach: In-app WebView

An in-app WebView is acceptable only for limited use cases:

1. temporary checkout fallback
2. unsupported sections during early rollout
3. emergency fallback if native store screens fail

It must not be the primary long-term store experience.

### Approved approach: Native Dynamic Store

The approved long-term direction is:

```txt
Native Dynamic Store inside the Barber App
```

Meaning:

- React Native screens render the store inside the Barber App.
- Store data comes from the Store Backend.
- Identity comes from DilMart Main Auth.
- Store orders, carts, products, inventory, merchants, and campaigns remain owned by the Store Backend/DB.
- The user does not feel like they left the app.

---

## 4. High-Level Architecture

```txt
Barber App Native Store Screens
        |
        | DilMart JWT
        v
DilMart Main Backend / Store Integration Module
        |
        | internal signed service request
        v
DilMart Store Backend
        |
        v
Store DB: products, categories, campaigns, carts, orders, merchants, inventory
```

### Important principle

Do not build two stores.

Wrong:

```txt
Store Web has its own products
Barber App has separate local/hardcoded products
```

Correct:

```txt
Store Backend is the source of truth.
Barber App is a native client for the Store domain.
```

---

## 5. Database Strategy

### Decision

Do not merge the Store DB into the DilMart Main DB at this phase.

Adopt:

```txt
Unified DilMart Identity + Separate Store Domain
```

### Why not merge DBs now?

DilMart Main contains:

- users
- barbershops
- bookings
- services
- wallets
- staff
- subscriptions
- admin operations

Store contains:

- products
- categories
- merchants
- inventory
- carts
- orders
- coupons
- delivery
- checkout

Full DB unification would create unnecessary risk:

- dangerous migrations
- table/domain conflicts
- larger main backend surface
- difficult fault isolation
- store bugs could affect booking operations
- slower implementation

### Approved DB shape

- DilMart Main DB remains the source of truth for app users and salons.
- Store DB remains the source of truth for products, inventory, carts, orders, merchants, and delivery.
- Store DB links app users through `store_linked_profiles`.

---

## 6. Auth Strategy

### Decision

DilMart Main Auth becomes the identity provider for users coming from DilMart apps.

The Store must not require a separate login when accessed from the Barber App.

### Flow

```txt
1. User opens Barber App.
2. User taps Store.
3. Barber App calls DilMart Main Backend:
   POST /store-integration/session
4. DilMart Main Backend validates the user's DilMart JWT.
5. DilMart Main Backend creates a short-lived signed store session.
6. Store Backend validates the signed session.
7. Store Backend creates or updates a linked store profile.
8. Barber App renders native store screens for the resolved segment.
```

### Session properties

The store session must be:

- short-lived
- signed
- auditable
- scoped to store operations
- not a replacement for the user's main DilMart auth
- revocable by TTL

---

## 7. Store Linked Profiles

Add a Store-side profile mapping table.

Suggested table:

```sql
store_linked_profiles (
  id uuid primary key,
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
)
```

Not every Store user needs a DilMart account. Public store users may exist without `DilMart_user_id`.

---

## 8. External Web Store Users

The public web store remains open.

Do not force every web buyer to register a salon in DilMart.

The public store should support three paths:

### 8.1 Retail customer

A normal buyer who wants personal-care products.

```txt
segment = RETAIL_CUSTOMER
source = store_web
```

Requirements:

- phone + OTP
- name
- address
- normal checkout

### 8.2 Professional barber buyer, unverified

A barber who is not yet connected to a DilMart salon account.

```txt
segment = PROFESSIONAL_BARBER_UNVERIFIED
source = store_web
```

Can see:

- professional machines
- scissors
- razors
- sterilization tools
- professional consumables

But should not receive the full benefits of verified B2B salon-owner pricing or setup packages.

### 8.3 Salon owner lead

A business owner who enters through the store but does not yet use DilMart Barber App.

Collect lightweight lead data:

- name
- phone
- city
- business type
- salon name
- interested in full setup or normal buying

Then encourage them to activate their salon in DilMart Barber App for full benefits.

### Commercial rule

```txt
Buying is open to everyone.
Full professional B2B benefits are reserved for verified barbers and salon owners.
```

---

## 9. User Segments and Store Views

The store is one marketplace, but every user sees a relevant view.

### 9.1 Male salon owner

Visible sections:

- male barbershop setup
- barber chairs
- mirrors and workstations
- professional machines
- scissors and blades
- razors
- sterilization and consumables
- towels and capes
- wholesale offers

### 9.2 Barber staff

Visible sections:

- professional machines
- scissors
- razors and blades
- combs and brushes
- personal barber tools
- beard/hair professional products

Not primary:

- chairs
- large mirrors
- full salon setup packages
- reception furniture

### 9.3 Women salon owner

Visible sections:

- women salon setup
- women hair tools
- dyes and treatments
- styling/drying devices
- hair-washing chairs
- professional hair-care products
- sterilization and consumables
- professional cosmetics

### 9.4 Nail studio

Visible sections:

- nail tools
- gel and polish
- UV/LED devices
- nail tables
- sterilization
- precision tools
- nail studio consumables

### 9.5 Beauty center

Visible sections:

- professional cosmetics
- makeup tools
- skincare products
- beauty devices
- sterilization
- consumables
- room setup products

### 9.6 Customer App user, future phase

Visible sections:

- hair care
- beard care
- skincare
- personal tools
- post-booking product suggestions
- gifts

Customer App integration is not part of the first implementation.

---

## 10. Product Visibility Model

Category alone is not enough. Every product must have visibility metadata.

Suggested metadata fields:

```txt
target_audience:
- customer
- barber_staff
- salon_owner
- professional_buyer
- all

business_type_tags:
- men_barbershop
- women_salon
- nail_studio
- beauty_center
- spa
- all

product_use_case:
- personal_tool
- salon_equipment
- consumable
- furniture
- professional_cosmetic
- setup_package
- wholesale

visible_in:
- web_store
- barber_app
- customer_app
- all

purchase_mode:
- retail
- b2b
- wholesale
- quote_request
```

### Product is visible in Barber App if:

```txt
1. status = active
2. visible_in includes barber_app or all
3. target_audience matches the user role/segment
4. business_type_tags matches the salon business type
5. product is in stock or supports preorder
6. supplier/merchant is approved
```

---

## 11. Dynamic Layout Model

The app must not hardcode store sections or product lists.

The app should call:

```txt
GET /store-integration/barber/home
```

The backend returns dynamic layout data:

```json
{
  "layoutVersion": 1,
  "audience": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop",
  "banners": [],
  "categories": [],
  "sections": [
    {
      "type": "product_carousel",
      "title": "Special offers for salon owners",
      "products": []
    },
    {
      "type": "category_grid",
      "title": "Shop by category",
      "categories": []
    },
    {
      "type": "campaign_banner",
      "title": "Equip your salon",
      "campaignId": "..."
    }
  ]
}
```

### Required section types

Minimum supported section types:

```txt
hero_banner
campaign_banner
category_grid
product_carousel
product_grid
supplier_carousel
setup_package_grid
text_block
quick_filter_chips
```

### Product updates

New merchant products should appear automatically if:

- product status is active
- merchant is approved
- product is assigned to relevant audience
- product is visible in `barber_app` or `all`
- product matches business type rules

No app update should be required for normal product/category/campaign changes.

---

## 12. Native App UX

### Entry point

Add a strong dashboard card in the Barber App:

```txt
Equip your salon from DilMart Store
Original tools, special offers, and trusted suppliers.
[Open Barber Store]
```

### Suggested routes

```txt
apps/barber-app/app/(app)/store/index.tsx
apps/barber-app/app/(app)/store/category/[id].tsx
apps/barber-app/app/(app)/store/product/[id].tsx
apps/barber-app/app/(app)/store/cart.tsx
apps/barber-app/app/(app)/store/checkout.tsx
apps/barber-app/app/(app)/store/orders.tsx
```

### MVP screens

- Store Home Native
- Category List Native
- Product List Native
- Product Detail Native
- Add to Cart
- Checkout: native simple checkout or temporary internal WebView
- Orders: native list or minimal first version

### UX principle

The user must feel they are still inside the Barber App.

- use Barber App navigation
- use DilMart design system
- support RTL
- avoid external browser redirects
- do not require re-login
- preserve back navigation

---

## 13. API Contracts — DilMart Main Backend

Suggested module:

```txt
backend/src/modules/store-integration
```

Suggested endpoints:

```txt
POST /store-integration/session
GET  /store-integration/barber/home
GET  /store-integration/products
GET  /store-integration/products/:id
POST /store-integration/cart/items
GET  /store-integration/cart
POST /store-integration/checkout
GET  /store-integration/orders
```

### `POST /store-integration/session`

Creates a short-lived store session for the authenticated DilMart user.

Input: current DilMart JWT.  
Output:

```json
{
  "storeSessionToken": "signed-token",
  "expiresIn": 900,
  "segment": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop",
  "linkedProfileStatus": "ready"
}
```

### `GET /store-integration/barber/home`

Returns dynamic home layout for the current barber/salon segment.

Output:

```json
{
  "layoutVersion": 1,
  "segment": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop",
  "sections": []
}
```

---

## 14. API Contracts — Store Backend

Suggested endpoints:

```txt
POST /integrations/DilMart/session/exchange
GET  /marketplace/home
GET  /marketplace/products
GET  /marketplace/products/:id
POST /cart/items
GET  /cart
POST /checkout/preview
POST /checkout/submit
GET  /orders/me
```

Store Backend must support these context fields:

```txt
audience
segment
business_type
visible_in
source_app
DilMart_user_id
DilMart_barbershop_id
```

### `POST /integrations/DilMart/session/exchange`

Receives a signed session from DilMart Main Backend and returns a Store-side session/context.

Input:

```json
{
  "token": "signed-store-session"
}
```

Output:

```json
{
  "storeAccessToken": "store-token",
  "linkedProfileId": "uuid",
  "segment": "B2B_BARBER_OWNER",
  "businessType": "men_barbershop"
}
```

---

## 15. Environment Variables

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

Secrets must never be exposed to mobile apps or frontend clients.

---

## 16. Implementation Roadmap

### Phase 0 — Product and architecture freeze

- Approve B2B Barber First
- Approve Native Dynamic Store
- Approve Unified Identity
- Reject full DB merge for this phase
- Define business segments

### Phase 1 — Store segmentation metadata

- Add product audience fields
- Add business type tags
- Add `visible_in`
- Add purchase mode
- Update admin product form
- Update product search/filter logic

### Phase 2 — Backend integration

- Add `store-integration` module in DilMart Main Backend
- Add session exchange endpoint in Store Backend
- Add `store_linked_profiles`
- Implement signed short-lived session
- Implement dynamic home API

### Phase 3 — Barber App Native Store MVP

- Add dashboard entry card
- Add store routes
- Render dynamic home sections
- Render categories and product lists
- Render product detail
- Implement add-to-cart
- Use checkout WebView only if native checkout is not ready

### Phase 4 — Full native commerce

- Native cart
- Native checkout
- Order list
- Order detail/tracking
- Reorder
- Address from barbershop profile

### Phase 5 — Advanced B2B

- B2B pricing
- wholesale rules
- setup packages
- quote requests
- supplier campaigns
- role-based purchasing permissions

### Phase 6 — Customer App future phase

- Retail store in Customer App
- Post-booking recommendations
- AI personalization

---

## 17. Non-Goals for First Implementation

Do not implement in first phase:

- full DB merge
- external browser store flow
- full WebView store as the main UX
- separate Store login for Barber App users
- forcing every web buyer to register as a salon
- hardcoded products in the mobile app
- AI personalization
- Customer App store integration
- complex financing/payment terms

---

## 18. Acceptance Criteria

### Product acceptance

- Barber App users can open the store without leaving the app.
- No second login is required for Barber App users.
- Store home content is dynamically returned by backend.
- Male salon owners see male salon/barber business products.
- Women salon owners see women salon products.
- Nail studios see nail products.
- Barber staff see personal/professional tools, not full salon setup as primary content.
- New eligible products can appear without app update.
- Store Web remains available for public users.

### Technical acceptance

- No Store secret is exposed to mobile app.
- Session exchange uses signed short-lived tokens.
- Store orders persist in Store DB.
- DilMart Main DB is not polluted with Store product/order internals.
- Product visibility rules are backend-enforced, not just frontend-filtered.
- App does not hardcode campaigns or products.
- WebView is not used as the main store home if Native Home is implemented.

---

## 19. Final Direction

The final approved direction is:

```txt
Native Dynamic Segmented Store
+
Unified DilMart Identity
+
Separate Store Domain
+
B2B Barber First
```

Meaning:

```txt
The barber sees a professional store inside the Barber App.
The salon owner sees B2B equipment and salon setup offers.
The barber staff sees personal professional tools.
Women salons see women salon products.
Nail studios see nail products.
Beauty centers see beauty products.
Customers will later see personal-care retail products.
The public web store remains open to everyone.
```
