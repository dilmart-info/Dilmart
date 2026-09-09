import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

test("Support Phone Migration Integrity Suite (20260909170000)", async (t) => {
  const migrationPath = fs.existsSync(path.resolve(process.cwd(), "supabase/migrations/20260909170000_update_dilmart_primary_support_phone.sql"))
    ? path.resolve(process.cwd(), "supabase/migrations/20260909170000_update_dilmart_primary_support_phone.sql")
    : path.resolve(process.cwd(), "../supabase/migrations/20260909170000_update_dilmart_primary_support_phone.sql");
  assert.ok(fs.existsSync(migrationPath), "Migration file must exist");
  const sql = fs.readFileSync(migrationPath, "utf8");

  await t.test("1. Migration SQL Static Contract Verification", () => {
    // Assert candidate slugs are checked together
    assert.ok(
      sql.includes("WHERE slug IN ('dilmart-store', 'DilMart-primary');"),
      "Must check candidate slugs ('dilmart-store', 'DilMart-primary')",
    );
    // Assert count(*) validation is present
    assert.ok(
      sql.includes("IF v_merchant_count <> 1 THEN"),
      "Must assert exactly one merchant candidate",
    );
    // Assert row count diagnostic on update
    assert.ok(
      sql.includes("GET DIAGNOSTICS v_updated_count = ROW_COUNT;"),
      "Must check ROW_COUNT diagnostics after update",
    );
    assert.ok(
      sql.includes("IF v_updated_count <> 1 THEN"),
      "Must assert exactly 1 row updated in merchant_settings",
    );
    // Assert exact target phone numbers
    assert.ok(
      sql.includes("contact_phone = '+9647759600068'"),
      "Must set official contact_phone to +9647759600068",
    );
    assert.ok(
      sql.includes("whatsapp_phone = '9647759600068'"),
      "Must set official whatsapp_phone to 9647759600068",
    );
  });

  // Simulation engine replicating the PL/pgSQL DO block behavior faithfully
  function simulateMigration(merchantsTable, settingsTable) {
    const candidates = merchantsTable.filter((m) =>
      ["dilmart-store", "DilMart-primary"].includes(m.slug),
    );
    const v_merchant_count = candidates.length;

    if (v_merchant_count !== 1) {
      throw new Error(
        `MIGRATION_INTEGRITY_FAILED: Expected exactly one DilMart merchant candidate, found ${v_merchant_count}`,
      );
    }

    const v_dilmart_merchant_id = candidates[0].id;
    let v_updated_count = 0;

    for (const setting of settingsTable) {
      if (setting.merchant_id === v_dilmart_merchant_id) {
        setting.contact_phone = "+9647759600068";
        setting.whatsapp_phone = "9647759600068";
        setting.updated_at = new Date().toISOString();
        v_updated_count++;
      }
    }

    if (v_updated_count !== 1) {
      throw new Error(
        `MIGRATION_INTEGRITY_FAILED: Expected exactly 1 merchant_settings row updated for DilMart primary, but updated ${v_updated_count} rows`,
      );
    }

    return {
      updatedMerchantId: v_dilmart_merchant_id,
      updatedCount: v_updated_count,
    };
  }

  await t.test("2. Case: only 'dilmart-store' exists (Production Scenario) -> SUCCESS", () => {
    const mId = crypto.randomUUID();
    const merchants = [{ id: mId, slug: "dilmart-store", display_name: "DilMart Store" }];
    const settings = [{ merchant_id: mId, contact_phone: "+964 787 185 7930", whatsapp_phone: "9647871857930" }];

    const result = simulateMigration(merchants, settings);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.updatedMerchantId, mId);
    assert.equal(settings[0].contact_phone, "+9647759600068");
    assert.equal(settings[0].whatsapp_phone, "9647759600068");
  });

  await t.test("3. Case: only 'DilMart-primary' exists (Local/Fixtures Scenario) -> SUCCESS", () => {
    const mId = crypto.randomUUID();
    const merchants = [{ id: mId, slug: "DilMart-primary", display_name: "DilMart Store" }];
    const settings = [{ merchant_id: mId, contact_phone: "+964 787 185 7930", whatsapp_phone: "9647871857930" }];

    const result = simulateMigration(merchants, settings);
    assert.equal(result.updatedCount, 1);
    assert.equal(result.updatedMerchantId, mId);
    assert.equal(settings[0].contact_phone, "+9647759600068");
    assert.equal(settings[0].whatsapp_phone, "9647759600068");
  });

  await t.test("4. Case: both candidates exist simultaneously -> FAIL-CLOSED", () => {
    const mId1 = crypto.randomUUID();
    const mId2 = crypto.randomUUID();
    const merchants = [
      { id: mId1, slug: "dilmart-store", display_name: "DilMart Store" },
      { id: mId2, slug: "DilMart-primary", display_name: "DilMart Primary" },
    ];
    const settings = [
      { merchant_id: mId1, contact_phone: "+964 787 185 7930" },
      { merchant_id: mId2, contact_phone: "+964 787 185 7930" },
    ];

    assert.throws(
      () => simulateMigration(merchants, settings),
      /MIGRATION_INTEGRITY_FAILED: Expected exactly one DilMart merchant candidate, found 2/,
    );
  });

  await t.test("5. Case: neither candidate exists -> FAIL-CLOSED", () => {
    const mId = crypto.randomUUID();
    const merchants = [{ id: mId, slug: "other-merchant", display_name: "Other" }];
    const settings = [{ merchant_id: mId, contact_phone: "+964 787 185 7930" }];

    assert.throws(
      () => simulateMigration(merchants, settings),
      /MIGRATION_INTEGRITY_FAILED: Expected exactly one DilMart merchant candidate, found 0/,
    );
  });

  await t.test("6. Case: candidate merchant exists but NO matching merchant_settings -> FAIL-CLOSED", () => {
    const mId = crypto.randomUUID();
    const merchants = [{ id: mId, slug: "dilmart-store", display_name: "DilMart Store" }];
    const settings = []; // Missing settings record

    assert.throws(
      () => simulateMigration(merchants, settings),
      /MIGRATION_INTEGRITY_FAILED: Expected exactly 1 merchant_settings row updated for DilMart primary, but updated 0 rows/,
    );
  });
});
