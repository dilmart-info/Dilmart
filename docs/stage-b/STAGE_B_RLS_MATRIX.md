# DILMART — STAGE B RLS (ROW LEVEL SECURITY) AUTHORITY MATRIX
**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE | **Baseline Commit:** `62922bb`

---

## 1. Matrix Overview & Executive Scope

This document provides the high-level Row Level Security (RLS) overview across the core marketplace tables.
For the complete policy and privilege breakdown across **all 71 active database tables**, see the authoritative companion document:
👉 [`docs/stage-b/STAGE_B_RLS_FULL_MATRIX.md`](file:///d:/DilMart/docs/stage-b/STAGE_B_RLS_FULL_MATRIX.md) `[CONFIRMED BY CODE] [CONFIRMED BY LIVE DB QUERY]`.

### Dual-State Table Accounting
- **Live Production Database (`ztplxqlthuqkuktbznbo`):** **70 / 71 active tables have RLS ENABLED** `[CONFIRMED BY LIVE DB QUERY]`.
- **Repository Migration Replay State:** **70 / 71 active tables have RLS ENABLED** `[CONFIRMED BY REPOSITORY CODE]`.
- **P0 Finding (`F-B-01`):** `public.product_import_sessions` currently has RLS DISABLED and 0 policies in live production. Remediation migration `20260830210000_lock_product_import_sessions_rls.sql` is prepared on branch `fix/stage-b-p0-product-import-rls` and will achieve 71/71 upon approved execution.

---

## 2. Core Marketplace RLS Summary

| Table Name | RLS Enabled (Live) | Anon SELECT | Auth SELECT | Auth INSERT | Auth UPDATE | Auth DELETE | Merchant Access | Admin Access | Service Role |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **`profiles`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=id`) | ❌ DENIED | ❌ REVOKED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`customer_profiles`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`customer_addresses`** | ✅ YES | ❌ DENIED | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ✅ Own (`uid=user_id`) | ❌ DENIED | ✅ Full | ✅ Full |
| **`merchants`** | ✅ YES | ✅ Active Only | ✅ Active Only | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own (`app_private.is_merchant_member`) | ✅ Full | ✅ Full |
| **`merchant_users`** | ✅ YES | ❌ DENIED | ✅ Own Merchant | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Owner / Manager | ✅ Full | ✅ Full |
| **`merchant_settings`** | ✅ YES | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own (`app_private.is_merchant_member`) | ✅ Full | ✅ Full |
| **`categories`** | ✅ YES | ✅ Active Only | ✅ Active Only | ❌ DENIED | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Full | ✅ Full |
| **`products`** | ✅ YES | ✅ Published/Active | ✅ Published/Active | ❌ DENIED | ❌ DENIED | ❌ DENIED | ✅ Own (`app_private.is_merchant_member`) | ✅ Full | ✅ Full |
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
| **`product_import_sessions`** | ❌ **NO (Live P0)** | ⚠️ YES (Default) | ⚠️ YES (Default) | ⚠️ YES (Default) | ⚠️ YES (Default) | ⚠️ YES (Default) | ⚠️ Unisolated | ⚠️ Unisolated | ✅ Full |
