-- Gate 2 correction (DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001): public product-read RLS must
-- enforce the FULL triple-state visibility contract (`is_active`, `is_published`,
-- `visibility_status`), not just `is_active`. NOT applied by this change — same governance gate
-- as supabase/migrations/20260801190000_product_import_confirm_atomic.sql; see GATE1_REPORT.md.
--
-- Problem being fixed: the current public SELECT policy on `public.products`
-- ("Public can view active merchant products", from
-- supabase/migrations/20260421110000_marketplace_rls.sql) only checks
-- `is_active = true AND merchants.status = 'active'`. It does NOT check `is_published` or
-- `visibility_status`. Application-layer query helpers (`applyPublicProductFilters` /
-- `isPubliclyListableProduct`, see GATE1_REPORT.md "Visibility surfaces covered") already add
-- `is_published = true AND visibility_status = 'public'` on every public read path, but RLS is
-- the actual last line of defense: any query that reaches `public.products` under the `anon` or
-- `authenticated` role WITHOUT going through those helpers (a future endpoint, a raw
-- PostgREST/Supabase client call, a bug) would still leak imported-but-not-yet-published
-- products (which import creates as `is_active=false, is_published=false,
-- visibility_status='private'` by default, but a merchant/admin could flip `is_active=true`
-- without also publishing). This migration makes RLS itself enforce the full triple-state rule
-- so the database is safe even if an application-layer filter is ever missed.
--
-- Merchant/admin write and same-merchant-read access is UNCHANGED — "Admins can manage all
-- products" and "Merchant members can manage own products" (both FOR ALL, from the same 2026
-- 0421 migration) are preserved as-is; only the public-facing SELECT policy is replaced.
DROP POLICY IF EXISTS "Products are publicly readable" ON public.products;
DROP POLICY IF EXISTS "Public can view active merchant products" ON public.products;
DROP POLICY IF EXISTS "Products are viewable by everyone" ON public.products;
DROP POLICY IF EXISTS "Public can view published active merchant products" ON public.products;

CREATE POLICY "Public can view published active merchant products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (
  is_active = true
  AND is_published = true
  AND visibility_status = 'public'
  AND EXISTS (
    SELECT 1 FROM public.merchants m
    WHERE m.id = products.merchant_id AND m.status = 'active'
  )
);

-- Belt-and-suspenders: an RLS policy only RESTRICTS access that the role already has via a
-- table-level GRANT — it never grants access on its own. Supabase-hosted projects provision this
-- base `SELECT` grant for `anon`/`authenticated` automatically outside of user migration history,
-- which is why the previous (also anon-facing) policy has always worked in production. That
-- provisioning step is NOT replayed by a local/CI `supabase db reset`, so without this explicit,
-- idempotent GRANT a fresh local/CI database would have a working RLS policy that is still
-- completely unreachable by `anon`/`authenticated` (a `permission denied for table products`
-- error, not a `0 rows` RLS-filtered result) — this line makes the policy testable and correct in
-- every environment, and is a harmless no-op anywhere the grant already exists.
--
-- The policy's `EXISTS (SELECT 1 FROM public.merchants ...)` subquery also runs under the
-- QUERYING role's own privileges (it is a plain USING clause, not a SECURITY DEFINER function
-- like `is_platform_admin()`/`is_merchant_member()`), so `anon`/`authenticated` need base SELECT
-- on `public.merchants` too — this was already an implicit requirement of the PRIOR policy
-- ("Public can view active merchant products", which has the same EXISTS-on-merchants shape) and
-- is preserved unchanged here, not a new requirement introduced by this migration.
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.merchants TO anon, authenticated;

-- Preserved, unchanged (re-created only if missing, e.g. on a fresh DB where the 2026-04-21
-- migration already ran and these still exist — CREATE POLICY IF NOT EXISTS is not standard
-- Postgres syntax, so use a guarded DO block instead of dropping/recreating policies we must
-- not touch).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Admins can manage all products'
  ) THEN
    CREATE POLICY "Admins can manage all products"
    ON public.products
    FOR ALL
    USING (public.is_platform_admin())
    WITH CHECK (public.is_platform_admin());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' AND policyname = 'Merchant members can manage own products'
  ) THEN
    CREATE POLICY "Merchant members can manage own products"
    ON public.products
    FOR ALL
    USING (public.is_merchant_member(merchant_id))
    WITH CHECK (public.is_merchant_member(merchant_id));
  END IF;
END $$;
