# Skill: Performance, Staging & Deployment — DilMart-Store

## Mission

Prepare DilMart-Store for reliable staging and production deployment.

## Concerns

- Render backend cold start.
- Netlify frontend build.
- Supabase staging/prod separation.
- environment variables.
- CI install reliability.
- caching strategy.
- API response latency.
- image optimization.
- rollback.

## Staging/Prod Rule

Staging and production must have separate:

- Supabase project
- Render backend service
- Netlify frontend site/env
- API base URLs
- service role keys
- anon keys
- storage buckets or prefixes

Never point staging frontend to production backend/DB unless explicitly intentional.

## Performance Checklist

- [ ] home/catalog APIs cached where safe.
- [ ] product images optimized.
- [ ] cold start mitigation documented.
- [ ] critical API endpoints measured.
- [ ] no expensive frontend Supabase scans.
- [ ] no unbounded admin queries.
- [ ] pagination for large lists.

## Deployment Checklist

- [ ] `npm ci` works in CI environment.
- [ ] frontend build passes.
- [ ] backend build passes.
- [ ] env example updated.
- [ ] migration plan documented.
- [ ] rollback plan documented.
- [ ] smoke test after deploy.

## Output Required

```md
# Deployment/Performance Review

## Environment

Local / Staging / Production

## Findings

- ...

## Required Fixes

- ...

## Validation

- ...

## Verdict

PASS / PASS WITH NOTES / FAIL
```
