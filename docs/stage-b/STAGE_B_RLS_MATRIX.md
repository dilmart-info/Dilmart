# DILMART — STAGE B RLS (ROW LEVEL SECURITY) AUTHORITY MATRIX
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Matrix Overview & Executive Scope

This document provides the high-level Row Level Security (RLS) overview across the core marketplace tables.
For the complete, un-truncated policy and privilege breakdown across **all 71 active database tables**, see the authoritative companion document:
👉 [`docs/stage-b/STAGE_B_RLS_FULL_MATRIX.md`](file:///d:/DilMart/docs/stage-b/STAGE_B_RLS_FULL_MATRIX.md) `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`.

---

## 2. Core Marketplace RLS Summary

| Table Name | RLS Enabled | Anon SELECT | Auth SELECT | Auth INSERT | Auth UPDATE | Auth DELETE | Merchant Access | Admin Access | Service Role |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`profiles`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=id`) | ❌ DENIED | ❌ REVOKED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`customer_profiles`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`customer_addresses`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ❌ DENIED | ✅ Full | ✅ Full |
| **`merchants`** | ✅ YES | ✅ Active Only | ✅ Active Only | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own (`is_merchant_member`) | ✅ Full | ✅ Full |
| **`merchant_users`** | ✅ YES | ❌ DENIED | ✅ Own Merchant | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Owner / Manager | ✅ Full | ✅ Full |
| **`merchant_settings`** | ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own (`is_merchant_member`) | ✅ Full | ✅ Full |
| **`categories`** | ✅ YES | ✅ Active Only | ✅ Active Only | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`products`** | ✅ YES | ✅ Published/Active | ✅ Published/Active | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own (`is_merchant_member`) | ✅ Full | ✅ Full |
| **`stock_movements`** | ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own Merchant | ✅ Full | ✅ Full |
| **`orders`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=customer_id`) | ❌ DENIED | ❌ REVOKED | ❌ REVOKED | ✅ Own Merchant Read | ✅ Full | ✅ Full |
| **`order_items`** | ✅ YES | ❌ DENIED | ✅ Own Order | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own Merchant Read | ✅ Full | ✅ Full |
| **`checkout_attempts`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=user_id`) | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`order_finance_events`** | ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`merchant_ledger_entries`**| ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own Merchant Read | ✅ Full | ✅ Full |
| **`merchant_payout_batches`** | ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own Merchant Read | ✅ Full | ✅ Full |
| **`courier_ledger_entries`** | ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`coupons`** | ✅ YES | ✅ Active Only | ✅ Active Only | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own Merchant Read/Write | ✅ Full | ✅ Full |
| **`loyalty_transactions`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=user_id`) | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`governorates`** | ✅ YES | ✅ Active Only | ✅ Active Only | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`delivery_prices`** | ✅ YES | ✅ Public Read | ✅ Public Read | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`order_delivery_integrations`**| ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`audit_logs`** | ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`product_import_sessions`** | ⚠️ DRIFT | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own Merchant Read | ✅ Full | ✅ Full |

---

## 3. Key RLS Hardening Findings & Verification

1. **`profiles` Role Escalation Blocked:**
   - Table-level and column-level `UPDATE` privileges were **revoked from PUBLIC, anon, and authenticated** `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`. Profile updates are now strictly mediated by the backend NestJS service with field allowlisting.

2. **`orders` Financial Mutation Blocked:**
   - `UPDATE` privileges on `public.orders` were **revoked from PUBLIC, anon, and authenticated** `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`. Direct modification of order status, cash collected, and settlement state via PostgREST is rejected at the database privilege level.

3. **RLS Helper Schema Isolation:**
   - RLS helper functions `is_admin()`, `is_platform_admin()`, and `is_merchant_member(uuid)` were relocated to schema `app_private` (in `20260820180000_rls_helper_private_schema.sql`).
   - PostgREST does not expose `app_private`, preventing direct HTTP RPC probing of administrative helper functions `[CONFIRMED BY CODE]`.

4. **Migration / Schema Drift on `product_import_sessions`:**
   - In repository migration `20260426090000_m20_merchant_productivity_layer.sql`, `product_import_sessions` was created without RLS statements.
   - In the live production database, 4 RLS policies exist out-of-band. A forward-only alignment migration is documented as Finding `F-B-01` for Stage B Pass 2 cleanup.
