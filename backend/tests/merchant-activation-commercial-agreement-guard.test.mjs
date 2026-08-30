/**
 * Merchant activation guard: a merchant transitioning into 'active' for the first time (or after
 * being non-active) must have an explicit merchant Commercial Agreement — but an already-active
 * merchant must never be blocked/deactivated by this guard (no unexpected mass outage). There must
 * be exactly ONE authoritative status-transition path: the generic profile update can never write
 * `status`, so it can't be used to bypass the readiness/agreement checks.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException } from "@nestjs/common";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

const MERCHANT_ID = "30000000-0000-4000-8000-000000000003";

function makeSupabaseAdmin({ merchantStatusBefore, hasAgreement, productsCount = 5, updateMatchesRow = true }) {
  const updateCalls = [];
  function chainFor(table) {
    const state = { countMode: false, count: 0, updatePayload: null };
    return {
      select(_cols, opts) {
        if (opts && opts.count === "exact" && opts.head) {
          state.countMode = true;
          if (table === "products") state.count = productsCount;
          if (table === "commercial_rules") state.count = hasAgreement ? 1 : 0;
        }
        // `.select("id")` chained after `.update(...)` (optimistic-concurrency read-back) — no
        // special state needed, just keep chaining.
        return this;
      },
      eq() { return this; },
      not() { return this; },
      or() { return this; },
      lte() { return this; },
      update(payload) {
        state.updatePayload = payload;
        if (table === "merchants") updateCalls.push(payload);
        return this;
      },
      maybeSingle: async () => {
        if (table === "merchants") return { data: { id: MERCHANT_ID, display_name: "M", status: merchantStatusBefore }, error: null };
        if (table === "merchant_settings") {
          return { data: { contact_phone: "07700000000", whatsapp_phone: null, support_email: null, city: "Baghdad", address: "addr" }, error: null };
        }
        return { data: null, error: null };
      },
      then(resolve, reject) {
        if (state.countMode) return Promise.resolve({ data: null, error: null, count: state.count }).then(resolve, reject);
        if (state.updatePayload) {
          const rows = updateMatchesRow ? [{ id: MERCHANT_ID }] : [];
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
  }
  return { updateCalls, admin: { client: { from: (t) => chainFor(t) } } };
}

test("activation without an explicit commercial agreement is blocked", async () => {
  const { MerchantsService } = await import("../dist/modules/merchants/merchants.service.js");
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchantStatusBefore: "draft", hasAgreement: false });
  const service = new MerchantsService(supabaseAdmin, {});

  await assert.rejects(
    () => service.updateMerchantStatus(MERCHANT_ID, { status: "active" }),
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      const response = err.getResponse();
      assert.equal(response.code, "COMMERCIAL_AGREEMENT_REQUIRED");
      return true;
    },
  );
});

test("activation with an explicit commercial agreement succeeds", async () => {
  const { MerchantsService } = await import("../dist/modules/merchants/merchants.service.js");
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchantStatusBefore: "draft", hasAgreement: true });
  const service = new MerchantsService(supabaseAdmin, {});

  const result = await service.updateMerchantStatus(MERCHANT_ID, { status: "active" });
  assert.deepEqual(result, { ok: true });
});

test("an already-active merchant re-saved as active is never blocked, even without an explicit agreement (no mass outage)", async () => {
  const { MerchantsService } = await import("../dist/modules/merchants/merchants.service.js");
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchantStatusBefore: "active", hasAgreement: false });
  const service = new MerchantsService(supabaseAdmin, {});

  const result = await service.updateMerchantStatus(MERCHANT_ID, { status: "active" });
  assert.deepEqual(result, { ok: true });
});

test("a concurrent status change between the readiness check and the write is surfaced, not silently activated", async () => {
  const { MerchantsService } = await import("../dist/modules/merchants/merchants.service.js");
  // hasAgreement true + all checks pass, but the guarded UPDATE ... WHERE status = <expected>
  // matches zero rows, simulating another request having changed status in between.
  const { admin: supabaseAdmin } = makeSupabaseAdmin({ merchantStatusBefore: "draft", hasAgreement: true, updateMatchesRow: false });
  const service = new MerchantsService(supabaseAdmin, {});

  await assert.rejects(
    () => service.updateMerchantStatus(MERCHANT_ID, { status: "active" }),
    (err) => {
      assert.ok(err instanceof ForbiddenException);
      assert.equal(err.getResponse().code, "MERCHANT_STATUS_CONFLICT");
      return true;
    },
  );
});

test("generic updateMerchant() never writes status — the ONLY authoritative activation path is updateMerchantStatus", async () => {
  const { MerchantsService } = await import("../dist/modules/merchants/merchants.service.js");
  const { admin: supabaseAdmin, updateCalls } = makeSupabaseAdmin({ merchantStatusBefore: "draft", hasAgreement: false });
  const service = new MerchantsService(supabaseAdmin, {});

  // Simulate a raw request body smuggling a status change through the generic profile-update
  // route (TypeScript's DTO shape is compile-time only; a real HTTP client can still send it).
  await service.updateMerchant(MERCHANT_ID, { display_name: "New Name", status: "active" });

  assert.equal(updateCalls.length, 1);
  assert.ok(!("status" in updateCalls[0]), "the update payload sent to the DB must never contain a status key");
  assert.equal(updateCalls[0].display_name, "New Name");
});
