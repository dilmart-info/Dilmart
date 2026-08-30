-- DILMART — STAGE B PASS 2
-- SCRIPT 2: LIVE LEGACY TABLES INVENTORY (READ-ONLY)

SELECT
  c.oid::bigint AS table_oid,
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS owner_name,
  c.relrowsecurity AS is_rls_enabled,
  c.relforcerowsecurity AS is_rls_forced,
  (
    SELECT count(*)::bigint
    FROM pg_constraint con
    WHERE con.confrelid = c.oid AND con.contype = 'f'
  ) AS inbound_fk_count,
  (
    SELECT count(*)::bigint
    FROM pg_constraint con
    WHERE con.conrelid = c.oid AND con.contype = 'f'
  ) AS outbound_fk_count,
  (
    SELECT count(*)::bigint
    FROM pg_policy pol
    WHERE pol.polrelid = c.oid
  ) AS policy_count,
  (
    SELECT count(*)::bigint
    FROM pg_trigger trg
    WHERE trg.tgrelid = c.oid AND NOT trg.tgisinternal
  ) AS trigger_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND (
    c.relname IN (
      'store_linked_profiles', 'store_carts', 'store_cart_items',
      'store_federated_session_families', 'store_federated_refresh_tokens',
      'store_federated_session_audit_events', 'dilmart_customer_handoffs',
      'dilmart_customer_handoff_audit_events', 'dilmart_barber_handoffs',
      'dilmart_barber_handoff_audit_events', 'dilmart_barber_web_sessions'
    )
    OR c.relname ILIKE '%barber%'
    OR c.relname ILIKE '%salon%'
    OR c.relname ILIKE '%handoff%'
    OR c.relname ILIKE '%federated%'
    OR c.relname ILIKE '%linked_profile%'
    OR c.relname ILIKE '%store_cart%'
    OR c.relname ILIKE '%b2b%'
  )
ORDER BY c.relname;
