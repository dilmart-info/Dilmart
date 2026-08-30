-- Rollback for 20260820150000_merchant_settings_atomic_upsert.sql
--
-- Drops the atomic merchant settings upsert RPC. Self-contained: nothing else references it (no
-- view, trigger, policy or other function), it creates no table, index or trigger, and it migrates
-- no data — so dropping it leaves merchant_settings and merchants exactly as they are.
--
-- ORDERING: roll the BACKEND back first. Once
-- `MerchantsService.upsertMerchantSettings()` calls this RPC, dropping the function while that code
-- is live makes POST /merchants/settings fail. Restoring the previous split-write implementation is
-- always safe, because it uses only base tables.

BEGIN;

DROP FUNCTION IF EXISTS public.upsert_merchant_settings_atomic(uuid, jsonb);

COMMIT;
