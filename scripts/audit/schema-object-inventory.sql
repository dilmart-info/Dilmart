-- Canonical object inventory for a disposable local database.
-- Serialization rules: scripts/audit/OBJECT_INVENTORY.md
-- Emits definitions. The seal step hashes them and discards this output.
-- No business rows, role passwords, tokens, or sequence current values.

SET search_path = pg_temp, pg_catalog;
SET client_encoding = 'UTF8';
SET client_min_messages = warning;

CREATE FUNCTION pg_temp.audit_field(value text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(coalesce(value, E'\\N'), E'\\', E'\\\\'), chr(31), E'\\u'), chr(30), E'\\x');
$$;

CREATE FUNCTION pg_temp.audit_canon(VARIADIC parts text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(string_agg(pg_temp.audit_field(part), chr(31) ORDER BY ord), '')
  FROM unnest(parts) WITH ORDINALITY AS item(part, ord);
$$;

CREATE FUNCTION pg_temp.audit_bool(value boolean)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN value THEN 'true' WHEN value IS NOT NULL THEN 'false' ELSE NULL END;
$$;

CREATE FUNCTION pg_temp.audit_sorted(items text[])
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT string_agg(item, chr(30) ORDER BY item COLLATE "C")
  FROM unnest(coalesce(items, ARRAY[]::text[])) AS item;
$$;

CREATE FUNCTION pg_temp.audit_extension_owned(class_name text, object_id oid, sub_id integer)
RETURNS text LANGUAGE sql STABLE AS $$
  SELECT pg_temp.audit_bool(EXISTS (
    SELECT 1 FROM pg_depend dependency
    WHERE dependency.deptype = 'e'
      AND dependency.classid = class_name::regclass
      AND dependency.objid = object_id
      AND dependency.objsubid = sub_id
      AND dependency.refclassid = 'pg_extension'::regclass
  ));
$$;

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
    ('triggers'),
    ('views'),
    ('sequences'),
    ('enumerations'),
    ('domains'),
    ('partitions'),
    ('extensions'),
    ('extension_members'),
    ('role_attributes'),
    ('role_memberships'),
    ('migrations'),
    ('publications'),
    ('publication_tables'),
    ('event_triggers')
), objects AS (
  SELECT 'g0-a2-02-v1' AS format_version, namespace.nspname AS schema_name, 'schemas' AS category,
         namespace.nspname AS object_identity,
         pg_temp.audit_canon(pg_get_userbyid(namespace.nspowner)) AS canonical_definition
  FROM ns joined
  JOIN pg_namespace namespace ON namespace.oid = joined.oid
  UNION ALL
  SELECT 'g0-a2-02-v1', namespace.nspname, 'schema_grants',
         pg_temp.audit_canon(namespace.nspname, CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable), pg_get_userbyid(privilege.grantor)),
         pg_temp.audit_canon(namespace.nspname, pg_get_userbyid(privilege.grantor), CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable))
  FROM ns joined
  JOIN pg_namespace namespace ON namespace.oid = joined.oid
  CROSS JOIN LATERAL aclexplode(coalesce(namespace.nspacl, acldefault('n', namespace.nspowner))) privilege
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'relations', relation.nspname || '.' || relation.relname,
         pg_temp.audit_canon(relation.relkind::text, pg_temp.audit_bool(relation.relrowsecurity), pg_temp.audit_bool(relation.relforcerowsecurity), pg_get_userbyid(relation.relowner), pg_temp.audit_sorted(relation.reloptions), pg_temp.audit_extension_owned('pg_class', relation.oid, 0))
  FROM rel relation
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'columns', relation.nspname || '.' || relation.relname || '.' || attribute.attname,
         pg_temp.audit_canon(attribute.attnum::text, format_type(attribute.atttypid, attribute.atttypmod), pg_temp.audit_bool(attribute.attnotnull), attribute.attidentity::text, attribute.attgenerated::text, pg_get_expr(default_expression.adbin, default_expression.adrelid), CASE WHEN attribute.attcollation <> 0 THEN attribute.attcollation::regcollation::text ELSE NULL END, pg_temp.audit_extension_owned('pg_attribute', relation.oid, attribute.attnum))
  FROM rel relation
  JOIN pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped
  LEFT JOIN pg_attrdef default_expression ON default_expression.adrelid = relation.oid AND default_expression.adnum = attribute.attnum
  WHERE relation.relkind <> 'S'
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname,
         CASE constraint_row.contype WHEN 'p' THEN 'primary_keys' WHEN 'f' THEN 'foreign_keys' WHEN 'u' THEN 'unique_constraints' WHEN 'c' THEN 'check_constraints' WHEN 'x' THEN 'exclusion_constraints' ELSE 'other_constraints' END,
         relation.nspname || '.' || relation.relname || '.' || constraint_row.conname,
         pg_temp.audit_canon(constraint_row.contype::text, pg_get_constraintdef(constraint_row.oid, false), pg_temp.audit_bool(constraint_row.convalidated), pg_temp.audit_bool(constraint_row.condeferrable), pg_temp.audit_bool(constraint_row.condeferred))
  FROM rel relation
  JOIN pg_constraint constraint_row ON constraint_row.conrelid = relation.oid
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'indexes', relation.nspname || '.' || index_relation.relname,
         pg_temp.audit_canon(pg_get_indexdef(index_relation.oid), pg_temp.audit_bool(index_row.indisvalid), pg_temp.audit_bool(index_row.indisready), pg_temp.audit_bool(index_row.indisunique), pg_temp.audit_bool(index_row.indisprimary), pg_temp.audit_extension_owned('pg_class', index_relation.oid, 0))
  FROM rel relation
  JOIN pg_index index_row ON index_row.indrelid = relation.oid
  JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'policies', relation.nspname || '.' || relation.relname || '.' || policy.polname,
         pg_temp.audit_canon(policy.polcmd::text, pg_temp.audit_bool(policy.polpermissive), pg_temp.audit_sorted(ARRAY(SELECT CASE WHEN role_oid = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(role_oid) END FROM unnest(policy.polroles) AS role_oid)), pg_get_expr(policy.polqual, policy.polrelid), pg_get_expr(policy.polwithcheck, policy.polrelid))
  FROM rel relation
  JOIN pg_policy policy ON policy.polrelid = relation.oid
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'relation_grants',
         pg_temp.audit_canon(relation.nspname, relation.relname, CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable), pg_get_userbyid(privilege.grantor)),
         pg_temp.audit_canon(pg_get_userbyid(privilege.grantor), CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable))
  FROM rel relation
  CROSS JOIN LATERAL aclexplode(coalesce(relation.relacl, acldefault(CASE WHEN relation.relkind = 'S' THEN 's'::"char" ELSE 'r'::"char" END, relation.relowner))) privilege
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'column_grants',
         pg_temp.audit_canon(relation.nspname, relation.relname, attribute.attname, CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable), pg_get_userbyid(privilege.grantor)),
         pg_temp.audit_canon(pg_get_userbyid(privilege.grantor), CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable))
  FROM rel relation
  JOIN pg_attribute attribute ON attribute.attrelid = relation.oid AND attribute.attnum > 0 AND NOT attribute.attisdropped AND attribute.attacl IS NOT NULL
  CROSS JOIN LATERAL aclexplode(attribute.attacl) privilege
  UNION ALL
  SELECT 'g0-a2-02-v1', coalesce(namespace.nspname, ''), 'default_privileges',
         pg_temp.audit_canon(coalesce(namespace.nspname, 'GLOBAL'), pg_get_userbyid(default_acl.defaclrole), default_acl.defaclobjtype::text, CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable), pg_get_userbyid(privilege.grantor)),
         pg_temp.audit_canon(pg_get_userbyid(privilege.grantor), CASE WHEN privilege.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(privilege.grantee) END, privilege.privilege_type, pg_temp.audit_bool(privilege.is_grantable))
  FROM pg_default_acl default_acl
  LEFT JOIN ns namespace ON namespace.oid = default_acl.defaclnamespace
  CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) privilege
  WHERE default_acl.defaclnamespace = 0 OR namespace.oid IS NOT NULL
  UNION ALL
  SELECT 'g0-a2-02-v1', namespace.nspname, 'routines', namespace.nspname || '.' || routine.proname || '(' || pg_get_function_identity_arguments(routine.oid) || ')',
         pg_temp.audit_canon(routine.prokind::text, pg_get_functiondef(routine.oid), pg_get_userbyid(routine.proowner), pg_temp.audit_bool(routine.prosecdef), pg_temp.audit_bool(routine.proleakproof), pg_temp.audit_sorted(routine.proconfig), pg_temp.audit_extension_owned('pg_proc', routine.oid, 0))
  FROM pg_proc routine
  JOIN ns namespace ON namespace.oid = routine.pronamespace
  WHERE routine.prokind IN ('f', 'p', 'w')
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'triggers', relation.nspname || '.' || relation.relname || '.' || trigger_row.tgname,
         pg_temp.audit_canon(pg_get_triggerdef(trigger_row.oid, false), trigger_row.tgenabled::text, pg_temp.audit_extension_owned('pg_trigger', trigger_row.oid, 0))
  FROM rel relation
  JOIN pg_trigger trigger_row ON trigger_row.tgrelid = relation.oid AND NOT trigger_row.tgisinternal
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'views', relation.nspname || '.' || relation.relname,
         pg_temp.audit_canon(relation.relkind::text, pg_get_viewdef(relation.oid, false), pg_temp.audit_extension_owned('pg_class', relation.oid, 0))
  FROM rel relation
  WHERE relation.relkind IN ('v', 'm')
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'sequences', relation.nspname || '.' || relation.relname,
         pg_temp.audit_canon(format_type(sequence_row.seqtypid, NULL), sequence_row.seqstart::text, sequence_row.seqincrement::text, sequence_row.seqmin::text, sequence_row.seqmax::text, sequence_row.seqcache::text, pg_temp.audit_bool(sequence_row.seqcycle), pg_get_userbyid(relation.relowner), (
           SELECT string_agg(owner_namespace.nspname || '.' || owner_relation.relname || '.' || owner_attribute.attname, chr(30) ORDER BY owner_namespace.nspname COLLATE "C", owner_relation.relname COLLATE "C", owner_attribute.attname COLLATE "C")
           FROM pg_depend dependency
           JOIN pg_class owner_relation ON owner_relation.oid = dependency.refobjid
           JOIN pg_namespace owner_namespace ON owner_namespace.oid = owner_relation.relnamespace
           JOIN pg_attribute owner_attribute ON owner_attribute.attrelid = dependency.refobjid AND owner_attribute.attnum = dependency.refobjsubid
           WHERE dependency.classid = 'pg_class'::regclass AND dependency.objid = relation.oid AND dependency.refclassid = 'pg_class'::regclass AND dependency.deptype = 'a'
         ), pg_temp.audit_extension_owned('pg_class', relation.oid, 0))
  FROM rel relation
  JOIN pg_sequence sequence_row ON sequence_row.seqrelid = relation.oid
  UNION ALL
  SELECT 'g0-a2-02-v1', namespace.nspname, 'enumerations', namespace.nspname || '.' || enum_type.typname,
         pg_temp.audit_canon((SELECT string_agg(label.enumlabel, chr(30) ORDER BY label.enumsortorder) FROM pg_enum label WHERE label.enumtypid = enum_type.oid))
  FROM pg_type enum_type
  JOIN ns namespace ON namespace.oid = enum_type.typnamespace
  WHERE enum_type.typtype = 'e'
  UNION ALL
  SELECT 'g0-a2-02-v1', namespace.nspname, 'domains', namespace.nspname || '.' || domain_type.typname,
         pg_temp.audit_canon(format_type(domain_type.typbasetype, domain_type.typtypmod), pg_temp.audit_bool(domain_type.typnotnull), domain_type.typdefault, (
           SELECT string_agg(constraint_row.conname || '=' || pg_get_constraintdef(constraint_row.oid, false), chr(30) ORDER BY constraint_row.conname COLLATE "C")
           FROM pg_constraint constraint_row WHERE constraint_row.contypid = domain_type.oid
         ), pg_temp.audit_extension_owned('pg_type', domain_type.oid, 0))
  FROM pg_type domain_type
  JOIN ns namespace ON namespace.oid = domain_type.typnamespace
  WHERE domain_type.typtype = 'd'
  UNION ALL
  SELECT 'g0-a2-02-v1', relation.nspname, 'partitions', relation.nspname || '.' || relation.relname,
         pg_temp.audit_canon(CASE WHEN relation.relkind = 'p' THEN pg_get_partkeydef(relation.oid) ELSE NULL END, pg_get_expr(relation.relpartbound, relation.oid), (
           SELECT string_agg(parent_namespace.nspname || '.' || parent_relation.relname, chr(30) ORDER BY parent_namespace.nspname COLLATE "C", parent_relation.relname COLLATE "C")
           FROM pg_inherits inheritance
           JOIN pg_class parent_relation ON parent_relation.oid = inheritance.inhparent
           JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent_relation.relnamespace
           WHERE inheritance.inhrelid = relation.oid
         ))
  FROM rel relation
  WHERE relation.relispartition OR relation.relkind = 'p'
  UNION ALL
  SELECT 'g0-a2-02-v1', namespace.nspname, 'extensions', extension.extname,
         pg_temp.audit_canon(extension.extversion, namespace.nspname)
  FROM pg_extension extension
  JOIN pg_namespace namespace ON namespace.oid = extension.extnamespace
  UNION ALL
  SELECT 'g0-a2-02-v1', coalesce(member_namespace.nspname, ''), 'extension_members',
         member.extname || '|' || member.member_kind || '|' || member_namespace.nspname || '.' || member.member_name,
         pg_temp.audit_canon(member.extname, member.member_kind, member.member_name)
  FROM (
    SELECT extension.extname, namespace.nspname AS nspname, 'class' AS member_kind, relation.relname AS member_name
    FROM pg_depend dependency
    JOIN pg_extension extension ON extension.oid = dependency.refobjid
    JOIN pg_class relation ON dependency.classid = 'pg_class'::regclass AND relation.oid = dependency.objid
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    WHERE dependency.deptype = 'e' AND dependency.refclassid = 'pg_extension'::regclass
    UNION ALL
    SELECT extension.extname, namespace.nspname, 'routine', routine.proname || '(' || pg_get_function_identity_arguments(routine.oid) || ')'
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
  ) member
  JOIN pg_namespace member_namespace ON member_namespace.nspname = member.nspname
  WHERE member.nspname IN ('public', 'app_private', 'auth', 'storage', 'extensions')
  UNION ALL
  SELECT 'g0-a2-02-v1', '', 'role_attributes', role_row.rolname,
         pg_temp.audit_canon(pg_temp.audit_bool(role_row.rolsuper), pg_temp.audit_bool(role_row.rolinherit), pg_temp.audit_bool(role_row.rolcreaterole), pg_temp.audit_bool(role_row.rolcreatedb), pg_temp.audit_bool(role_row.rolcanlogin), pg_temp.audit_bool(role_row.rolreplication), pg_temp.audit_bool(role_row.rolbypassrls))
  FROM pg_roles role_row
  WHERE role_row.rolname NOT LIKE 'pg\_%' ESCAPE '\'
  UNION ALL
  SELECT 'g0-a2-02-v1', '', 'role_memberships',
         parent_role.rolname || '|' || member_role.rolname || '|' || grantor_role.rolname,
         pg_temp.audit_canon(pg_temp.audit_bool(membership.admin_option), pg_temp.audit_bool(membership.inherit_option), pg_temp.audit_bool(membership.set_option))
  FROM pg_auth_members membership
  JOIN pg_roles parent_role ON parent_role.oid = membership.roleid
  JOIN pg_roles member_role ON member_role.oid = membership.member
  JOIN pg_roles grantor_role ON grantor_role.oid = membership.grantor
  WHERE parent_role.rolname NOT LIKE 'pg\_%' ESCAPE '\'
     OR member_role.rolname NOT LIKE 'pg\_%' ESCAPE '\'
  UNION ALL
  SELECT 'g0-a2-02-v1', '', 'migrations', migration.version,
         pg_temp.audit_canon(migration.version, migration.name, md5(coalesce(migration.statements::text, '')))
  FROM supabase_migrations.schema_migrations migration
  UNION ALL
  SELECT 'g0-a2-02-v1', '', 'publications', publication.pubname,
         pg_temp.audit_canon(pg_get_userbyid(publication.pubowner), pg_temp.audit_bool(publication.puballtables), pg_temp.audit_bool(publication.pubinsert), pg_temp.audit_bool(publication.pubupdate), pg_temp.audit_bool(publication.pubdelete), pg_temp.audit_bool(publication.pubtruncate), pg_temp.audit_bool(publication.pubviaroot))
  FROM pg_publication publication
  UNION ALL
  SELECT 'g0-a2-02-v1', namespace.nspname, 'publication_tables', publication.pubname || '|' || namespace.nspname || '.' || relation.relname,
         pg_temp.audit_canon(publication.pubname, namespace.nspname, relation.relname)
  FROM pg_publication_rel published
  JOIN pg_publication publication ON publication.oid = published.prpubid
  JOIN pg_class relation ON relation.oid = published.prrelid
  JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
  UNION ALL
  SELECT 'g0-a2-02-v1', '', 'event_triggers', event_trigger.evtname,
         pg_temp.audit_canon(event_trigger.evtevent, pg_temp.audit_sorted(event_trigger.evttags), event_trigger.evtfoid::regprocedure::text, event_trigger.evtenabled::text, pg_get_userbyid(event_trigger.evtowner))
  FROM pg_event_trigger event_trigger
)
SELECT format_version, schema_name, category, object_identity, canonical_definition
FROM (
  SELECT format_version, schema_name, category, object_identity, canonical_definition FROM objects
  UNION ALL
  SELECT 'g0-a2-02-v1', '', mandatory.category, '__CATEGORY_EMPTY__', 'g0-a2-02-v1|' || mandatory.category || '|__CATEGORY_EMPTY__'
  FROM mandatory
  WHERE NOT EXISTS (SELECT 1 FROM objects WHERE objects.category = mandatory.category)
) inventory
ORDER BY category COLLATE "C", schema_name COLLATE "C", object_identity COLLATE "C";
