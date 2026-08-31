# DILMART — STAGE B PASS 3
# MIGRATION A: SEMANTIC LIVE-BODY VS PROPOSED-BODY DIFF ANALYSIS

**Generated:** 2026-08-31 | **Target Database:** Live Production `ztplxqlthuqkuktbznbo`
**Catalog Source:** `pg_proc`, `pg_get_functiondef()`, `pg_get_function_identity_arguments()`

---

## 1. Live Production Function Signatures & Authority

### A. `public.place_order` (Live OID: 19058)
- **Identity Arguments (55 Args):**
  `p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_source_app text, p_channel text, p_store_linked_profile_id uuid, p_dilmart_user_id uuid, p_dilmart_barbershop_id uuid, p_segment text, p_business_type text`
- **Owner:** `postgres`
- **Security Definer:** `true`
- **Search Path:** `["search_path=public, pg_temp"]`
- **ACL Matrix:**
  - PUBLIC: `false`
  - anon: `false`
  - authenticated: `false`
  - service_role: `true`

### B. `public.place_order_idempotent` (Live OID: 19289)
- **Identity Arguments (51 Args):**
  `p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text`
- **Owner:** `postgres`
- **Security Definer:** `true`
- **Search Path:** `["search_path=public"]`
- **ACL Matrix:**
  - PUBLIC: `false`
  - anon: `false`
  - authenticated: `false`
  - service_role: `true`

---

## 2. Invariant-by-Invariant Semantic Comparison

| Invariant / Logic Block | Live Production (55 Args) | Proposed Migration A (49 Args) | Semantic Equivalence Verdict |
|---|---|---|:---:|
| **Cart Validation** | `IF p_items IS NULL OR jsonb_array_length(p_items) = 0` | Identical | **100% IDENTICAL** |
| **Single-Merchant Rule** | `COUNT(DISTINCT p.merchant_id) = 1` | Identical | **100% IDENTICAL** |
| **Merchant Status Rule** | `merchants.status = 'active'` | Identical | **100% IDENTICAL** |
| **Merchant Scope Match** | `p_merchant_id IS NOT NULL AND p_merchant_id <> v_merchant_id` | Identical | **100% IDENTICAL** |
| **Product Row Locking** | `FOR UPDATE OF p` | Identical | **100% IDENTICAL** |
| **Product Active Rule** | `IF NOT v_product.is_active` | Identical | **100% IDENTICAL** |
| **Product Visibility Rule**| `v_product.visibility_status = 'archived'` | Identical | **100% IDENTICAL** |
| **Merchant Status on Item**| `v_product.merchant_status <> 'active'` | Identical | **100% IDENTICAL** |
| **Catalog Price Rule** | Discount vs regular price + offer expiration | Identical | **100% IDENTICAL** |
| **Stock Row Decrement** | `stock = stock - v_qty, sold_count = COALESCE(sold_count, 0) + v_qty` | Identical | **100% IDENTICAL** |
| **Merchandise Total Check**| `ABS(v_db_merchandise - v_expected_merch) > 1` | Identical | **100% IDENTICAL** |
| **Orders Insert** | Inserts customer, pricing, financial, status, and 6 legacy columns | Inserts customer, pricing, financial, status, and modern `channel` | **CLEANED (6 legacy columns omitted)** |
| **Loyalty Point Deduction**| `loyalty_transactions` insert + `profiles.points` update | Identical | **100% IDENTICAL** |
| **Order Items Insert** | Iterates `v_lines` JSON array to insert `order_items` | Identical | **100% IDENTICAL** |
| **Coupon Usage** | `PERFORM public.increment_coupon_usage(p_coupon_id)` | Identical | **100% IDENTICAL** |
| **Order Number Return** | `RETURN v_order_number` | Identical | **100% IDENTICAL** |

---

## 3. Strict Boundary Affirmation

The proposed 49-argument function differs from the live production 55-argument function **strictly and exclusively** by removing:
- `p_source_app`
- `p_store_linked_profile_id`
- `p_dilmart_user_id`
- `p_dilmart_barbershop_id`
- `p_segment`
- `p_business_type`
and their corresponding column write references in `INSERT INTO public.orders`.
Zero commercial, pricing, loyalty, inventory, or financial logic was altered or dropped.
