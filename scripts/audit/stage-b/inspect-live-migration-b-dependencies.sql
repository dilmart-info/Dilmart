-- ============================================================================
-- DILMART — STAGE B PASS 4: LIVE PRODUCTION MIGRATION B DEPENDENCY INSPECTION
-- Read-Only Inspection of Foreign Keys, Triggers, Policies & Dependents
-- ============================================================================

-- 1. Triggers on Legacy Tables
SELECT
  event_object_table AS table_name,
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN (
    'dilmart_barber_handoff_audit_events',
    'dilmart_barber_handoffs',
    'dilmart_barber_web_sessions',
    'dilmart_customer_handoff_audit_events',
    'dilmart_customer_handoffs',
    'store_cart_items',
    'store_carts',
    'store_federated_refresh_tokens',
    'store_federated_session_audit_events',
    'store_federated_session_families',
    'store_linked_profiles'
  )
ORDER BY event_object_table, trigger_name;

-- 2. Foreign Keys & Check Constraints on Legacy Tables & Columns
SELECT
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_schema = 'public'
  AND (
    tc.table_name IN (
      'dilmart_barber_handoff_audit_events',
      'dilmart_barber_handoffs',
      'dilmart_barber_web_sessions',
      'dilmart_customer_handoff_audit_events',
      'dilmart_customer_handoffs',
      'store_cart_items',
      'store_carts',
      'store_federated_refresh_tokens',
      'store_federated_session_audit_events',
      'store_federated_session_families',
      'store_linked_profiles'
    )
    OR (
      tc.table_name IN ('orders', 'checkout_attempts')
      AND kcu.column_name IN ('dilmart_barbershop_id', 'dilmart_user_id', 'store_cart_id', 'store_linked_profile_id')
    )
  )
ORDER BY tc.table_name, tc.constraint_name;

-- 3. Check Views referencing any legacy table or column
SELECT table_name, view_definition
FROM information_schema.views
WHERE table_schema = 'public'
  AND (
    view_definition ILIKE '%dilmart_barber%'
    OR view_definition ILIKE '%store_cart%'
    OR view_definition ILIKE '%store_federated%'
    OR view_definition ILIKE '%store_linked_profile%'
  );
