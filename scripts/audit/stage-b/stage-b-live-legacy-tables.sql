-- DILMART — STAGE B PASS 2
-- SCRIPT 2: LIVE LEGACY TABLES EXTRACTION (READ-ONLY)

SELECT
  c.oid,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  pg_get_userbyid(c.relowner) AS owner_name,
  (SELECT count(*) FROM pg_policies p WHERE p.schemaname = n.nspname AND p.tablename = c.relname) AS policy_count,
  (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS user_trigger_count,
  (SELECT count(*) FROM pg_index i WHERE i.indrelid = c.oid) AS index_count,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'constraint_name', con.conname,
      'foreign_table', f_c.relname,
      'foreign_column', f_a.attname
    ))
    FROM pg_constraint con
    JOIN pg_class f_c ON f_c.oid = con.confrelid
    JOIN pg_attribute f_a ON f_a.attrelid = con.confrelid AND f_a.attnum = con.confkey[1]
    WHERE con.conrelid = c.oid AND con.contype = 'f'
  ) AS outbound_fks,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'constraint_name', con.conname,
      'referencing_table', r_c.relname,
      'referencing_column', r_a.attname
    ))
    FROM pg_constraint con
    JOIN pg_class r_c ON r_c.oid = con.conrelid
    JOIN pg_attribute r_a ON r_a.attrelid = con.conrelid AND r_a.attnum = con.conkey[1]
    WHERE con.confrelid = c.oid AND con.contype = 'f'
  ) AS inbound_fks
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND (
    c.relname ILIKE '%barber%'
    OR c.relname ILIKE '%salon%'
    OR c.relname ILIKE '%handoff%'
    OR c.relname ILIKE '%federated%'
    OR c.relname ILIKE '%linked_profile%'
    OR c.relname ILIKE '%store_cart%'
    OR c.relname ILIKE '%b2b%'
    OR c.relname ILIKE '%stylai%'
  )
ORDER BY c.relname;
