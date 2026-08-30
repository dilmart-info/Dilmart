-- Rollback for 20260820160000_supabase_security_advisor_error_hardening.sql
--
-- ⚠ SECURITY-REDUCING — EMERGENCY USE ONLY. ⚠
--
-- This script does NOT restore a neutral state: it deliberately reintroduces the exposure that the
-- migration closed. Running it means accepting, knowingly and temporarily, that:
--
--   * the three delivery-intelligence views go back to owner (SECURITY DEFINER) semantics, so the
--     RLS on `orders` and `delivery_events` is bypassed inside them again;
--   * `anon` and `authenticated` — i.e. anyone holding the public anon key — regain full
--     privileges on those views and can read platform-wide delivery operations;
--   * the two Jenni provisioning lock tables lose RLS and regain full CRUD for `anon` and
--     `authenticated`, so a browser client can read, forge or delete provisioning locks and defeat
--     the mutual exclusion they exist to provide.
--
-- Do not run this to "undo a deploy". The migration is backend-compatible by construction: every
-- consumer of all five entities uses service_role, which has BYPASSRLS, so a backend failure after
-- the migration is very unlikely to be caused by it — investigate first. If a rollback is genuinely
-- required, treat it as an active security incident: run it, restore service, and re-apply the
-- hardening as soon as the real cause is fixed.
--
-- ORDERING: no backend rollback is needed first — nothing in the application depends on the
-- hardened state.

BEGIN;

-- Views: back to owner context and the previous browser-role grants.
ALTER VIEW public.delivery_open_orders_view         SET (security_invoker = false);
ALTER VIEW public.delivery_agent_performance_view   SET (security_invoker = false);
ALTER VIEW public.delivery_company_performance_view SET (security_invoker = false);

GRANT ALL ON public.delivery_open_orders_view         TO anon, authenticated, service_role;
GRANT ALL ON public.delivery_agent_performance_view   TO anon, authenticated, service_role;
GRANT ALL ON public.delivery_company_performance_view TO anon, authenticated, service_role;

COMMENT ON VIEW public.delivery_open_orders_view IS NULL;
COMMENT ON VIEW public.delivery_agent_performance_view IS NULL;
COMMENT ON VIEW public.delivery_company_performance_view IS NULL;

-- Lock tables: drop the deny-browser policies, disable RLS, restore the previous grants.
DROP POLICY IF EXISTS jenni_merchant_provisioning_locks_deny_browser_roles ON public.jenni_merchant_provisioning_locks;
DROP POLICY IF EXISTS jenni_store_provisioning_locks_deny_browser_roles    ON public.jenni_store_provisioning_locks;

ALTER TABLE public.jenni_merchant_provisioning_locks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.jenni_store_provisioning_locks    DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.jenni_merchant_provisioning_locks TO anon, authenticated, service_role;
GRANT ALL ON public.jenni_store_provisioning_locks    TO anon, authenticated, service_role;

COMMENT ON TABLE public.jenni_merchant_provisioning_locks IS NULL;
COMMENT ON TABLE public.jenni_store_provisioning_locks IS NULL;

COMMIT;
