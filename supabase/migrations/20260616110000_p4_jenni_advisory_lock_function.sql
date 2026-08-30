-- Phase 2A: Advisory lock function for Jenni Store provisioning
-- This function is called from JenniStoreProvisioningService to prevent
-- concurrent creation of duplicate Jenni Stores for the same merchant.
--
-- SAFETY: This is a function-only migration. No data changes.
-- It creates pg_advisory_xact_lock which auto-releases at transaction end.

CREATE OR REPLACE FUNCTION public.jenni_provisioning_advisory_lock(p_lock_key bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(294967296, p_lock_key::int);
  -- 294967296 = arbitrary namespace to avoid collisions with other locks
  -- p_lock_key = hash of merchant UUID
END;
$$;

-- Allow service_role to call this function
GRANT EXECUTE ON FUNCTION public.jenni_provisioning_advisory_lock(bigint) TO service_role;
