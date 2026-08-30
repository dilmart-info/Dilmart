-- DILMART — STAGE B PASS 2
-- SCRIPT 3: LIVE LEGACY COLUMNS EXTRACTION (READ-ONLY)

SELECT
  c.relname AS table_name,
  a.attname AS column_name,
  a.attnum AS column_position,
  format_type(a.atttypid, a.atttypmod) AS data_type,
  NOT a.attnotnull AS is_nullable,
  pg_get_expr(ad.adbin, ad.adrelid) AS default_expression,
  (
    SELECT count(*)
    FROM pg_constraint con
    WHERE con.conrelid = c.oid AND a.attnum = ANY(con.conkey)
  ) > 0 AS is_constrained,
  (
    SELECT count(*)
    FROM pg_index i
    WHERE i.indrelid = c.oid AND a.attnum = ANY(i.indkey)
  ) > 0 AS is_indexed,
  (
    SELECT f_c.relname
    FROM pg_constraint con
    JOIN pg_class f_c ON f_c.oid = con.confrelid
    WHERE con.conrelid = c.oid AND con.contype = 'f' AND a.attnum = ANY(con.conkey)
    LIMIT 1
  ) AS foreign_table_target
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT a.attisdropped
  AND (
    a.attname ILIKE '%barber%'
    OR a.attname ILIKE '%salon%'
    OR a.attname ILIKE '%handoff%'
    OR a.attname ILIKE '%federated%'
    OR a.attname ILIKE '%linked_profile%'
    OR a.attname ILIKE '%store_cart%'
    OR a.attname ILIKE '%b2b%'
    OR a.attname ILIKE '%stylai%'
    OR a.attname IN (
      'requires_verified_salon',
      'dilmart_user_id',
      'dilmart_barbershop_id',
      'store_cart_id',
      'store_linked_profile_id'
    )
  )
ORDER BY c.relname, a.attname;
