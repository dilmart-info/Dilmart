# DilMart Store Integration — Acceptance Criteria and QA

## 1. Product Acceptance Criteria

### Barber App integration

- User can open store from Barber App dashboard.
- Store opens inside the app, not external browser.
- User is not asked to login again.
- Store home uses native UI.
- Store content is dynamic from backend.
- Products are not hardcoded in mobile app.

### Segmentation

- Male salon owner sees male barbershop/salon-owner products.
- Women salon owner sees women salon products.
- Nail studio owner sees nail products.
- Beauty center owner sees beauty products.
- Barber staff sees personal professional tools, not full salon setup as primary content.
- General/public Store remains open for direct web buyers.

### Content freshness

- New eligible product appears in Barber App without app update.
- New eligible banner/campaign appears without app update.
- Hidden/inactive product does not appear.
- Unapproved merchant products do not appear.

## 2. Technical Acceptance Criteria

### Auth/session

- Store session is issued only by DilMart Main Backend.
- Store session is short-lived.
- Store integration secret is not available in mobile app.
- Store Backend validates the session signature and TTL.
- Store linked profile is created/updated correctly.

### Backend enforcement

- Product visibility is enforced by Store Backend.
- Direct product detail request for a hidden product is rejected or returns not found.
- Store orders remain in Store DB.
- DilMart Main DB does not duplicate product/order internals.

### App behavior

- App supports loading, empty, and error states.
- Back navigation works normally.
- RTL layout works.
- Checkout does not open external browser.
- If WebView checkout is used, it is internal and returns to app after completion.

## 3. QA Test Matrix

### User: male salon owner

Expected:

- sees salon setup, machines, chairs, mirrors, consumables
- can add B2B products to cart
- sees verified owner offers if configured

### User: barber staff

Expected:

- sees machines, scissors, razors, personal professional tools
- does not see full salon setup as primary homepage content

### User: women salon owner

Expected:

- sees women salon equipment and products
- does not primarily see male-only barber content

### User: nail studio owner

Expected:

- sees nail tools, gels, UV/LED, nail tables

### Product: active, visible_in = barber_app, audience = salon_owner

Expected:

- appears for matching salon owner
- does not appear for unrelated role/business type

### Product: inactive

Expected:

- does not appear anywhere

### Product: visible_in = web_store only

Expected:

- appears on web store
- does not appear in Barber App

### Product: merchant unapproved

Expected:

- does not appear in Barber App even if metadata matches

## 4. Launch Blockers

Do not launch if:

- Barber App opens external browser as the main store flow
- products are hardcoded in app
- user must login again inside store
- Store Backend does not enforce visibility
- Store integration secret is exposed to frontend/mobile
- inactive or unapproved products appear

## 5. Launch-Ready Definition

Ready for first release when:

```txt
A verified Barber App salon owner can open a native store home, see relevant dynamic B2B products, view product details, add to cart, and complete checkout through native or internal WebView checkout without leaving the app or logging in again.
```
