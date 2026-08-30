# DILMART — STAGE B PASS 2
# DEEP-DIVE ANALYSIS: `public.place_order` & SIGNATURE TRANSITION CONTRACT

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 | **Status:** READ-ONLY AUDIT BASELINE
**Target Function:** `public.place_order(...)`
**Live OID:** `19893` | **Security Mode:** `SECURITY DEFINER` | **Search Path:** `public, pg_temp`

---

## 1. Full Production Caller Map

`public.place_order` is **ACTIVELY RUNTIME REACHABLE** across three critical production code paths:

1. **Customer Web & Native Checkout:**
   - Flow: `POST /api/checkout/submit` ➔ `CheckoutController.submit()` ➔ `CheckoutService.submit()`
   - Database Entrypoint: Calls `public.place_order_idempotent` (when `attemptId` is passed) or fallback `public.place_order`.
2. **PostgreSQL Idempotency Envelope:**
   - Flow: `public.place_order_idempotent` executes attempt locking, request hash validation, and delegates core order creation to `public.place_order` via Named Parameters.
3. **Manual Assisted & WhatsApp-Assisted Orders:**
   - Flow: `POST /api/orders/manual` ➔ `OrdersController.createManualOrder()` ➔ `OrdersService.createManualOrder()`
   - Database Entrypoint: Invokes `public.place_order` directly via SupabaseAdmin RPC client to create merchant orders, attach WhatsApp intent metadata, compute financial snapshots, and decrement stock.

---

## 2. Full Regression Scope for Future Refactor

Any future modification of `place_order` must execute and pass verification against:
- **Standard Customer Checkout:** Single-item, multi-item, and multi-category orders.
- **Checkout Idempotency:** Duplicate submission handling, concurrency locking, payload hash mismatch rejection.
- **Checkout Recovery / Stale Attempt Retry:** Re-opening processing attempts after timeout.
- **Manual Assisted Orders:** Agent-driven order creation with custom commercial terms.
- **WhatsApp-Assisted Orders:** Linkage of `whatsapp_intent_id` and channel attribution.
- **Financial Snapshot Calculations:** Commission, platform assisted fee, extra fee, courier fee, and merchant net amounts.
- **Inventory Stock Decrements:** Atomic decrement of `products.stock_quantity` and increment of `products.sold_count`.
- **Loyalty Transactions:** Atomic points deduction and `loyalty_transactions` insertion.
- **Coupon Redemptions:** Multi-use and single-use coupon validation and logging.

---

## 3. Function Signature Transition Contract

In PostgreSQL, altering function parameter types or removing parameters creates a **new overload** rather than replacing the existing function. To prevent an ambiguous overload state in production, the transition must execute inside a **single atomic transaction**:

### Exact Old Function Identity (`p.oid::regprocedure`):
```text
public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, uuid, text, text)
```
*(55 parameters total, containing legacy arguments `p_store_linked_profile_id`, `p_dilmart_user_id`, `p_dilmart_barbershop_id`, `p_segment`, `p_business_type`)*.

### Proposed New Function Identity (50 parameters):
```text
public.place_order(
  p_customer_name text,
  p_customer_phone text,
  p_governorate_id uuid,
  p_area text,
  p_nearest_landmark text,
  p_notes text,
  p_subtotal numeric,
  p_delivery_cost numeric,
  p_discount numeric,
  p_total numeric,
  p_coupon_id uuid,
  p_items jsonb,
  p_user_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_map_url text,
  p_points_spent integer,
  p_points_discount numeric,
  p_points_earned integer,
  p_merchant_id uuid,
  p_payment_method text,
  p_merchant_notes text,
  p_merchandise_subtotal numeric,
  p_discount_total numeric,
  p_delivery_fee_charged numeric,
  p_platform_commission_type text,
  p_platform_commission_rate numeric,
  p_platform_commission_amount numeric,
  p_platform_assisted_fee_amount numeric,
  p_platform_extra_fee_amount numeric,
  p_courier_fee_payable numeric,
  p_merchant_gross_amount numeric,
  p_merchant_net_amount numeric,
  p_gross_collected_amount numeric,
  p_platform_net_revenue_amount numeric,
  p_currency_code text,
  p_financial_snapshot_version integer,
  p_payment_status text,
  p_collection_status text,
  p_settlement_status text,
  p_cash_expected_amount numeric,
  p_commission_rule_id uuid,
  p_assisted_fee_rule_id uuid,
  p_platform_fee_rule_id uuid,
  p_delivery_billing_rule_id uuid,
  p_resolved_plan_id uuid,
  p_resolved_plan_code text,
  p_commercial_snapshot_version integer,
  p_channel text
)
```

### Atomic Migration Transition Order (Migration A Blueprint):
1. **Step 1: Create New Function:**
   Define `public.place_order` with the clean 50-parameter signature, setting `search_path = public, pg_temp` and `SECURITY DEFINER`.
2. **Step 2: Update Idempotency Wrapper:**
   Re-create `public.place_order_idempotent` to pass named arguments matching the new signature.
3. **Step 3: Drop Old Overload:**
   Execute `DROP FUNCTION public.place_order(text, text, uuid, ... 55 args) RESTRICT;`.
4. **Step 4: Configure Security Grants:**
   ```sql
   REVOKE ALL ON FUNCTION public.place_order(...) FROM PUBLIC, anon, authenticated;
   GRANT EXECUTE ON FUNCTION public.place_order(...) TO service_role;
   ```
5. **Step 5: Post-Transition Verification Assertion:**
   ```sql
   DO $$
   BEGIN
     IF (SELECT count(*) FROM pg_proc WHERE proname = 'place_order') <> 1 THEN
       RAISE EXCEPTION 'MIGRATION FAILED: Ambiguous or missing place_order overload detected';
     END IF;
   END $$;
   ```
