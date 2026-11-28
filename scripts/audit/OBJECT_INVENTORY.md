# Canonical object inventory (g0-a2-02-v2)

Metadata-only catalog evidence for ED-01. This does not close ED-01, D09, or G0.

`g0-a2-02-v1` sealed inventories are a different format. Comparison rejects them as unsupported. They are not identical to a v2 inventory, including the previous sealed SHA-256 `8AE1A3E1ED2082F18089A844C09F662B27F321DB4B9482981C7E579F0DBC36A7`.

## Files

- `schema-fingerprint.sql` and `schema-extended-metadata.sql` stay unchanged. They remain the historical aggregate MD5 evidence.
- `schema-object-inventory.sql` is one read-only query. It emits one source row per object, plus an explicit empty marker for every mandatory category that has no rows.
- `seal-schema-inventory.mjs` replaces each canonical definition with its SHA-256. The workflow deletes the raw file, including when the step is interrupted.
- `compare-schema-inventory.mjs` compares two sealed inventories offline. A review file must name format `g0-a2-02-review-v2` and the SHA-256 of each sealed file.

## Read-only extraction

The SQL file starts with `BEGIN TRANSACTION READ ONLY`, sets `search_path` to `pg_catalog`, runs one `SELECT`, and ends with `ROLLBACK`. It creates no functions and runs no other DDL. `SET LOCAL` is transaction-scoped and disappears at rollback. Hosted roles and privileges are unchanged by this file.

## Serialization

- Format version on every row: `g0-a2-02-v2`.
- Sealed columns: `format_version`, `schema_name`, `category`, `object_identity`, `definition_sha256`.
- The hash is SHA-256 over the UTF-8 canonical definition. It is not MD5.
- A field is escaped by replacing `\` with `\\`, U+001F with `\u`, and U+001E with `\x`. NULL becomes the two-character marker `\N`. The literal text `\N` is escaped to `\\N`, so it does not collide with NULL. An empty string stays empty.
- Composite values join escaped fields with a raw U+001F. Lists escape each item, sort by UTF-16 code unit, and join with a raw U+001E. The same rules are applied in SQL with `chr(31)`, `chr(30)`, and `COLLATE "C"`.
- Ordering of sealed rows uses code-point comparison, then `COLLATE "C"` in the extractor. Locale is not consulted.
- Empty category: `schema_name` blank, `object_identity` `__CATEGORY_EMPTY__`, definition text `g0-a2-02-v2|<category>|__CATEGORY_EMPTY__`.
- Object identities are `text`. PostgreSQL `name` concatenation is limited to 63 bytes and is not used as an identity type. OIDs and sequence `last_value` are not used.
- Two inventories that both contain zero concrete objects are invalid. One empty side remains a normal missing/extra result.
- When both inventories carry `extraction_context` identity `server_version_num=<n>`, different PostgreSQL major versions are invalid. A minor difference is a normal object difference.

## Comparison

The first file is the baseline and the second is the candidate.

- `IDENTICAL`: same identity and hash. Exit 0 only when every concrete object matches and every mandatory category is present.
- `MISSING`: baseline object absent from the candidate.
- `EXTRA`: candidate object absent from the baseline.
- `MODIFIED`: same identity, different hash.
- Exit 2 when any raw difference remains. A review file can label a difference, but it cannot turn the result into a pass.
- Exit 3 for a bad header, malformed quoting, unsupported format, duplicate identity, missing mandatory category, mixed empty marker, an unbound review, or a review item that matches nothing.
- There is no managed-schema allowlist.

A changed grant keeps the grantee, privilege, grant option, grantor, and default-versus-explicit marker in the object identity. Replacing `EXECUTE` for `PUBLIC` with `EXECUTE` for another role is therefore `MISSING` plus `EXTRA`.

## Coverage

Mandatory categories are schemas, schema grants, relations, columns, primary keys, foreign keys, unique constraints, check constraints, exclusion constraints, other constraints, indexes, policies, relation grants, column grants, default privileges, routines, routine grants, triggers, views, sequences, enumerations, domains, types, type grants, partitions, extensions, extension members, role attributes, role memberships, migrations, publications, publication schemas, publication tables, event triggers, and extraction context.

Routine grants read `proacl` when present and `acldefault('f', proowner)` when the ACL is null. Each row records schema, identity arguments, grantee (`PUBLIC` when the grantee OID is 0), privilege, grant option, grantor, and `default` or `explicit`. This is the object-level form of the unchanged aggregate `function_grants` and `routine_grants:<schema>` queries. Those aggregates stay MD5 text and are not compared to this SHA-256 inventory.

Types cover defined base, composite, range, and multirange types in the five schemas, with owner. Table row types, arrays, enums, and domains stay out of that category. Enums and domains keep their own categories. Type grants cover base, composite, domain, enum, range, and multirange types through `typacl` or `acldefault('T', typowner)`.

Sequence ownership lists dependency types `a` and `i` as `deptype:schema.table.column`. Internal identity ownership (`i`) is included. The sequence current value is not.

Publication tables include `pg_get_expr(prqual, prrelid)` and the published column list. A null column list stays NULL. An empty column list stays an empty string. Publication schemas come from `pg_publication_namespace`.

Extension members in the five schemas include classes, routines, types, operators, collations, operator classes, and operator families. Extension objects outside `public`, `app_private`, `auth`, `storage`, and `extensions` are excluded, including `pg_catalog` internals. The extension row itself still records every installed extension and its schema.

`extraction_context` records `server_version_num`, `server_version`, and `search_path`, plus whether the extractor transaction is read only.

Columns include type, nullability, default, identity, generated expression, and collation. Routines include the definition, owner, `SECURITY DEFINER`, leakproof, and configuration. Role attributes do not include passwords. Migration identity is version plus name plus a digest of the statement text.

Schemas inventoried for DilMart objects: `public`, `app_private`, `auth`, `storage`, and `extensions`. Auth, storage, and extension objects are reported, not ignored.

The aggregate extended fingerprint omits constraint type and the unique/primary index flags. Those differences are why its public constraint and index hashes do not match `schema-fingerprint.sql`. The object inventory keeps constraint type and `indisunique` / `indisprimary`.

## Explicit exclusions

- Business table rows.
- Role passwords, tokens, and secret values.
- Sequence current values.
- PostgreSQL internal roles whose names start with `pg_`.
- Extension membership rows outside the five schemas above.
- `pg_description` comments. They are not in the mandatory PRE-G0-01 set.
- Preflight and rollback SQL files under `supabase/migrations/`. The replay continues to use the 175 top-level migrations.
- Operator classes and families outside the five schemas.

Hashes are comparable for the same PostgreSQL major version. `pg_get_functiondef` and `pg_get_indexdef` text can change across major versions. The current local evidence baseline is PostgreSQL 17.

## Workflow

`.github/workflows/pre-g0-schema-evidence.yml` remains manual and local. It pins Supabase CLI 3.2.0, rewrites the project id, resets with `--no-seed`, runs the final schema gate, writes the old aggregate files, stops the disposable project, and uploads `local-schema-evidence` for 3 days. The object inventory query contains the read-only transaction. Raw definitions are not printed. An `EXIT` trap removes them if the step stops early. The same query is executed twice in that database and the sealed files must be byte-identical. That proves query stability for one replay. It is not, by itself, two independent database builds.

`postgres-inventory-mutations.test.mjs` applies grants, ownership, routine configuration, RLS, constraints, type grants, identity ownership, and publication changes only inside the disposable container `g0a202r1-mut`.
