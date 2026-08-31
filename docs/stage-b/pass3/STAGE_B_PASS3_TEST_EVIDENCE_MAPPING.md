# DILMART — STAGE B PASS 3
# MIGRATION A: COMPREHENSIVE TEST EVIDENCE MAPPING MATRIX

**Generated:** 2026-08-31 | **Status:** FINAL AUDIT & TEST EVIDENCE MATRIX
**Target Migration:** `supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql`

---

## 1. Test Invariant & Evidence Mapping

| Required Invariant / Behavior | Test Classification | Primary Test Suite / File | Specific Assertion / Test Block | Verification Status |
|---|:---:|---|---|:---:|
| **Explicit Transaction Atomicity (`BEGIN...COMMIT`)** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | Subtest 1: Migration contains explicit `BEGIN;` and `COMMIT;` wrapping all DDL/DCL | **VERIFIED** |
| **Hardened Preflight Exact Identity & Singularity** | `[STATIC SQL ASSERTION]` & `[REAL POSTGRESQL]` | `stage-b-rollback-and-upgrade-gate.sql` & migration preflight | `place_order` count=1, `place_order_idempotent` count=1, exact 55/51 identity match | **VERIFIED IN DB** |
| **Atomic Rename-First Sequence (`RESTRICT`)** | `[STATIC SQL ASSERTION]` & `[REAL POSTGRESQL]` | `stage-b-rollback-and-upgrade-gate.sql` & migration body | Rename to temporary legacy, create 49-arg, drop legacy `RESTRICT` | **VERIFIED IN DB** |
| **Explicit Owner (`postgres`) & `SECURITY DEFINER`** | `[STATIC SQL ASSERTION]` & `[REAL POSTGRESQL]` | `final-schema-gate.sql` & migration body | `ALTER FUNCTION ... OWNER TO postgres;` & catalog assertions (`owner = 'postgres'`) | **VERIFIED IN DB** |
| **Hardened Postconditions & ACL Assertions** | `[REAL POSTGRESQL]` | `final-schema-gate.sql` & migration postconditions | `place_order` count=1 (49 args), `place_order_idempotent` count=1 (51 args), `service_role` execute, non-service denied | **VERIFIED IN DB** |
| **Real Forced-Failure Rollback & Authority Restoration** | `[REAL POSTGRESQL — FORCED FAILURE ROLLBACK + AUTHORITY RESTORATION]` | `stage-b-rollback-and-upgrade-gate.sql` | Subtransaction rename to `place_order_legacy_stageb` aborted via exception; proves 55-arg exact identity, owner, search_path, ACL restoration & legacy/partial absence | **VERIFIED IN DB** |
| **Distinct Immediate Pre-A Upgrade Path** | `[REAL POSTGRESQL — IMMEDIATE PRE-A UPGRADE]` | `ci.yml` & `stage-b-rollback-and-upgrade-gate.sql` | Disposable DB reset to pre-A baseline (55/51 args) -> apply ONLY Migration A -> verify post-A state (49/51 args) | **VERIFIED IN DB** |
| **Customer Checkout Order Creation** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` & `checkout-concurrency.test.mjs` | `orders` row inserted, expected `order_number` returned | **VERIFIED IN DB** |
| **Order Line Items Creation & Attributes** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | `public.order_items` row verified: `product_id`, `quantity`, `price = 20000` (authoritative catalog price), `merchant_id` | **VERIFIED IN DB** |
| **Stock Decrement & `sold_count` Increment** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | Pre-order vs post-order assertions: `stock_after = stock_before - 3`, `sold_count_after = sold_count_before + 3` | **VERIFIED IN DB** |
| **Insufficient Stock Abort & Full Rollback** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | Excessive quantity rejected; post-state proves zero order writes, zero order_items writes, stock and sold_count unchanged | **VERIFIED IN DB** |
| **Single-Merchant Enforcement & Full Rollback** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | Multi-merchant items rejected (`Cart must contain products from exactly one merchant`); post-state proves zero orders, zero order_items, stock unchanged on both products | **VERIFIED IN DB** |
| **Inactive Merchant Rejection & Full Rollback** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | Suspended merchant rejected (`Merchant is not available for orders`); post-state proves zero orders, zero order_items, stock and sold_count unchanged | **VERIFIED IN DB** |
| **Catalog Price Authority Enforcement** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | Persisted `order_items.price` equals authoritative catalog price; fraudulent client merchandise subtotal is rejected | **VERIFIED IN DB** |
| **Merchandise Total Mismatch & Full Rollback** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | Fraudulent `p_merchandise_subtotal` mismatch rejected; post-state proves zero orders, zero order_items, stock and sold_count unchanged | **VERIFIED IN DB** |
| **Financial Snapshot Persistence** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | `orders.merchandise_subtotal` (20000), `orders.delivery_fee_charged` (4000), `platform_commission_amount` (2000), `merchant_net_amount` (18000), `currency_code` ('IQD') persisted | **VERIFIED IN DB** |
| **Coupon Usage Increment** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | `coupons.used_count` asserted before (3) and after order placement (4) | **VERIFIED IN DB** |
| **Loyalty Points Spend & Resulting Balance** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | `loyalty_transactions` spend record inserted with amount `-40`; `profiles.points` verified decremented from 100 to 60 | **VERIFIED IN DB** |
| **Duplicate Attempt Reuse (Idempotency)** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Duplicate attempt with identical hash returns existing order (`reused: true`) without duplication | **VERIFIED IN DB** |
| **Payload Hash Mismatch Rejection** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Attempt key reused with different hash throws `IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` | **VERIFIED IN DB** |
| **Active Attempt Conflict Protection** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Concurrent active processing attempt returns 202 `CHECKOUT_IN_PROGRESS` | **VERIFIED IN DB** |
| **Stale Attempt Recovery** | `[REAL POSTGRESQL]` | `checkout-idempotency.test.mjs` | Stale attempt (>5 min) is reset back to processing | **VERIFIED IN DB** |
| **Channel Attribution (`orders.channel`)** | `[REAL POSTGRESQL]` | `stage-b-place-order-behavior.test.mjs` | Order row asserts `channel = 'web_checkout'` | **VERIFIED IN DB** |
| **Manual Assisted Order (`manual_assisted`)** | `[APPLICATION MOCK]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | `OrdersService.createManualOrder()` passes `p_channel: "manual_assisted"` to RPC | **VERIFIED IN MOCK** |
| **WhatsApp-Assisted Order (`whatsapp_assisted`)**| `[APPLICATION MOCK]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | `OrdersService.createManualOrder({ intent_id })` passes `p_channel: "whatsapp_assisted"` to RPC | **VERIFIED IN MOCK** |

---

## 2. Separate Validation Paths Execution Proof

### Path A: Fresh Replay (Complete Repository Migration Chain)
- **Execution Mechanism:** Local Supabase Stack Fresh Initialization in CI (`Start Supabase Local Stack and Verify Upgrade Path`).
- **Assertion:** Replays every migration from baseline through `20260831100000_stage_b_place_order_authority_refactor.sql`.

### Path B: Distinct Immediate Pre-A Upgrade & Forced-Failure Rollback
- **Execution Mechanism:**
  1. Temporarily move out `20260831100000_stage_b_place_order_authority_refactor.sql`.
  2. `supabase db reset` to immediate pre-A state (`20260830210000_lock_product_import_sessions_rls.sql`).
  3. Execute `stage-b-rollback-and-upgrade-gate.sql` via `psql "$DB_URL"`:
     - Asserts pre-A state: `place_order` count=1 (55 args, exact reviewed identity, owner, prosecdef, search_path, ACLs), `place_order_idempotent` count=1 (51 args, exact reviewed identity, owner, prosecdef, search_path, ACLs).
     - Executes real forced-failure rename PL/pgSQL subtransaction and catches exception.
     - Asserts complete rollback restoration: 55 args restored with exact original identity, owner, search_path, ACLs; `place_order_legacy_stageb` count=0; partial 49-arg function count=0; `place_order_idempotent` count=1 (51 args, exact identity, owner, search_path, ACLs).
  4. Restores ONLY Migration A (`20260831100000_stage_b_place_order_authority_refactor.sql`).
  5. Runs `supabase migration up`.
  6. Executes `final-schema-gate.sql` and proves post-A state: `place_order` count=1 (49 args), `place_order_idempotent` count=1 (51 args), owner `postgres`, search_path, ACLs.
  7. Downstream test suites execute full real behavioral validations against this upgraded state.
