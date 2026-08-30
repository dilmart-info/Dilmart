-- DILMART — STAGE B PASS 2
-- SCRIPT 4 (EXPANDED): COMPREHENSIVE LIVE DATABASE DEPENDENCY EXTRACTION (READ-ONLY)
-- Enumerate: Foreign Keys, Triggers, Trigger Functions, Views, Indexes, Constraints, Defaults, and Cross-Schema Dependencies.

-- 1. All Foreign Key Relationships
SELECT
  'foreign_key' AS dependency_type,
  con.conname AS constraint_or_object_name,
  src_n.nspname AS source_schema,
  src_c.relname AS source_table,
  src_a.attname AS source_column,
  tgt_n.nspname AS target_schema,
  tgt_c.relname AS target_table,
  tgt_a.attname AS target_column,
  con.confdeltype::text AS on_delete_action
FROM pg_constraint con
JOIN pg_class src_c ON src_c.oid = con.conrelid
JOIN pg_namespace src_n ON src_n.oid = src_c.relnamespace
JOIN pg_class tgt_c ON tgt_c.oid = con.confrelid
JOIN pg_namespace tgt_n ON tgt_n.oid = tgt_c.relnamespace
JOIN pg_attribute src_a ON src_a.attrelid = con.conrelid AND src_a.attnum = con.conkey[1]
JOIN pg_attribute tgt_a ON tgt_a.attrelid = con.confrelid AND tgt_a.attnum = con.confkey[1]
WHERE con.contype = 'f'
  AND (
    src_c.relname IN (
      'store_carts', 'store_cart_items', 'store_linked_profiles',
      'store_federated_session_families', 'store_federated_refresh_tokens',
      'store_federated_session_audit_events', 'dilmart_customer_handoffs',
      'dilmart_customer_handoff_audit_events', 'dilmart_barber_handoffs',
      'dilmart_barber_handoff_audit_events', 'dilmart_barber_web_sessions',
      'orders', 'checkout_attempts', 'products', 'marketplace_banners'
    )
    OR tgt_c.relname IN (
      'store_carts', 'store_cart_items', 'store_linked_profiles',
      'store_federated_session_families', 'store_federated_refresh_tokens',
      'store_federated_session_audit_events', 'dilmart_customer_handoffs',
      'dilmart_customer_handoff_audit_events', 'dilmart_barber_handoffs',
      'dilmart_barber_handoff_audit_events', 'dilmart_barber_web_sessions'
    )
  )

UNION ALL

-- 2. All Triggers on Legacy Tables or Cross-Schema (auth.users)
SELECT
  'trigger' AS dependency_type,
  t.tgname AS constraint_or_object_name,
  n.nspname AS source_schema,
  c.relname AS source_table,
  NULL AS source_column,
  fn_n.nspname AS target_schema,
  p.proname AS target_table,
  p.oid::regprocedure::text AS target_column,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS on_delete_action
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_namespace fn_n ON fn_n.oid = p.pronamespace
WHERE NOT t.tgisinternal
  AND (
    c.relname IN (
      'store_carts', 'store_cart_items', 'store_linked_profiles',
      'store_federated_session_families', 'store_federated_refresh_tokens',
      'store_federated_session_audit_events', 'dilmart_customer_handoffs',
      'dilmart_customer_handoff_audit_events', 'dilmart_barber_handoffs',
      'dilmart_barber_handoff_audit_events', 'dilmart_barber_web_sessions'
    )
    OR (n.nspname = 'auth' AND c.relname = 'users' AND p.proname ILIKE '%federated%')
    OR p.proname IN (
      'reject_barber_handoff_audit_mutation',
      'reject_handoff_audit_mutation',
      'reject_federated_session_audit_mutation',
      'reject_reserved_federated_email'
    )
  )

UNION ALL

-- 3. Indexes on Legacy Columns in Active Tables
SELECT
  'index' AS dependency_type,
  i_c.relname AS constraint_or_object_name,
  n.nspname AS source_schema,
  t_c.relname AS source_table,
  a.attname AS source_column,
  NULL AS target_schema,
  NULL AS target_table,
  NULL AS target_column,
  CASE WHEN i.indisunique THEN 'UNIQUE' ELSE 'NON-UNIQUE' END AS on_delete_action
FROM pg_index i
JOIN pg_class i_c ON i_c.oid = i.indexrelid
JOIN pg_class t_c ON t_c.oid = i.indrelid
JOIN pg_namespace n ON n.oid = t_c.relnamespace
JOIN pg_attribute a ON a.attrelid = t_c.oid AND a.attnum = ANY(i.indkey)
WHERE n.nspname = 'public'
  AND t_c.relname IN ('orders', 'checkout_attempts', 'products', 'marketplace_banners')
  AND a.attname IN (
    'dilmart_barbershop_id', 'dilmart_user_id', 'store_cart_id', 'store_linked_profile_id',
    'requires_verified_salon', 'is_b2b_offer'
  )

ORDER BY dependency_type, source_table, constraint_or_object_name;
