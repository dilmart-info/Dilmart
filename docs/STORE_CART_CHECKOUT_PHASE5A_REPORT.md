# Phase 5A — Store Cart Checkout: Implementation Report

**Repository**: DilMart-Store  
**Branch**: `feat/store-cart-checkout-phase5a`  
**Date**: 2026-06-09  
**Status**: Implementation Complete — Pending Review  
**Build**: ✅ TypeScript + NestJS build pass (0 errors)  
**Revision**: v2 — 3 blocking fixes applied after PR #4 review

---

## Scope

Backend only (DilMart-Store). No Barber App changes in this phase.

```txt
✅ M30 migration    — extended place_order RPC with B2B tracking params
✅ CartCheckoutDto  — CartCheckoutPreviewDto + CartCheckoutSubmitDto
✅ CartCheckoutService — previewCartCheckout() + submitCartCheckout()
✅ CartController   — POST /cart/checkout/preview + POST /cart/checkout
✅ CartModule       — registered CartCheckoutService with FinanceModule + JenniModule
✅ Build            — TypeScript no errors, NestJS build success
```

---

## Files Changed

| File                                                                         | Change                                                                       |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `supabase/migrations/20260609100000_m30_place_order_b2b_source_tracking.sql` | New — extends place_order RPC                                                |
| `backend/src/modules/cart/cart.dto.ts`                                       | Extended — added CartCheckoutPreviewDto, CartCheckoutSubmitDto               |
| `backend/src/modules/cart/cart-checkout.service.ts`                          | New — CartCheckoutService                                                    |
| `backend/src/modules/cart/cart.controller.ts`                                | Extended — 2 new endpoints                                                   |
| `backend/src/modules/cart/cart.module.ts`                                    | Extended — imports FinanceModule, JenniModule; registers CartCheckoutService |

---

## M30 Migration Detail

**File**: `supabase/migrations/20260609100000_m30_place_order_b2b_source_tracking.sql`

**What it does**:

- Drops the existing `place_order` canonical overload (created in `20260608122500_fix_place_order_overloads.sql`)
- Recreates with 7 new optional parameters (all `DEFAULT NULL` or `DEFAULT 'web_checkout'`):

| Parameter                   | Type | Written to `orders` column |
| --------------------------- | ---- | -------------------------- |
| `p_source_app`              | TEXT | `source_app`               |
| `p_channel`                 | TEXT | `channel`                  |
| `p_store_linked_profile_id` | UUID | `store_linked_profile_id`  |
| `p_DilMart_user_id`         | UUID | `DilMart_user_id`          |
| `p_DilMart_barbershop_id`   | UUID | `DilMart_barbershop_id`    |
| `p_segment`                 | TEXT | `segment`                  |
| `p_business_type`           | TEXT | `business_type`            |

**Backward compatibility**: ✅ All new parameters have DEFAULT values. Existing callers (`CheckoutService.submit()` for web checkout, `OrdersService.createManualOrder()`) pass no new arguments and continue to work unchanged.

**Internal logic**: Identical to the previous canonical `place_order` — server-side re-pricing, stock decrement, single-merchant enforcement, loyalty points — plus the 7 new columns written to `INSERT INTO orders`.

---

## New API Endpoints

### `POST /cart/checkout/preview`

**Auth**: `X-Store-Session` required, `sourceApp = barber_app`  
**Body**: `{ governorate_id: UUID, coupon_code?: string }`

Returns order totals for the active cart and a given governorate, without creating an order or modifying cart state. Used by the Barber App to show the final checkout summary.

**Response**:

```json
{
  "cart": { "id": "...", "merchant_id": "..." },
  "items": [
    {
      "product_id": "...",
      "product_name": "شامبو ترطيب",
      "quantity": 2,
      "unit_price": 6000,
      "line_total": 12000
    }
  ],
  "subtotal": 12000,
  "discount": 0,
  "delivery_cost": 5000,
  "total": 17000,
  "itemCount": 2
}
```

Returns `{ cart: null, items: [], subtotal: 0, ... }` when cart is empty.

---

### `POST /cart/checkout`

**Auth**: `X-Store-Session` required, `sourceApp = barber_app`  
**Body**: `CartCheckoutSubmitDto`

```ts
{
  customer_name: string;       // required, max 100
  customer_phone: string;      // required, Iraqi format 07XXXXXXXXX
  governorate_id: string;      // required, UUID — for Jenni delivery cost
  area: string;                // required, max 200
  nearest_landmark?: string;   // optional, max 300
  notes?: string;              // optional, max 1000
  coupon_code?: string;        // optional (coupon support not active in Phase 5)
  latitude?: number;           // optional GPS
  longitude?: number;
  map_url?: string;
}
```

**Success Response**:

