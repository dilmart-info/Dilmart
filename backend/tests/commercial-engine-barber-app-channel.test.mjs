/**
 * barber_app_checkout channel: must be recognized as a first-class channel by the commercial
 * engine (not silently coerced to web_checkout), and a merchant-wide agreement must still win
 * on that channel because merchant scope is channel-agnostic.
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

const MERCHANT_ID = "10000000-0000-4000-8000-000000000001";

function makeSupabaseAdmin({ rules = [] }) {
  const chainFor = (table) => ({
    select() { return this; },
    eq() { return this; },
    or() { return this; },
    lte() { return this; },
    order() { return this; },
    limit() { return this; },
    in() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
    then(resolve, reject) {
      if (table === "commercial_rules") {
        return Promise.resolve({ data: rules, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve, reject);
    },
  });
  return { client: { from: (table) => chainFor(table) } };
}

const baseRule = (overrides) => ({
  id: overrides.id,
  rule_type: "commission",
  scope_type: overrides.scope_type,
  scope_reference_id: overrides.scope_reference_id ?? null,
  priority: 0,
  value_type: "percentage",
  value: overrides.value,
  conditions: overrides.conditions ?? {},
  is_active: true,
  start_at: "2020-01-01T00:00:00Z",
  end_at: null,
  created_at: "2020-01-01T00:00:00Z",
  ...overrides,
});

test("barber_app_checkout is not silently normalized to web_checkout", async () => {
  const { CommercialEngineService } = await import("../dist/modules/finance/commercial-engine.service.js");

  const rules = [
    baseRule({ id: "r-web", scope_type: "channel", value: 8, conditions: { channel: "web_checkout" } }),
    baseRule({ id: "r-barber", scope_type: "channel", value: 5, conditions: { channel: "barber_app_checkout" } }),
  ];
  const engine = new CommercialEngineService(makeSupabaseAdmin({ rules }));

  const result = await engine.resolveCommercialTerms({ merchant_id: MERCHANT_ID, channel: "barber_app_checkout" });

  assert.equal(result.channel, "barber_app_checkout", "channel must be preserved, not coerced to web_checkout");
  assert.equal(result.commission_rule_id, "r-barber", "must match the barber_app_checkout-specific rule");
  assert.equal(result.commission_rate, 5, "must NOT pick up the web_checkout rule's rate");
});

test("merchant-wide commercial agreement applies to barber_app_checkout (merchant scope beats channel scope)", async () => {
  const { CommercialEngineService } = await import("../dist/modules/finance/commercial-engine.service.js");

  const rules = [
    baseRule({ id: "r-web", scope_type: "channel", value: 8, conditions: { channel: "web_checkout" } }),
    baseRule({ id: "r-barber", scope_type: "channel", value: 5, conditions: { channel: "barber_app_checkout" } }),
    baseRule({ id: "r-merchant", scope_type: "merchant", scope_reference_id: MERCHANT_ID, value: 15, conditions: {} }),
  ];
  const engine = new CommercialEngineService(makeSupabaseAdmin({ rules }));

  const result = await engine.resolveCommercialTerms({ merchant_id: MERCHANT_ID, channel: "barber_app_checkout" });

  assert.equal(result.commission_rule_id, "r-merchant");
  assert.equal(result.commission_rate, 15, "the merchant's negotiated 15% must win regardless of channel");
});

test("unrecognized channel values still fall back to web_checkout", async () => {
  const { CommercialEngineService } = await import("../dist/modules/finance/commercial-engine.service.js");

  const rules = [baseRule({ id: "r-web", scope_type: "channel", value: 8, conditions: { channel: "web_checkout" } })];
  const engine = new CommercialEngineService(makeSupabaseAdmin({ rules }));

  const result = await engine.resolveCommercialTerms({ merchant_id: MERCHANT_ID, channel: "some_future_unknown_channel" });

  assert.equal(result.channel, "web_checkout");
  assert.equal(result.commission_rule_id, "r-web");
});
