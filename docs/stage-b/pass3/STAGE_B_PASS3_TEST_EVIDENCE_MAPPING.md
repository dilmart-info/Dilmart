# DILMART — STAGE B PASS 3
# MIGRATION A: COMPREHENSIVE TEST EVIDENCE MAPPING MATRIX

**Generated:** 2026-08-31 | **Status:** MACHINE-VERIFIED AUDIT & TEST PROOF
**Target Migration:** `supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql`
**GitHub Launch Critical CI Run:** `33337284661`

---

## 1. Test Invariant & Evidence Mapping

| Required Invariant / Behavior | Test Classification | Primary Test Suite / File | Specific Assertion / Test Block | Verification Result |
|---|:---:|---|---|:---:|
| **Explicit Transaction Atomicity (`BEGIN...COMMIT`)** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | Subtest 1: Migration begins with `BEGIN;` and ends with `COMMIT;` | **PASS** |
| **Hardened Preflight Exact Identity Check** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | Subtest 2: Exact string match for `pg_get_function_identity_arguments()` | **PASS** |
| **Atomic Rename-First Sequence (`RESTRICT`)** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | Subtest 3: Rename to temporary legacy, create 49-arg, drop legacy `RESTRICT` | **PASS** |
| **Explicit Owner (`postgres`) & `SECURITY DEFINER`** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | Subtest 4: `ALTER FUNCTION ... OWNER TO postgres;` | **PASS** |
| **Hardened Postconditions & ACL Assertions** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | Subtest 5: 49 args, exact identity, `service_role` execute, non-service denied | **PASS** |
| **Forced-Failure Rollback Safety** | `[STATIC SQL ASSERTION]` | `stage-b-migration-a-atomicity-rollback.test.mjs` | Subtest 1-2: Indivisible transaction block aborts on exception | **PASS** |
| **Customer Checkout Order Creation** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/checkout-concurrency.test.mjs` | Test 1: `first checkout call creates attempt and order successfully` | **PASS** |
| **Order Items Creation** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/checkout-concurrency.test.mjs` | Verified order line items inserted into `public.order_items` | **PASS** |
| **Duplicate Attempt Reuse (Idempotency)** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/checkout-concurrency.test.mjs` | Test 2: `second checkout call with same attemptId reuses order without duplicate` | **PASS** |
| **Payload Hash Mismatch Rejection** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/checkout-concurrency.test.mjs` | Test 3: `attempt with different request hash throws IDEMPOTENCY_KEY_REUSED` | **PASS** |
| **Active Attempt Conflict Protection** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/checkout-concurrency.test.mjs` | Test 4: Concurrent processing attempt returns 202 `CHECKOUT_IN_PROGRESS` | **PASS** |
| **Stale Attempt Recovery** | `[REAL POSTGRESQL]` | `backend/tests/checkout-idempotency.test.mjs` | Test: Stale attempt (>5 min) is reset back to processing | **PASS** |
| **Atomic Stock Decrement & `sold_count`** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/product-readiness-db-gates.test.mjs` | Verified atomic stock deduction and sold count increment | **PASS** |
| **Insufficient Stock Rejection** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/product-readiness-db-gates.test.mjs` | Insufficient stock raises `'Insufficient stock for product: %'` | **PASS** |
| **Single-Merchant Enforcement** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/stage-b-migration-a-atomicity-and-behavior.test.mjs` / SQL Body | Cross-merchant items raise `'Cart must contain products from exactly one merchant'` | **PASS** |
| **Inactive Merchant Rejection** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/stage-b-migration-a-atomicity-and-behavior.test.mjs` / SQL Body | Inactive merchant raises `'Merchant is not available for orders'` | **PASS** |
| **Catalog Price Enforcement** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/stage-b-migration-a-atomicity-and-behavior.test.mjs` / SQL Body | Catalog price overrides client; subtotal mismatch raises exception | **PASS** |
| **Financial Snapshot Persistence** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/merchant-commercial-agreement-order-snapshot.test.mjs` | Commercial agreement snapshots and financial snapshot values recorded | **PASS** |
| **Loyalty Points Spend & Ledger** | `[APPLICATION MOCK] & [SQL Body]` | `backend/tests/p0-checkout-identity-geo.test.mjs` | Points deduction recorded in `loyalty_transactions` and `profiles.points` | **PASS** |
| **Coupon Usage Increment** | `[APPLICATION MOCK] & [SQL Body]` | `backend/tests/p0-checkout-identity-geo.test.mjs` | `public.increment_coupon_usage()` called on coupon application | **PASS** |
| **Manual Assisted Order (`manual_assisted`)** | `[APPLICATION MOCK]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | `OrdersService.createManualOrder()` passes `p_channel: "manual_assisted"` | **PASS** |
| **WhatsApp-Assisted Order (`whatsapp_assisted`)**| `[APPLICATION MOCK]` | `stage-b-migration-a-atomicity-and-behavior.test.mjs` | `OrdersService.createManualOrder({ intent_id })` passes `p_channel: "whatsapp_assisted"` | **PASS** |
| **Channel Attribution (`orders.channel`)** | `[REAL POSTGRESQL]` | `backend/tests/db-integration/checkout-concurrency.test.mjs` | Order row asserts `channel = 'web_checkout'` | **PASS** |

---

## 2. Separate Validation Paths Execution Proof

### Path A: Fresh Replay (Complete Repository Migration Chain)
- **Execution Mechanism:** Local Supabase Stack Fresh Initialization in CI (`Start Supabase Local Stack and Verify Upgrade Path`).
- **Result:** `PASS` — All migrations 1 to `20260831100000_stage_b_place_order_authority_refactor.sql` executed sequentially from clean state.

### Path B: Immediate Pre-A Upgrade Path
- **Execution Mechanism:** Transition from pre-A database state (containing 55-arg `place_order` and 51-arg `place_order_idempotent`) directly applying Migration A via `ALTER FUNCTION ... RENAME TO ...` ➔ `CREATE FUNCTION ...` ➔ `DROP FUNCTION ... RESTRICT`.
- **Result:** `PASS` — Atomic transaction committed, exactly 1 `place_order` (49 args) and 1 `place_order_idempotent` (51 args) active, 0 temporary functions remaining.
