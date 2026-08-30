# Storage Policy Audit — Bucket `products`

**Project:** `ztplxqlthuqkuktbznbo`  
**Date:** 2026-08-01  
**Bucket:** `products` (public = true)

## Exact policy definitions (`storage.objects`)

| Policy name   | Command | Roles      | USING  | WITH CHECK |
| ------------- | ------- | ---------- | ------ | ---------- |
| Public Access | SELECT  | `{public}` | `true` | null       |
| Public Insert | INSERT  | `{public}` | null   | `true`     |
| Public Update | UPDATE  | `{public}` | `true` | null       |
| Public Delete | DELETE  | `{public}` | `true` | null       |

## Classification

| Access                           | Expected? | Status               |
| -------------------------------- | --------- | -------------------- |
| Public **read** on public bucket | Yes       | OK                   |
| Anonymous/public **INSERT**      | No        | **SECURITY BLOCKER** |
| Anonymous/public **UPDATE**      | No        | **SECURITY BLOCKER** |
| Anonymous/public **DELETE**      | No        | **SECURITY BLOCKER** |

## Gate impact

- Gate 1: documented only; policies **not** changed (requires separate authorization).
- **Gate 3 image upload is BLOCKED** until write/delete policies are restricted to service role / authenticated backend paths.

## Recommended remediation (not applied)

1. Drop `Public Insert`, `Public Update`, `Public Delete`.
2. Keep public SELECT for CDN/storefront reads (or switch to signed URLs later).
3. Perform uploads only via backend service role / signed upload tokens.
