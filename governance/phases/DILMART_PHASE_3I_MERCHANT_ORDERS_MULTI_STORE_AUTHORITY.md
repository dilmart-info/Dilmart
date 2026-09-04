# Phase 3I: Merchant Orders List & Operational Multi-Store Authority

## Phase Identity

```text
Phase Name: DILMART-PHASE-3I-MERCHANT-ORDERS-MULTI-STORE-AUTHORITY-001
Branch: frontend/dilmart-merchant-orders-authority
Base SHA: 0c2ca589390c57412982ecd71f3c1302a7724075
Status: IMPLEMENTATION_COMPLETE_DRAFT_PR
```

---

## 1. Executive Summary

Phase 3I establishes explicit multi-store authority, canonical response wrapping, and strict customer PII privacy protection for the Merchant Orders List surface (`/merchants/:id/orders` and `src/pages/merchant/Orders.tsx`).

Prior to Phase 3I, the merchant orders page relied on legacy order endpoints that lacked explicit merchant-bound URL parameter routing, could silently risk fallback to an arbitrary store, and exposed order data structures containing sensitive customer PII (such as direct phone numbers and street addresses).

Phase 3I resolves these vulnerabilities through:
1. **Explicit Backend Route & Validation:** Introduces `GET /merchants/:id/orders` with `ParseUUIDPipe({ version: "4" })` and whitelisted `ListMerchantOrdersQueryDto`.
2. **Canonical Envelope Contract:** Strictly packages the orders response in `{ merchant_id, orders, total, limit, offset }`, guaranteeing the caller always receives verified store association and pagination metadata.
3. **Fail-Closed Store Membership Authority:** Strictly validates caller membership against the specified merchant. Any cross-store IDOR attempt, unauthenticated access, inactive store access, or customer role access is immediately rejected with HTTP 403 Forbidden.
4. **No First-Store Fallback:** Enforces explicit `merchant_id` requirement in the backend orders service (`OrdersService.listOrdersForMerchant`), throwing `ForbiddenException("Merchant id is required.")` if absent.
5. **Strict Customer PII Projection:** Proactively sanitizes the merchant orders list. Sensitive customer phone numbers and full street addresses are omitted from the list projection, returning only operational fields (order number, status, governorate, totals, items count, decision status).
6. **Frontend Keyed Workspace:** Refactors `src/pages/merchant/Orders.tsx` into `<MerchantOrdersWorkspace key={merchantId} merchantId={merchantId} />`, ensuring complete state unmount, instant filter reset, and zero cross-store data leakage upon switching active stores.
7. **Strict Fail-Closed Frontend Parser:** Validates `merchant_id` consistency, non-negative amounts and integers, and actively throws security violations if any forbidden customer PII is detected in the response.
8. **Truthful UI States:** Introduces dedicated loading skeleton, retryable error banner with exact failure message, and clean empty states.

---

## 2. Boundaries & Non-Negotiable Constraints

- **No DB Migrations:** Zero schema alterations.
- **No Live DB Mutations:** All operations use existing database schema and mock/testing boundaries.
- **No Deployments:** Deferral of production deployment until governance sign-off.
- **Draft PR Only:** PR opened in draft status without merging.
- **Order Details Out of Scope:** Order item mutation and deep order details (`/merchant/orders/:id`) remain sealed from Phase 3B.

---

## 3. Files Modified & Created

### Backend
- `backend/src/modules/merchants/merchants.dto.ts`
  - Added `ListMerchantOrdersQueryDto` validating `search`, `status`, `merchant_decision_status`, `page`, `limit`, `offset`, `date_from`, `date_to`.
- `backend/src/modules/merchants/merchants.controller.ts`
  - Added `@Get(":id/orders")` guarded by `ParseUUIDPipe({ version: "4" })`, `RolesGuard` (`super_admin`, `admin`, `merchant_owner`, `merchant_manager`, `merchant_staff`), and `ValidationPipe`.
- `backend/src/modules/merchants/merchants.service.ts`
  - Implemented `listMerchantOrders` verifying caller membership, store active status, PII scrubbing, and canonical envelope packaging.
