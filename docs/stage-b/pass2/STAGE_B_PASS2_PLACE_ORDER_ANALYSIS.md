# DILMART — STAGE B PASS 2
# DEEP-DIVE ANALYSIS: `public.place_order` & CHECKOUT AUTHORITY

**Generated:** 2026-08-30 | **Status:** READ-ONLY AUDIT BASELINE
**Target Function:** `public.place_order(...)`
**Source Location:** `supabase/migrations/20260820180000_order_finance_core_contracts.sql` / Live PostgreSQL `pg_proc`

---

## 1. Live Function Identity & Metadata

- **`p.oid::regprocedure`:**
  ```text
  public.place_order(text, text, uuid, text, text, text, numeric, numeric, numeric, numeric, uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid, text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, uuid, text, text)
  ```
- **Security Mode:** `SECURITY DEFINER` (`prosecdef = true`)
- **Search Path:** `public, pg_temp` (`proconfig = ["search_path=public, pg_temp"]`)
- **Execution Authority:** `service_role` ONLY (`anon` = false, `authenticated` = false, `PUBLIC` = false)
- **Status:** **REFACTOR / MODIFY (CRITICAL CHECKOUT BLOCKER)**

---

## 2. Answers to Explicit Architectural Questions

### Q1: Is `place_order` still runtime reachable?
**YES.** `place_order` is actively called on every checkout submission:
1. Called by `place_order_idempotent` in Section 2 (`v_order_number := public.place_order( ... Named Parameters ... );`).
2. Called as direct fallback by `backend/src/modules/checkout/checkout.service.ts` when `attemptId` is omitted.

### Q2: Which backend route/RPC invokes it?
- Route: `POST /api/checkout/submit`
- Controller: `CheckoutController.submit()`
- Service: `CheckoutService.submit()`
- DB RPC: `place_order_idempotent` (which wraps `place_order`).

### Q3: Is `place_order_idempotent` the preferred modern authority?
**YES.** `place_order_idempotent` provides the authoritative transactional idempotency lock, request payload hashing, and order-attempt linkage. It delegates the core order insertion and inventory decrement logic to `place_order`.

### Q4: Are both functions active?
**YES.** They work as a nested transactional pair: `place_order_idempotent` handles attempt locking & deduplication, while `place_order` executes the order creation and stock decrements.

### Q5: Can `place_order` be retired entirely?
**NO.** `place_order` contains the core commercial logic:
- Order record insertion into `public.orders`
- Order items batch insertion into `public.order_items`
- Loyalty points deduction & transaction logging in `public.loyalty_transactions`
- Atomic stock decrements in `public.products` (`stock_quantity = stock_quantity - item.quantity`, `sold_count = sold_count + item.quantity`)
- Coupon redemption recording

### Q6: Must `place_order` be recreated before legacy columns are removed?
**YES, ABSOLUTELY.** The current function body of `place_order` includes:
```sql
dilmart_user_id = p_dilmart_user_id,
dilmart_barbershop_id = p_dilmart_barbershop_id,
segment = p_segment,
business_type = p_business_type
```
If `orders.dilmart_user_id` or `orders.dilmart_barbershop_id` are dropped before `place_order` is refactored, any subsequent checkout call will throw a PostgreSQL runtime syntax error (`column "dilmart_user_id" does not exist`).

### Q7: Does any checkout path depend on its current signature?
**NO.** Modern callers pass parameters by name. The legacy parameters (`p_store_linked_profile_id`, `p_dilmart_user_id`, `p_dilmart_barbershop_id`, `p_segment`, `p_business_type`) default to `NULL` and are not passed by modern checkout clients.

---

## 3. Final Strategic Verdict: `REFACTOR` (Wave 0)

1. **Step 1:** Author forward migration to re-create `public.place_order` with pure modern arguments, removing all legacy parameters and column writes.
2. **Step 2:** Verify checkout test suites (`checkout-concurrency.test.mjs`, `p0-checkout-identity-geo.test.mjs`).
3. **Step 3:** Only after Step 1 & 2 succeed can `orders.dilmart_user_id` and `orders.dilmart_barbershop_id` be safely dropped.
