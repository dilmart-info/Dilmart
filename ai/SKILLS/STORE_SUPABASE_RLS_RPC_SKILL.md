# Skill: Supabase RLS/RPC/Migrations — DilMart-Store

## Mission

Protect database integrity while supporting backend-driven marketplace operations.

## Rules

- Do not edit applied migrations.
- Add new timestamped migrations.
- Prefer idempotent statements where possible.
- Keep service_role-only functions locked down.
- Do not expose service role to frontend.
- RLS must protect tables even if backend has bugs.
- RPCs should be minimal atomic helpers, not giant unmanaged business workflows unless already established and reviewed.

## Migration Checklist

- [ ] New migration file timestamped correctly.
- [ ] No destructive operation unless explicitly approved.
- [ ] Constraints/indexes named clearly.
- [ ] RLS policies reviewed.
- [ ] RPC permissions reviewed.
- [ ] Grants/revokes explicit.
- [ ] Backfill safe and bounded.
- [ ] Rollback risk noted.

## RPC Safety Questions

- Can anonymous users call it?
- Can authenticated users call it with spoofed IDs?
- Does it trust client totals?
- Does it lock rows where race conditions matter?
- Is it idempotent or protected against duplicate execution?
- Does it return stable shape expected by frontend/backend?

## Output Required

```md
# Supabase Safety Review

## Migration/RPC

...

## Risks

- ...

## Permissions

- anon:
- authenticated:
- service_role:

## Data Integrity

- ...

## Verdict

PASS / PASS WITH NOTES / FAIL
```
