# Store Identity Linking Strategy

## Goal

Prepare the store for future identity linkage with DilMart while keeping the store as an independent domain now.

## Current state

- Store identity is managed in Supabase (`auth.users` + `profiles`)
- Merchant memberships mapped through `merchant_users`

## Target direction

Introduce external identity linking without forcing immediate SSO rollout.

## Recommended model

1. Keep local store user id as authoritative for store runtime.
2. Add future mapping table (planned):
   - `external_identities`
   - columns: `provider`, `provider_user_id`, `store_user_id`, `linked_at`, `status`
3. Token exchange/SSO can be layered later via backend auth module.

## Constraints for now

- Do not hardcode UI assumptions tied to Supabase token shape.
- Use backend-issued session context for business endpoints over time.
- Avoid embedding provider-specific claims in business logic.

## Future SSO rollout (high-level)

1. DilMart authenticates user.
2. Backend verifies DilMart token signature.
3. Backend maps/creates store user link.
4. Backend issues store API session/JWT.
5. Frontends use store backend token only for domain APIs.

## Anti-patterns to avoid now

- Coupling domain authorization to frontend-decoded Supabase claims.
- Writing business rules based on external provider payload formats.
- Duplicating user-role derivation in clients.
