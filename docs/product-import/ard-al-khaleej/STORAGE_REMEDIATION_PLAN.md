# Storage Remediation Plan — Bucket `products`

DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001 — Gate 2 correction.

**Status: NOT APPLIED.** This document is a plan only. No Storage policy has been changed by
this PR. Gate 3 (image upload) stays **blocked** until this plan is executed and re-verified —
see `STORAGE_POLICY_AUDIT.md` for the current (unsafe) policy definitions.

## 1. Current upload path (already correct — no change needed here)

Every product-image write already goes through the backend, never directly from the browser:

- `POST /uploads/products/image` (`backend/src/modules/uploads/uploads.controller.ts`) is the
  only HTTP entry point for product image uploads. It resolves the caller's actor/scope, then
  calls `UploadsService.uploadProductImage`.
- `UploadsService` (`backend/src/modules/uploads/uploads.service.ts`) performs the actual
  `SupabaseAdminService.client.storage.from("products").upload(...)` call using the
  **service-role** Supabase client — the same client the rest of the backend uses, which
  bypasses RLS/Storage policies entirely because it authenticates as `service_role`.
- Frontend callers — `src/pages/admin/ProductForm.tsx`, `src/pages/merchant/Settings.tsx`,
  `src/pages/admin/Categories.tsx` — all upload through `apiClient` (i.e. `POST
/uploads/products/image`), not through `@supabase/supabase-js` storage calls. A repo-wide
  search for `supabase.storage`/`storage.from("products")` on the frontend found **zero** call
  sites outside the backend.

**Conclusion:** the public `INSERT`/`UPDATE`/`DELETE` policies on `storage.objects` for the
`products` bucket are not required by any legitimate client path today. They are pure excess
attack surface.

## 2. Current policy definitions (unsafe — see `STORAGE_POLICY_AUDIT.md`)

| Policy name   | Command | Roles      | USING  | WITH CHECK |
| ------------- | ------- | ---------- | ------ | ---------- |
| Public Access | SELECT  | `{public}` | `true` | —          |
| Public Insert | INSERT  | `{public}` | —      | `true`     |
| Public Update | UPDATE  | `{public}` | `true` | —          |
| Public Delete | DELETE  | `{public}` | `true` | —          |

Any anonymous client holding only the publishable (anon) key can currently upload, overwrite, or
delete **any** object in the `products` bucket. This is a live security blocker independent of
the product-import work — it predates this PR and is not caused by it, but it directly blocks
Gate 3 (image upload) because Gate 3's whole safety story ("uploads only via backend service
role") is undermined while a public write path also exists in parallel.

## 3. Replacement policy set (to be applied in a future, separately-authorized migration)

```sql
-- NOT applied by this PR — for governance sign-off + a future migration file only.
drop policy if exists "Public Insert" on storage.objects;
drop policy if exists "Public Update" on storage.objects;
drop policy if exists "Public Delete" on storage.objects;

-- Keep public read — the bucket is public and the storefront/CDN needs anonymous SELECT.
-- ("Public Access" policy is left untouched.)

-- No new INSERT/UPDATE/DELETE policy is added for anon/authenticated. The backend's
-- service-role client bypasses RLS/Storage policies entirely, so it needs none — that is
-- the entire point of routing all uploads through `UploadsService`.
```

After this change, `storage.objects` for bucket `products` allows:

- `SELECT`: anyone (public bucket, unchanged).
- `INSERT` / `UPDATE` / `DELETE`: **service_role only** (implicit — RLS is bypassed by
  `service_role`, so no explicit policy is required or added for it).
- `INSERT` / `UPDATE` / `DELETE` as `anon` or `authenticated`: **denied** (no matching policy).

## 4. Test plan to run AFTER the policy change (before signing off Gate 3)

1. **Admin image upload** — as an admin actor, `POST /admin/merchants/:merchantId/products/...`
   flow that eventually calls `POST /uploads/products/image` (via `ProductForm.tsx` in the admin
   UI) with a real image file. Expect: 200, object appears in the `products` bucket, public URL
   resolves (SELECT still public).
2. **Merchant image upload** — as a merchant owner/manager actor, same endpoint via
   `src/pages/merchant/Settings.tsx` (or `ProductForm.tsx` in the merchant UI, if applicable).
   Expect: 200, object appears, public URL resolves.
3. **Anonymous direct-to-storage upload attempt (must now fail)** — using only the anon
   (publishable) key, attempt `supabase.storage.from("products").upload(...)` directly from a
   throwaway script (not through the backend). Expect: `403`/policy-denied error. This is the
   regression check that actually proves the blocker is closed.
4. **Anonymous direct-to-storage delete/update attempt (must now fail)** — same as (3) for
   `remove()`/`update()` on an existing object path. Expect: denied.
5. **Public read still works** — fetch an existing object's public URL unauthenticated. Expect:
   200 (SELECT policy untouched).
6. Re-run `STORAGE_POLICY_AUDIT.md`'s policy listing query and confirm only `SELECT` remains for
   `anon`/`public`.

## 5. Gate impact

- **Gate 3 (image upload) stays BLOCKED** until steps 1–6 above are executed against a real
  (non-production, or production-with-explicit-approval) Supabase project and all pass.
- This remediation is independent of, and does not require, the `product_import_confirm_atomic`
  migration (Part A of this PR) — the two can be applied in either order, but Gate 3 needs
  _both_ (safe atomic confirm + hardened Storage policies) before it can be unblocked.
- No Storage policy has been changed by this PR; this document only records the plan per the
  task constraints ("Do NOT change Storage policies").
