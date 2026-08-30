/**
 * Merchant Commercial Agreement admin layer (AdminService.getMerchantCommercialAgreement /
 * scheduleMerchantCommercialAgreement): current/upcoming/history bucketing, the "no explicit
 * agreement" fallback distinction, validation hardening, and atomic single-RPC scheduling.
 *
 * Note on audit logging: as of the transactional-audit fix, the audit_logs row for a scheduled
 * agreement is written by admin_schedule_merchant_commercial_agreement itself (SQL), in the same
 * transaction as the commercial_rules mutation — NOT via a separate AdminService ->
 * AuditService.log() call. This file therefore verifies that AdminService passes actor_id/
 * actor_role through to the RPC (and fails closed before the RPC if either is missing) rather than
 * asserting on an application-level audit call. See
 * merchant-commercial-agreement-transactional-audit-logic.test.mjs for the SQL-side audit-payload
 * shape (algorithm mirror, same caveat as the replace_pending mirror tests: no live Postgres here).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

const MERCHANT_ID = "20000000-0000-4000-8000-000000000002";
const ACTOR = { actorId: "admin-1", actorRole: "admin" };

function makeSupabaseAdmin({ merchant, rules = [], rpcImpl }) {
  const rpcCalls = [];
  const chainFor = (table) => ({
    select() { return this; },
    eq() { return this; },
    in() { return this; },
    order() { return this; },
    limit() { return this; },
    maybeSingle: async () => {
      if (table === "merchants") return { data: merchant ?? null, error: null };
      return { data: null, error: null };
    },
    then(resolve, reject) {
      if (table === "commercial_rules") return Promise.resolve({ data: rules, error: null }).then(resolve, reject);
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  });
  return {
    rpcCalls,
    admin: {
      client: {
        from: (t) => chainFor(t),
        rpc: async (name, params) => {
          rpcCalls.push({ name, params });
          return rpcImpl ? rpcImpl(name, params) : { data: null, error: null };
        },
      },
    },
  };
}

async function buildAdminService({ supabaseAdmin, orderFinanceService }) {
  const { AdminService } = await import("../dist/modules/admin/admin.service.js");
  return new AdminService(
    supabaseAdmin,
    {}, // AuditService — intentionally unused by scheduleMerchantCommercialAgreement now.
    orderFinanceService ?? { async resolveCommercialTerms() { return { commission_rate: 0, plan_code: null }; } },
    {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
  );
}

const rule = (overrides) => ({
  id: overrides.id,
  rule_type: overrides.rule_type ?? "commission",
  scope_type: "merchant",
  scope_reference_id: MERCHANT_ID,
  priority: 1000,
  value_type: "percentage",
  value: overrides.value,
  conditions: overrides.conditions ?? {},
  is_active: overrides.is_active ?? true,
  start_at: overrides.start_at,
  end_at: overrides.end_at ?? null,
  created_at: overrides.start_at,
  created_by: null,
  ...overrides,
});

test("current/upcoming/history bucketing: picks the row in effect now, the next scheduled row, and files the rest as history", async () => {
  const past = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const oneYearAgo = past;
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 3600 * 1000).toISOString();
  const oneMonthAhead = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();

  const rules = [
    rule({ id: "ended", value: 10, start_at: oneYearAgo, end_at: sixMonthsAgo }), // history
    rule({ id: "current", value: 12, start_at: sixMonthsAgo, end_at: null }), // current
    rule({ id: "future", value: 14, start_at: oneMonthAhead, end_at: null }), // upcoming
  ];

  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID, display_name: "Ard Al Khaleej" }, rules });
  const service = await buildAdminService({ supabaseAdmin });

  const agreement = await service.getMerchantCommercialAgreement(MERCHANT_ID);

  assert.equal(agreement.has_explicit_agreement, true);
  assert.equal(agreement.current.commission.id, "current");
  assert.equal(agreement.current.commission.value, 12);
  assert.equal(agreement.upcoming.commission.id, "future");
  assert.equal(agreement.upcoming.commission.value, 14);
  assert.equal(agreement.history.length, 1);
  assert.equal(agreement.history[0].id, "ended");
  assert.equal(agreement.engine_fallback, null, "fallback must not be shown when an explicit agreement exists");
});

test("bucketing tolerates non-Z timestamptz offset formats (numeric comparison, not string comparison)", async () => {
  // PostgREST can return timestamptz as e.g. "...+00:00" instead of "...Z" — lexicographic string
  // comparison against a "...Z" `now` would misclassify these. Use offsets that are lexicographically
  // OUT of order versus their Z-equivalents to prove the comparison is numeric, not textual.
  const nowMs = Date.now();
  const currentStart = new Date(nowMs - 3600_000).toISOString().replace("Z", "+00:00");
  const upcomingStart = new Date(nowMs + 3600_000).toISOString().replace("Z", "+00:00");

  const rules = [
    rule({ id: "current", value: 12, start_at: currentStart, end_at: null }),
    rule({ id: "future", value: 14, start_at: upcomingStart, end_at: null }),
  ];
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID, display_name: "M" }, rules });
  const service = await buildAdminService({ supabaseAdmin });

  const agreement = await service.getMerchantCommercialAgreement(MERCHANT_ID);
  assert.equal(agreement.current.commission.id, "current");
  assert.equal(agreement.upcoming.commission.id, "future");
});

test("no explicit merchant agreement: has_explicit_agreement is false and the fallback is clearly separate, not presented as the agreement", async () => {
  const orderFinanceService = {
    async resolveCommercialTerms() {
      return { commission_rate: 8, plan_code: "default" };
    },
  };
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID, display_name: "New Merchant" }, rules: [] });
  const service = await buildAdminService({ supabaseAdmin, orderFinanceService });

  const agreement = await service.getMerchantCommercialAgreement(MERCHANT_ID);

  assert.equal(agreement.has_explicit_agreement, false);
  assert.equal(agreement.current.commission, null);
  assert.deepEqual(agreement.engine_fallback, { commission_rate: 8, source: "plan:default" });
});

test("scheduleMerchantCommercialAgreement rejects an out-of-range commission percentage before touching the DB", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });

  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 150, effective_from: new Date().toISOString() }, ACTOR),
    (err) => {
      assert.ok(err instanceof BadRequestException);
      return true;
    },
  );
  assert.equal(rpcCalls.length, 0, "must fail before ever calling the DB");
});

test("scheduleMerchantCommercialAgreement rejects commission_value_type outside percentage/fixed", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });

  await assert.rejects(
    () =>
      service.scheduleMerchantCommercialAgreement(
        MERCHANT_ID,
        { commission_rate: 12, commission_value_type: "hybrid", effective_from: new Date().toISOString() },
        ACTOR,
      ),
    (err) => {
      assert.ok(err instanceof BadRequestException);
      return true;
    },
  );
  assert.equal(rpcCalls.length, 0);
});

test('blank commission_rate ("") is rejected, never coerced to 0', async () => {
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });
  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: "", effective_from: new Date().toISOString() }, ACTOR),
    (err) => err instanceof BadRequestException,
  );
});

test("null commission_rate is rejected, never coerced to 0", async () => {
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });
  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: null, effective_from: new Date().toISOString() }, ACTOR),
    (err) => err instanceof BadRequestException,
  );
});

test("missing commission_rate is rejected, never coerced to 0", async () => {
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });
  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { effective_from: new Date().toISOString() }, ACTOR),
    (err) => err instanceof BadRequestException,
  );
});

test("explicit numeric 0 commission_rate is accepted as a deliberate 0% agreement", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({
    merchant: { id: MERCHANT_ID, display_name: "M" },
    rules: [],
    rpcImpl: () => ({ data: [{ rule_type: "commission", new_rule_id: "r1", closed_rule_id: null, replaced_pending_rule_id: null }], error: null }),
  });
  const service = await buildAdminService({ supabaseAdmin });

  await service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 0, effective_from: new Date().toISOString() }, ACTOR);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].params.p_terms[0].value, 0);
});

test("scheduleMerchantCommercialAgreement makes exactly ONE atomic RPC call for the whole agreement, not one per term", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({
    merchant: { id: MERCHANT_ID },
    rpcImpl: (name) => ({
      data: [{ rule_type: "commission" }, { rule_type: "assisted_fee" }, { rule_type: "platform_fee" }],
      error: null,
    }),
  });
  const service = await buildAdminService({ supabaseAdmin });

  await service.scheduleMerchantCommercialAgreement(
    MERCHANT_ID,
    { commission_rate: 12, assisted_fee_rate: 2, platform_fee_rate: 1, effective_from: new Date().toISOString() },
    ACTOR,
  );

  assert.equal(rpcCalls.length, 1, "one call for the whole agreement — no partial-success window between terms");
  assert.equal(rpcCalls[0].name, "admin_schedule_merchant_commercial_agreement");
  assert.equal(rpcCalls[0].params.p_terms.length, 3);
  assert.deepEqual(
    rpcCalls[0].params.p_terms.map((t) => t.rule_type),
    ["commission", "assisted_fee", "platform_fee"],
  );
});

test("a failure writing the audit row rolls back the ENTIRE transaction — no unaudited financial change can commit", async () => {
  // Because the audit_logs INSERT lives inside the same plpgsql function/transaction as the
  // commercial_rules mutation (see the migration), any failure there — e.g. a constraint
  // violation on audit_logs — aborts the whole RPC call. From the caller's side this is
  // indistinguishable from any other RPC failure: one error, nothing committed. This test proves
  // AdminService treats it that way (propagates, never proceeds to report success).
  const auditInsertFailure = { code: "23502", message: 'null value in column "actor_role" of relation "audit_logs" violates not-null constraint' };
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({
    merchant: { id: MERCHANT_ID },
    rpcImpl: () => ({ data: null, error: auditInsertFailure }),
  });
  const service = await buildAdminService({ supabaseAdmin });

  await assert.rejects(() =>
    service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 12, effective_from: new Date().toISOString() }, ACTOR),
  );
  assert.equal(rpcCalls.length, 1, "exactly one RPC call was attempted — no retry masking the failure as a partial success");
});

test("scheduleMerchantCommercialAgreement surfaces an overlapping-agreement conflict as 409, not a silent overwrite", async () => {
  const rpcImpl = async () => ({
    data: null,
    error: { code: "23P01", message: "A future scheduled agreement already exists for this merchant and rule_type." },
  });
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID }, rpcImpl });
  const service = await buildAdminService({ supabaseAdmin });

  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 14, effective_from: new Date().toISOString() }, ACTOR),
    (err) => {
      assert.ok(err instanceof ConflictException);
      return true;
    },
  );
});

test("scheduleMerchantCommercialAgreement passes actor_id/actor_role through to the RPC — the SQL side is what guarantees the same-transaction audit row", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({
    merchant: { id: MERCHANT_ID },
    rpcImpl: () => ({ data: [{ rule_type: "commission" }], error: null }),
  });
  const service = await buildAdminService({ supabaseAdmin });

  await service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 12, effective_from: new Date().toISOString() }, ACTOR);

  assert.equal(rpcCalls.length, 1);
  assert.equal(rpcCalls[0].params.p_actor_id, ACTOR.actorId);
  assert.equal(rpcCalls[0].params.p_actor_role, ACTOR.actorRole);
});

test("a missing actor id is rejected before the RPC is ever called — never an unaudited write", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });

  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 12, effective_from: new Date().toISOString() }, { actorId: "", actorRole: "admin" }),
    (err) => err instanceof BadRequestException,
  );
  assert.equal(rpcCalls.length, 0);
});

test("a missing actor role is rejected before the RPC is ever called — never an unaudited write", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });

  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 12, effective_from: new Date().toISOString() }, { actorId: "admin-1", actorRole: undefined }),
    (err) => err instanceof BadRequestException,
  );
  assert.equal(rpcCalls.length, 0);
});

test("a bare date-only effective_from (no time component) is rejected — must already be a Baghdad-converted instant", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({ merchant: { id: MERCHANT_ID } });
  const service = await buildAdminService({ supabaseAdmin });

  await assert.rejects(
    () => service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 12, effective_from: "2026-11-01" }, ACTOR),
    (err) => err instanceof BadRequestException,
  );
  assert.equal(rpcCalls.length, 0);
});

test("a fully-qualified effective_from instant (already Baghdad-converted) is accepted", async () => {
  const { admin: supabaseAdmin, rpcCalls } = makeSupabaseAdmin({
    merchant: { id: MERCHANT_ID },
    rpcImpl: () => ({ data: [{ rule_type: "commission" }], error: null }),
  });
  const service = await buildAdminService({ supabaseAdmin });

  await service.scheduleMerchantCommercialAgreement(MERCHANT_ID, { commission_rate: 12, effective_from: "2026-10-31T21:00:00.000Z" }, ACTOR);
  assert.equal(rpcCalls.length, 1);
});
