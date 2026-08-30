-- DilMart-PRODUCT-STORAGE-SECURITY-REMEDIATION-001
-- Gate S1: Lock down write access on the public `products` Storage bucket.
--
-- STATUS: Migration file only until separately authorized for remote apply.
-- Do NOT apply to production without an explicit Gate D2-style authorization.
--
-- Problem:
--   supabase/migrations/20260214215000_fix_storage.sql replaced Storage object policies
--   with unrestricted public INSERT/UPDATE/DELETE (USING/WITH CHECK true). Any client that
--   holds only the publishable anon key can upload, overwrite, or delete objects.
--
-- Legitimate write path today:
--   Backend `POST /uploads/products/image` → UploadsService → service_role
--   `storage.from('products').upload(...)`. Service role bypasses Storage RLS, so it does
--   not need (and must not rely on) public write policies.
--
-- Frontend callers (admin ProductForm, merchant Settings, admin Categories) upload only via
-- the backend API — there is no direct browser → Storage write path for product images.
--
-- This migration:
--   1. DROPS public INSERT / UPDATE / DELETE policies on storage.objects
--   2. KEEPS public SELECT ("Public Access") so CDN / storefront image URLs keep working
--   3. Adds NO new write policies for anon/authenticated — writes remain service_role-only

DROP POLICY IF EXISTS "Public Insert" ON storage.objects;
DROP POLICY IF EXISTS "Public Update" ON storage.objects;
DROP POLICY IF EXISTS "Public Delete" ON storage.objects;

-- Intentionally leave "Public Access" (SELECT) in place.
-- After this migration, expected policy set for product media:
--   SELECT : public (Public Access)
--   INSERT/UPDATE/DELETE : denied for anon/authenticated; available to service_role via bypass
