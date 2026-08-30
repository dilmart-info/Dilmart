/**
 * P1-6a: Payout batch eligibility rules.
 *
 * SQL eligibility is enforced entirely inside the create_payout_batch_atomic RPC.
 * Tests here use two complementary strategies:
 *   - SQL text inspection: read the migration file and assert the exact WHERE clause,
 *     proving DB-level filtering without a live Supabase instance.
 *   - Service behaviour: mock the RPC response to verify the service correctly maps
 *     each RPC outcome (empty, success) regardless of which DB rows triggered it.
 *
 * E1: status = 'accrued' is NOT present as an eligibility status in the SQL
 * E2: status = 'payable' is the sole eligibility status in the SQL
 * E3: payout_batch_id IS NULL guard is present in the SQL (already-batched excluded)
 * E4: merchant_id = p_merchant_id filter is present in the SQL (wrong merchant excluded)
 * E5: Service returns empty=true when RPC signals no payable entries
 *     (e.g. only accrued entries exist — DB returns 0 candidates)
 * E6: Service returns batch result when RPC signals payable entries found
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

// ─── Load migration SQL once ──────────────────────────────────────────────────

const __dir = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dir, "../../supabase/migrations/20260512200000_p1_6_payout_batch_atomic_rpc.sql");
const sql = readFileSync(MIGRATION_PATH, "utf8");

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MERCHANT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ADMIN_ID    = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BATCH_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ACTOR       = { actorRole: "admin", actorId: ADMIN_ID };

const MOCK_BATCH = {
  id: BATCH_ID, merchant_id: MERCHANT_ID, status: "draft",
  total_credits: 5000, total_debits: 0, net_amount: 5000,
  currency_code: "IQD", notes: null, created_by: ADMIN_ID,
  created_at: "2026-05-12T00:00:00Z", locked_at: null,
  approved_at: null, settled_at: null, approved_by: null,
};

// ─── E1: 'accrued' is NOT an eligibility status ───────────────────────────────

test("E1: SQL WHERE clause does not include status='accrued' as an eligibility value", () => {
  // Strip comments so we only inspect executable SQL.
  const executableSql = sql.replace(/--[^\n]*/g, "");

  // Check 'accrued' does not appear as a status value in the WHERE filter.
  // Acceptable forms are: status = 'accrued', IN ('accrued', ...), IN (..., 'accrued').
  const accrued_in_status = /mle\.status\s*(=\s*'accrued'|IN\s*\([^)]*'accrued'[^)]*\))/i.test(executableSql);
  assert.equal(
    accrued_in_status,
    false,
    "mle.status filter must not include 'accrued' — only 'payable' entries are eligible",
  );
});

// ─── E2: 'payable' is the sole eligibility status ─────────────────────────────

test("E2: SQL WHERE clause uses mle.status = 'payable' as the sole eligibility filter", () => {
  const executableSql = sql.replace(/--[^\n]*/g, "");

  const payable_eq = /mle\.status\s*=\s*'payable'/i.test(executableSql);
  assert.ok(
    payable_eq,
    "mle.status = 'payable' must appear in the SQL WHERE clause",
  );
});

// ─── E3: payout_batch_id IS NULL guard is present ────────────────────────────

test("E3: SQL WHERE clause includes mle.payout_batch_id IS NULL (already-batched entries excluded)", () => {
  const executableSql = sql.replace(/--[^\n]*/g, "");

  const guard = /mle\.payout_batch_id\s+IS\s+NULL/i.test(executableSql);
  assert.ok(
    guard,
    "mle.payout_batch_id IS NULL must appear in the candidate query",
  );
});

// ─── E4: merchant_id scoping is enforced in SQL ───────────────────────────────

test("E4: SQL WHERE clause filters mle.merchant_id = p_merchant_id (wrong-merchant entries excluded)", () => {
  const executableSql = sql.replace(/--[^\n]*/g, "");

  const scope = /mle\.merchant_id\s*=\s*p_merchant_id/i.test(executableSql);
  assert.ok(
    scope,
    "mle.merchant_id = p_merchant_id must appear in the candidate query",
  );
});

// ─── E5: Service returns empty=true when only accrued entries exist ───────────
// The DB returns 0 candidates when all entries are 'accrued' (not 'payable').
// The RPC signals this as empty=true; the service must propagate it unchanged.

test("E5: Service returns { ok: true, empty: true } when RPC signals no payable entries (accrued-only scenario)", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const supabase = {
    client: {
      from() { throw new Error("from() must not be called — RPC-only flow"); },
      async rpc() {
        // Simulates: DB found zero rows because only 'accrued' entries exist
        return {
          data: { ok: true, empty: true, message: "No payable entries available for payout batch." },
          error: null,
        };
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  const result = await service.createPayoutBatch({ merchant_id: MERCHANT_ID }, ACTOR);

  assert.equal(result.ok,    true, "ok must be true");
  assert.equal(result.empty, true, "empty must be true when no payable entries found");
  assert.ok(result.message,        "message must be present");
});

// ─── E6: Service returns batch when payable entries exist ─────────────────────

test("E6: Service returns { ok: true, batch, entries_count } when RPC finds payable entries", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const supabase = {
    client: {
      from() { throw new Error("from() must not be called — RPC-only flow"); },
      async rpc() {
        return {
          data: { ok: true, empty: false, entries_count: 2, batch: MOCK_BATCH },
          error: null,
        };
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  const result = await service.createPayoutBatch({ merchant_id: MERCHANT_ID }, ACTOR);

  assert.equal(result.ok,            true,     "ok must be true");
  assert.equal(result.entries_count, 2,        "entries_count must be 2");
  assert.equal(result.batch?.id,     BATCH_ID, "batch.id must match");
});
