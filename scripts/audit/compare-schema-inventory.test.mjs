import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  EMPTY_IDENTITY,
  FORMAT_VERSION,
  MANDATORY_CATEGORIES,
  applyReview,
  compareInventories,
  emptyCanonical,
  parseSealedInventory,
  sealRecords,
  serializeSealed,
  sha256,
} from "./schema-inventory-lib.mjs";

function row(category, identity, definition, schema = "public") {
  return {
    format_version: FORMAT_VERSION,
    schema_name: schema,
    category,
    object_identity: identity,
    canonical_definition: definition,
  };
}

function inventory(concreteRows) {
  const present = new Set(concreteRows.map((item) => item.category));
  const empties = MANDATORY_CATEGORIES.filter((category) => !present.has(category)).map((category) => row(
    category,
    EMPTY_IDENTITY,
    emptyCanonical(category),
    "",
  ));
  return sealRecords([...concreteRows, ...empties]);
}

function compare(baselineRows, candidateRows) {
  return compareInventories(inventory(baselineRows), inventory(candidateRows));
}

const baseColumn = row("columns", "public.orders.note", "text|true|null|\\N");

test("identical catalogs", () => {
  const result = compare([baseColumn], [baseColumn]);
  assert.equal(result.status, "IDENTICAL");
  assert.equal(result.exitCode, 0);
});

test("missing column", () => {
  const result = compare([baseColumn], []);
  assert.equal(result.differences[0].classification, "MISSING");
  assert.equal(result.exitCode, 2);
});

test("changed default", () => {
  const result = compare(
    [row("columns", "public.orders.note", "text|false|default|0")],
    [row("columns", "public.orders.note", "text|false|default|1")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("changed nullability", () => {
  const result = compare(
    [row("columns", "public.orders.note", "text|false")],
    [row("columns", "public.orders.note", "text|true")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("changed data type", () => {
  const result = compare(
    [row("columns", "public.orders.note", "text")],
    [row("columns", "public.orders.note", "integer")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("missing foreign key", () => {
  const result = compare([row("foreign_keys", "public.orders.orders_user_fkey", "FOREIGN KEY (user_id) REFERENCES users(id)")], []);
  assert.equal(result.differences[0].category, "foreign_keys");
  assert.equal(result.differences[0].classification, "MISSING");
});

test("changed check constraint", () => {
  const result = compare(
    [row("check_constraints", "public.orders.note_length", "CHECK (length(note) > 0)")],
    [row("check_constraints", "public.orders.note_length", "CHECK (length(note) > 1)")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("changed unique index", () => {
  const result = compare(
    [row("indexes", "public.orders_note_key", "unique|true|primary|false")],
    [row("indexes", "public.orders_note_key", "unique|false|primary|false")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("disabled RLS", () => {
  const result = compare(
    [row("relations", "public.orders", "r|rls|true|force|false")],
    [row("relations", "public.orders", "r|rls|false|force|false")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("modified policy", () => {
  const result = compare(
    [row("policies", "public.orders.owner_only", "USING (user_id = auth.uid())")],
    [row("policies", "public.orders.owner_only", "USING (true)")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("changed grant", () => {
  const result = compare(
    [row("relation_grants", "public.orders|authenticated|SELECT|false|postgres", "SELECT")],
    [row("relation_grants", "public.orders|authenticated|INSERT|false|postgres", "INSERT")],
  );
  const kinds = result.differences.map((item) => item.classification).sort();
  assert.deepEqual(kinds, ["EXTRA", "MISSING"]);
  assert.equal(result.exitCode, 2);
});

test("changed SECURITY DEFINER or routine search_path", () => {
  const result = compare(
    [row("routines", "public.touch(uuid)", "definer|false|search_path|public")],
    [row("routines", "public.touch(uuid)", "definer|true|search_path|pg_catalog")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("changed routine definition", () => {
  const result = compare(
    [row("routines", "public.touch(uuid)", "BEGIN RETURN 1; END")],
    [row("routines", "public.touch(uuid)", "BEGIN RETURN 2; END")],
  );
  assert.equal(result.differences[0].classification, "MODIFIED");
});

test("missing migration identity", () => {
  const result = compare([row("migrations", "20260214175155", "20260214175155|init", "")], []);
  assert.equal(result.differences[0].classification, "MISSING");
  assert.equal(result.differences[0].category, "migrations");
});

test("duplicate object key", () => {
  const records = inventory([baseColumn]);
  records.push({ ...records.find((item) => item.object_identity === "public.orders.note"), definition_sha256: sha256("other") });
  const result = compareInventories(records, inventory([baseColumn]));
  assert.equal(result.status, "INVALID");
  assert.equal(result.exitCode, 3);
  assert.match(result.errors.join("\n"), /duplicate object identity/);
});

test("empty category", () => {
  const identical = compare([], []);
  assert.equal(identical.status, "IDENTICAL");
  const extra = compare([], [row("column_grants", "public.orders.note|authenticated|SELECT|false|postgres", "SELECT")]);
  assert.equal(extra.differences.some((item) => item.classification === "EXTRA"), true);
  assert.equal(extra.status, "DIFFERENT");
});

test("input ordering independence", () => {
  const first = inventory([
    row("columns", "public.orders.b", "text"),
    row("columns", "public.orders.a", "integer"),
  ]);
  const second = inventory([
    row("columns", "public.orders.a", "integer"),
    row("columns", "public.orders.b", "text"),
  ]);
  assert.equal(serializeSealed(first), serializeSealed(second));
  assert.equal(compareInventories(first, [...second].reverse()).status, "IDENTICAL");
});

test("incompatible format version", () => {
  const records = inventory([baseColumn]);
  records[0] = { ...records[0], format_version: "g0-a2-02-v0" };
  const result = compareInventories(records, inventory([baseColumn]));
  assert.equal(result.status, "INVALID");
  assert.match(result.errors.join("\n"), /unsupported format/);
});

test("a reviewed difference is not a pass", () => {
  const result = applyReview(compare([baseColumn], []), {
    format: "g0-a2-02-review-v1",
    items: [{
      classification: "MISSING",
      schema_name: "public",
      category: "columns",
      object_identity: "public.orders.note",
      reason: "synthetic review fixture",
    }],
  });
  assert.equal(result.exitCode, 2);
  assert.equal(result.reviewed.length, 1);
  assert.equal(result.unexplained.length, 0);
});

test("an unmatched review item is invalid", () => {
  const result = applyReview(compare([baseColumn], [baseColumn]), {
    format: "g0-a2-02-review-v1",
    items: [{
      classification: "MISSING",
      schema_name: "auth",
      category: "relations",
      object_identity: "auth.users",
      reason: "does not match a raw difference",
    }],
  });
  assert.equal(result.exitCode, 3);
});

test("sealed CSV round trip and SQL category coverage", () => {
  const text = serializeSealed(inventory([baseColumn]));
  const parsed = parseSealedInventory(text);
  assert.equal(compareInventories(parsed, inventory([baseColumn])).status, "IDENTICAL");
  const sql = readFileSync(new URL("./schema-object-inventory.sql", import.meta.url), "utf8");
  for (const category of MANDATORY_CATEGORIES) assert.match(sql, new RegExp(`'${category}'`));
});
