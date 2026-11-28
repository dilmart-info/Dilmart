# Canonical object inventory (g0-a2-02-v1)

Metadata-only catalog evidence for ED-01. This does not close ED-01, D09, or G0.

## Files

- `schema-fingerprint.sql` and `schema-extended-metadata.sql` stay unchanged. They remain the historical aggregate MD5 evidence.
- `schema-object-inventory.sql` emits one source row per object, plus an explicit empty marker for every mandatory category that has no rows.
- `seal-schema-inventory.mjs` replaces each canonical definition with its SHA-256 and deletes nothing by itself. The workflow deletes the raw file.
- `compare-schema-inventory.mjs` compares two sealed inventories offline.

## Serialization

- Format version on every row: `g0-a2-02-v1`.
- Sealed columns: `format_version`, `schema_name`, `category`, `object_identity`, `definition_sha256`.
- The hash is SHA-256 over the UTF-8 canonical definition. It is not MD5.
- Fields are joined with unit separator `U+001F`. List values use `U+001E` and are sorted with `C` collation when order is not meaningful.
- Backslash, unit separator, and record separator inside a value are escaped before joining. NULL becomes `\N`. Booleans are `true` or `false`.
- Empty category: `schema_name` blank, `object_identity` `__CATEGORY_EMPTY__`, definition text `g0-a2-02-v1|<category>|__CATEGORY_EMPTY__`.
- Object identities include the qualifiers needed to keep grants, overloads, publications, and extension members distinct. They are cast to `text` before comparison. PostgreSQL `name` concatenation is limited to 63 bytes and must not be the identity type. OIDs and sequence `last_value` are not used.
- Extractor `search_path` is `pg_temp, pg_catalog`. Helper functions live in `pg_temp`. Routine `search_path` remains inside `proconfig` and is part of the definition. Catalog text stays schema-qualified because application schemas are not on the extractor path.

## Comparison

The first file is the baseline and the second is the candidate.

- `IDENTICAL`: same identity and hash. Exit 0 only when every concrete object matches and every mandatory category is present.
- `MISSING`: baseline object absent from the candidate.
- `EXTRA`: candidate object absent from the baseline.
- `MODIFIED`: same identity, different hash.
- Exit 2 when any raw difference remains. A review file can label a difference, but it cannot turn the result into a pass.
- Exit 3 for a bad header, unsupported format, duplicate identity, missing mandatory category, mixed empty marker, or a review item that matches nothing.
- There is no managed-schema allowlist.

A changed grant keeps the grantee, privilege, grant option, and grantor in the object identity. Replacing `SELECT` with `INSERT` is therefore `MISSING` plus `EXTRA`, not a collapsed `MODIFIED` row. Either result exits 2.

## Coverage and historical gaps

The aggregate extended fingerprint omits constraint type and the unique/primary index flags. Those differences are why its public constraint and index hashes do not match `schema-fingerprint.sql`. The object inventory keeps constraint type and `indisunique` / `indisprimary`.

Mandatory categories are schemas, schema grants, relations, columns, primary keys, foreign keys, unique constraints, check constraints, exclusion constraints, other constraints, indexes, policies, relation grants, column grants, default privileges, routines, triggers, views, sequences, enumerations, domains, partitions, extensions, extension members, role attributes, role memberships, migrations, publications, publication tables, and event triggers.

Columns include type, nullability, default, identity, generated expression, and collation. Routines include the definition, owner, `SECURITY DEFINER`, leakproof, and configuration. Sequences include bounds and owned column, not the current value. Role attributes do not include passwords. Migration identity is version plus name plus a digest of the statement text.

Schemas inventoried for DilMart objects: `public`, `app_private`, `auth`, `storage`, and `extensions`. Auth, storage, and extension objects are reported, not ignored.

## Explicit exclusions

- Business table rows.
- Role passwords, tokens, and secret values.
- Sequence current values.
- PostgreSQL internal roles whose names start with `pg_`.
- Extension membership rows outside the five schemas above.
- `pg_description` comments. They are not in the mandatory PRE-G0-01 set.
- Preflight and rollback SQL files under `supabase/migrations/`. The replay continues to use the 175 top-level migrations.

Hashes are comparable for the same PostgreSQL major version. `pg_get_functiondef` and `pg_get_indexdef` text can change across major versions. The current local evidence baseline is PostgreSQL 17.12.

## Workflow

`.github/workflows/pre-g0-schema-evidence.yml` remains manual and local. It still pins Supabase CLI 3.2.0, rewrites the project id, resets with `--no-seed`, runs the final schema gate, writes the old aggregate files, stops the disposable project, and uploads `local-schema-evidence` for 3 days. The object inventory is sealed before upload. Raw definitions are not printed and are removed from the runner temp directory. The same query is executed twice in that database and the sealed files must be byte-identical. That proves query stability for one replay. It is not, by itself, two independent database builds.
