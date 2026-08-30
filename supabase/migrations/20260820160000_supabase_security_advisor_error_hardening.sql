-- DilMart-STORE-SUPABASE-ADVISOR-ERROR-CLOSURE-001
-- Closes the five ERROR findings reported by the Supabase Security Advisor.
--
-- FINDINGS
--   SECURITY DEFINER VIEW
--     1. public.delivery_open_orders_view
--     2. public.delivery_agent_performance_view
--     3. public.delivery_company_performance_view
--   RLS DISABLED IN PUBLIC
--     4. public.jenni_merchant_provisioning_locks
--     5. public.jenni_store_provisioning_locks
--
-- WHY THE VIEW FINDINGS ARE REAL, NOT COSMETIC
-- The three delivery views were created (20260426160000 / 20260427023000 / 20260427033500) without
-- `WITH (security_invoker = true)`. A Postgres view without that option runs its query with the
-- privileges and RLS context of its OWNER (postgres, which additionally has BYPASSRLS), not of the
-- caller. `orders` and `delivery_events` both have RLS enabled — nine and two policies — but a view
-- over them in owner context never evaluates those policies. And the views are not merely readable
-- by the browser roles: their ACLs grant `arwdDxtm` (every privilege) to BOTH `anon` and
-- `authenticated`. So any holder of the public anon key could read platform-wide delivery
-- operations — order ids, delivery status, assigned company and agent, SLA timing — with the row
-- filtering of `orders` and `delivery_events` bypassed. That is a live exposure of internal
-- operational data, which is why this is an ERROR and not a warning.
--
-- WHY THE LOCK-TABLE FINDINGS ARE REAL
-- `jenni_store_provisioning_locks` (20260616120000) and `jenni_merchant_provisioning_locks`
-- (20260620150000) are backend concurrency primitives: one row per merchant currently being
-- provisioned, inserted to acquire and deleted to release. They were created in the exposed
-- `public` schema with RLS disabled and, like the views, carry full `arwdDxtm` for `anon` and
-- `authenticated`. A browser client could therefore read who is being provisioned, and — worse —
-- INSERT a lock row to block provisioning indefinitely, or DELETE a live lock and defeat the
-- mutual exclusion the tables exist to provide. They hold no user-facing data and must never be
-- reachable from a browser.
--
-- FIX
--   Views: `security_invoker = true` so the caller's privileges and RLS apply, plus removal of the
--   browser-role grants, leaving SELECT for `service_role` only.
--   Lock tables: RLS enabled, browser-role grants removed, explicit CRUD for `service_role`, and a
--   RESTRICTIVE deny-all policy for `anon`/`authenticated` as defence in depth so a future
--   accidental GRANT still cannot reach a row.
--
-- WHY THE BACKEND KEEPS WORKING
-- All five entities are consumed exclusively through `SupabaseAdminService` (service_role):
-- `delivery-intelligence.service.ts` for the views, `jenni-store-provisioning.service.ts` and
-- `jenni-merchant-provisioning.service.ts` for the locks. There is no browser/frontend reference to
-- any of them. `service_role` has BYPASSRLS in this project, so `security_invoker = true` and the
-- new RLS do not change one row of what the backend sees, and the restrictive policy — which
-- targets `anon`/`authenticated` only — never applies to it.
--
-- NOT IN SCOPE
-- The Advisor's WARN/INFO findings (function search_path, auth configuration, performance advice)
-- are deliberately untouched here. No view definition is rewritten, no data is read, written or
-- migrated, and no function or auth setting is changed.
--
-- ROLLBACK: supabase/migrations/rollback/20260820160000_supabase_security_advisor_error_hardening.ROLLBACK.sql
-- The rollback is SECURITY-REDUCING and emergency-only: it restores the exposure described above.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1-3. Delivery intelligence views: caller context + backend-only access.
-- ─────────────────────────────────────────────────────────────────────────────

-- ALTER VIEW keeps the stored query definition byte-identical; only the option changes.
ALTER VIEW public.delivery_open_orders_view         SET (security_invoker = true);
ALTER VIEW public.delivery_agent_performance_view   SET (security_invoker = true);
ALTER VIEW public.delivery_company_performance_view SET (security_invoker = true);

REVOKE ALL ON public.delivery_open_orders_view         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.delivery_agent_performance_view   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.delivery_company_performance_view FROM PUBLIC, anon, authenticated;

-- These are an internal admin-analytics implementation detail, not a customer API: read-only, and
-- only for the backend.
GRANT SELECT ON public.delivery_open_orders_view         TO service_role;
GRANT SELECT ON public.delivery_agent_performance_view   TO service_role;
GRANT SELECT ON public.delivery_company_performance_view TO service_role;

COMMENT ON VIEW public.delivery_open_orders_view IS
  'Internal delivery-intelligence view (backend/service_role only). security_invoker = true so the caller''s RLS context applies to orders/delivery_events. Not exposed to anon/authenticated.';
COMMENT ON VIEW public.delivery_agent_performance_view IS
  'Internal delivery-intelligence view (backend/service_role only). security_invoker = true so the caller''s RLS context applies to orders/delivery_events. Not exposed to anon/authenticated.';
COMMENT ON VIEW public.delivery_company_performance_view IS
  'Internal delivery-intelligence view (backend/service_role only). security_invoker = true so the caller''s RLS context applies to orders/delivery_events. Not exposed to anon/authenticated.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4-5. Jenni provisioning lock tables: RLS on, browser roles out.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.jenni_merchant_provisioning_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jenni_store_provisioning_locks    ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.jenni_merchant_provisioning_locks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jenni_store_provisioning_locks    FROM PUBLIC, anon, authenticated;

-- The backend acquires a lock with INSERT, inspects it with SELECT, and releases it with DELETE;
-- stale-lock cleanup also deletes. UPDATE is granted for symmetry with the previous GRANT ALL.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jenni_merchant_provisioning_locks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.jenni_store_provisioning_locks    TO service_role;

-- Defence in depth. With the grants removed these tables are already unreachable from a browser;
-- a RESTRICTIVE policy means that even a future accidental GRANT cannot expose a row, because a
-- restrictive policy is ANDed with every other policy and this one is never satisfiable. It targets
-- anon/authenticated only, and service_role has BYPASSRLS, so backend behaviour is unchanged.
DROP POLICY IF EXISTS jenni_merchant_provisioning_locks_deny_browser_roles ON public.jenni_merchant_provisioning_locks;
CREATE POLICY jenni_merchant_provisioning_locks_deny_browser_roles
  ON public.jenni_merchant_provisioning_locks
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS jenni_store_provisioning_locks_deny_browser_roles ON public.jenni_store_provisioning_locks;
CREATE POLICY jenni_store_provisioning_locks_deny_browser_roles
  ON public.jenni_store_provisioning_locks
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.jenni_merchant_provisioning_locks IS
  'Backend-only concurrency primitive for Jenni merchant provisioning (service_role). RLS enabled; browser roles hold no privileges and are additionally denied by a restrictive policy.';
COMMENT ON TABLE public.jenni_store_provisioning_locks IS
  'Backend-only concurrency primitive for Jenni store provisioning (service_role). RLS enabled; browser roles hold no privileges and are additionally denied by a restrictive policy.';

COMMIT;
