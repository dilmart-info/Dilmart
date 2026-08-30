-- Rollback for 20260820140000_admin_merchant_readiness_summary_rpc.sql
--
-- Drops the platform merchant-readiness summary RPC. Self-contained: nothing else references it
-- (no view, trigger, policy or other function), and it reads only existing tables.
--
-- ORDERING: roll the BACKEND back first. Once
-- `MerchantsService.getPlatformMerchantReadinessSummariesForAdmin()` calls this RPC, dropping the
-- function while that code is live makes the executive governance endpoint fail. Restoring the
-- previous per-merchant implementation is always safe, because it uses only base tables.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_merchant_readiness_summary();

COMMIT;
