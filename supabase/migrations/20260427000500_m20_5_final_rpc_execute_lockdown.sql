-- M20.5 Final — Sensitive RPC EXECUTE lockdown (idempotent)
-- Keep service_role as the sole executor of sensitive RPCs.
DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.transition_delivery_status(uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.transition_delivery_status(uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.transition_delivery_status(uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.transition_delivery_status(uuid, text, text, uuid, text, jsonb, text, text, text, uuid, uuid, text) TO service_role';

  EXECUTE 'REVOKE ALL ON FUNCTION public.process_cod_remittance_to_platform(uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.process_cod_remittance_to_platform(uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.process_cod_remittance_to_platform(uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.process_cod_remittance_to_platform(uuid, uuid, numeric, numeric, numeric, text, boolean, text, text, numeric, text) TO service_role';

  EXECUTE 'REVOKE ALL ON FUNCTION public.clear_order_agent_atomic(uuid, uuid, text, text) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.clear_order_agent_atomic(uuid, uuid, text, text) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.clear_order_agent_atomic(uuid, uuid, text, text) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.clear_order_agent_atomic(uuid, uuid, text, text) TO service_role';

  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_override_delivery_status(uuid, text, uuid, text) FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_override_delivery_status(uuid, text, uuid, text) FROM anon';
  EXECUTE 'REVOKE ALL ON FUNCTION public.admin_override_delivery_status(uuid, text, uuid, text) FROM authenticated';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.admin_override_delivery_status(uuid, text, uuid, text) TO service_role';
END
$$;
