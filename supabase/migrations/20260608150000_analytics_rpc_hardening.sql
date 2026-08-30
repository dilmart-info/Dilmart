-- PR-H8: Harden analytics_overview() RPC
-- 1. Set search_path to prevent search_path hijacking with SECURITY DEFINER
-- 2. Restrict execute to service_role only (backend uses service_role key)

ALTER FUNCTION public.analytics_overview() SET search_path = public;

-- Revoke from all, then grant only to service_role
REVOKE EXECUTE ON FUNCTION public.analytics_overview() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.analytics_overview() FROM anon;
REVOKE EXECUTE ON FUNCTION public.analytics_overview() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.analytics_overview() TO service_role;
