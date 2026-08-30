# DilMart Store Integration — Implementation Roadmap

## Phase 0 — Decision Freeze

Confirm:

- B2B Barber First
- Native Dynamic Store inside Barber App
- Unified DilMart Identity
- Separate Store Domain
- No full DB merge now
- WebView only as fallback/temporary checkout

## Phase 1 — Store Segmentation Foundation

Store Backend / Store Admin:

- add product visibility metadata
- add audience fields
- add business type tags
- add visible_in
- add purchase_mode
- update product admin form
- update product search query to filter by segment/context

Deliverable:

```txt
Store products can be filtered by audience, business type, and channel.
```

## Phase 2 — Identity and Session Bridge

DilMart Main Backend:

- create `store-integration` module
- implement `POST /store-integration/session`
- resolve current user role, barbershop, business type, owner/staff status
- sign short-lived store session token

Store Backend:

- implement `POST /integrations/DilMart/session/exchange`
- validate signed token
- create/update linked profile
- return store context/session

Deliverable:

```txt
A Barber App user can open the Store without separate login.
```

## Phase 3 — Dynamic Barber Store Home

Store Backend:

- implement dynamic home response for barber app
- return banners, categories, and sections by segment/business type

DilMart Main Backend:

- proxy/compose `GET /store-integration/barber/home`

Barber App:

- render dynamic sections
- add dashboard entry card

Deliverable:

```txt
Barber App renders native store home with dynamic content.
```

## Phase 4 — Product Browsing

Barber App:

- product list
- category detail
- product detail
- search
- filters

Backends:

- implement visible product listing
- enforce visibility on product details

Deliverable:

```txt
Users can browse products relevant to their role/business type.
```

## Phase 5 — Cart and Checkout MVP

Option A preferred:

- native cart
- native checkout

Option B temporary:

- native cart
- internal WebView checkout

Deliverable:

```txt
User can complete an order without external browser and without second login.
```

## Phase 6 — Orders

Barber App:

- order list
- order detail

Store Backend:

- return orders for linked profile/DilMart context

Deliverable:

```txt
User can view Store orders from Barber App.
```

## Phase 7 — Advanced B2B

- quote requests
- setup packages
- wholesale pricing
- verified salon offers
- supplier campaigns
- reorder
- role-based purchase permissions

## Phase 8 — Customer App Future

- retail customer store
- post-booking recommendations
- AI personalization
