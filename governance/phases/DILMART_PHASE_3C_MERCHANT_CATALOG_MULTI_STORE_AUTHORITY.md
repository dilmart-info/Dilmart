# PHASE 3C: Merchant Catalog Multi-Store Authority & Operations

## Identity

- **Task ID:** `DILMART-PHASE-3C-MERCHANT-CATALOG-MULTI-STORE-AUTHORITY-001`
- **Branch:** `frontend/dilmart-merchant-catalog-operations`
- **Target Base:** `main` (`c4851b8477dfffe8884ec85e9b04d5c16447e066`)
- **Status:** `IMPLEMENTATION_COMPLETE`

## Problem & Defect Summary

Prior to this phase, merchant catalog reads correctly respected the selected active store, but several catalog mutation paths omitted an explicit `merchant_id` parameter:
1. Product Quick Add
2. Bulk product actions (activate, deactivate, update stock, change category, adjust price, archive)
3. Product duplicate
4. Merchant CSV import preview
5. Merchant CSV import confirmation

Because the backend previously resolved merchant scope using an unspecified membership (`resolveMerchantScope(undefined, ...)`), multi-store merchants could inadvertently apply mutations (or CSV import jobs) to an unintended store rather than the one currently selected in the UI.

Additionally, `src/lib/scoped-queries.ts` contained an unsafe `.catch` fallback that retried rejected merchant product queries without `merchant_id`.

## Implemented Architecture & Contracts

### 1. Backend Mutation DTOs & Validation
- Added validated DTOs in `backend/src/modules/products/products.dto.ts`:
  - `MerchantProductImportPreviewDto`: enforces `@IsUUID("4") merchant_id` in multipart requests.
  - `MerchantProductImportConfirmDto`: enforces `@IsUUID("4") import_id` and `@IsUUID("4") merchant_id`.
  - `MerchantBulkActionDto`: enforces `@IsUUID("4") merchant_id`, `@IsUUID("4", { each: true }) product_ids`, `@IsIn(...) action`, and optional `payload`.
  - `MerchantQuickAddProductDto`: enforces `@IsUUID("4") merchant_id`, `name`, `category_id`, `price`, etc.
  - `MerchantProductDuplicateDto`: enforces `@IsUUID("4") merchant_id`.
- Controllers in `backend/src/modules/products/merchant-products.controller.ts` validate incoming requests and pass `merchant_id` to services.

### 2. Service Scope Resolution & Multi-Store Isolation
- In `ProductsService` and `ProductImportService`:
  - `resolveMerchantForActor` / `resolveMerchantForMerchantActor` require `requestedMerchantId` for merchant mutations.
  - Calls `ScopeResolverService.resolveMerchantScope(requestedMerchantId, actorRole, actorId)`.
  - Validates that the resolved merchant ID equals the requested merchant ID and is in `active` status.
  - Fails with HTTP 400 for missing/invalid merchant IDs.
  - Fails with HTTP 403 for merchant IDs outside the actor's memberships or inactive merchants.
  - Duplicate product operations strictly require the source product to belong to the requested merchant scope.
  - Import confirmation strictly requires the import session to match the requested merchant ID.

### 3. Frontend Multi-Store Authority & Fail-Closed Scoping
- In `src/lib/api/merchant.ts`:
  - Updated all catalog mutation endpoints to require and transmit `merchant_id`.
  - CSV preview appends `merchant_id` to `FormData`.
  - CSV confirm, bulk actions, quick add, and duplicate send `merchant_id` in the request body.
- In `src/lib/scoped-queries.ts`:
  - Removed retry fallback on error; scoped merchant queries now fail closed immediately.
- In `src/components/scoped/ProductsPage.tsx`:
  - Watches active `context.merchantId` and resets selected product IDs, bulk action inputs, and quick-add modals on store switch.
- In `src/pages/merchant/ProductImport.tsx`:
  - Tracks `previewMerchantId`.
  - Clears file, preview, and results on active store switch.
  - Allows CSV confirmation only when `previewMerchantId === activeMerchantId`.
  - Ignores async preview/confirm responses if the active store changed while in flight.

### 4. Role Authority Gating
- Reusable helper `canMerchantManageCatalog(role)` in `src/lib/merchant-role-authority.ts`:
  - `owner`, `merchant_owner`, `manager`, `merchant_manager`: Full catalog management permissions.
  - `staff`, `merchant_staff`: Read-only catalog permissions.
  - `null`, `undefined`, unknown roles: Fail closed (read-only).
- Frontend UI guards:
  - For staff users, hides/disables Add Product, CSV Import, Quick Add, Bulk Actions, table selection checkboxes, Edit buttons, and Status toggles, rendering "عرض فقط".
  - `ProductForm.tsx` and `ProductImport.tsx` display a read-only notification banner and disable submit/import buttons.
- Backend `@Roles("merchant_owner", "merchant_manager")` guard enforces authoritative protection.

## Verification & Invariant Proof

1. **Backend Unit & Invariant Tests:**
   - `backend/tests/merchant-catalog-multi-store-authority.test.mjs` (5 tests PASS):
     - Quick Add targets Store B when requested.
     - Bulk Actions target Store B and reject Store A products.
     - Duplicate duplicates inside Store B and rejects cross-store duplication.
     - Unauthorized store mutations fail with HTTP 403.
     - CSV import preview and confirm bind strictly to the requested store and reject cross-store confirmation.
   - `backend/tests/product-readiness-invariant.test.mjs` (PASS)
   - `backend/tests/product-publication-activation-sync.test.mjs` (PASS)
   - `backend/tests/product-duplicate-generated-column-compat.test.mjs` (PASS)
   - `backend/tests/product-import-safety.test.mjs` (PASS)
2. **Frontend Vitest Suite:**
   - 96 test files (885 tests) PASS.
3. **Static Governance & Architecture Guards:**
   - `npm run test:ci-guards` (99 tests PASS)
   - `npm run arch:guard` (PASS)
   - `npm run auth:guard` (PASS)
   - `npm run native:assets:check` (PASS)
   - `npm run build:mobile` (PASS)
   - `npm run mobile:boundary` (PASS)
   - `npx eslint` (0 errors, 0 warnings)
   - Frontend and Backend production builds compile with exit code 0.
