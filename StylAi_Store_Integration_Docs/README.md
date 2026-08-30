# DilMart Store Integration Documentation Pack

This documentation pack describes the agreed product and technical direction for integrating **DilMart Store** with the **DilMart Barber App** first, then with the Customer App later.

## Primary Decision

Build a **B2B Barber-first Native Dynamic Segmented Marketplace** inside the Barber App.

This means:

- The Barber App must not open the store as an external browser link.
- The primary in-app store experience should be native React Native screens.
- Store data remains owned by the Store Backend/DB.
- Identity comes from DilMart Main Auth.
- Product visibility is dynamic and segmented by user role, business type, audience, and channel.
- WebView may be used only as a temporary/fallback layer, mainly for checkout during early rollout.

## Files

1. [`00_MASTER_SPEC.md`](./00_MASTER_SPEC.md) — Complete reference spec covering product, architecture, UX, data, auth, API, rollout, and acceptance criteria.
2. [`01_PRODUCT_STRATEGY.md`](./01_PRODUCT_STRATEGY.md) — Product decisions, user segments, marketplace positioning.
3. [`02_ARCHITECTURE_AND_AUTH.md`](./02_ARCHITECTURE_AND_AUTH.md) — Unified identity, session exchange, linked profiles, DB separation decision.
4. [`03_PRODUCT_VISIBILITY_AND_SEGMENTATION.md`](./03_PRODUCT_VISIBILITY_AND_SEGMENTATION.md) — Audience rules, business type rules, product metadata, dynamic home layout.
5. [`04_API_CONTRACTS.md`](./04_API_CONTRACTS.md) — Suggested endpoint contracts for DilMart Main Backend and Store Backend.
6. [`05_NATIVE_APP_UX.md`](./05_NATIVE_APP_UX.md) — Barber App UX, routes, screen behavior, WebView fallback policy.
7. [`06_DATA_MODEL_AND_MIGRATIONS.md`](./06_DATA_MODEL_AND_MIGRATIONS.md) — Suggested schema additions and migration direction.
8. [`07_IMPLEMENTATION_ROADMAP.md`](./07_IMPLEMENTATION_ROADMAP.md) — Development phases and engineering sequence.
9. [`08_ACCEPTANCE_CRITERIA_AND_QA.md`](./08_ACCEPTANCE_CRITERIA_AND_QA.md) — QA scenarios and launch acceptance criteria.

## Developer Summary

Implement the store as a **native dynamic surface** inside the Barber App, powered by backend-driven layout and product visibility rules. Do not hardcode products, sections, campaigns, or category membership in the app. The app should render sections returned by the backend.

The expected final shape is:

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
