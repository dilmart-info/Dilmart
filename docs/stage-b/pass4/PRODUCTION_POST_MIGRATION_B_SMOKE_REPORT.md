# Production Post-Migration B Smoke Verification Report

**Date:** 2026-08-31
**Target Supabase Project Ref:** `ztplxqlthuqkuktbznbo` (DilMart-Store Live)
**Migration B Reference:** `20260831120000_stage_b_legacy_destructive_cleanup.sql`
**Result:** 🟢 **ALL SMOKE INVARIANTS PASSED (100% SUCCESS)**

---

## 1. Scope of Verification

| Test Invariant | Tested Method | Result | Details |
|---|---|---|---|
| **Normal Checkout Execution** | `place_order_idempotent` | 🟢 PASS | Successfully created order with financial & delivery snapshots, assigned order number, `reused: false`. |
| **Catalog Pricing Enforcement** | `place_order` | 🟢 PASS | Successfully validated active merchant, product pricing & discount calculation against catalog. |
| **Order Items Creation** | `place_order_idempotent` | 🟢 PASS | `order_items` row created with accurate unit price, quantity, and product linkage. |
| **Inventory Mutation** | `place_order_idempotent` | 🟢 PASS | Stock decremented atomically by purchased quantity (`stock - qty`). |
| **Active Modern Channel Attribution** | `place_order_idempotent` | 🟢 PASS | `channel` persisted accurately as `'web_checkout'`. |
| **Idempotent Retry Safety** | `place_order_idempotent` | 🟢 PASS | Identical request hash & attempt ID returned existing `order_id` with `reused: true`; 0 duplicates. |
| **Strict User ID Enforcement** | Migration B Schema | 🟢 PASS | `checkout_attempts.user_id` enforced `NOT NULL` constraint. |
| **Post-Smoke Database Integrity** | Cleanup Routine | 🟢 PASS | Smoke order, items, attempt, and user removed; stock restored to original value. |

---

## 2. Invariant Signature Verification Summary

```text
Function: public.place_order (49 args)
Owner: postgres
Security Definer: true
Search Path: public, pg_temp
Execution Privileges: service_role only (REVOKE public/anon/authenticated)

Function: public.place_order_idempotent (51 args)
Owner: postgres
Security Definer: true
Search Path: public, pg_temp
Execution Privileges: service_role only (REVOKE public/anon/authenticated)
```

**Track A is now 100% COMPLETE. Backend cleanup work STOPS as instructed.**
