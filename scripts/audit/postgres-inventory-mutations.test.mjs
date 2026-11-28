import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseRawInventory, sealRecords, serializeSealed, sha256 } from "./schema-inventory-lib.mjs";

const CONTAINER = "g0a202r1-mut";
const extractorSql = readFileSync(new URL("./schema-object-inventory.sql", import.meta.url), "utf8");

function docker(args, { input } = {}) {
  const result = spawnSync("docker", args, { input, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `docker exited ${result.status}`).slice(0, 4000));
  }
  return result.stdout;
}

function psql(sql, { csv = false, tuples = false } = {}) {
  const args = ["exec", "-i", CONTAINER, "psql", "-q", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
  if (csv) args.push("--csv");
  if (tuples) args.push("-At");
  return docker(args, { input: sql });
}

function extract() {
  const raw = psql(extractorSql, { csv: true });
  const rows = parseRawInventory(raw);
  const sealed = serializeSealed(sealRecords(rows));
  return { rows, sealed, digest: sha256(sealed) };
}

function rowFor(rows, category, identityIncludes) {
  return rows.find((row) => row.category === category && row.object_identity.includes(identityIncludes));
}

test("isolated postgres metadata mutations change the sealed inventory", async () => {
  assert.doesNotMatch(extractorSql, /CREATE\s+(FUNCTION|TABLE|TEMP|SCHEMA)/i);
  assert.match(extractorSql, /BEGIN TRANSACTION READ ONLY/);
  assert.match(extractorSql, /ROLLBACK;/);
  docker(["rm", "-f", CONTAINER]);
  docker([
    "run", "-d", "--name", CONTAINER, "--network", "none",
    "-e", "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:17",
  ]);
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const probe = spawnSync("docker", ["exec", CONTAINER, "pg_isready", "-U", "postgres", "-d", "postgres"], { encoding: "utf8" });
      if (probe.status === 0) {
        ready = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.equal(ready, true);

    psql(`
      CREATE SCHEMA app_private;
      CREATE SCHEMA auth;
      CREATE SCHEMA storage;
      CREATE SCHEMA extensions;
      CREATE SCHEMA supabase_migrations;
      CREATE TABLE supabase_migrations.schema_migrations (
        version text PRIMARY KEY,
        name text,
        statements text[]
      );
      INSERT INTO supabase_migrations.schema_migrations VALUES ('0001', 'synthetic', ARRAY['select 1']);
      CREATE ROLE synth_owner NOLOGIN;
      CREATE TABLE public.orders (
        id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        note text,
        marker text DEFAULT '\\N'
      );
      ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
      CREATE TABLE public."طلب" ("قيمة" text);
      CREATE FUNCTION public.touch(p integer) RETURNS integer LANGUAGE sql AS 'SELECT p';
      CREATE TYPE public.widget AS (n integer);
      CREATE PUBLICATION synth_pub FOR TABLE public.orders (id) WHERE (id > 0);
      CREATE PUBLICATION synth_schema FOR TABLES IN SCHEMA public;
    `);

    const before = extract();
    const repeated = extract();
    assert.equal(repeated.digest, before.digest);
    const readOnly = rowFor(before.rows, "extraction_context", "transaction_read_only=");
    assert.equal(readOnly.object_identity, "transaction_read_only=on");
    assert.equal(readOnly.canonical_definition, "on");
    assert.equal(psql("SELECT current_setting('transaction_read_only');", { tuples: true }), "off\n");
    assert.equal(psql("SELECT count(*) FROM pg_namespace WHERE nspname = 'pg_temp';", { tuples: true }), "0\n");
    assert.match(rowFor(before.rows, "routine_grants", "touch").object_identity, /PUBLIC/);
    assert.equal(rowFor(before.rows, "routine_grants", "touch").canonical_definition.includes("default"), true);
    assert.ok(before.rows.some((row) => row.category === "sequences" && row.canonical_definition.includes("i:public.orders.id")));
    assert.ok(before.rows.some((row) => row.category === "types" && row.object_identity === "public.widget"));
    assert.ok(before.rows.some((row) => row.category === "publication_schemas" && row.object_identity.includes("synth_schema")));
    assert.ok(before.rows.some((row) => row.category === "publication_tables" && row.canonical_definition.includes("(id > 0)")));
    assert.ok(before.rows.some((row) => row.category === "relations" && row.object_identity.includes("طلب")));
    const plain = rowFor(before.rows, "columns", "public.orders.note");
    const marker = rowFor(before.rows, "columns", "public.orders.marker");
    assert.notEqual(sha256(plain.canonical_definition), sha256(marker.canonical_definition));

    psql(`
      REVOKE ALL ON FUNCTION public.touch(integer) FROM PUBLIC;
      GRANT EXECUTE ON FUNCTION public.touch(integer) TO synth_owner;
      ALTER FUNCTION public.touch(integer) OWNER TO synth_owner;
      ALTER FUNCTION public.touch(integer) SET search_path = pg_catalog;
      ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
      ALTER TABLE public.orders ADD CONSTRAINT orders_note_len CHECK (length(note) < 40);
      REVOKE USAGE ON TYPE public.widget FROM PUBLIC;
      ALTER PUBLICATION synth_pub SET TABLE public.orders (note) WHERE (id > 1);
      ALTER TABLE public.orders ADD COLUMN extra_seq bigint GENERATED BY DEFAULT AS IDENTITY;
    `);

    const after = extract();
    assert.notEqual(after.digest, before.digest);
    assert.equal(after.rows.some((row) => row.category === "routine_grants" && row.object_identity.includes("touch") && row.object_identity.includes("PUBLIC")), false);
    assert.ok(after.rows.some((row) => row.category === "routine_grants" && row.object_identity.includes("touch") && row.object_identity.includes("synth_owner") && row.object_identity.includes("explicit")));
    assert.ok(after.rows.some((row) => row.category === "routines" && row.object_identity.includes("touch") && row.canonical_definition.includes("search_path=pg_catalog")));
    assert.ok(after.rows.some((row) => row.category === "routines" && row.object_identity.includes("touch") && row.canonical_definition.includes("synth_owner")));
    assert.ok(after.rows.some((row) => row.category === "check_constraints" && row.object_identity.includes("orders_note_len")));
    assert.notEqual(
      sha256(rowFor(before.rows, "relations", "public.orders").canonical_definition),
      sha256(rowFor(after.rows, "relations", "public.orders").canonical_definition),
    );
    assert.ok(after.rows.some((row) => row.category === "type_grants" && row.object_identity.includes("widget") && row.object_identity.includes("explicit")));
    assert.equal(after.rows.some((row) => row.category === "type_grants" && row.object_identity.includes("widget") && row.object_identity.includes("PUBLIC")), false);
    assert.ok(after.rows.some((row) => row.category === "publication_tables" && row.canonical_definition.includes("(id > 1)") && row.canonical_definition.includes("note")));
    assert.ok(after.rows.some((row) => row.category === "sequences" && row.canonical_definition.includes("i:public.orders.extra_seq")));
    assert.equal(rowFor(after.rows, "extraction_context", "transaction_read_only=").object_identity, "transaction_read_only=on");
    process.stdout.write(`mutation-proof read_only=on before=${before.digest} after=${after.digest}\n`);
  } finally {
    spawnSync("docker", ["rm", "-f", CONTAINER], { encoding: "utf8" });
  }
});
