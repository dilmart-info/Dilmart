# DILMART — STAGE B RPC & DATABASE PRIVILEGE AUTHORITY AUDIT
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Executive RPC Authority Summary

- **Total Functions Audited:** 82 functions across all migrations.
- **SECURITY DEFINER Functions:** 54 functions.
- **SECURITY INVOKER Functions:** 28 functions.
- **PostgREST Public Attack Surface:** **0 mutating SECURITY DEFINER functions are callable by anonymous or untrusted authenticated browser roles.**
- **Enforcement Layer:** All critical mutating functions (`place_order_idempotent`, `cancel_order_atomic`, `approve_merchant_atomic`, etc.) are restricted to `service_role` execution.

---

## 2. Authoritative RPC Inventory & Privilege Matrix

| Function Signature | Security | Schema | EXECUTE Grants | Internal Authorization | Caller Layer | Classification |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `place_order_idempotent(...)` | DEFINER | `public` | `service_role` | Idempotency lock + user verification | Backend CheckoutService | **SERVICE-ROLE ONLY** |
| `place_order(...)` | DEFINER | `public` | `service_role` | Pinned search path, backend mediated | Legacy Backend fallback | **SERVICE-ROLE ONLY** |
| `cancel_order_atomic(...)` | INVOKER | `public` | `service_role` | Actor verification + CAS status check | Backend OrdersService | **SERVICE-ROLE ONLY** |
| `approve_merchant_atomic(...)` | DEFINER | `public` | `service_role` | Admin actor verification | Backend AdminService | **ADMIN ONLY** |
| `reject_merchant_atomic(...)` | DEFINER | `public` | `service_role` | Admin actor verification | Backend AdminService | **ADMIN ONLY** |
| `admin_schedule_merchant_commercial_agreement(...)` | DEFINER | `public` | `service_role` | Platform admin check | Backend CommercialEngine | **ADMIN ONLY** |
| `admin_merchant_readiness_summary()` | DEFINER | `public` | `service_role` | Read-only aggregation | Backend AdminService | **ADMIN ONLY** |
| `upsert_merchant_settings_atomic(...)` | DEFINER | `public` | `service_role` | Merchant scoping check | Backend MerchantsService | **MERCHANT SCOPED** |
| `validate_coupon(...)` | DEFINER | `public` | `service_role` | Read-only coupon validation | Backend CheckoutService | **AUTHENTICATED SAFE** |
| `claim_pending_points(...)` | DEFINER | `public` | `service_role` | Phone matching logic | Backend LoyaltyService | **SERVICE-ROLE ONLY** |
| `get_available_points(...)` | DEFINER | `public` | `service_role` | User balance lookup | Backend LoyaltyService | **SERVICE-ROLE ONLY** |
| `is_admin()` | DEFINER | `app_private` | `anon, authenticated, service_role` | Evaluates caller `auth.uid()` | RLS Policies ONLY | **PUBLIC SAFE (Private Schema)** |
| `is_platform_admin()` | DEFINER | `app_private` | `anon, authenticated, service_role` | Evaluates caller `auth.uid()` | RLS Policies ONLY | **PUBLIC SAFE (Private Schema)** |
| `is_merchant_member(merchant_id uuid)` | DEFINER | `app_private` | `anon, authenticated, service_role` | Evaluates `merchant_users` membership | RLS Policies ONLY | **PUBLIC SAFE (Private Schema)** |

---

## 3. Legacy / Residue Functions Identified for Stage B Deprecation

1. **`place_b2b_cart_order_idempotent(...)`**
   - **Defined in:** `20260816100000_b2b_checkout_idempotency.sql`
   - **Status:** Complete dead code. Decoupled in Stage A.
   - **Target:** Safe forward drop candidate in Stage B.

2. **`finalize_barber_handoff(...)`**
   - **Defined in:** `20260819100100_barber_handoff_functions.sql`
   - **Status:** Complete dead code. Handoffs decoupled.
   - **Target:** Safe forward drop candidate in Stage B.

3. **`verify_barber_web_session(...)`** & **`redeem_barber_handoff_and_create_session(...)`**
   - **Defined in:** `20260819100200_barber_web_sessions.sql`
   - **Status:** Complete dead code.
   - **Target:** Safe forward drop candidate in Stage B.

4. **`revoke_barber_web_sessions_for_user(...)`**
   - **Defined in:** `20260819100200_barber_web_sessions.sql`
   - **Status:** Complete dead code.
   - **Target:** Safe forward drop candidate in Stage B.
