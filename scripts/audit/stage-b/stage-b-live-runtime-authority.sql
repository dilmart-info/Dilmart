-- DILMART — STAGE B PASS 2
-- SCRIPT 5: LIVE RUNTIME AUTHORITY & RPC SECURITY EXTRACTION (READ-ONLY)

SELECT
  p.oid,
  p.oid::regprocedure AS full_identity,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS is_security_definer,
  COALESCE(array_to_string(p.proconfig, ', '), 'DEFAULT (UNSET)') AS search_path_config,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'app_private')
ORDER BY n.nspname, p.proname;
