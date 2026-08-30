# Store Backend Guardrails

## Architectural guardrails (effective immediately)

## Core principle

**Backend is the only source of business truth.**

## Forbidden from now on

1. New business logic inside frontend pages/hooks/components.
2. New checkout/pricing/coupon/inventory/loyalty rules in client code.
3. New Supabase Edge Functions for domain orchestration.
4. New scheduling/cron orchestration inside Supabase.
5. Long business workflows embedded in SQL or RPC.

## Allowed in Supabase

- Postgres schema + migrations
- indexes/constraints/foreign keys
- RLS policies
- auth/storage primitives
- minimal atomic SQL helpers only when unavoidable

## Allowed in frontend

- Rendering/UI/forms
- local state + optimistic UX
- query caching
- API calling only (`src/lib/api-client.ts`)

## Backend coding rules

1. Controllers must be thin.
2. Services own business logic.
3. Data access should be isolated in repository-like layers over time.
4. DTO validation is mandatory for write endpoints.
5. Endpoint responses must stay stable for web/mobile reuse.
6. Server-side authorization enforced regardless of client behavior.

## CI/Review enforcement

- Any PR that introduces new `supabase.from/rpc` in client business flows is rejected.
- Any PR that adds business orchestration in SQL/RPC without approval is rejected.
- Any new feature must define backend endpoint contract first.

## Migration policy

- Existing direct client reads can remain temporarily if classified non-critical.
- Critical flows (checkout, pricing, orders, inventory, coupon, loyalty) must be backend-first.
- Transitional adapters are acceptable only with explicit deprecation notes.
