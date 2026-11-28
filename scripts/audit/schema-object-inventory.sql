-- Canonical object inventory g0-a2-02-v2. Read-only: no DDL.
-- Serialization: scripts/audit/OBJECT_INVENTORY.md
-- v1 sealed inventories are incompatible and must not be treated as identical.
BEGIN TRANSACTION READ ONLY;
SET LOCAL search_path = pg_catalog;
SET LOCAL client_encoding = 'UTF8';
SET LOCAL client_min_messages = warning;
WITH ns AS (
  SELECT namespace.oid, namespace.nspname
  FROM pg_namespace namespace
  WHERE namespace.nspname IN ('public', 'app_private', 'auth', 'storage', 'extensions')
), rel AS (
  SELECT relation.*, namespace.nspname
  FROM pg_class relation
  JOIN ns namespace ON namespace.oid = relation.relnamespace
  WHERE relation.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
), mandatory(category) AS (
  VALUES
    ('schemas'),
    ('schema_grants'),
    ('relations'),
    ('columns'),
    ('primary_keys'),
    ('foreign_keys'),
    ('unique_constraints'),
    ('check_constraints'),
    ('exclusion_constraints'),
    ('other_constraints'),
    ('indexes'),
    ('policies'),
    ('relation_grants'),
    ('column_grants'),
    ('default_privileges'),
    ('routines'),
    ('routine_grants'),
    ('triggers'),
    ('views'),
    ('sequences'),
    ('enumerations'),
    ('domains'),
    ('types'),
    ('type_grants'),
    ('partitions'),
    ('extensions'),
    ('extension_members'),
    ('role_attributes'),
    ('role_memberships'),
    ('migrations'),
    ('publications'),
    ('publication_schemas'),
    ('publication_tables'),
    ('event_triggers'),
    ('extraction_context')
), objects AS (
  SELECT 'g0-a2-02-v2' AS format_version, namespace.nspname::text AS schema_name, 'schemas'::text AS category,
         namespace.nspname::text AS object_identity,
         concat_ws(chr(31), replace(replace(replace(coalesce((pg_get_userbyid(namespace.nspowner))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')) AS canonical_definition
  FROM ns joined
  JOIN pg_namespace namespace ON namespace.oid = joined.oid
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname, 'schema_grants',
         concat_ws(chr(31), replace(replace(replace(coalesce((namespace.nspname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce((namespace.nspname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM ns joined
  JOIN pg_namespace namespace ON namespace.oid = joined.oid
  CROSS JOIN LATERAL aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) privilege
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'relations', relation.nspname::text || '.' || relation.relname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((relation.relkind::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (relation.relrowsecurity) THEN 'true' WHEN (relation.relrowsecurity) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (relation.relforcerowsecurity) THEN 'true' WHEN (relation.relforcerowsecurity) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(relation.relowner))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (relation.reloptions) IS NULL THEN NULL ELSE coalesce((SELECT string_agg(replace(replace(replace(coalesce(item, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), chr(30) ORDER BY item COLLATE "C" NULLS FIRST) FROM unnest(relation.reloptions) AS item), '') END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_class'::regclass AND dependency.objid = (relation.oid) AND dependency.objsubid = (0) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'columns', relation.nspname::text || '.' || relation.relname::text || '.' || attribute.attname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((attribute.attnum::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((format_type(attribute.atttypid, attribute.atttypmod))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (attribute.attnotnull) THEN 'true' WHEN (attribute.attnotnull) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((attribute.attidentity::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((attribute.attgenerated::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_expr(default_expression.adbin, default_expression.adrelid))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN attribute.attcollation <> 0 THEN attribute.attcollation::regcollation::text ELSE NULL END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_attribute'::regclass AND dependency.objid = (relation.oid) AND dependency.objsubid = (attribute.attnum) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  JOIN pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
  LEFT JOIN pg_attrdef default_expression ON default_expression.adrelid = relation.oid AND default_expression.adnum = attribute.attnum
  WHERE relation.relkind <> 'S'
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname,
         CASE constraint_row.contype WHEN 'p' THEN 'primary_keys' WHEN 'f' THEN 'foreign_keys' WHEN 'u' THEN 'unique_constraints' WHEN 'c' THEN 'check_constraints' WHEN 'x' THEN 'exclusion_constraints' ELSE 'other_constraints' END,
         relation.nspname::text || '.' || relation.relname::text || '.' || constraint_row.conname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((constraint_row.contype::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_constraintdef(constraint_row.oid, false))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (constraint_row.convalidated) THEN 'true' WHEN (constraint_row.convalidated) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (constraint_row.condeferrable) THEN 'true' WHEN (constraint_row.condeferrable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (constraint_row.condeferred) THEN 'true' WHEN (constraint_row.condeferred) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  JOIN pg_constraint constraint_row ON constraint_row.conrelid = relation.oid
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'indexes', relation.nspname::text || '.' || index_relation.relname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((pg_get_indexdef(index_relation.oid))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (index_row.indisvalid) THEN 'true' WHEN (index_row.indisvalid) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (index_row.indisready) THEN 'true' WHEN (index_row.indisready) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (index_row.indisunique) THEN 'true' WHEN (index_row.indisunique) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (index_row.indisprimary) THEN 'true' WHEN (index_row.indisprimary) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_class'::regclass AND dependency.objid = (index_relation.oid) AND dependency.objsubid = (0) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  JOIN pg_index index_row ON index_row.indrelid = relation.oid
  JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'policies', relation.nspname::text || '.' || relation.relname::text || '.' || policy.polname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((policy.polcmd::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (policy.polpermissive) THEN 'true' WHEN (policy.polpermissive) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END FROM unnest(policy.polroles) AS role_oid)) IS NULL THEN NULL ELSE coalesce((SELECT string_agg(replace(replace(replace(coalesce(item, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), chr(30) ORDER BY item COLLATE "C" NULLS FIRST) FROM unnest(ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END FROM unnest(policy.polroles) AS role_oid)) AS item), '') END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_expr(policy.polqual, policy.polrelid))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_expr(policy.polwithcheck, policy.polrelid))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  JOIN pg_policy policy ON policy.polrelid = relation.oid
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'relation_grants',
         concat_ws(chr(31), replace(replace(replace(coalesce((relation.nspname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((relation.relname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault(CASE WHEN relation.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, relation.relowner))) privilege
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'column_grants',
         concat_ws(chr(31), replace(replace(replace(coalesce((relation.nspname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((relation.relname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((attribute.attname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  JOIN pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped AND attribute.attacl IS NOT NULL
  CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
  UNION ALL
  SELECT 'g0-a2-02-v2', coalesce(namespace.nspname, ''), 'default_privileges',
         concat_ws(chr(31), replace(replace(replace(coalesce((coalesce(namespace.nspname, 'GLOBAL'))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(default_acl.defaclrole))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((default_acl.defaclobjtype::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce((pg_get_userbyid(privilege.grantor))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((privilege.privilege_type)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (privilege.is_grantable) THEN 'true' WHEN (privilege.is_grantable) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_default_acl default_acl
  LEFT JOIN ns namespace ON namespace.oid = default_acl.defaclnamespace
  CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
  WHERE default_acl.defaclnamespace = 0 OR namespace.oid IS NOT NULL
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname, 'routines', namespace.nspname::text || '.' || routine.proname::text || '(' || pg_get_function_identity_arguments(routine.oid) || ')',
         concat_ws(chr(31), replace(replace(replace(coalesce((routine.prokind::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_functiondef(routine.oid))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(routine.proowner))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (routine.prosecdef) THEN 'true' WHEN (routine.prosecdef) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (routine.proleakproof) THEN 'true' WHEN (routine.proleakproof) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (routine.proconfig) IS NULL THEN NULL ELSE coalesce((SELECT string_agg(replace(replace(replace(coalesce(item, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), chr(30) ORDER BY item COLLATE "C" NULLS FIRST) FROM unnest(routine.proconfig) AS item), '') END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_proc'::regclass AND dependency.objid = (routine.oid) AND dependency.objsubid = (0) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_proc routine
  JOIN ns namespace ON namespace.oid = routine.pronamespace
  WHERE routine.prokind IN ('f', 'p', 'w')
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'triggers', relation.nspname::text || '.' || relation.relname::text || '.' || trigger_row.tgname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((pg_get_triggerdef(trigger_row.oid, false))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((trigger_row.tgenabled::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_trigger'::regclass AND dependency.objid = (trigger_row.oid) AND dependency.objsubid = (0) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  JOIN pg_trigger trigger_row ON trigger_row.tgrelid = relation.oid AND NOT trigger_row.tgisinternal
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'views', relation.nspname::text || '.' || relation.relname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((relation.relkind::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_viewdef(relation.oid, false))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_class'::regclass AND dependency.objid = (relation.oid) AND dependency.objsubid = (0) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  WHERE relation.relkind IN ('v', 'm')
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'sequences', relation.nspname::text || '.' || relation.relname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((format_type(sequence_row.seqtypid, NULL))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((sequence_row.seqstart::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((sequence_row.seqincrement::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((sequence_row.seqmin::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((sequence_row.seqmax::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((sequence_row.seqcache::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (sequence_row.seqcycle) THEN 'true' WHEN (sequence_row.seqcycle) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(relation.relowner))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((
           SELECT string_agg(dependency.deptype::text || ':' || owner_namespace.nspname::text || '.' || owner_relation.relname::text || '.' || owner_attribute.attname::text, chr(30) ORDER BY dependency.deptype::text COLLATE "C", owner_namespace.nspname::text COLLATE "C", owner_relation.relname::text COLLATE "C", owner_attribute.attname::text COLLATE "C")
           FROM pg_depend dependency
           JOIN pg_class owner_relation ON owner_relation.oid = dependency.refobjid
           JOIN pg_namespace owner_namespace ON owner_namespace.oid = owner_relation.relnamespace
           JOIN pg_attribute owner_attribute ON owner_attribute.attrelid = dependency.refobjid AND owner_attribute.attnum = dependency.refobjsubid
           WHERE dependency.classid = 'pg_class'::regclass AND dependency.objid = relation.oid AND dependency.refclassid = 'pg_class'::regclass AND dependency.deptype IN ('a', 'i')
         ))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_class'::regclass AND dependency.objid = (relation.oid) AND dependency.objsubid = (0) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  JOIN pg_sequence sequence_row ON sequence_row.seqrelid = relation.oid
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname, 'enumerations', namespace.nspname::text || '.' || enum_type.typname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce(((SELECT string_agg(label.enumlabel, chr(30) ORDER BY label.enumsortorder) FROM pg_enum label WHERE label.enumtypid = enum_type.oid))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_type enum_type
  JOIN ns namespace ON namespace.oid = enum_type.typnamespace
  WHERE enum_type.typtype = 'e'
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname, 'domains', namespace.nspname::text || '.' || domain_type.typname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((format_type(domain_type.typbasetype, domain_type.typtypmod))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (domain_type.typnotnull) THEN 'true' WHEN (domain_type.typnotnull) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((domain_type.typdefault)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((
           SELECT string_agg(constraint_row.conname::text || '=' || pg_get_constraintdef(constraint_row.oid, false), chr(30) ORDER BY constraint_row.conname COLLATE "C")
           FROM pg_constraint constraint_row WHERE constraint_row.contypid = domain_type.oid
         ))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN EXISTS (SELECT 1 FROM pg_depend dependency WHERE dependency.deptype = 'e' AND dependency.classid = 'pg_type'::regclass AND dependency.objid = (domain_type.oid) AND dependency.objsubid = (0) AND dependency.refclassid = 'pg_extension'::regclass) THEN 'true' ELSE 'false' END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_type domain_type
  JOIN ns namespace ON namespace.oid = domain_type.typnamespace
  WHERE domain_type.typtype = 'd'
  UNION ALL
  SELECT 'g0-a2-02-v2', relation.nspname, 'partitions', relation.nspname::text || '.' || relation.relname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((CASE WHEN relation.relkind = 'p' THEN pg_get_partkeydef(relation.oid) ELSE NULL END)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_expr(relation.relpartbound, relation.oid))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((
           SELECT string_agg(parent_namespace.nspname::text || '.' || parent_relation.relname::text, chr(30) ORDER BY parent_namespace.nspname COLLATE "C", parent_relation.relname COLLATE "C")
           FROM pg_inherits inheritance
           JOIN pg_class parent_relation ON parent_relation.oid = inheritance.inhparent
           JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent_relation.relnamespace
           WHERE inheritance.inhrelid = relation.oid
         ))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM rel relation
  WHERE relation.relispartition OR relation.relkind = 'p'
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname, 'extensions', extension.extname,
         concat_ws(chr(31), replace(replace(replace(coalesce((extension.extversion)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((namespace.nspname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  UNION ALL
  SELECT 'g0-a2-02-v2', coalesce(member_namespace.nspname, ''), 'extension_members',
         member.extname::text || '|' || member.member_kind::text || '|' || member_namespace.nspname::text || '.' || member.member_name::text,
         concat_ws(chr(31), replace(replace(replace(coalesce((member.extname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((member.member_kind)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((member.member_name)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM (
    SELECT extension.extname::text, namespace.nspname::text AS nspname, 'class'::text AS member_kind, relation.relname::text AS member_name
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_class relation ON dependency.classid = 'pg_class'::regclass AND relation.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
    UNION ALL
    SELECT extension.extname, namespace.nspname, 'routine', routine.proname::text || '(' || pg_get_function_identity_arguments(routine.oid) || ')'
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_proc routine ON dependency.classid = 'pg_proc'::regclass AND routine.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = routine.pronamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
    UNION ALL
    SELECT extension.extname, namespace.nspname, 'type', type_row.typname
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_type type_row ON dependency.classid = 'pg_type'::regclass AND type_row.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = type_row.typnamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
    UNION ALL
    SELECT extension.extname, namespace.nspname, 'operator', operator_row.oprname::text
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_operator operator_row ON dependency.classid = 'pg_operator'::regclass AND operator_row.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = operator_row.oprnamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
    UNION ALL
    SELECT extension.extname, namespace.nspname, 'collation', collation_row.collname::text
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_collation collation_row ON dependency.classid = 'pg_collation'::regclass AND collation_row.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = collation_row.collnamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
    UNION ALL
    SELECT extension.extname::text, namespace.nspname::text, 'operator_class'::text, opclass.opcname::text
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_opclass opclass ON dependency.classid = 'pg_opclass'::regclass AND opclass.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = opclass.opcnamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
    UNION ALL
    SELECT extension.extname::text, namespace.nspname::text, 'operator_family'::text, opfamily.opfname::text
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_opfamily opfamily ON dependency.classid = 'pg_opfamily'::regclass AND opfamily.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = opfamily.opfnamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
  ) member
  JOIN pg_namespace member_namespace ON member_namespace.nspname = member.nspname
  WHERE member.nspname IN ('public', 'app_private', 'auth', 'storage', 'extensions')
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'role_attributes', role_row.rolname,
         concat_ws(chr(31), replace(replace(replace(coalesce(((CASE WHEN (role_row.rolsuper) THEN 'true' WHEN (role_row.rolsuper) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (role_row.rolinherit) THEN 'true' WHEN (role_row.rolinherit) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (role_row.rolcreaterole) THEN 'true' WHEN (role_row.rolcreaterole) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (role_row.rolcreatedb) THEN 'true' WHEN (role_row.rolcreatedb) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (role_row.rolcanlogin) THEN 'true' WHEN (role_row.rolcanlogin) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (role_row.rolreplication) THEN 'true' WHEN (role_row.rolreplication) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (role_row.rolbypassrls) THEN 'true' WHEN (role_row.rolbypassrls) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_roles role_row
  WHERE role_row.rolname NOT LIKE 'pg\_%' ESCAPE '\'
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'role_memberships',
         parent_role.rolname::text || '|' || member_role.rolname::text || '|' || grantor_role.rolname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce(((CASE WHEN (membership.admin_option) THEN 'true' WHEN (membership.admin_option) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (membership.inherit_option) THEN 'true' WHEN (membership.inherit_option) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (membership.set_option) THEN 'true' WHEN (membership.set_option) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_auth_members membership
  JOIN pg_roles parent_role ON parent_role.oid = membership.roleid
  JOIN pg_roles member_role ON member_role.oid = membership.member
  JOIN pg_roles grantor_role ON grantor_role.oid = membership.grantor
  WHERE parent_role.rolname NOT LIKE 'pg\_%' ESCAPE '\'
     OR member_role.rolname NOT LIKE 'pg\_%' ESCAPE '\'
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'migrations', migration.version,
         concat_ws(chr(31), replace(replace(replace(coalesce((migration.version)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((migration.name)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((md5(coalesce(migration.statements::text, '')))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM supabase_migrations.schema_migrations migration
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'publications', publication.pubname,
         concat_ws(chr(31), replace(replace(replace(coalesce((pg_get_userbyid(publication.pubowner))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (publication.puballtables) THEN 'true' WHEN (publication.puballtables) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (publication.pubinsert) THEN 'true' WHEN (publication.pubinsert) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (publication.pubupdate) THEN 'true' WHEN (publication.pubupdate) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (publication.pubdelete) THEN 'true' WHEN (publication.pubdelete) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (publication.pubtruncate) THEN 'true' WHEN (publication.pubtruncate) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (publication.pubviaroot) THEN 'true' WHEN (publication.pubviaroot) IS NOT NULL THEN 'false' ELSE NULL END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_publication publication
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname, 'publication_tables',
         concat_ws(chr(31), replace(replace(replace(coalesce(publication.pubname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(namespace.nspname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(relation.relname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce((publication.pubname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((namespace.nspname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((relation.relname)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(pg_get_expr(published.prqual, published.prrelid), E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace((CASE WHEN published.prattrs IS NULL THEN NULL ELSE coalesce((SELECT string_agg(attribute.attname::text, chr(30) ORDER BY attribute.attname::text COLLATE "C") FROM unnest(published.prattrs::smallint[]) AS column_list(column_number) JOIN pg_attribute attribute ON attribute.attrelid = published.prrelid AND attribute.attnum = column_list.column_number), '') END), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_publication_rel published
  JOIN pg_publication publication ON publication.oid = published.prpubid
  JOIN pg_class relation ON relation.oid = published.prrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'event_triggers', event_trigger.evtname,
         concat_ws(chr(31), replace(replace(replace(coalesce((event_trigger.evtevent)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(((CASE WHEN (event_trigger.evttags) IS NULL THEN NULL ELSE coalesce((SELECT string_agg(replace(replace(replace(coalesce(item, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), chr(30) ORDER BY item COLLATE "C" NULLS FIRST) FROM unnest(event_trigger.evttags) AS item), '') END))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((event_trigger.evtfoid::regprocedure::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((event_trigger.evtenabled::text)::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce((pg_get_userbyid(event_trigger.evtowner))::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_event_trigger event_trigger
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname::text, 'routine_grants',
         concat_ws(chr(31), replace(replace(replace(coalesce(namespace.nspname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(routine.proname::text || '(' || pg_get_function_identity_arguments(routine.oid) || ')', E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(privilege.privilege_type::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.is_grantable THEN 'true' ELSE 'false' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(pg_get_userbyid(privilege.grantor), E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN routine.proacl IS NULL THEN 'default' ELSE 'explicit' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce(pg_get_userbyid(routine.proowner), E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(pg_get_userbyid(privilege.grantor), E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(privilege.privilege_type::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.is_grantable THEN 'true' ELSE 'false' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN routine.proacl IS NULL THEN 'default' ELSE 'explicit' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_proc routine
  JOIN ns namespace ON namespace.oid = routine.pronamespace
  CROSS JOIN LATERAL aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) privilege
  WHERE routine.prokind IN ('f', 'p', 'w')
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname::text, 'types', namespace.nspname::text || '.' || type_row.typname::text,
         concat_ws(chr(31), replace(replace(replace(coalesce(type_row.typname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(type_row.typtype::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(type_row.typcategory::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(pg_get_userbyid(type_row.typowner), E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_type type_row
  JOIN ns namespace ON namespace.oid = type_row.typnamespace
  WHERE type_row.typisdefined AND type_row.typtype IN ('b', 'c', 'r', 'm') AND type_row.typcategory <> 'A'
    AND NOT EXISTS (SELECT 1 FROM pg_class row_class WHERE row_class.oid = type_row.typrelid AND row_class.relkind IN ('r', 'p', 'v', 'm', 'f', 'S'))
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname::text, 'type_grants',
         concat_ws(chr(31), replace(replace(replace(coalesce(namespace.nspname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(type_row.typname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(privilege.privilege_type::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.is_grantable THEN 'true' ELSE 'false' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(pg_get_userbyid(privilege.grantor), E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN type_row.typacl IS NULL THEN 'default' ELSE 'explicit' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce(pg_get_userbyid(type_row.typowner), E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(privilege.privilege_type::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN privilege.is_grantable THEN 'true' ELSE 'false' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(CASE WHEN type_row.typacl IS NULL THEN 'default' ELSE 'explicit' END, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_type type_row
  JOIN ns namespace ON namespace.oid = type_row.typnamespace
  CROSS JOIN LATERAL aclexplode(coalesce(type_row.typacl, acldefault('T', type_row.typowner))) privilege
  WHERE type_row.typisdefined AND type_row.typtype IN ('b', 'c', 'd', 'e', 'r', 'm') AND type_row.typcategory <> 'A'
  UNION ALL
  SELECT 'g0-a2-02-v2', namespace.nspname::text, 'publication_schemas',
         concat_ws(chr(31), replace(replace(replace(coalesce(publication.pubname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(namespace.nspname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x')),
         concat_ws(chr(31), replace(replace(replace(coalesce(publication.pubname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'), replace(replace(replace(coalesce(namespace.nspname::text, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x'))
  FROM pg_publication_namespace published_schema
  JOIN pg_publication publication ON publication.oid = published_schema.pnpubid
  JOIN pg_namespace namespace ON namespace.oid = published_schema.pnnspid
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'extraction_context', 'server_version_num=' || current_setting('server_version_num'), current_setting('server_version')
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'extraction_context', 'transaction_read_only=' || current_setting('transaction_read_only'), current_setting('transaction_read_only')
  UNION ALL
  SELECT 'g0-a2-02-v2', '', 'extraction_context', 'search_path', current_setting('search_path')
)
SELECT format_version, schema_name, category, object_identity, canonical_definition
FROM (
  SELECT format_version, schema_name, category, object_identity, canonical_definition FROM objects
  UNION ALL
  SELECT 'g0-a2-02-v2', '', mandatory.category, '__CATEGORY_EMPTY__', 'g0-a2-02-v2|' || mandatory.category || '|__CATEGORY_EMPTY__'
  FROM mandatory
  WHERE NOT EXISTS (SELECT 1 FROM objects WHERE objects.category = mandatory.category)
) inventory
ORDER BY category COLLATE "C", schema_name COLLATE "C", object_identity COLLATE "C";
ROLLBACK;
