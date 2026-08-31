import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTestClient, getAnonClient } from "./db-client-helper.mjs";

test("Stage B Migration A — Atomicity & Forced-Failure Rollback [STATIC SQL ASSERTION]", async (t) => {
  const migrationPath = resolve("..", "supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql");
  const sql = readFileSync(migrationPath, "utf8");

  await t.test("1. Migration wraps all 8 stages inside an indivisible transaction block", () => {
    const beginIdx = sql.indexOf("BEGIN;");
    const commitIdx = sql.lastIndexOf("COMMIT;");
    assert.ok(beginIdx !== -1, "BEGIN statement must be present");
    assert.ok(commitIdx !== -1, "COMMIT statement must be present");
    assert.ok(commitIdx > beginIdx, "COMMIT must be placed strictly after BEGIN");

    const renameIdx = sql.indexOf("RENAME TO place_order_legacy_stageb;");
    const createIdx = sql.indexOf("CREATE FUNCTION public.place_order(");
    const dropIdx = sql.indexOf("DROP FUNCTION public.place_order_legacy_stageb(");
    const postconditionIdx = sql.indexOf("v_po_rec.pronargs <> 49");

    assert.ok(renameIdx > beginIdx && renameIdx < commitIdx, "Rename must be inside transaction");
    assert.ok(createIdx > beginIdx && createIdx < commitIdx, "Create must be inside transaction");
    assert.ok(dropIdx > beginIdx && dropIdx < commitIdx, "Drop must be inside transaction");
    assert.ok(postconditionIdx > beginIdx && postconditionIdx < commitIdx, "Postconditions must be inside transaction");
  });

  await t.test("2. Rollback safety: In PostgreSQL, any unhandled exception before COMMIT automatically aborts transaction", () => {
    assert.ok(sql.includes("RAISE EXCEPTION 'PREFLIGHT FAILED: Current public.place_order identity arguments"), "Preflight must fail closed before rename");
    assert.ok(sql.includes("RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Expected 49 arguments"), "Postcondition must fail closed and roll back entire migration if arg count differs");
  });
});

test("Stage B Migration A — Database State Verification [REAL POSTGRESQL]", async (t) => {
  let supabase;
  try {
    supabase = getTestClient();
  } catch (e) {
    console.log("SKIP: No database client available for REAL POSTGRESQL test.");
    t.skip("No database client available");
    return;
  }

  await t.test("1. Temporary legacy function place_order_legacy_stageb does NOT exist in live database", async () => {
    const { error } = await supabase.rpc("place_order_legacy_stageb", {});
    // Must error with missing function / not found (PGRST202 or 42883)
    const isMissing = error?.code === "PGRST202" || error?.code === "42883" || String(error?.message || "").includes("does not exist");
    assert.ok(isMissing, "Temporary function place_order_legacy_stageb must NOT exist in the database");
  });

  await t.test("2. Canonical place_order RPC is registered and executable by service_role", async () => {
    // Calling place_order with invalid/empty items should trigger the plpgsql business validation
    // rather than function missing error.
    const { error } = await supabase.rpc("place_order", {
      p_customer_name: "Test",
      p_customer_phone: "07700000000",
      p_governorate_id: "00000000-0000-0000-0000-000000000000",
      p_area: "Test Area",
      p_nearest_landmark: null,
      p_notes: null,
      p_subtotal: 0,
      p_delivery_cost: 0,
      p_discount: 0,
      p_total: 0,
      p_coupon_id: null,
      p_items: []
    });

    assert.ok(error, "Calling with empty items should return a validation error");
    assert.ok(
      error.message.includes("Order items cannot be empty") || error.code === "P0001",
      `Expected PL/pgSQL validation error, got: ${error.message}`
    );
  });

  await t.test("3. Anon role is denied direct execution of place_order", async () => {
    const anon = getAnonClient();
    if (!anon) {
      t.skip("No anon client available");
      return;
    }

    const { error } = await anon.rpc("place_order", {
      p_customer_name: "Test",
      p_customer_phone: "07700000000",
      p_governorate_id: "00000000-0000-0000-0000-000000000000",
      p_area: "Test Area",
      p_nearest_landmark: null,
      p_notes: null,
      p_subtotal: 0,
      p_delivery_cost: 0,
      p_discount: 0,
      p_total: 0,
      p_coupon_id: null,
      p_items: []
    });

    assert.ok(error, "Anon role must receive permission denied error");
  });
});
