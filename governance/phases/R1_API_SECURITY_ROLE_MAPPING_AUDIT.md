# API Security & Role Mapping Audit (R1)

**Date:** 2026-06-30  
**Phase:** Phase R1 — API Security & Role Mapping Hardening  
**Status:** Completed Audit

---

## Executive Summary

This audit reviews the NestJS backend authorization layer, role mapping, merchant scope validation, and customer self-access boundaries for the **DilMart-Store** repository. The objective is to identify potential security gaps, role-escalation paths, or scoping bypasses, and outline small, targeted code improvements to harden the API.

---

## 1. Threat Model & Role Matrix

The platform defines the following actor roles and access boundaries:

| Role                         | Scope              | Access Boundaries                                                                                     |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------- |
| `super_admin` / `admin`      | Global / Platform  | Can view all merchants, orders, products, finances, and perform overriding operational actions.       |
| `merchant_owner`             | Merchant Specific  | Full control over products, coupons, inventory, and order operations _only_ for their owned merchant. |
| `merchant_manager`           | Merchant Specific  | Similar to `merchant_owner` but cannot assign new owners or change merchant onboarding status.        |
| `merchant_staff`             | Merchant Specific  | Read-only access to products, coupons, and orders. Cannot perform destructive mutations or updates.   |
| `agent`                      | Delivery Specific  | Can only view and update orders assigned specifically to them.                                        |
| `customer` / `authenticated` | Self Specific      | Can manage their own profile, addresses, and view their own order history.                            |
| `guest`                      | Public / Anonymous | Can view public product catalog and submit COD orders.                                                |

---

## 2. Core Authorization Audits

### 2.1. RolesGuard (`roles.guard.ts`)

- **Role Resolution**: Derives user roles by querying the `profiles` table in Supabase via a service-role client. If the database profile does not have a role, it falls back to JWT app/user metadata. This is secure because database-level role mapping acts as the single source of truth.
- **Optional Bearer Token Handling**: Supports optional authentication (e.g., guest checkouts) by permitting requests without tokens on `@Roles("authenticated")` endpoints unless it is the `/auth/context` path.
- **CORS & Project Ref Protection**: Verifies that the JWT issuer matches the backend's Supabase project ref, blocking cross-project token attacks.

### 2.2. ScopeResolverService (`scope-resolver.service.ts`)

- **Platform Scope Check**: Correctly restricts platform operations to `admin` and `super_admin`.
- **Self Scope Check**: Restricts access to target user resources (e.g., profiles, addresses) by asserting `resolved.actorId === targetUserId`.
- **Merchant Scope Check**:
  - Admins can query any merchant by passing the target ID.
  - Merchant roles are verified against the `merchant_users` membership table. If a merchant actor requests a `targetMerchantId` they are not a member of, it throws a `ForbiddenException`.

---

## 3. Scoped Services & Scoping Logic Audit

### 3.1. resolveMerchantScope Gaps (Defense-in-Depth Risk)

The following services define a private helper `resolveMerchantScope(requestedMerchantId, actorRole, actorId)` to validate and override scope requests:

- `OrdersService`
- `ProductsService`
- `MerchantsService`
- `InventoryService`
- `CouponsService`
- `AdminService`

#### The Issue:

In all these services, the helper checks:

```typescript
if (this.isAdminRole(actorRole)) return requestedMerchantId;
if (!this.isMerchantRole(actorRole)) return requestedMerchantId;
```

If the actor has a role other than admin or merchant (e.g., `customer`, `agent`, or `authenticated` guest), the function returns `requestedMerchantId` directly without performing any database validation.

While the controller endpoints are currently guarded by `@Roles("super_admin", "admin", "merchant_owner", "merchant_manager", "merchant_staff")`, this structure leaves a defense-in-depth vulnerability:

- If a new endpoint or refactor forgets to include the `@Roles` guard, or includes `@Roles("authenticated")`, a customer or agent could query or modify arbitrary merchant-scoped data simply by passing the `merchant_id` parameter.
- The scoping check should fail closed. If the actor is neither an admin nor a merchant role, it should throw a `ForbiddenException` immediately when trying to resolve merchant scope.

---

## 4. Hardening Recommendations (Targeted Fixes)

### 4.1. Resolve Merchant Scope Hardening

We will update `resolveMerchantScope` in all 6 affected services to fail closed:

```typescript
if (this.isAdminRole(actorRole)) return requestedMerchantId;
if (!this.isMerchantRole(actorRole)) {
  throw new ForbiddenException(
    "Merchant scope resolution is not permitted for this role.",
  );
}
```

This ensures that any non-admin / non-merchant role actor attempting to access merchant-scoped service logic is blocked, reinforcing API authority.

### 4.2. Audit Verification & Test Execution Results

#### Files Modified:

1. `backend/src/modules/products/products.service.ts` ([products.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/products/products.service.ts))
2. `backend/src/modules/orders/orders.service.ts` ([orders.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/orders/orders.service.ts))
3. `backend/src/modules/merchants/merchants.service.ts` ([merchants.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/merchants/merchants.service.ts))
4. `backend/src/modules/inventory/inventory.service.ts` ([inventory.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/inventory/inventory.service.ts))
5. `backend/src/modules/coupons/coupons.service.ts` ([coupons.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/coupons/coupons.service.ts))
6. `backend/src/modules/admin/admin.service.ts` ([admin.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/admin/admin.service.ts))

#### Tests Updated:

- `backend/tests/policy-matrix.test.mjs` ([policy-matrix.test.mjs](file:///e:/Project/DilMart-Store/backend/tests/policy-matrix.test.mjs)) — added explicit assertions inside the `scope-resolver matrix` loop to verify that:
  - `customer` role fails to resolve merchant scope (throws `ForbiddenException`).
  - `agent` role fails to resolve merchant scope (throws `ForbiddenException`).
  - `guest` or undefined role fails to resolve merchant scope (throws `ForbiddenException`).
  - `admin` and `super_admin` remain fully allowed to resolve arbitrary scopes.
  - Authorized merchant roles (e.g. `merchant_owner` on member merchants) remain allowed.

#### Verification Run Results:

- **Architecture Guard (`npm run arch:guard`)**: Passed with `0 violations`.
- **Backend Build (`npm run build` inside backend)**: Succeeded with zero compile errors.
- **Policy Matrix Integration Tests (`npm run test:policy`)**: All `18 / 18` tests passed.
- **Hardening Regression Tests (`npm run test:hardening`)**: All `39 / 39` tests passed.

---

## 5. Non-Interference Declaration

The changes made are strictly restricted to backend access control and scoping validation inside the six NestJS service modules. We explicitly confirm that:

- **NO** changes were made to Jenni delivery dispatch or delivery configurations.
- **NO** business logic changes were made to checkout pricing, coupons, loyalty points, or stock calculations.
- **NO** financial calculation or ledgers logic was touched.
- **NO** database migrations were introduced.
- **NO** frontend runtime code was modified.
- **NO** production config or environment variables were changed.