- `backend/src/modules/orders/orders.service.ts`
  - Locked down `listOrdersForMerchant` to reject missing `merchant_id` with `ForbiddenException`.
- `backend/tests/merchant-orders-multi-store-authority.test.mjs`
  - Added 16 tests covering authorization, cross-store IDOR blockage, PII stripping, legacy fallback elimination, and real NestJS HTTP boundary verification.

### Frontend
- `src/lib/api/merchant.ts`
  - Added types `CanonicalMerchantOrderSummary`, `CanonicalMerchantOrdersResponse`, and method `listMerchantOrders`.
- `src/pages/merchant/Orders.tsx`
  - Implemented `<MerchantOrdersWorkspace key={merchantId} />`, `parseCanonicalOrdersResponse`, filter state management, loading skeleton, error retry, and safe presentation.
- `src/pages/merchant/Orders.test.tsx`
  - Added 16 tests covering API contracts, truthful states, cross-store switching isolation, late race condition immunity, and parser fail-closed guards.

### Governance
- `governance/CURRENT_PHASE.md`
- `governance/phases/DILMART_PHASE_3I_MERCHANT_ORDERS_MULTI_STORE_AUTHORITY.md`

---

## 4. Test Verification Results

### Backend Test Suite
```text
node backend/tests/merchant-orders-multi-store-authority.test.mjs
# tests 16
# pass 16
# fail 0
# duration_ms: ~326ms
```
- Subtest 1: Store A Owner retrieves Store A orders with canonical envelope
- Subtest 2: Store A Manager and Staff can read Store A orders
- Subtest 3: Cross-Store IDOR blocked: Store A Owner cannot view Store B orders
- Subtest 4: Cross-Store IDOR blocked: Store B Owner cannot view Store A orders
- Subtest 5: Inactive / Suspended Store orders access rejected
- Subtest 6: Customer role cannot access merchant orders
- Subtest 7: Platform admin can read any merchant orders
- Subtest 8: Strict PII stripping: returned orders never contain customer phone or address
- Subtest 9: Filter by status works correctly
- Subtest 10: Search by order number works correctly
- Subtest 11: Legacy listOrdersForMerchant rejects missing merchant_id (no silent fallback)
- Subtest 12: Real NestJS HTTP Boundary: ParseUUIDPipe rejects malformed merchant ID with 400
- Subtest 13: Real NestJS HTTP Boundary: Whitelist validation rejects non-whitelisted query params with 400
- Subtest 14: Real NestJS HTTP Boundary: Valid request returns 200 with canonical envelope
- Subtest 15: Real NestJS HTTP Boundary: Cross-store IDOR via HTTP returns 403
- Subtest 16: Real NestJS HTTP Boundary: Customer token via HTTP returns 403

### Frontend Test Suite
```text
npx vitest run src/pages/merchant/Orders.test.tsx
# tests 16
# pass 16
# fail 0
```
- API Runtime contract: `merchantApi.listMerchantOrders` exposed
- No merchant state: truthful unattached prompt
- API error state: distinct error screen with retry button
- Empty state: truthful empty message when total is zero
- Populated state & safe projection: displays orders correctly without leaking sensitive customer PII
- Search & status filtering: triggers queries with updated parameters
- Merchant A -> B data isolation: switching merchant unmounts workspace and requests new merchant orders
- Deferred race condition isolation: late resolved response from Store A does not overwrite Store B
- Contract assertion: well-formed canonical payload validation
- Fail-closed: raw payload non-object rejection
- Fail-closed: missing/empty merchant_id rejection
- Fail-closed: cross-store merchant_id mismatch rejection
- Fail-closed: missing/invalid orders array rejection
- Fail-closed: invalid total, limit, offset rejection
- Fail-closed: forbidden customer PII detection rejection
- Fail-closed: invalid/negative amounts rejection

### Lint & Guards
- `npx eslint src/pages/merchant/Orders.tsx src/pages/merchant/Orders.test.tsx src/lib/api/merchant.ts` (0 errors)
- `npm --prefix backend run build` (Exit code: 0)
- `npm run build` (Exit code: 0)
- `npm run test:ci-guards` (3 files, 99 passed)
- `npm run arch:guard` (0 violations)
- `git diff --check` (Clean)
