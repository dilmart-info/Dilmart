# DilMart Store Integration — Native App UX

## 1. UX Principle

The user must feel the Store is part of the Barber App.

Do not use an external browser as the primary experience.

## 2. Entry Points

### Dashboard card

```txt
Equip your salon from DilMart Store
Original tools, special offers, and trusted suppliers.
[Open Barber Store]
```

### Optional account/menu entry

```txt
DilMart Store
Professional tools and salon equipment
```

## 3. Suggested Routes

```txt
apps/barber-app/app/(app)/store/index.tsx
apps/barber-app/app/(app)/store/category/[id].tsx
apps/barber-app/app/(app)/store/product/[id].tsx
apps/barber-app/app/(app)/store/cart.tsx
apps/barber-app/app/(app)/store/checkout.tsx
apps/barber-app/app/(app)/store/orders.tsx
apps/barber-app/app/(app)/store/orders/[id].tsx
```

## 4. Store Home Screen

The Store Home must render dynamic sections returned by backend.

Possible sections:

```txt
- hero banners
- shop by category
- special offers for salon owners
- full salon setup packages
- professional machines
- scissors and blades
- sterilization and consumables
- newly added products
- most ordered by barbers
- trusted suppliers
- wholesale offers
```

The list changes by segment and business type.

## 5. Product List Screen

Required features:

- category title
- product grid/list
- search
- filters
- sort
- loading state
- empty state
- error state
- pagination/infinite scroll

## 6. Product Detail Screen

Required fields:

- product image gallery
- title
- price
- currency
- badges
- merchant/supplier
- availability
- description
- specifications
- warranty/original product indicator when available
- quantity selector
- add to cart
- request quote when `purchase_mode = quote_request`

## 7. Cart Screen

Must support:

- item quantity update
- remove item
- subtotal
- delivery estimate if available
- checkout CTA

## 8. Checkout Screen

MVP options:

### Preferred

Native checkout.

### Temporary fallback

Internal WebView checkout only, not external browser.

Rules:

- preserve app navigation
- no separate login
- pass store session securely
- return to app after success/failure

## 9. Orders Screen

Minimum:

- order list
- status
- date
- total
- basic detail screen

Later:

- delivery tracking
- reorder
- support/contact supplier

## 10. WebView Policy

Allowed:

- temporary checkout
- unsupported fallback
- emergency fallback

Not allowed:

- primary store home
- external browser redirect
- second login flow

## 11. RTL and Design

The store must follow DilMart Barber App design and RTL behavior.

- Arabic-first UI
- same spacing/typography style
- app-native navigation
- consistent empty/loading/error states
