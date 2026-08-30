-- DILMART-STORE-PRODUCT-IMPORT-SESSIONS-RLS-001 (P0 LAUNCH BLOCKER REMEDIATION)
-- Enables Row Level Security on public.product_import_sessions, revokes direct
-- browser table privileges, and installs fail-closed tenant-isolated RLS policies.
--
-- WHY
-- Investigation found that public.product_import_sessions was created without
-- RLS enabled and without explicit table-level permission revokes, leaving anon
-- and authenticated roles with default CRUD privileges over PostgREST / Data API.
--
-- CONTAINMENT
-- 1. Enable Row Level Security (ALTER TABLE public.product_import_sessions ENABLE ROW LEVEL SECURITY).
-- 2. Revoke all privileges from anon.
-- 3. Revoke direct INSERT, UPDATE, DELETE privileges from authenticated browser role.
-- 4. Install fail-closed policies:
--    - "Admins can manage product_import_sessions" (FOR ALL USING app_private.is_platform_admin() WITH CHECK app_private.is_platform_admin())
--    - "Merchants can view own product_import_sessions" (FOR SELECT TO authenticated USING (app_private.is_merchant_member(merchant_id)))
--    - "Merchants can insert own product_import_sessions" (FOR INSERT TO authenticated WITH CHECK (app_private.is_merchant_member(merchant_id)))
--    - "Merchants can update own product_import_sessions" (FOR UPDATE TO authenticated USING (app_private.is_merchant_member(merchant_id)) WITH CHECK (app_private.is_merchant_member(merchant_id)))
-- 5. Service_role preserves full CRUD for backend ProductImportService execution.

BEGIN;

-- 1. Enable RLS
ALTER TABLE IF EXISTS public.product_import_sessions ENABLE ROW LEVEL SECURITY;

-- 2. Revoke browser mutation privileges
REVOKE ALL ON TABLE public.product_import_sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.product_import_sessions FROM authenticated;

-- 3. Drop existing policies if any
DROP POLICY IF EXISTS "Admins can manage product_import_sessions" ON public.product_import_sessions;
DROP POLICY IF EXISTS "Merchants can view own product_import_sessions" ON public.product_import_sessions;
DROP POLICY IF EXISTS "Merchants can insert own product_import_sessions" ON public.product_import_sessions;
DROP POLICY IF EXISTS "Merchants can update own product_import_sessions" ON public.product_import_sessions;

-- 4. Create authoritative fail-closed policies
CREATE POLICY "Admins can manage product_import_sessions"
ON public.product_import_sessions
FOR ALL
TO public
USING (app_private.is_platform_admin())
WITH CHECK (app_private.is_platform_admin());

CREATE POLICY "Merchants can view own product_import_sessions"
ON public.product_import_sessions
FOR SELECT
TO authenticated
USING (app_private.is_merchant_member(merchant_id));

CREATE POLICY "Merchants can insert own product_import_sessions"
ON public.product_import_sessions
FOR INSERT
TO authenticated
WITH CHECK (app_private.is_merchant_member(merchant_id));

CREATE POLICY "Merchants can update own product_import_sessions"
ON public.product_import_sessions
FOR UPDATE
TO authenticated
USING (app_private.is_merchant_member(merchant_id))
WITH CHECK (app_private.is_merchant_member(merchant_id));

COMMIT;
