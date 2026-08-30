# Marketplace Refactor Plan (Incremental)

## Current Single-Merchant Assumptions

- `products`, `orders`, and `order_items` are globally scoped (no merchant ownership).
- `profiles.role` currently models only platform-level roles (`admin`, `customer`, `agent`).
- Cart/checkout does not enforce merchant boundary.
- Admin routes/pages are global store operations, not split between platform admin and merchant users.
- Storefront product queries are global and do not isolate per merchant.

## Target Marketplace Architecture

- Introduce merchant domain:
  - `merchants`
  - `merchant_users`
  - `merchant_settings`
- Add `merchant_id` to commerce entities:
  - `products`
  - `orders`
  - `order_items`
  - `coupons` (nullable for platform-wide compatibility)
- Extend role system for marketplace actors:
  - `super_admin`, `admin`, `customer`, `agent`
  - `merchant_owner`, `merchant_manager`, `merchant_staff`

## Compatibility Rules (Non-Breaking)

- Keep existing storefront routes and checkout flow operational.
- Backfill all existing records to a default merchant (`DilMart-primary`).
- Keep categories platform-level in v1.
- Keep one-merchant-per-cart in v1 to avoid multi-merchant checkout complexity.
- Keep platform admin pages functional while adding merchant portal routes.

## Rollout Strategy

1. **Phase 0 (this document)**  
   Define guardrails and compatibility policy.
2. **Phase 1 (DB foundation)**  
   Add merchant tables + merchant references in commerce entities + backfill default merchant.
3. **Phase 2 (RLS updates)**  
   Add merchant-aware access isolation while preserving admin capability.
4. **Phase 3 (Data access helpers)**  
   Add merchant-aware query helpers for storefront and portal.
5. **Phase 4 (Admin split)**  
   Keep `/admin/*` as platform admin; add `/merchant/*` portal.
6. **Phase 5 (Storefront merchant-awareness)**  
   Scope product fetches by active merchant and enforce single-merchant cart.
7. **Phase 6 (Merchant management UI)**  
   Platform pages to create/suspend merchants and assign merchant users.
8. **Phase 7 (Data migration safety)**  
   Ensure legacy rows remain valid through backfill.
9. **Phase 8 (assumption cleanup)**  
   Remove remaining global-store assumptions gradually.

## Temporarily Single-Merchant in V1

- Public storefront branding remains single branded experience.
- Cart supports one merchant at a time (explicit guard).
- Platform-level categories remain shared.

## Risks and Controls

- **RLS lockout risk**: add helper functions and permissive admin path first.
- **Legacy data risk**: enforce backfill before `NOT NULL` constraints.
- **Checkout regression risk**: preserve existing `place_order` signature and add optional merchant parameter.
