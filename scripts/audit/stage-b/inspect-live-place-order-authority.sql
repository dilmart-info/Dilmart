-- Read-Only Inspection of Live Production place_order & place_order_idempotent Authority
SELECT
  p.oid,
  p.oid::regprocedure AS regprocedure,
  n.nspname AS schema_name,
  p.proname AS function_name,
  p.pronargs AS argument_count,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS return_type,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility,
  p.proconfig AS search_path_config,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  pg_get_functiondef(p.oid) AS function_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('place_order', 'place_order_idempotent')
ORDER BY p.proname;
