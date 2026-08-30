# DILMART — STAGE B PASS 2
# DEEP-DIVE ANALYSIS: `public.place_order` & ATOMIC RENAME-FIRST TRANSITION CONTRACT

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 (Micro-Closure Patch) | **Status:** PLANNING & AUDIT BASELINE (READ-ONLY)
**Target Function:** `public.place_order(...)`
**Environment Snapshot OID:** `19058` (Linked Production `ztplxqlthuqkuktbznbo`)  
*(Note: OIDs are environment-local snapshot metadata only. Durable authority resides in `p.oid::regprocedure` and `pg_get_function_identity_arguments(p.oid)`).*

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

## 2. Parameter Calculation & Exact Identities

### Current Old Function Identity (55 Parameters):
```text
public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, uuid, text, text)
```

### The 6 Removed Legacy Parameters:
1. `p_source_app text` (Omitted in favor of `p_channel`)
2. `p_store_linked_profile_id uuid`
3. `p_dilmart_user_id uuid`
4. `p_dilmart_barbershop_id uuid`
5. `p_segment text`
6. `p_business_type text`

### Proposed New Function Identity (Exact 49 Parameters: 55 - 6 = 49):
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

---

## 3. Safe Rename-First Atomic Transition Contract (Migration A)

To eliminate any window where two overloaded functions named `place_order` exist concurrently in PostgreSQL, Migration A will execute the following strict atomic sequence:

```sql
BEGIN;

-- 1. Preflight assertion: exact old regprocedure exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'place_order'
      AND pronargs = 55
  ) THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: Old 55-parameter place_order function not found';
  END IF;
END $$;

-- 2. Rename old function to temporary legacy identity
ALTER FUNCTION public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, uuid, text, text)
RENAME TO place_order_legacy_stageb;

-- 3. Create clean new place_order function (49 parameters)
CREATE FUNCTION public.place_order(
  p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text,
  p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric,
  p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid,
  p_latitude double precision, p_longitude double precision, p_map_url text,
  p_points_spent integer, p_points_discount numeric, p_points_earned integer,
  p_merchant_id uuid, p_payment_method text, p_merchant_notes text,
  p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric,
  p_platform_commission_type text, p_platform_commission_rate numeric,
  p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric,
  p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric,
  p_merchant_gross_amount numeric, p_merchant_net_amount numeric,
  p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric,
  p_currency_code text, p_financial_snapshot_version integer, p_payment_status text,
  p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric,
  p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid,
  p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text,
  p_commercial_snapshot_version integer, p_channel text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
-- Clean function body inserting purely into modern columns (omitting dilmart_*, segment, business_type, source_app)
$$;

-- 4. Re-create place_order_idempotent to resolve the new place_order exclusively
CREATE OR REPLACE FUNCTION public.place_order_idempotent(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
-- delegates to public.place_order(Named Parameters)
$$;

-- 5. Configure security grants
REVOKE ALL ON FUNCTION public.place_order(...) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_order(...) TO service_role;

-- 6. Drop temporary legacy function
DROP FUNCTION public.place_order_legacy_stageb(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, uuid, text, text) RESTRICT;

-- 7. Post-transition assertions
DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc WHERE proname = 'place_order') <> 1 THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Ambiguous or missing place_order function';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'place_order_legacy_stageb') THEN
    RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Legacy place_order still exists';
  END IF;
END $$;

COMMIT;
```
