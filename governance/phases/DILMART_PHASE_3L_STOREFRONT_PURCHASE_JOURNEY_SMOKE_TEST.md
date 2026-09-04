# Phase 3L: Customer Storefront Purchase Journey Smoke Test

## Phase Identity

```text
Phase Name: DILMART-PHASE-3L-STOREFRONT-PURCHASE-JOURNEY-SMOKE-TEST-001
Branch: governance/phase3l-storefront-purchase-journey-smoke-test-closure
Scope: Live Storefront End-to-End Customer Purchase Journey Smoke Test
Target Environment: DilMart-Store (Supabase ztplxqlthuqkuktbznbo)
Target Merchant: 46371607-ba4c-4fd2-bab4-8a6bd9371477 (DilMart Store)
Status: PHASE_3L_SMOKE_TEST_PASS
```

---

## 1. Executive Summary

Phase 3L executed an end-to-end smoke verification of the customer storefront purchase journey against the refreshed demo catalog on DilMart-Store.

The test exercised the full lifecycle:
1. **Catalog & Discovery:** Homepage category tiles, products catalog listing (`/products`), and category image rendering.
2. **Product Detail:** Product detail page navigation, specification inspection, stock availability check, and image gallery rendering.
3. **Cart Operations:** Adding product to cart, opening cart page, modifying line item quantity (increment from 1 to 2), and verifying dynamic price recalculation.
4. **Checkout & Submission:** Filling customer name, phone number, governorate (Baghdad), address, landmark, and placing order via Cash on Delivery (`cash_on_delivery`).
5. **Confirmation & Status:** Successful redirection to order confirmation (`/thank-you?order=DUK-260904-0144`).
6. **Backend & Data Integrity:** Strict merchant scoping, stock deduction, merchant notification generation, and multi-portal query availability.

---

## 2. Test Order Evidence

| Field | Value | Verification Status |
| :--- | :--- | :--- |
| **Order Number** | `DUK-260904-0144` | Verified on screen & in database |
| **Order UUID** | `b205c5fc-b07c-4479-b5d1-fbeedcdeba98` | Verified in `orders` table |
| **Merchant ID** | `46371607-ba4c-4fd2-bab4-8a6bd9371477` | Verified — strictly `DilMart Store` |
| **Tested Product** | أداة جيب متعددة الوظائف قابلة للطي (11 في 1) | Verified in `order_items` |
| **Product SKU** | `DIL-LIFE-006` | Verified |
| **Quantity Ordered** | 2 | Verified in `order_items.quantity` |
| **Unit Price** | 15,000 IQD | Verified |
| **Merchandise Subtotal** | 30,000 IQD | Verified in `orders.subtotal` |
| **Delivery Fee** | 5,000 IQD | Verified in `orders.delivery_cost` (Baghdad) |
| **Total Collected** | 35,000 IQD | Verified in `orders.total` |
| **Payment Method** | `cash_on_delivery` | Verified |
| **Order Status** | `new` | Verified |
| **Customer Name** | احمد علي | Verified |
| **Customer Phone** | 07701234567 | Verified |
| **Governorate** | بغداد | Verified via `governorate_id` relation |

---

## 3. Systems Verification Evidence

### A. Database Verification (`ztplxqlthuqkuktbznbo`)
- **Single-Merchant Integrity:** The order `b205c5fc-b07c-4479-b5d1-fbeedcdeba98` and its item `2157b819-d8cf-4e2a-aa33-2f6ae10c9f7b` are exclusively associated with `merchant_id = '46371607-ba4c-4fd2-bab4-8a6bd9371477'`.
- **Zero Orphan Rows:** No order items without orders, no orders without merchants.
- **Automated Inventory Deduction:** SKU `DIL-LIFE-006` stock decremented atomically from `50` to `48`.
- **Merchant Notifications:** Notification record created in `merchant_notifications`:
  - `type`: `new_order`
  - `title`: `طلب جديد`
  - `message`: `وصل طلب رقم DUK-260904-0144 — افتح الطلب لبدء التجهيز`

### B. Merchant Portal Verification (`/merchant/orders`)
- Scoped endpoint query `GET /merchants/46371607-ba4c-4fd2-bab4-8a6bd9371477/orders` returned order `DUK-260904-0144`.
- Strict PII filtering enforced: customer phone and detailed address excluded from merchant order list per governance contract.

### C. Admin Portal Verification (`/admin/orders`)
- Platform-wide orders query `GET /orders` returned order `DUK-260904-0144` with full customer details, delivery location, and merchant attribution (`DilMart Store`).

### D. UI/UX & Visual Verification
- **Category Tiles:** All 7 main category images rendered cleanly with zero broken images.
- **Cart Interaction:** Modifying item quantity updated subtotal instantaneously without glitch.
- **Checkout Flow:** Field validation accepted Iraqi phone formatting and dynamic delivery cost calculation.

---

## 4. Operational Boundaries & Compliance

- **No Code Mutations:** 0 application source files modified.
- **No DB Migrations:** 0 migrations created or applied.
- **No Deployments:** Production deploy deferred.
- **Order Retention:** Test order `DUK-260904-0144` persisted in database for audit and inspection per instruction.
- **Patch Assessment:** `NO_PATCH_REQUIRED` — all components functioned as designed.
