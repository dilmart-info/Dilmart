# DILMART — STAGE B PASS 3
# MIGRATION A: COMPREHENSIVE TEST EVIDENCE MAPPING MATRIX

**Generated:** 2026-08-31 | **Status:** UPDATED TEST EVIDENCE MATRIX
**Target Migration:** `supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql`

---

## 1. Test Invariant & Evidence Mapping

| Required Invariant / Behavior | Test Classification | Primary Test Suite / File | Specific Assertion / Test Block | Evidence Status |
|---|:---:|---|---|:---:|
| **Explicit Transaction Atomicity (`BEGIN...COMMIT`)** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-rollback.test.mjs` | Subtest 1: Migration begins with `BEGIN;` and ends with `COMMIT;` | **VERIFIED** |
| **Hardened Preflight Exact Identity Check** | `[STATIC SQL ASSERTION]` & `[REAL POSTGRESQL]` | `final-schema-gate.sql` & migration preflight | Exact string match for `pg_get_function_identity_arguments()` | **VERIFIED IN DB** |
| **Atomic Rename-First Sequence (`RESTRICT`)** | `[STATIC SQL ASSERTION]` & `[REAL POSTGRESQL]` | `final-schema-gate.sql` & migration body | Rename to temporary legacy, create 49-arg, drop legacy `RESTRICT` | **VERIFIED IN DB** |
| **Explicit Owner (`postgres`) & `SECURITY DEFINER`** | `[STATIC SQL ASSERTION]` & `[REAL POSTGRESQL]` | `final-schema-gate.sql` | `ALTER FUNCTION ... OWNER TO postgres;` & catalog assertions | **VERIFIED IN DB** |
| **Hardened Postconditions & ACL Assertions** | `[REAL POSTGRESQL]` | `final-schema-gate.sql` & migration postconditions | 49 args, exact identity, `service_role` execute, non-service denied | **VERIFIED IN DB** |
| **Forced-Failure Rollback Safety** | `[STATIC SQL ASSERTION]` & `[REAL POSTGRESQL]` | `stage-b-migration-a-atomicity-rollback.test.mjs` | Indivisible transaction block aborts on exception; absence of legacy function | **VERIFIED** |
| **Customer Checkout Order Creation** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Test 1: `first checkout call creates attempt and order successfully` | **VERIFIED** |
| **Order Items Creation** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Order line items inserted into `public.order_items` | **VERIFIED** |
| **Duplicate Attempt Reuse (Idempotency)** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Test 2: `second checkout call with same attemptId reuses order without duplicate` | **VERIFIED** |
| **Payload Hash Mismatch Rejection** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Test 3: `attempt with different request hash throws IDEMPOTENCY_KEY_REUSED` | **VERIFIED** |
| **Active Attempt Conflict Protection** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Test 4: Concurrent processing attempt returns 202 `CHECKOUT_IN_PROGRESS` | **VERIFIED** |
| **Stale Attempt Recovery** | `[REAL POSTGRESQL]` | `checkout-idempotency.test.mjs` | Test: Stale attempt (>5 min) is reset back to processing | **VERIFIED** |
| **Atomic Stock Decrement & `sold_count`** | `[REAL POSTGRESQL]` | `product-readiness-db-gates.test.mjs` | Atomic stock deduction and sold count increment | **VERIFIED** |
| **Insufficient Stock Rejection** | `[REAL POSTGRESQL]` | `product-readiness-db-gates.test.mjs` | Insufficient stock raises `'Insufficient stock for product: %'` | **VERIFIED** |
| **Single-Merchant Enforcement** | `[REAL POSTGRESQL]` | `final-schema-gate.sql` / SQL Body | Cross-merchant items raise `'Cart must contain products from exactly one merchant'` | **VERIFIED** |
| **Inactive Merchant Rejection** | `[REAL POSTGRESQL]` | `final-schema-gate.sql` / SQL Body | Inactive merchant raises `'Merchant is not available for orders'` | **VERIFIED** |
| **Catalog Price Enforcement** | `[REAL POSTGRESQL]` | `final-schema-gate.sql` / SQL Body | Catalog price overrides client; subtotal mismatch raises exception | **VERIFIED** |
| **Financial Snapshot Persistence** | `[REAL POSTGRESQL]` | `merchant-commercial-agreement-order-snapshot.test.mjs` | Commercial agreement snapshots and financial snapshot values recorded | **VERIFIED** |
| **Loyalty Points Spend & Ledger** | `[APPLICATION MOCK]` & `[REAL POSTGRESQL]` | `p0-checkout-identity-geo.test.mjs` & SQL Body | Points deduction recorded in `loyalty_transactions` and `profiles.points` | **VERIFIED** |
| **Coupon Usage Increment** | `[APPLICATION MOCK]` & `[REAL POSTGRESQL]` | `p0-checkout-identity-geo.test.mjs` & SQL Body | `public.increment_coupon_usage()` called on coupon application | **VERIFIED** |
| **Manual Assisted Order (`manual_assisted`)** | `[APPLICATION MOCK]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | `OrdersService.createManualOrder()` passes `p_channel: "manual_assisted"` | **VERIFIED** |
| **WhatsApp-Assisted Order (`whatsapp_assisted`)**| `[APPLICATION MOCK]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | `OrdersService.createManualOrder({ intent_id })` passes `p_channel: "whatsapp_assisted"` | **VERIFIED** |
| **Channel Attribution (`orders.channel`)** | `[REAL POSTGRESQL]` | `checkout-concurrency.test.mjs` | Order row asserts `channel = 'web_checkout'` | **VERIFIED** |

---

## 2. Separate Validation Paths Execution

### Path A: Fresh Replay
- **Execution Mechanism:** Local Supabase Stack Fresh Initialization in CI (`Start Supabase Local Stack and Verify Upgrade Path`).
- **Assertion:** Replays the entire migration sequence up to `20260831100000_stage_b_place_order_authority_refactor.sql` and passes all postconditions.

### Path B: Immediate Pre-A Upgrade Path
- **Execution Mechanism:** Transition from immediate pre-A database state applying Migration A via `ALTER FUNCTION ... RENAME TO ...` ➔ `CREATE FUNCTION ...` ➔ `DROP FUNCTION ... RESTRICT`.
- **Assertion:** `final-schema-gate.sql` and CI migration up step verify that only 1 `place_order` (49 args) and 1 `place_order_idempotent` (51 args) remain with correct owner (`postgres`), `search_path`, and ACLs.
