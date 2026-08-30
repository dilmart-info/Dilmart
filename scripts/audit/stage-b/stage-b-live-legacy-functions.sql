-- DILMART — STAGE B PASS 2
-- SCRIPT 1: LIVE LEGACY FUNCTIONS & RPC EXTRACTION (READ-ONLY)

SELECT
  p.oid,
  p.oid::regprocedure AS full_identity,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility,
  pg_get_userbyid(p.proowner) AS owner_name,
  COALESCE(array_to_string(p.proconfig, ', '), 'DEFAULT') AS search_path_config,
  COALESCE(p.proacl::text, 'DEFAULT') AS acl_definition,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute,
  CASE
    WHEN p.prosrc ILIKE '%store_cart%' THEN true
    WHEN p.prosrc ILIKE '%store_linked_profile%' THEN true
    WHEN p.prosrc ILIKE '%dilmart_user_id%' THEN true
    WHEN p.prosrc ILIKE '%dilmart_barbershop%' THEN true
    WHEN p.prosrc ILIKE '%federated%' THEN true
    WHEN p.prosrc ILIKE '%handoff%' THEN true
    WHEN p.prosrc ILIKE '%barber%' THEN true
    WHEN p.prosrc ILIKE '%salon%' THEN true
    ELSE false
  END AS body_has_legacy_terms
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'app_private')
  AND (
    p.proname ILIKE '%barber%'
    OR p.proname ILIKE '%salon%'
    OR p.proname ILIKE '%handoff%'
    OR p.proname ILIKE '%federated%'
    OR p.proname ILIKE '%store_cart%'
    OR p.proname ILIKE '%linked_profile%'
    OR p.proname ILIKE '%b2b%'
    OR p.proname = 'place_order'
    OR p.proname = 'place_order_idempotent'
    OR p.prosrc ILIKE '%store_linked_profile%'
    OR p.prosrc ILIKE '%dilmart_barbershop%'
    OR p.prosrc ILIKE '%store_cart%'
  )
ORDER BY n.nspname, p.proname;
