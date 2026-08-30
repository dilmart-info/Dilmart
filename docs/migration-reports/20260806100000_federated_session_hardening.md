# Migration Report — 20260806100000_federated_session_hardening

- **Task:** DilMart-CUSTOMER-STORE-STORE-PR4 (Federated Store Session Core)
- **Environment:** additive schema change; validated on the local Supabase CLI stack via `supabase db reset`.
- **Feature flag:** inert unless `STORE_FEDERATED_AUTH_ENABLED=true` (no flag is enabled by this migration).

## Scope

Additive hardening of the federated session tables + the immutable session audit log. No column is dropped or narrowed; no existing row is rewritten.

### `store_federated_session_families` (added, additive)

- `updated_at timestamptz not null default clock_timestamp()`
- `last_rotated_at timestamptz null`
- `refresh_window_started_at timestamptz null`
- `refresh_count integer not null default 0`
- CHECK constraints: `session_version >= 1`, `refresh_count >= 0`, `absolute_expires_at > created_at`, and `status in ('REVOKED','COMPROMISED') ⇒ revoked_at is not null`.

### `store_federated_refresh_tokens` (added, additive)

- `replaced_by_token_id uuid null` → self-FK to `store_federated_refresh_tokens(id)` (rotation lineage).
- `reuse_detected_at timestamptz null`.

### `store_federated_session_audit_events` (new)

- Immutable by construction: `reject_federated_session_audit_mutation()` BEFORE UPDATE OR DELETE trigger raises.
- `FORCE ROW LEVEL SECURITY`, service-role only; no anon/authenticated grant.
- Referenced by value (event_type, session_family_id, store_customer_id, DilMart_user_id, request_id, detail jsonb, created_at at `clock_timestamp()`), **no cascading FK** so audit survives row lifecycle.
- Supporting indexes on `session_family_id` and `(store_customer_id, created_at)`.

## Time authority

All timestamps default to PostgreSQL `clock_timestamp()`; no application-supplied time is trusted for audit or expiry.

## Validation

- `supabase db reset` applies cleanly from empty.
- RLS/permission/immutability asserted by `tests/db-integration/federated-session-core.test.mjs` (audit UPDATE/DELETE rejected; anon/authenticated blocked).

## Rollback

Additive only. Rollback = drop the new table + the added columns/constraints; no data migration to reverse. The feature stays dormant while `STORE_FEDERATED_AUTH_ENABLED` is unset, so a rollback has no runtime effect on existing flows.
