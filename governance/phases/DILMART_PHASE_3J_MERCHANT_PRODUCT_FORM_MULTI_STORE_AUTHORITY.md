# Phase 3J: Merchant Product Create/Edit Form Multi-Store Mutation Authority

## Phase Identity

```text
Phase Name: DILMART-PHASE-3J-MERCHANT-PRODUCT-FORM-MULTI-STORE-AUTHORITY-001
Branch: frontend/dilmart-merchant-product-form-authority
Base SHA: e8c5152118a21aebcdad8fbb4d49e2ed23611c05
PR: (Pending Draft PR)
Status: IMPLEMENTATION_TESTS_PASS_DRAFT_PR_PREPARATION
```

---

## 1. Executive Summary

Phase 3J secures the product creation and editing surface for merchants (`/merchant/products/new` and `/merchant/products/:id/edit`), closing the mutation authority loop across the merchant backoffice.

Prior to Phase 3J:
1. The merchant routes for new/edit product pointed directly to `AdminProductForm`, where merchant scope could be vulnerable to cross-store IDOR or stale store context if the merchant user switched stores.
2. In the backend, `products.controller.ts` routes (`@Get(":id")`, `@Post(":id")`, `@Post(":id/status")`) lacked strict UUID validation.
3. In `products.service.ts`, `createProduct` and `updateProduct` allowed implicit fallback or did not fail closed if `merchant_id` was omitted or mismatched by a merchant actor.
4. `merchant_staff` role separation was incomplete: a staff user could technically attempt product mutations if the UI did not enforce strict read-only states or backend did not fail closed on staff role.
5. Inactive/suspended merchant accounts were not strictly rejected with HTTP 403 on product creation and editing.

Phase 3J resolves these vulnerabilities through:
1. **Explicit Backend Product Authority:**
   - Enforces `ParseUUIDPipe({ version: "4" })` on all `:id` parameters in `products.controller.ts`.
   - In `products.service.ts`:
     - `getProductById`: For merchant roles, requires explicit `merchant_id`, verifies actor membership and active store status, scopes product lookup to `merchant_id`, and returns HTTP 403 Forbidden if not found in scope.
     - `createProduct`: Strictly rejects `merchant_staff` (HTTP 403 Forbidden), requires explicit `merchant_id` in payload, verifies actor membership and active store status, and injects authoritative `merchant_id`.
     - `updateProduct`: Strictly rejects `merchant_staff` (HTTP 403 Forbidden), requires explicit `merchant_id`, verifies actor membership and active store status, verifies product belongs to merchant (IDOR protection, returning HTTP 403 Forbidden if mismatched), and preserves backward compatibility returning `{ ok: true }`.
     - `updateProductStatus`: Strictly rejects `merchant_staff` (HTTP 403 Forbidden) and asserts active store authority.
2. **Frontend Keyed Workspace Wrapper:**
   - Introduces `src/pages/merchant/ProductForm.tsx` wrapping `AdminProductForm` with `key={`${merchantId}-${id || "new"}`}`.
   - Store switching triggers an instantaneous full component remount, completely resetting dirty form state and preventing cross-store state bleed.
   - Renders truthful loading skeleton and fail-closed empty/unauthorized banner when no active merchant is bound.
3. **Frontend Authority & Read-Only Hardening:**
   - In `src/pages/admin/ProductForm.tsx`:
     - Hardens product query with queryKey scoped by `merchantIdFromMembership`.
     - Asserts canonical response ownership: throws `UNAUTHORIZED_CROSS_STORE_PRODUCT` and displays fail-closed error card if product belongs to another store.
     - Disables inputs, buttons, and image uploaders via `<fieldset disabled={!canManageCatalog}>` for `merchant_staff`.
     - Guards async image uploads and submissions against race conditions using `activeMerchantRef`.
4. **Zero Out-of-Scope Alterations:**
   - No DB migrations or live mutations.
   - Preserves general admin/platform capabilities.
   - Products list, product import, and order details remain untouched.

---

## 2. Boundaries & Non-Negotiable Constraints

- **No DB Migrations:** 0 migrations created or applied.
- **No Live DB Operations:** 0 live mutations.
- **No Deployment:** Production deploy deferred until post-merge governance closure.
- **Minimal Form Changes:** Kept existing form structure; only added authority, read-only, and error states.

---

## 3. Files Modified & Created

### Backend
- `backend/src/modules/products/products.controller.ts`
  - Added `ParseUUIDPipe({ version: "4" })` on `:id` parameter for `@Get(":id")`, `@Post(":id")`, and `@Post(":id/status")`.
- `backend/src/modules/products/products.service.ts`
  - Implemented multi-store checks in `getProductById`, `createProduct`, `updateProduct`, and `updateProductStatus`.
- `backend/tests/merchant-product-form-multi-store-authority.test.mjs`
  - 19 discrete tests covering unit + real NestJS HTTP boundary with `ParseUUIDPipe` and roles guard.

### Frontend
- `src/pages/merchant/ProductForm.tsx`
  - Keyed workspace wrapper with loading skeleton and unauthorized empty banner.
- `src/app/WebBackofficeRoutes.tsx`
  - Switched `/merchant/products/new` and `/merchant/products/:id/edit` to use `MerchantProductForm`.
- `src/pages/admin/ProductForm.tsx`
  - Scoped queryKey, canonical ownership assertion, staff read-only fieldset, async race guards.
- `src/pages/merchant/ProductForm.test.tsx`
  - 6 unit tests validating skeleton, empty state, staff read-only, IDOR fail-closed, and edit loading.

---

## 4. Verification Suites

- `node backend/tests/merchant-product-form-multi-store-authority.test.mjs` (19/19 passed)
- `npm --prefix backend test` (292/292 passed)
- `npx vitest run src/pages/merchant/ProductForm.test.tsx` (6/6 passed)
