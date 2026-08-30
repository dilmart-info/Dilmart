# Marketplace Hardening Report

## Scope

This phase closes residual safety gaps after the marketplace foundation rollout, with emphasis on authorization consistency, merchant isolation, and checkout integrity.

## Hardened Invariants

- **Single-merchant cart is enforced centrally** in `cart-store` (add/update/remove/hydration and explicit integrity checks).
- **Checkout revalidates cart integrity** before coupon validation and before order submission.
- **Coupon validation is merchant-aware** through `validate_coupon(..., p_merchant_id)` with backward-compatible defaults.
- **Order creation is DB-enforced** by hardening `place_order` and adding trigger-based merchant consistency checks on `order_items`.
- **Storefront queries fail-closed** when storefront merchant context is unavailable (no silent global catalog fallback).
- **Authz checks are centralized** in reusable helpers and route guards for platform admin, merchant users, and agents.
- **Merchant/admin surface split is safer** by guarding admin routes centrally and removing merchant links that navigated into platform-admin pages.
- **Current merchant resolution is stricter** (active merchant memberships only).

## Risks Closed

- Cross-merchant cart drift from stale local storage or edge mutation paths.
- Cross-merchant item injection in single order payloads.
- Merchant-foreign coupon usage.
- Scattered role checks causing inconsistent route behavior.
- Merchant users reaching legacy platform admin surfaces via direct links.

## Intentionally Deferred

- Multi-merchant checkout in one order (still out of scope by design).
- Commission/payout/subscription engines (non-goal for this phase).
- Full refactor of all legacy admin pages into merchant-shared components.

## Single-Merchant Compatibility (By Design)

- Storefront still resolves to a default active merchant (`DilMart-primary`) for current production UX.
- Merchant scope is now explicit and enforced while preserving one-store behavior.

## Follow-up (Out of Scope)

- Regenerate Supabase TypeScript types after applying hardening migration.
- Add end-to-end tests for cart integrity, coupon scoping, and guarded routes.
