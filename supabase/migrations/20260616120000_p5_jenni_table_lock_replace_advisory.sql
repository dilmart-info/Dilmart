-- Phase 2A Fix: Replace advisory lock with table-based lock
-- Advisory lock via RPC was releasing immediately after RPC transaction ends,
-- before the Jenni API call. Table-based lock persists across operations.
--
-- SAFETY: Schema change only (new table + drop unused function). No data changes.

-- 1. Create table-based lock for store provisioning
CREATE TABLE IF NOT EXISTS public.jenni_store_provisioning_locks (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  locked_at timestamptz NOT NULL DEFAULT now()
);

-- Allow service_role full access
GRANT ALL ON public.jenni_store_provisioning_locks TO service_role;

-- 2. Drop the old advisory lock function (no longer used)
DROP FUNCTION IF EXISTS public.jenni_provisioning_advisory_lock(bigint);
