# DILMART — STAGE B PASS 4: MIGRATION B DEPENDENCY-ORDERING & DESTRUCTION DESIGN

## 1. Safety Architecture: Zero CASCADE Principle

Migration B operates under a strict **Zero CASCADE** policy. Every dependent database object (triggers, constraints, foreign keys, indexes, columns, child tables, and parent tables) is explicitly enumerated and dropped in exact topological order.

If any unexpected dependency exists, PostgreSQL will immediately fail closed and abort the transaction via standard transaction rollback.

---

## 2. Dependency Graph & Execution Sequence

```
[Fail-Closed Preflight: Migration A Invariants + Zero Data Assertions]
                               │
                               ▼
    [Step 1: Drop Triggers on Legacy Audit Tables]
     - trg_reject_barber_handoff_audit_mutation
     - trg_reject_handoff_audit_mutation
     - trg_reject_federated_session_audit_mutation
                               │
                               ▼
    [Step 2: Drop 16 Legacy Functions + 2 Trigger Functions by Exact Identity]
     - finalize_barber_handoff(uuid, text, ...)
     - finalize_customer_handoff(...)
     - logout_all_federated_sessions(...)
     - place_b2b_cart_order_idempotent(...)
     - provision_dilmart_federated_customer(...)
     - redeem_and_create_federated_session(...)
     - redeem_barber_handoff_and_create_session(...)
     - redeem_customer_handoff(...)
     - reject_barber_handoff_audit_mutation()
     - reject_handoff_audit_mutation()
     - reject_federated_session_audit_mutation()
     - reject_reserved_federated_email()
     - resolve_dilmart_federated_customer(...)
     - revoke_barber_web_sessions_for_user(...)
     - revoke_federated_sessions_for_identity(...)
     - rotate_federated_refresh_token(...)
     - validate_federated_session_family(...)
     - verify_barber_web_session(...)
                               │
                               ▼
    [Step 3: Drop Foreign Keys, Check Constraints & Indexes on Active Tables]
     - checkout_attempts: drop chk_checkout_attempts_owner_xor, drop 2 FKs, drop 2 indexes
     - checkout_attempts: add clean chk_checkout_attempts_user_id_not_null
     - orders: drop 2 FKs, drop 4 indexes
     - products: drop 1 index (idx_products_requires_verified_salon)
                               │
                               ▼
    [Step 4: Drop Legacy Columns from Active Tables]
     - checkout_attempts: store_cart_id, store_linked_profile_id
     - orders: dilmart_barbershop_id, dilmart_user_id, store_cart_id, store_linked_profile_id
     - products: requires_verified_salon
                               │
                               ▼
    [Step 5: Drop Child Legacy Tables (No Outward Foreign References)]
     - dilmart_barber_handoff_audit_events
     - dilmart_customer_handoff_audit_events
     - store_federated_session_audit_events
     - store_federated_refresh_tokens
     - store_cart_items
                               │
                               ▼
    [Step 6: Drop Intermediate Legacy Tables]
     - dilmart_barber_web_sessions
     - dilmart_barber_handoffs
     - dilmart_customer_handoffs
     - store_federated_session_families
     - store_carts
                               │
                               ▼
    [Step 7: Drop Root Legacy Table]
     - store_linked_profiles
                               │
                               ▼
[Step 8: Fail-Closed Postcondition Assertions: 0 Functions, 0 Tables, 0 Columns, Pristine place_order]
```

---

## 3. Preflight & Postcondition Guard Invariants

1. **Migration A Authority Preservation:**
   - Preflight & Postconditions explicitly assert that `public.place_order` (49 arguments) and `public.place_order_idempotent` (51 arguments) are owned by `postgres`, configured with `SECURITY DEFINER` and `search_path = public, pg_temp`, and granted exclusively to `service_role`.
   - Migration B will immediately refuse to execute on any database that has not consumed Migration A.

2. **Data Safety Assurance:**
   - Preflight iterates over all 11 legacy tables. If any table contains > 0 rows, execution halts with `STAGE_B_PREFLIGHT_FAIL`.
   - Preflight checks all legacy columns on active tables. If any non-null or non-default values exist, execution halts with `STAGE_B_PREFLIGHT_FAIL`.
