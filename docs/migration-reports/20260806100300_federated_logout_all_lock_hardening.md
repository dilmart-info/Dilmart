# Migration Report — 20260806100300_federated_logout_all_lock_hardening

- **Task:** STORE-PR4 Final Closure — Multi-Family Logout-All Concurrency
- **Type:** additive; replaces ONLY `logout_all_federated_sessions` (old `(TEXT,UUID)` signature dropped first).
- **Environment:** validated on a clean local Supabase CLI stack. Layers on the unmerged PR4 chain (100000/100100/100200) — none of which is deployed to a persistent environment. No merged STORE-PR3 migration is touched.
- **Feature flag:** inert unless `STORE_FEDERATED_AUTH_ENABLED=true`.

## The deadlock this fixes

The previous `logout_all` locked the **presented token's family first**, then every ACTIVE identity family in `ORDER BY id`. Two concurrent logout-all calls presenting valid tokens from **different families of the same identity** could cycle:

```
T1 holds family A → waits for family B
T2 holds family B → waits for family A
```

The pre-existing lifecycle-concurrency test only exercised one family / the same token twice, so it never surfaced this.

## The fix — identity-level serialization before any family lock

New order inside `logout_all_federated_sessions`:

1. Resolve the presented token → family → identity triple **without** a row lock.
2. **Identity mutex:** `SELECT ... FROM store_linked_profiles WHERE id = linked_profile_id FOR UPDATE`. The identity triple is 1:1:1 with that row, so only one logout-all per identity proceeds at a time — the A↔B cycle cannot form.
3. Re-read/revalidate the identity context under the mutex.
4. Lock every matching ACTIVE family in one `ORDER BY id FOR UPDATE` pass.
5. Lock the exact presented refresh-token row (its family is already locked → the global **family→token** order used by rotate/logout is preserved).
6. Authority gate: presented token belongs to the expected family, is unused/unrevoked/unexpired; presented family is ACTIVE/unexpired and matches store_customer_id + linked_profile_id + DilMart_user_id. Failure → no change, no success audit, generic `logged_out`.
7. Revoke every locked ACTIVE family + its tokens; exactly one `FEDERATED_SESSION_LOGOUT_ALL` audit per revoked family; each `session_version` increments once.

## Acyclic interaction with the other lifecycle RPCs

- `rotate` / `logout_federated_session`: lock family→token, never take the linked_profiles lock.
- `revoke_federated_sessions_for_identity`: locks families in the **same** `ORDER BY id`, never takes the linked_profiles lock.
- `redeem_and_create_federated_session`: locks handoff→linked_profiles and only INSERTs a new family (never locks an existing one).

No lock-acquisition cycle exists across these paths.

## Security invariants preserved

`SECURITY DEFINER`, `SET search_path = pg_catalog, public`, `REVOKE`d from PUBLIC/anon/authenticated, `GRANT`ed to `service_role` only. `clock_timestamp()` remains the sole expiry authority.

## Validation

`federated-session-logout-all-multifamily.test.mjs`: 50× cross-family `logoutAll(A)` vs `logoutAll(B)` across **both** UUID orderings (A.id<B.id and A.id>B.id) via `Promise.all`, plus 25× each of logout-all vs refresh / logout / revoke on the sibling family. Every iteration: deadlock count 0, SQLSTATE count 0, both calls return `logged_out`, all identity families REVOKED with `session_version` bumped exactly once, all live tokens revoked, exactly one logout-all audit per family, and an unrelated identity untouched.

## Rollback

Additive; rollback = drop the function and re-create the `20260806100200` version. No data rewrite. Dormant while the flag is unset.
