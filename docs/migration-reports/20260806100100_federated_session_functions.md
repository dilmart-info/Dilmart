# Migration Report — 20260806100100_federated_session_functions

- **Task:** DilMart-CUSTOMER-STORE-STORE-PR4 (Federated Store Session Core)
- **Environment:** additive; SECURITY DEFINER RPCs. Validated on the local Supabase CLI stack.
- **Feature flag:** RPCs exist but are only invoked when the backend feature `STORE_FEDERATED_AUTH_ENABLED=true`.

## Scope — new RPCs (all `SECURITY DEFINER`, `SET search_path = pg_catalog, public`, `REVOKE ... FROM PUBLIC/anon/authenticated`, `GRANT ... TO service_role`)

1. **`redeem_and_create_federated_session(...)`** — the single atomic consume→create. Validates the handoff `FOR UPDATE`, re-checks LINKED + the link row + customer-compatible profile, marks the handoff redeemed, inserts the session family + first refresh-token hash, and writes `HANDOFF_REDEEMED` + `FEDERATED_SESSION_CREATED` audits — all in one transaction. TTL guard requires exactly `refresh=2592000` / `absolute=7776000`. Returns `(status, error_code, store_customer_id, linked_profile_id, DilMart_user_id, target_path, display_name)`.

2. **`rotate_federated_refresh_token(...)`** — reuse detection FIRST (a token whose `used_at` is already set ⇒ mark family `COMPROMISED`, bump `session_version`, revoke all its tokens, committed not rolled back); then expiry/family/device checks; then a DB-time fixed-window rate limit (30 / 3600s) under the family row lock; then rotation (insert the child refresh row FIRST, then set the parent's `used_at` + `replaced_by_token_id`). Returns `(status, error_code, family_id, store_customer_id, linked_profile_id, DilMart_user_id, session_version)`.

3. **`logout_federated_session(...)`** — mark the family `REVOKED`, `session_version + 1`, revoke tokens; idempotent; returns a constant `status='logged_out'` (no existence oracle).

4. **`logout_all_federated_sessions(...)`** — revoke every ACTIVE family for the same identity (`store_customer_id` + `DilMart_user_id`).

5. **`revoke_federated_sessions_for_identity(...)`** — internal foundation for STORE-PR5 identity-wide revocation; returns `revoked_count`.

6. **`validate_federated_session_family(...)`** — read-only DB-time validation (family ACTIVE, version match, not past inactive/absolute expiry); returns `(valid, store_customer_id, linked_profile_id, DilMart_user_id, session_version, email, phone)`. Consumed by the access-token verifier.

## Time authority

All expiry decisions use PostgreSQL `clock_timestamp()`; the application never supplies "now".

## Validation

- Applies cleanly under `supabase db reset`.
- Behaviour proven by `federated-session-core.test.mjs` (9 cases) + `federated-session-redeem-concurrency.test.mjs` (25×2) + `federated-session-refresh-concurrency.test.mjs` (25×2): exactly-one redeem winner, atomic rollback, DB-time expiry, rotation chain, reuse→COMPROMISED, logout idempotency, identity isolation.

## Rollback

Additive; rollback = `DROP FUNCTION` for the six RPCs. No data rewrite. Dormant while the feature flag is unset.
