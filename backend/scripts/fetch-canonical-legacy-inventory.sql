-- DILMART — STAGE B CANONICAL LIVE LEGACY INVENTORY EXTRACTION SCRIPT
-- Generates exact literal function identities, security modes, proconfig, and privilege matrices
-- directly from PostgreSQL system catalogs. (Strictly READ-ONLY).

-- 1. Canonical 16 Legacy Functions + place_order
SELECT
  p.oid,
  p.oid::regprocedure AS full_identity,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility,
  p.proconfig AS search_path_config,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'place_b2b_cart_order_idempotent',
    'finalize_barber_handoff',
    'verify_barber_web_session',
    'redeem_barber_handoff_and_create_session',
    'revoke_barber_web_sessions_for_user',
    'reject_barber_handoff_audit_mutation',
    'finalize_customer_handoff',
    'redeem_customer_handoff',
    'logout_all_federated_sessions',
    'provision_dilmart_federated_customer',
    'redeem_and_create_federated_session',
    'reject_reserved_federated_email',
    'resolve_dilmart_federated_customer',
    'revoke_federated_sessions_for_identity',
    'rotate_federated_refresh_token',
    'validate_federated_session_family',
    'place_order'
  )
ORDER BY p.proname;

-- 2. Complete Legacy Columns Catalog (including all 4 previously omitted columns)
SELECT
  c.relname AS table_name,
  a.attname AS column_name,
  format_type(a.atttypid, a.atttypmod) AS data_type,
  NOT a.attnotnull AS is_nullable,
  (
    SELECT count(*)
    FROM pg_constraint con
    WHERE con.conrelid = c.oid
      AND a.attnum = ANY(con.conkey)
  ) > 0 AS is_constrained
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND (
    (c.relname = 'orders' AND a.attname IN ('dilmart_barbershop_id', 'dilmart_user_id', 'store_cart_id', 'store_linked_profile_id'))
    OR (c.relname = 'checkout_attempts' AND a.attname IN ('store_cart_id', 'store_linked_profile_id'))
    OR (c.relname = 'products' AND a.attname = 'requires_verified_salon')
  )
  AND NOT a.attisdropped
ORDER BY c.relname, a.attname;

-- 3. Complete Legacy Tables Catalog
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  pg_get_userbyid(c.relowner) AS table_owner,
  count(p.policyname) AS active_policies
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname IN (
    'store_carts',
    'store_cart_items',
    'store_linked_profiles',
    'store_federated_session_families',
    'store_federated_refresh_tokens',
    'store_federated_session_audit_events',
    'dilmart_customer_handoffs',
    'dilmart_customer_handoff_audit_events',
    'dilmart_barber_handoffs',
    'dilmart_barber_handoff_audit_events',
    'dilmart_barber_web_sessions'
  )
GROUP BY c.relname, c.relrowsecurity, c.relowner
ORDER BY c.relname;
