-- DILMART-STORE-PRODUCT-IMPORT-SESSIONS-RLS-001 (P0 LAUNCH BLOCKER REMEDIATION)
-- Enables Row Level Security on public.product_import_sessions, revokes all direct
-- browser table privileges, drops obsolete browser policies, and restricts CRUD strictly
-- to the trusted backend service_role.
--
-- WHY
-- Investigation found that public.product_import_sessions was created in migration
-- 20260426090000_m20_merchant_productivity_layer.sql without RLS enabled and without
-- privilege revokes, leaving anon and authenticated roles with default CRUD over Data API.
--
-- RUNTIME CONTRACT & LEAST PRIVILEGE
-- Frontend has 0 direct PostgREST calls to product_import_sessions.
-- ProductImportService and product_import_confirm_atomic interact strictly through
-- backend NestJS and SupabaseAdmin (service_role) with strict tenant scope checks.
-- Direct browser access is completely unneeded and eliminated.

BEGIN;

-- 1. Enable RLS (fail closed without IF EXISTS to trap schema drift)
ALTER TABLE public.product_import_sessions
ENABLE ROW LEVEL SECURITY;

-- 2. Revoke all privileges from public, anon, and authenticated
REVOKE ALL ON TABLE public.product_import_sessions
FROM PUBLIC, anon, authenticated;

-- 3. Grant full CRUD exclusively to service_role (backend client)
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.product_import_sessions
TO service_role;

-- 4. Clean up any historical/intended browser policies
DROP POLICY IF EXISTS "Admins can manage product_import_sessions"
ON public.product_import_sessions;

DROP POLICY IF EXISTS "Merchants can view own product_import_sessions"
ON public.product_import_sessions;

DROP POLICY IF EXISTS "Merchants can insert own product_import_sessions"
ON public.product_import_sessions;

DROP POLICY IF EXISTS "Merchants can update own product_import_sessions"
ON public.product_import_sessions;

COMMIT;
