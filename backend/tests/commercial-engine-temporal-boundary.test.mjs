/**
 * Temporal boundary consistency: commercial_rules windows are half-open [start_at, end_at) —
 * start inclusive, end exclusive. At the exact instant an old agreement ends and a new one begins
 * (old.end_at === new.start_at === effective_at), only the NEW agreement may match. This exercises
 * the actual `.or("end_at.is.null,end_at.gt.<effectiveAt>")` filter string CommercialEngineService
 * builds — the mock below implements the same half-open-interval semantics Postgres would, instead
 * of ignoring the filter arguments the way the other unit-test mocks in this repo do, so a
 * regression to `end_at.gte` would be caught here even without a live database.
 */

import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";

const MERCHANT_ID = "40000000-0000-4000-8000-000000000004";

function applyRealisticFilters(rows, { orExpr, lteFilters }) {
  // Mirrors `.lte("start_at", effectiveAt)` plus `.or("end_at.is.null,end_at.gt.<effectiveAt>")` —
  // i.e. exactly what CommercialEngineService.resolveCommercialTerms sends.
  let out = rows;
  for (const [col, val] of lteFilters) {
    out = out.filter((r) => r[col] <= val);
  }
  if (orExpr) {
    const m = /end_at\.(gte|gt)\.(.+)$/.exec(orExpr);
    if (m) {
      const [, op, val] = m;
      out = out.filter((r) => r.end_at == null || (op === "gt" ? r.end_at > val : r.end_at >= val));
    }
  }
  return out;
}

function makeSupabaseAdmin({ rules }) {
  const chainFor = (table) => {
    const lteFilters = [];
    let orExpr = null;
    const obj = {
      select() { return this; },
      eq() { return this; },
      lte(col, val) { lteFilters.push([col, val]); return this; },
      or(expr) { orExpr = expr; return this; },
      order() { return this; },
      limit() { return this; },
      in() { return this; },
      maybeSingle: async () => ({ data: null, error: null }),
      then(resolve, reject) {
        if (table === "commercial_rules") {
          return Promise.resolve({ data: applyRealisticFilters(rules, { orExpr, lteFilters }), error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: [], error: null }).then(resolve, reject);
      },
    };
    return obj;
  };
  return { client: { from: (t) => chainFor(t) } };
}

const rule = (overrides) => ({
  id: overrides.id,
  rule_type: "commission",
  scope_type: "merchant",
  scope_reference_id: MERCHANT_ID,
  priority: 1000,
  value_type: "percentage",
  value: overrides.value,
  conditions: {},
  is_active: true,
  created_at: overrides.start_at,
  ...overrides,
});

test("at the exact transition instant (old.end_at === new.start_at === checkout time), only the NEW agreement matches", async () => {
  const { CommercialEngineService } = await import("../dist/modules/finance/commercial-engine.service.js");

  const transition = "2026-08-20T12:00:00.000Z";
  const rules = [
    rule({ id: "old", value: 12, start_at: "2026-01-01T00:00:00.000Z", end_at: transition }),
    rule({ id: "new", value: 14, start_at: transition, end_at: null }),
  ];
  const engine = new CommercialEngineService(makeSupabaseAdmin({ rules }));

  const result = await engine.resolveCommercialTerms({ merchant_id: MERCHANT_ID, channel: "web_checkout", effective_at: transition });

  assert.equal(result.commission_rule_id, "new", "the old agreement must not still match at its own end instant");
  assert.equal(result.commission_rate, 14);
});

test("one instant before the transition, only the OLD agreement matches (no gap)", async () => {
  const { CommercialEngineService } = await import("../dist/modules/finance/commercial-engine.service.js");

  const transition = "2026-08-20T12:00:00.000Z";
  const justBefore = "2026-08-20T11:59:59.999Z";
  const rules = [
    rule({ id: "old", value: 12, start_at: "2026-01-01T00:00:00.000Z", end_at: transition }),
    rule({ id: "new", value: 14, start_at: transition, end_at: null }),
  ];
  const engine = new CommercialEngineService(makeSupabaseAdmin({ rules }));

  const result = await engine.resolveCommercialTerms({ merchant_id: MERCHANT_ID, channel: "web_checkout", effective_at: justBefore });

  assert.equal(result.commission_rule_id, "old");
  assert.equal(result.commission_rate, 12, "no gap: the instant before the new agreement starts must still resolve to the old one");
});
