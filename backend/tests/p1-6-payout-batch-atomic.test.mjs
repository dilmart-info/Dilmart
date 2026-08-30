/**
 * P1-6: Atomic payout batch creation — service-layer tests.
 *
 * Verifies that AdminService.createPayoutBatch delegates entirely to the
 * create_payout_batch_atomic RPC (no direct table writes) and correctly
 * maps all RPC response shapes to its own return type.
 *
 * P6-1: createPayoutBatch calls the RPC with correct p_merchant_id
 * P6-2: RPC empty result maps to { ok: true, empty: true, message }
 * P6-3: RPC success result maps to { ok: true, batch, entries_count }
 * P6-4: RPC error is propagated as a thrown exception
 * P6-5: No direct table writes occur — the RPC is the only DB call
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MERCHANT_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ADMIN_ID    = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BATCH_ID    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const MOCK_BATCH_ROW = {
  id:            BATCH_ID,
  merchant_id:   MERCHANT_ID,
  status:        "draft",
  total_credits: 10000,
  total_debits:  0,
  net_amount:    10000,
  currency_code: "IQD",
  notes:         null,
  period_start:  null,
  period_end:    null,
  created_by:    ADMIN_ID,
  created_at:    "2026-05-12T00:00:00Z",
  locked_at:     null,
  approved_at:   null,
  settled_at:    null,
  approved_by:   null,
};

const ACTOR = { actorRole: "admin", actorId: ADMIN_ID };

// ─── P6-1: RPC called with correct p_merchant_id ──────────────────────────────

test("P6-1: createPayoutBatch calls create_payout_batch_atomic with the requested merchant_id", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const rpcCalls = [];

  const supabase = {
    client: {
      from() { throw new Error("from() must not be called — expected RPC-only flow"); },
      async rpc(name, args) {
        rpcCalls.push({ name, args });
        return { data: { ok: true, empty: false, entries_count: 1, batch: MOCK_BATCH_ROW }, error: null };
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  await service.createPayoutBatch({ merchant_id: MERCHANT_ID }, ACTOR);

  assert.equal(rpcCalls.length, 1, "Exactly one RPC call must be made");
  assert.equal(rpcCalls[0].name, "create_payout_batch_atomic",
    "RPC name must be create_payout_batch_atomic");
  assert.equal(rpcCalls[0].args.p_merchant_id, MERCHANT_ID,
    `p_merchant_id must equal ${MERCHANT_ID}`);
  assert.equal(rpcCalls[0].args.p_actor_id, ADMIN_ID,
    "p_actor_id must be the actor id");
});

// ─── P6-2: Empty RPC result maps to { ok, empty, message } ───────────────────

test("P6-2: RPC returning empty=true maps to { ok: true, empty: true, message }", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const emptyMsg = "No payable/accrued entries available for payout batch.";
  const supabase = {
    client: {
      from() { throw new Error("from() must not be called"); },
      async rpc() {
        return { data: { ok: true, empty: true, message: emptyMsg }, error: null };
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  const result = await service.createPayoutBatch({ merchant_id: MERCHANT_ID }, ACTOR);

  assert.equal(result.ok,      true,     "ok must be true");
  assert.equal(result.empty,   true,     "empty must be true");
  assert.equal(result.message, emptyMsg, "message must pass through unchanged");
});

// ─── P6-3: Success RPC result maps to { ok, batch, entries_count } ────────────

test("P6-3: RPC success result maps to { ok: true, batch, entries_count }", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const supabase = {
    client: {
      from() { throw new Error("from() must not be called"); },
      async rpc() {
        return { data: { ok: true, empty: false, entries_count: 3, batch: MOCK_BATCH_ROW }, error: null };
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  const result = await service.createPayoutBatch({ merchant_id: MERCHANT_ID }, ACTOR);

  assert.equal(result.ok,            true,     "ok must be true");
  assert.equal(result.entries_count, 3,        "entries_count must be 3");
  assert.equal(result.batch?.id,     BATCH_ID, "batch.id must match");
  assert.equal(result.batch?.status, "draft",  "batch.status must be draft");
});

// ─── P6-4: RPC error propagates as thrown exception ───────────────────────────

test("P6-4: RPC error is thrown by createPayoutBatch", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const dbError = { message: "deadlock detected", code: "40P01" };
  const supabase = {
    client: {
      from() { throw new Error("from() must not be called"); },
      async rpc() { return { data: null, error: dbError }; },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});

  await assert.rejects(
    () => service.createPayoutBatch({ merchant_id: MERCHANT_ID }, ACTOR),
    (err) => {
      assert.equal(err.message, "deadlock detected", "Error message must propagate");
      return true;
    },
  );
});

// ─── P6-5: No direct table writes — only the RPC is called ───────────────────

test("P6-5: createPayoutBatch makes no direct INSERT/UPDATE on payout or ledger tables", async () => {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");

  const tableCallLog = [];
  const supabase = {
    client: {
      from(table) {
        tableCallLog.push(table);
        // Return a minimal chain so any unexpected from() call doesn't crash
        const obj = {
          select()     { return this; },
          insert()     { return this; },
          update()     { return this; },
          upsert()     { return this; },
          eq()         { return this; },
          in()         { return this; },
          is()         { return this; },
          then(res, rej) { return Promise.resolve({ data: null, error: null }).then(res, rej); },
        };
        return obj;
      },
      async rpc() {
        return { data: { ok: true, empty: false, entries_count: 1, batch: MOCK_BATCH_ROW }, error: null };
      },
    },
  };

  const service = new AdminService(supabase, {}, {}, {}, {}, {}, {}, {});
  await service.createPayoutBatch({ merchant_id: MERCHANT_ID }, ACTOR);

  const forbidden = ["merchant_payout_batches", "merchant_payout_batch_items", "merchant_ledger_entries"];
  for (const table of forbidden) {
    assert.ok(
      !tableCallLog.includes(table),
      `from("${table}") must NOT be called — all writes are delegated to the RPC`,
    );
  }
});
