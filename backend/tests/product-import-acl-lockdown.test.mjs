/**
 * Product Import Sessions RLS & ACL Lockdown Test — static tripwire & policy guard.
 *
 * Asserts that:
 * 1. public.product_import_sessions has Row Level Security ENABLED in migration sequence.
 * 2. anon role has NO table privileges (REVOKE ALL).
 * 3. authenticated browser role has NO direct INSERT/UPDATE/DELETE privileges.
 * 4. RLS policies isolate merchant sessions to own merchant (app_private.is_merchant_member(merchant_id)).
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

test("product_import_sessions has RLS enabled in migration chain", () => {
  const migrations = orderedMigrations();
  let rlsEnabled = false;

  for (const { sql } of migrations) {
    if (/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?product_import_sessions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)) {
      rlsEnabled = true;
    }
  }

  assert.equal(rlsEnabled, true, "product_import_sessions must have RLS enabled via migration");
});

test("product_import_sessions revokes browser privileges in migration chain", () => {
  const migrations = orderedMigrations();
  let anonRevoked = false;
  let authMutationRevoked = false;

  for (const { sql } of migrations) {
    if (/REVOKE\s+ALL\s+ON\s+(?:TABLE\s+)?(?:public\.)?product_import_sessions\s+FROM\s+anon/i.test(sql)) {
      anonRevoked = true;
    }
    if (/REVOKE\s+INSERT,\s*UPDATE,\s*DELETE\s+ON\s+(?:TABLE\s+)?(?:public\.)?product_import_sessions\s+FROM\s+authenticated/i.test(sql)) {
      authMutationRevoked = true;
    }
  }

  assert.equal(anonRevoked, true, "anon must have all privileges revoked on product_import_sessions");
  assert.equal(authMutationRevoked, true, "authenticated must have direct mutation privileges revoked on product_import_sessions");
});

test("product_import_sessions policies use app_private helpers for tenant isolation", () => {
  const migrations = orderedMigrations();
  let foundMerchantPolicy = false;
  let foundAdminPolicy = false;

  for (const { sql } of migrations) {
    if (/CREATE\s+POLICY\s+"Merchants can view own product_import_sessions"[\s\S]*?app_private\.is_merchant_member/i.test(sql)) {
      foundMerchantPolicy = true;
    }
    if (/CREATE\s+POLICY\s+"Admins can manage product_import_sessions"[\s\S]*?app_private\.is_platform_admin/i.test(sql)) {
      foundAdminPolicy = true;
    }
  }

  assert.equal(foundMerchantPolicy, true, "Merchant policy must use app_private.is_merchant_member");
  assert.equal(foundAdminPolicy, true, "Admin policy must use app_private.is_platform_admin");
});

test("final-schema-gate.sql carries the Universal RLS gate and FRA-S-PIS-001 assertions", () => {
  const gate = readFileSync(join(HERE, "db-integration", "final-schema-gate.sql"), "utf8");

  assert.match(gate, /fra_universal_rls/i, "final-schema-gate.sql must carry the Universal RLS Gate");
  assert.match(gate, /fra_pis_001/i, "final-schema-gate.sql must carry FRA-S-PIS-001 product_import_sessions gate");
  assert.match(gate, /has_table_privilege\('anon',\s*'public\.product_import_sessions'/i, "gate must assert anon has no table privileges");
});
