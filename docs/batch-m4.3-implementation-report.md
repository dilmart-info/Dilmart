# Batch M4.3 — Conversion Funnel Visibility Implementation Report

## Status

**Completed (Baseline)**

Scope implemented: baseline funnel instrumentation and merchant cockpit visibility for recent conversion stages.

---

## 1) Implemented Funnel Stages

Added/activated event stages:

- `product.viewed` (existing)
- `cart.added` (new)
- `checkout.previewed` (new baseline trigger)
- `checkout.submitted` (new baseline trigger)

---

## 2) Code Changes

## A) Growth Hooks Contract

File:

- `src/lib/growth-hooks.ts`

Updates:

- extended `GrowthHookEventName` with:
  - `cart.added`
  - `checkout.previewed`
  - `checkout.submitted`
- added helper:
  - `getGrowthHookFunnelSummary({ merchantId?, windowDays? })`
  - computes stage counts + conversion rates for a rolling window

## B) Add-to-Cart Instrumentation

File:

- `src/lib/cart-store.ts`

Update:

- emit `cart.added` event when item is added to cart (includes `productId`, `merchantId`, `sourceSurface`).

## C) Checkout Stage Instrumentation

File:

- `src/pages/Checkout.tsx`

Updates:

- emit `checkout.previewed` before checkout submit request
- emit `checkout.submitted` after successful order submission

## D) Merchant Funnel Visibility

File:

- `src/pages/merchant/Overview.tsx`

Updates:

- added “Funnel التحويل (آخر 7 أيام)” card
- displays stage counts:
  - views
  - add to cart
  - checkout start
  - checkout submit
- displays conversion rates:
  - view->cart
  - cart->checkout
  - checkout->submit

---

## 3) Validation

- Lint checks executed for touched files.
- No new lint errors introduced.

---

## 4) Limitations (Current Baseline)

- Funnel summary is computed from local growth-hook event log (browser-local baseline).
- Cross-device/session unified analytics pipeline is out of M4.3 baseline scope.

---

## 5) Completion Verdict

**M4.3 baseline is implemented and visible.**

The system now exposes practical conversion funnel signals for merchant operations with minimal implementation overhead.
