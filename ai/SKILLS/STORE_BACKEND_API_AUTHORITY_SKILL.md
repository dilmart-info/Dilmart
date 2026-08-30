# Skill: Backend API Authority — DilMart-Store

## Mission

Ensure backend API remains the authority for all marketplace business flows.

## Invariants

- Frontend must not directly write business-critical Supabase tables.
- Frontend must not calculate final prices, stock truth, merchant truth, or finance truth.
- Backend must validate actor role and scope.
- Merchant scope is server-authoritative.
- Customer identity is token/session-authoritative, not body-authoritative.

## Dangerous Frontend Patterns

```ts
supabase.from("orders");
supabase.from("merchants");
supabase.from("merchant_users");
supabase.from("desktop_quick_links").insert /
  update /
  delete supabase.rpc("place_order");
supabase.rpc("validate_coupon");
supabase.rpc("redeem_points");
```

These require architecture review unless explicitly allow-listed as safe read-only/auth/storage.

## Backend Contract Pattern

For each business flow:

1. Controller endpoint.
2. DTO validation.
3. Actor extraction from auth guard.
4. Server-side scope resolution.
5. Service business logic.
6. Repository/Supabase access.
7. Stable response shape.
8. Tests or smoke validation.

## Required Review Questions

- Does this endpoint trust `merchant_id` from frontend?
- Does it trust `user_id` from frontend?
- Does it trust totals/price/discount from frontend?
- Can a merchant access another merchant's data?
- Can unauthenticated users reach admin/merchant data?
- Does this need an audit log?

## Output Required

```md
# Backend Authority Review

## Flow

...

## Actor Source

Token / session / body / unknown

## Scope Source

Server / client / mixed / unknown

## Findings

- ...

## Required Fixes

- ...

## Verdict

PASS / PASS WITH NOTES / FAIL
```
