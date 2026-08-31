-- ============================================================================
-- DILMART — STAGE B PASS 4: LIVE PRODUCTION MIGRATION B AUTHORITY INSPECTION
-- Read-Only Catalog Inventory of Legacy Functions, Tables, Columns & Counts
-- ============================================================================

-- 1. Modern place_order & place_order_idempotent Authority Verification
SELECT
  p.oid,
  p.proname AS function_name,
  p.pronargs AS argument_count,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  p.proconfig AS execution_config,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_execute
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('place_order', 'place_order_idempotent', 'place_order_legacy_stageb')
ORDER BY p.proname, p.pronargs;

-- 2. Legacy 16 Candidate Functions Authority Inventory
SELECT
  p.oid,
  p.proname AS function_name,
  p.pronargs AS argument_count,
  pg_get_userbyid(p.proowner) AS owner_name,
  p.prosecdef AS is_security_definer,
  p.provolatile AS volatility,
  p.proconfig AS execution_config,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  CAST(p.oid::regprocedure AS text) AS regprocedure_signature
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'finalize_barber_handoff',
    'finalize_customer_handoff',
    'logout_all_federated_sessions',
    'place_b2b_cart_order_idempotent',
    'provision_dilmart_federated_customer',
    'redeem_and_create_federated_session',
    'redeem_barber_handoff_and_create_session',
    'redeem_customer_handoff',
    'reject_barber_handoff_audit_mutation',
    'reject_handoff_audit_mutation',
    'reject_federated_session_audit_mutation',
    'reject_reserved_federated_email',
    'resolve_dilmart_federated_customer',
    'revoke_barber_web_sessions_for_user',
    'revoke_federated_sessions_for_identity',
    'rotate_federated_refresh_token',
    'validate_federated_session_family',
    'verify_barber_web_session'
  )
ORDER BY p.proname;

-- 3. Row Counts of All 11 Legacy Candidate Tables
SELECT 'dilmart_barber_handoff_audit_events' AS table_name, count(*) AS row_count FROM public.dilmart_barber_handoff_audit_events
UNION ALL
SELECT 'dilmart_barber_handoffs', count(*) FROM public.dilmart_barber_handoffs
UNION ALL
SELECT 'dilmart_barber_web_sessions', count(*) FROM public.dilmart_barber_web_sessions
UNION ALL
SELECT 'dilmart_customer_handoff_audit_events', count(*) FROM public.dilmart_customer_handoff_audit_events
UNION ALL
SELECT 'dilmart_customer_handoffs', count(*) FROM public.dilmart_customer_handoffs
UNION ALL
SELECT 'store_cart_items', count(*) FROM public.store_cart_items
UNION ALL
SELECT 'store_carts', count(*) FROM public.store_carts
UNION ALL
SELECT 'store_federated_refresh_tokens', count(*) FROM public.store_federated_refresh_tokens
UNION ALL
SELECT 'store_federated_session_audit_events', count(*) FROM public.store_federated_session_audit_events
UNION ALL
SELECT 'store_federated_session_families', count(*) FROM public.store_federated_session_families
UNION ALL
SELECT 'store_linked_profiles', count(*) FROM public.store_linked_profiles
ORDER BY table_name;

-- 4. Non-Null Counts of All 7 Legacy Columns on Active Tables
SELECT 'orders.dilmart_barbershop_id' AS target_column, count(*) AS non_null_count FROM public.orders WHERE dilmart_barbershop_id IS NOT NULL
UNION ALL
SELECT 'orders.dilmart_user_id', count(*) FROM public.orders WHERE dilmart_user_id IS NOT NULL
UNION ALL
SELECT 'orders.store_cart_id', count(*) FROM public.orders WHERE store_cart_id IS NOT NULL
UNION ALL
SELECT 'orders.store_linked_profile_id', count(*) FROM public.orders WHERE store_linked_profile_id IS NOT NULL
UNION ALL
SELECT 'checkout_attempts.store_cart_id', count(*) FROM public.checkout_attempts WHERE store_cart_id IS NOT NULL
UNION ALL
SELECT 'checkout_attempts.store_linked_profile_id', count(*) FROM public.checkout_attempts WHERE store_linked_profile_id IS NOT NULL
UNION ALL
SELECT 'products.requires_verified_salon', count(*) FROM public.products WHERE requires_verified_salon IS TRUE
ORDER BY target_column;
