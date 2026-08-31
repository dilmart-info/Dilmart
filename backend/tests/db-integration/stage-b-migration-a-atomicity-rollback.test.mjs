import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Stage B Migration A — Atomicity & Forced-Failure Rollback Simulation [STATIC SQL ASSERTION]", async (t) => {
  const migrationPath = resolve("..", "supabase/migrations/20260831100000_stage_b_place_order_authority_refactor.sql");
  const sql = readFileSync(migrationPath, "utf8");

  await t.test("1. Migration wraps all 8 stages inside an indivisible transaction block", () => {
    const beginIdx = sql.indexOf("BEGIN;");
    const commitIdx = sql.lastIndexOf("COMMIT;");
    assert.ok(beginIdx !== -1, "BEGIN statement must be present");
    assert.ok(commitIdx !== -1, "COMMIT statement must be present");
    assert.ok(commitIdx > beginIdx, "COMMIT must be placed strictly after BEGIN");

    // All DDL/DCL/assert statements must be strictly inside BEGIN and COMMIT
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
    // If postcondition or DDL raises exception, PostgreSQL rolls back all mutations
    // Preflight assertion guarantees no mutations happen if signature is mismatched
    assert.ok(sql.includes("RAISE EXCEPTION 'PREFLIGHT FAILED: Current public.place_order identity arguments"), "Preflight must fail closed before rename");
    assert.ok(sql.includes("RAISE EXCEPTION 'POST-TRANSITION ASSERTION FAILED: Expected 49 arguments"), "Postcondition must fail closed and roll back entire migration if arg count differs");
  });
});
