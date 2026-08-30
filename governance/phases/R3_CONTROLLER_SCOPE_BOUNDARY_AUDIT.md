# Audit Report — Phase R3: Controller Scope Wiring & DTO Boundary Cleanup

**Date:** 2026-07-02  
**Phase:** Phase R3 — Controller Scope Wiring & DTO Boundary Cleanup  
**Status:** COMPLETE  

---

## 1. Executive Summary
The goal of this audit is to verify and ensure that no client-supplied actor metadata (such as `actor_role`, `actor_id`, `actorEmail`, or `actorPhone`) is trusted or directly utilized in any NestJS controller boundaries or DTOs. All actor identity and privilege context must be derived exclusively from trusted server-side sources (the `@CurrentActor()` / `@ActorContext()` decorator or authenticated request context).

### Phase R3 Key Results:
- **Audit Confirmed No Controller Runtime Fix Was Required**: A comprehensive analysis of all 9 target controllers and their related DTOs verified that the boundary is already clean. Actor parameters are derived exclusively from the trusted request context via the `@CurrentActor()` decorator or secure token verification. No controller trusts client-supplied actor metadata.
- **Added Explicit Anti-Spoofing Regression Tests**: Added HTTP-level integration tests inside `backend/tests/policy-matrix.test.mjs` verifying that query parameter or request body spoofing attempts do not elevate privileges, that merchant users cannot access foreign merchant scopes, and that customer self-routes do not depend on client-supplied IDs.
- **No Out-of-Scope Systems Changed**: Zero changes to Jenni integration, database migrations, checkout pricing, coupons, stock levels, or financial calculations.

---

## 2. Controller & DTO Audit Matrix

The following table summarizes the checked controllers, their endpoints, and how they handle actor metadata and scope:

| Controller | File | Endpoint(s) | Role / Scope Field(s) | Source of Truth | Status / Safety |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OrdersController** | `orders.controller.ts` | List, detail, updates, manual creation | `actor_role`, `actor_id` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **ProductsController** | `products.controller.ts` | CRUD, status updates | `actor_role`, `actor_id` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **MerchantProductsController** | `merchant-products.controller.ts` | Import, bulk actions, quick add | `actor_role`, `actor_id` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **MerchantsController** | `merchants.controller.ts` | Settings, dashboard stats, readiness | `actor_role`, `actor_id` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **InventoryController** | `inventory.controller.ts` | List, adjustments | `actor_role`, `actor_id` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **CouponsController** | `coupons.controller.ts` | List, upsert, delete | `actor_role`, `actor_id` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **AdminController** | `admin.controller.ts` | Customers, governance tasks, policies | `actor_role`, `actor_id` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **CustomerController** | `customer.controller.ts` | Profile, addresses, orders | `actorId` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |
| **ProfilesController** | `profiles.controller.ts` | Update profile | `ActorContext` | Trusted `@CurrentActor()` | **SAFE** (trusted override) |

---

## 3. Analysis & Findings

### DTO Boundaries
An inspection of all DTO classes (`orders.dto.ts`, `products.dto.ts`, `merchants.dto.ts`, `inventory.dto.ts`, `coupons.dto.ts`, `admin.dto.ts`, `customer.dto.ts`, `profiles.dto.ts`) confirms that **no DTO declares any client-bindable `actor_role`, `actor_role`, `actorRole`, `actorId`, or `actor_id` properties**.

Because NestJS `ValidationPipe` is instantiated globally with `whitelist: true` (in `main.ts`):
```typescript
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```
Any client request attempting to supply extra properties (e.g. `actor_role` or `actor_id` in a JSON request body) will have those properties stripped before the request reaches the controller handlers.

### Controller Level Explicit Overrides
Where controller endpoints forward payloads to NestJS services using spread operators or inline constructions, they explicitly overwrite the actor properties with the trusted metadata extracted from the `@CurrentActor()` parameter:

- **OrdersController.createManual**:
  ```typescript
  return this.ordersService.createManualOrder({ ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  ```
- **ProductsController.updateStatus**:
  ```typescript
  return this.productsService.updateProductStatus(id, { ...payload, actor_role: actor?.actorRole, actor_id: actor?.actorId });
  ```

This ensures that even if `ValidationPipe` is bypassed or not used for specific inline types, the trusted server-side properties take absolute precedence and overwrite client input.

---

## 4. Behavior Parity & Regression Verification
No business logic or API routing behaviors are altered during this phase. Parity is maintained at 100%.

Dedicated integration tests were added in `backend/tests/policy-matrix.test.mjs` verifying that:
1. Query parameters attempting to spoof `actor_role` or `actor_id` do not elevate privileges.
2. Body properties attempting to spoof `actor_role` or `actor_id` are completely ignored or stripped by `ValidationPipe`.
3. Merchant users cannot query other merchants via `merchant_id` parameter.
4. Admins can successfully query scoped merchant values where supported.
5. Customer profile actions securely resolve to the token user ID, ignoring client query parameter spoofs.

---

## 5. Risk Assessment & Rollback Plan

### Risks
- **Low Risk**: Since no business logic or runtime code is changed, the risk of breaking existing features is extremely low.

### Rollback Plan
If any issues arise, a standard git rollback can be executed on the feature branch:
```bash
git checkout main
git branch -D hardening/controller-scope-boundary-r3
```
