/**
 * Product Import Sessions RLS & ACL Lockdown Test — static tripwire & policy guard.
 *
 * Asserts that:
 * 1. public.product_import_sessions has Row Level Security ENABLED via fail-closed DDL (without IF EXISTS).
 * 2. All privileges are revoked from PUBLIC, anon, and authenticated.
 * 3. Full CRUD is explicitly granted to service_role.
 * 4. Zero browser CREATE POLICY statements remain on product_import_sessions (service-role only model).
 * 5. backend/tests/db-integration/final-schema-gate.sql carries the authoritative Universal RLS Gate
 *    and FRA-S-PIS-001 assertions.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

function orderedMigrations() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

test("product_import_sessions has RLS enabled via fail-closed DDL (no IF EXISTS)", () => {
  const migrations = orderedMigrations();
  let failClosedRls = false;

  for (const { sql } of migrations) {
    if (/ALTER\s+TABLE\s+public\.product_import_sessions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql) &&
        !/ALTER\s+TABLE\s+IF\s+EXISTS\s+public\.product_import_sessions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)) {
      failClosedRls = true;
    }
  }

  assert.equal(failClosedRls, true, "product_import_sessions must have fail-closed ENABLE RLS without IF EXISTS");
});

test("product_import_sessions revokes all privileges from PUBLIC, anon, authenticated", () => {
  const migrations = orderedMigrations();
  let allRevoked = false;

  for (const { sql } of migrations) {
    if (/REVOKE\s+ALL\s+ON\s+(?:TABLE\s+)?public\.product_import_sessions\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(sql)) {
      allRevoked = true;
    }
  }

  assert.equal(allRevoked, true, "REVOKE ALL ON TABLE public.product_import_sessions FROM PUBLIC, anon, authenticated must be present");
});

test("product_import_sessions grants CRUD explicitly to service_role", () => {
  const migrations = orderedMigrations();
  let serviceGranted = false;

  for (const { sql } of migrations) {
    if (/GRANT\s+SELECT,\s*INSERT,\s*UPDATE,\s*DELETE\s+ON\s+(?:TABLE\s+)?public\.product_import_sessions\s+TO\s+service_role/i.test(sql)) {
      serviceGranted = true;
    }
  }

  assert.equal(serviceGranted, true, "Explicit service_role CRUD grant must be present");
});

test("product_import_sessions carries 0 browser CREATE POLICY statements in final lockdown", () => {
  const migrations = orderedMigrations();
  const lockdownMigration = migrations.find((m) => m.name.includes("lock_product_import_sessions_rls"));

  assert.ok(lockdownMigration, "lockdown migration must be present");
  const hasCreatePolicy = /CREATE\s+POLICY/i.test(lockdownMigration.sql);
  assert.equal(hasCreatePolicy, false, "Lockdown migration must NOT create browser policies (service-role only model)");
});

test("final-schema-gate.sql carries the Universal RLS gate and FRA-S-PIS-001 assertions", () => {
  const gate = readFileSync(join(HERE, "db-integration", "final-schema-gate.sql"), "utf8");

  assert.match(gate, /fra_universal_rls/i, "final-schema-gate.sql must carry the Universal RLS Gate");
  assert.match(gate, /fra_pis_001/i, "final-schema-gate.sql must carry FRA-S-PIS-001 product_import_sessions gate");
  assert.match(gate, /has_table_privilege\('anon',\s*'public\.product_import_sessions',\s*'SELECT'\)/i, "gate must assert anon has no SELECT");
  assert.match(gate, /has_table_privilege\('authenticated',\s*'public\.product_import_sessions',\s*'SELECT'\)/i, "gate must assert authenticated has no SELECT");
});
