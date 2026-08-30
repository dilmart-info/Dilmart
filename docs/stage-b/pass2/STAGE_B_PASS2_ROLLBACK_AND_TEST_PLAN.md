# DILMART — STAGE B PASS 2
# ROLLBACK & TEST VERIFICATION PLAN (PASS 3 BLUEPRINT)

**Generated:** 2026-08-30 | **Updated:** 2026-08-31 (Micro-Closure Patch) | **Status:** PLANNING & PROPOSAL ONLY

---

## 1. Rollback & Multi-Dimensional Recovery Strategy by Migration

| Migration | Operation | Data Loss Risk | Rollback Feasibility | Multi-Dimensional Verification Requirements |
|---|---|:---:|:---:|---|
| **Migration A** | `place_order` Rename-First Refactor | **ZERO** (Code change only) | **HIGH** (Instant) | Verify exact `regprocedure`, 49 arguments, `result_type`, `owner = 'postgres'`, `prosecdef = true`, `proconfig = ["search_path=public, pg_temp"]`, and `service_role` EXECUTE grant only. Assert 0 old overloads exist. |
| **Migration B** | Drop 15 Dead RPCs | **ZERO** (Unused routines) | **HIGH** (Instant) | Re-create functions from historical migration catalog definitions; verify `count = 0` in `pg_proc` for target identities. |
| **Migration C** | Drop 6 Leaf Tables + 3 Trigger Functions | **ZERO** (0 live rows) | **MEDIUM** (DDL rollback) | Verify table existence = false, trigger existence = false, trigger functions existence = false. Rollback restores columns, constraints, RLS enablement, and trigger definitions. |
| **Migration D** | Drop 5 Parent Tables (`store_linked_profiles`) | **ZERO** (0 live rows) | **MEDIUM** (DDL rollback) | Verify all 5 tables dropped; rollback restores tables, primary keys, and inbound foreign keys from `orders`/`checkout_attempts`. |
| **Migration E** | Drop 11 Legacy Columns & Replace Owner XOR | **ZERO** (0 non-null values) | **MEDIUM** (DDL rollback) | Verify `pg_attribute` no longer contains target columns; verify `chk_checkout_attempts_owner_xor` replaced by `user_id IS NOT NULL`; rollback executes `ALTER TABLE ... ADD COLUMN ... NULL;` and restores indexes. |
| **Optional Migration F** | Retire `auth.users` Federated Guard | **ZERO** (0 federated users) | **HIGH** (Instant) | Verify trigger `trg_reject_reserved_federated_email` dropped from `auth.users`. Rollback re-attaches trigger. |

---

## 2. Pre-Migration Safety Assertions for Future Pass 3

Before executing ANY destructive DDL statement in future Pass 3 migrations:
1. **Live Row Count Re-Check:**
   ```sql
   DO $$
   BEGIN
     IF (SELECT count(*) FROM public.store_carts) > 0 OR
        (SELECT count(*) FROM public.store_linked_profiles) > 0 THEN
       RAISE EXCEPTION 'PRE-MIGRATION GATE FAILED: Target legacy tables are not empty';
     END IF;
   END $$;
   ```
2. **Non-Null Value Re-Check (Orders & Checkout Attempts):**
   ```sql
   DO $$
   BEGIN
     IF (SELECT count(*) FROM public.orders WHERE dilmart_user_id IS NOT NULL OR dilmart_barbershop_id IS NOT NULL OR segment IS NOT NULL OR source_app IS NOT NULL OR business_type IS NOT NULL) > 0 THEN
       RAISE EXCEPTION 'PRE-MIGRATION GATE FAILED: orders legacy columns contain non-null values';
     END IF;
   END $$;
   ```
3. **Overload Ambiguity Prevention Assertion (Migration A):**
   ```sql
   DO $$
   BEGIN
     IF (SELECT count(*) FROM pg_proc WHERE proname = 'place_order') <> 1 THEN
       RAISE EXCEPTION 'MIGRATION FAILED: Multiple or missing place_order function overloads detected';
     END IF;
     IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'place_order_legacy_stageb') THEN
       RAISE EXCEPTION 'MIGRATION FAILED: Legacy place_order temporary identity still present';
     END IF;
   END $$;
   ```

---

## 3. Required Future Test Suite Matrix (Pass 3 Validation)

| Suite Name | Command | Primary Validation Focus |
|---|---|---|
| **Launch Critical Suite** | `npm run test:launch-critical` | Checkout idempotency, atomic order placement, stock decrement, account claims. |
| **Manual & Assisted Orders Suite** | `npm run test:manual-orders` | `OrdersService.createManualOrder()`, agent commercial terms resolution, WhatsApp intent linkage. |
| **Database Concurrency Suite** | `node --test backend/tests/db-integration/checkout-concurrency.test.mjs` | Lock attempt concurrency, payload hash mismatches, retry logic. |
| **Policy Matrix Suite** | `npm run test:policy` | Universal RLS enablement (60/60 tables post-cleanup), ACL lockdowns, role privilege isolation. |
| **Hardening Regression Suite** | `npm run test:hardening` | Iraqi phone normalization, search sanitization, customer identity masking. |
| **Product Import Suite** | `npm run test:product-import` | Catalog readiness, publication gates, tenant scope isolation. |
| **Frontend Production Build** | `npm run build` (root) | Zero broken imports or type references to removed legacy tables/types. |
| **Backend Production Build** | `npm run build` (`backend/`) | Zero broken NestJS service dependencies or DTO mappings. |
| **Universal Schema Gate** | `node backend/tests/db-integration/final-schema-gate.sql` | Universal schema gate passes with 0 RLS gaps. |
