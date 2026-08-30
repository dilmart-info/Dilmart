# Design & Audit: Centralized Merchant Scope Resolver (R2)

**Date:** 2026-07-01  
**Phase:** Phase R2 — Centralized Merchant Scope Resolver & Authorization Cleanup  
**Status:** Completed Audit

---

## 1. Context & Current Duplication

Currently, the security-hardened `resolveMerchantScope` logic introduced in Phase R1 is duplicated across six NestJS service modules. While this resolved the immediate security requirements, maintaining separate copies of this critical logic in six services creates technical debt and overhead.

### Current Duplicate Locations:

1. `backend/src/modules/products/products.service.ts` (L51-62)
2. `backend/src/modules/orders/orders.service.ts` (L52-63)
3. `backend/src/modules/merchants/merchants.service.ts` (L97-108)
4. `backend/src/modules/inventory/inventory.service.ts` (L17-28)
5. `backend/src/modules/coupons/coupons.service.ts` (L17-28)
6. `backend/src/modules/admin/admin.service.ts` (L148-159)

---

## 2. Proposed Centralization Strategy

### 2.1. Shared Resolver Location:

We will add the centralized `resolveMerchantScope` method inside the existing `ScopeResolverService` ([scope-resolver.service.ts](file:///e:/Project/DilMart-Store/backend/src/modules/scope-resolver/scope-resolver.service.ts)).

### 2.2. Centralized Logic:

The signature and implementation will mirror the logic validated in Phase R1:

```typescript
  async resolveMerchantScope(
    requestedMerchantId: string | undefined,
    actorRole?: string,
    actorId?: string,
  ): Promise<string | undefined> {
    if (actorRole === "super_admin" || actorRole === "admin") {
      return requestedMerchantId;
    }
    if (actorRole !== "merchant_owner" && actorRole !== "merchant_manager" && actorRole !== "merchant_staff") {
      throw new ForbiddenException("Merchant scope resolution is not permitted for this role.");
    }
    if (!actorId) {
      throw new ForbiddenException("Missing actor identity for merchant scope.");
    }

    let req = this.supabaseAdmin.client
      .from("merchant_users")
      .select("merchant_id")
      .eq("user_id", actorId);

    if (requestedMerchantId) {
      req = req.eq("merchant_id", requestedMerchantId);
    }

    const { data, error } = await req.limit(1).maybeSingle();
    if (error) throw error;
    if (!data?.merchant_id) {
      throw new ForbiddenException("Merchant scope is not allowed for this actor.");
    }

    return data.merchant_id as string;
  }
```

---

## 3. Services and Modules to Modify

### 3.1. Injecting ScopeResolverService:

The following services must inject `ScopeResolverService` in their constructor:

- `ProductsService` (currently does not inject it; must also import `ScopeResolverModule` in `ProductsModule`)
- `MerchantsService` (currently does not inject it; must also import `ScopeResolverModule` in `MerchantsModule`)
- `InventoryService` (currently does not inject it; must also import `ScopeResolverModule` in `InventoryModule`)
- `CouponsService` (currently does not inject it; must also import `ScopeResolverModule` in `CouponsModule`)
- `AdminService` (currently does not inject it; must also import `ScopeResolverModule` in `AdminModule`)
- `OrdersService` (already injects `ScopeResolverService`; no module import changes needed)

---

## 4. Behavior Parity Matrix (R1 vs R2)

We must ensure that the centralized helper preserves all access control rules exactly as they were in Phase R1:

| Case / Scenario                      | Phase R1 Behavior                                                            | Proposed Phase R2 Behavior                                                   | Status            |
| ------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------- |
| **Customer / `customer` role**       | Throws `ForbiddenException("Merchant scope resolution is not permitted...")` | Throws `ForbiddenException("Merchant scope resolution is not permitted...")` | Parity Maintained |
| **Agent / `agent` role**             | Throws `ForbiddenException`                                                  | Throws `ForbiddenException`                                                  | Parity Maintained |
| **Guest / `guest` / undefined role** | Throws `ForbiddenException`                                                  | Throws `ForbiddenException`                                                  | Parity Maintained |
| **Admin / `admin` / `super_admin`**  | Permitted (returns requested target or `undefined` for global list)          | Permitted (returns requested target or `undefined` for global list)          | Parity Maintained |
| **Authorized Merchant Member**       | Permitted (returns member's active merchant ID)                              | Permitted (returns member's active merchant ID)                              | Parity Maintained |
| **Unauthorized Merchant Member**     | Throws `ForbiddenException("Merchant scope is not allowed...")`              | Throws `ForbiddenException("Merchant scope is not allowed...")`              | Parity Maintained |
| **Missing Actor ID for Merchant**    | Throws `ForbiddenException("Missing actor identity...")`                     | Throws `ForbiddenException("Missing actor identity...")`                     | Parity Maintained |

---

## 5. Risk Assessment & Rollback Plan

### 5.1. Risks:

- **Circular Dependencies**: Importing `ScopeResolverModule` in other modules. Since `ScopeResolverModule` only imports `SupabaseAdminModule`, there are zero circular dependency risks.
- **Typings/Imports Gaps**: Forgetting to import NestJS modules or declaring constructor injections incorrectly. This will be caught instantly during backend compilation (`npm run build`).

### 5.2. Rollback Plan:

If compilation or integration tests fail and cannot be cleanly resolved, we can discard all local workspace modifications using:

```bash
git checkout -- .
git clean -fd
```