```json
{
  "order_number": "STY-2026-00123",
  "totals": {
    "subtotal": 12000,
    "discount": 0,
    "delivery_cost": 5000,
    "total": 17000
  }
}
```

**Error Responses**:
| Status | Scenario |
|--------|----------|
| 400 | Empty cart, inactive product/merchant, insufficient stock, price mismatch |
| 401 | Missing or invalid X-Store-Session |
| 403 | sourceApp ≠ barber_app |
| 409 | Cart already in checkout_in_progress (race condition) |
| 503 | Jenni delivery price not configured for governorate |

---

## CartCheckoutService — Flow Guarantees

The `submitCartCheckout()` method enforces the following invariants:

### 1. Cart lock prevents double-checkout

```
cart.status = 'active'
  → UPDATE to 'checkout_in_progress' before any order write
  → 409 if cart is already 'checkout_in_progress'
```

### 2. Prices always from DB

- `resolveCartLines()` fetches all products from `products` table
- Cart snapshot (`effective_unit_price`) is not used in calculations
- Validates: `is_active`, `visibility_status ≠ 'archived'`, `stock ≥ quantity`, `max_order_qty`

### 3. Cart revert on any failure

```typescript
try {
  // ... order creation
} catch (err) {
  await this.revertCartToActive(cart.id); // always runs on failure
  throw err;
}
```

### 4. Cart converted only after success

```
place_order RPC success
  → markCartConverted(cart.id)  // only here, never before
```

### 5. B2B identity from session claims only

```typescript
// All 7 B2B fields come from verified X-Store-Session claims:
p_source_app:              claims.sourceApp,          // "barber_app"
p_channel:                 "barber_app_checkout",
p_store_linked_profile_id: claims.linkedProfileId,   // store_linked_profiles.id
p_DilMart_user_id:          claims.DilMartUserId,
p_DilMart_barbershop_id:    claims.DilMartBarbershopId ?? null,
p_segment:                 claims.segment,
p_business_type:           claims.businessType ?? null,
```

Client body cannot influence these values.

### 6. Payment method always COD

```typescript
p_payment_method: "cod",  // hardcoded, not from client
```

---

## What Was NOT Changed

| Component                            | Status                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `checkout.service.ts` (web checkout) | Unchanged — existing web checkout unaffected                                               |
| `orders.service.ts`                  | Unchanged                                                                                  |
| `order-finance.service.ts`           | No changes needed — `barber_app_checkout` channel works as non-assisted channel by default |
| Barber App (DilMart-main)            | Not touched — Phase 5B                                                                     |
| Merchant fulfillment                 | Not implemented — Phase 6                                                                  |
| Online payment                       | Not implemented — COD only                                                                 |
| WhatsApp order flow                  | Not implemented                                                                            |

---

## Blocking Fixes Applied (v2)

| Fix                                   | Issue                                                                                                                           | Resolution                                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Fix 1** — Cart lock race condition  | `lockCartForCheckout()` did not verify UPDATE changed a row; concurrent requests could both proceed                             | Added `.select("id").maybeSingle()` + throw `ConflictException` if `data.id` is absent                                                                         |
| **Fix 2** — Visibility not re-checked | `resolveCartLines()` fetched prices/stock but not `visible_in / target_audience / business_type_tags / requires_verified_salon` | Now fetches all visibility fields + calls `ProductVisibilityService.canProductBeShown(row, viewerCtx)` where `viewerCtx` is built from verified session claims |
| **Fix 3** — `min_order_qty` skipped   | `max_order_qty` was checked but not `min_order_qty` at checkout                                                                 | Added `minQty` check: throws 400 if `qty < minQty`                                                                                                             |

---

## Reviewer Checklist

Before approving merge to main:

```txt
[ ] M30 migration: backward compatible — web checkout still works?
[ ] place_order RPC: new params default to NULL — no existing call broken?
[ ] Cart lock: checkout_in_progress prevents race condition?
[ ] Orders table: source_app = 'barber_app' written correctly?
[ ] Orders table: store_linked_profile_id written correctly?
[ ] Cart status: converts to 'converted' only after successful order?
[ ] Cart status: reverts to 'active' if order creation fails?
[ ] Prices: re-fetched from products table, not from cart snapshot?
[ ] No order created from Barber App without Phase 5B screens?
[ ] Build: TypeScript no errors, NestJS build success?
```

---

## Next Steps

After approval and merge to main:

```txt
Phase 5A: ✅ → merge to main → deploy to staging → API smoke test
Phase 5B: Barber App Checkout Screen (DilMart-main)
  - CheckoutScreen (app/(app)/store/checkout.tsx)
  - OrderConfirmationScreen (app/(app)/store/order-confirmation.tsx)
  - storeApi.ts: previewStoreCartCheckout() + submitStoreCartCheckout()
  - Cart screen: activate "متابعة الطلب" button
Phase 5C: Full integration verification
```
