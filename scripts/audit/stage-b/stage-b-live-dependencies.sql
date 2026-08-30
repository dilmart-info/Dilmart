-- DILMART — STAGE B PASS 2
-- SCRIPT 4: LIVE DATABASE DEPENDENCY GRAPH EXTRACTION (READ-ONLY)

-- 1. All Foreign Key Relationships targeting or originating from legacy tables
SELECT
  con.conname AS constraint_name,
  src_c.relname AS source_table,
  src_a.attname AS source_column,
  tgt_c.relname AS target_table,
  tgt_a.attname AS target_column,
  con.confupdtype AS on_update_action,
  con.confdeltype AS on_delete_action
FROM pg_constraint con
JOIN pg_class src_c ON src_c.oid = con.conrelid
JOIN pg_class tgt_c ON tgt_c.oid = con.confrelid
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
      'orders', 'checkout_attempts', 'products'
    )
    OR tgt_c.relname IN (
      'store_carts', 'store_cart_items', 'store_linked_profiles',
      'store_federated_session_families', 'store_federated_refresh_tokens',
      'store_federated_session_audit_events', 'dilmart_customer_handoffs',
      'dilmart_customer_handoff_audit_events', 'dilmart_barber_handoffs',
      'dilmart_barber_handoff_audit_events', 'dilmart_barber_web_sessions'
    )
  )
ORDER BY src_c.relname, con.conname;
