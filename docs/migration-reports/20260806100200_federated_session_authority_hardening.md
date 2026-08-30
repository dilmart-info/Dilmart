# Migration Report — 20260806100200_federated_session_authority_hardening

- **Task:** STORE-PR4 Security Closure — Session Authority & Concurrency
- **Type:** additive; REPLACES the six federated session RPCs with hardened versions (old signatures explicitly `DROP`ped first so no stale overload remains callable).
- **Environment:** validated on a clean local Supabase CLI stack (`supabase db reset`).
- **Deployment status of the migrations it layers on:** `20260806100100` is UNMERGED — it exists only on Draft PR #78 and has never been applied to a persistent (staging/production) environment. Therefore no deployed function state is being mutated; a reviewer applies the whole PR4 chain fresh.
- **Feature flag:** unchanged; all RPCs are inert unless `STORE_FEDERATED_AUTH_ENABLED=true`.

## What changes (per blocker)

- **B1 — logout authority.** `logout_federated_session` / `logout_all_federated_sessions` now require a **currently-valid, locked** refresh token (used_at NULL, revoked_at NULL, not expired, family ACTIVE / not revoked / not absolutely-expired / not inactivity-expired, and the token belongs to the locked family). An invalid/used/revoked/expired/unknown token makes **no** change and emits **no** success audit; the response stays the generic `logged_out` (no existence oracle). `logout_all` revokes only families matching **all three** identity values (store_customer_id + linked_profile_id + DilMart_user_id).
- **B2 — lock ordering.** `rotate` / `logout` / `logout_all` use one deterministic order: read token → family id (unlocked), lock the **family** `FOR UPDATE`, then lock the exact **token** `FOR UPDATE`, then revalidate membership. No token-first locking anywhere → no lifecycle deadlocks.
- **B3 — constants in the DB.** The trusted TTL/rate/window parameters are **removed** from `rotate` and the inactivity TTL from `validate`. Approved values are `CONSTANT`s inside PostgreSQL (refresh/inactive 2592000, rate 30, window 3600). Old signatures are dropped, so a caller can no longer supply them.
- **B4 — real lifetime.** `redeem_and_create` and `rotate` return `refresh_expires_in_seconds`, computed by PostgreSQL from the committed `expires_at = LEAST(now + 30d, family.absolute_expires_at)`.
- **B6 — context binding.** `redeem_and_create` takes expected handoff_id / store_customer_id / linked_profile_id / DilMart_user_id / target_path and checks them **under lock before consuming** (mismatch → `HANDOFF_CONTEXT_MISMATCH`, full rollback, code unspent). `rotate` takes expected family_id / store_customer_id / linked_profile_id / DilMart_user_id / session_version and checks them under lock (mismatch → no rotation). Successful results return every committed identity value.
- **B7 — revoke selector.** `revoke_federated_sessions_for_identity` uses **AND** semantics: when both selectors are supplied a family must match BOTH; a single selector is allowed; the widening OR is gone.

## Security invariants preserved

All functions remain `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, `REVOKE`d from PUBLIC/anon/authenticated and `GRANT`ed to `service_role` only. `clock_timestamp()` remains the sole expiry authority. The immutable audit tables are unchanged.

## Validation

- Applies cleanly under `supabase db reset` (full PR4 chain: hardening → functions → authority-hardening).
- Proven by `federated-session-logout-authority` (9), `-context-binding` (12), `-revoke-selector` (4), `-constants` (5), `-lifecycle-concurrency` (5×25), plus the retained core (9) and 25×2 redeem / 25×2 refresh concurrency suites.

## Rollback

Additive; rollback = drop the hardened functions and (if desired) re-create the `20260806100100` versions. No data rewrite. Dormant while the flag is unset.
