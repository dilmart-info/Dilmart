/**
 * Platform merchant-readiness summary — N+1 removal (DilMart-STORE-ADMIN-GOVERNANCE-READINESS-N1-001).
 *
 * `getPlatformMerchantReadinessSummariesForAdmin()` used to list merchants and then call
 * `computeReadinessByMerchantId()` once per merchant (6 Supabase operations each), so the
 * executive governance request cost 1 + 6N + 1 operations and grew with the merchant count.
 * It now issues ONE set-based RPC.
 *
 * These tests pin:
 *   - exactly one RPC call, no per-merchant table reads, for any merchant count;
 *   - the unchanged response contract;
 *   - the executive governance response shape and its lowest-8 ordering;
 *   - fail-closed behaviour (a database error is no longer silently swallowed).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MerchantsService } from "../dist/modules/merchants/merchants.service.js";
import { AdminAnalyticsService } from "../dist/modules/admin/admin-analytics.service.js";

const RPC_NAME = "admin_merchant_readiness_summary";

/** Records every Supabase operation so call counts can be asserted, not assumed. */
function makeSupabaseSpy({ rpcHandlers = {}, tableRows = {} } = {}) {
  const calls = { rpc: [], from: [] };

  class Query {
    constructor(table) {
      this.table = table;
      calls.from.push(table);
    }
    select() {
      return this;
    }
    eq() {
      return this;
    }
    not() {
      return this;
    }
    or() {
      return this;
    }
    lte() {
      return this;
    }
    gt() {
      return this;
    }
    order() {
      return this;
    }
    limit() {
      return this;
    }
    async maybeSingle() {
      return { data: (tableRows[this.table] ?? [])[0] ?? null, error: null, count: 0 };
    }
    async single() {
      return { data: (tableRows[this.table] ?? [])[0] ?? null, error: null, count: 0 };
    }
    then(resolve) {
      const rows = tableRows[this.table] ?? [];
      return resolve({ data: rows, error: null, count: rows.length });
    }
  }

  const client = {
    from: (table) => new Query(table),
    rpc: async (name, params) => {
      calls.rpc.push({ name, params });
      const handler = rpcHandlers[name];
      if (!handler) return { data: null, error: { message: `unexpected rpc ${name}` } };
      return handler(params);
    },
  };

  return { client, calls };
}

function summaryPayload(merchants) {
  const scored = merchants.map((m) => ({
    merchant_id: m.merchant_id,
    display_name: m.display_name ?? "",
    status: m.status ?? "",
    score: m.score,
    is_ready: m.score === 100,
  }));
  const low = scored.filter((m) => m.score < 50).length;
  const mid = scored.filter((m) => m.score >= 50 && m.score < 80).length;
  const high = scored.filter((m) => m.score >= 80).length;
  return {
    merchants: scored,
    distribution: [
      { key: "0-49", label: "منخفض (0–49)", count: low },
      { key: "50-79", label: "متوسط (50–79)", count: mid },
      { key: "80-100", label: "مرتفع (80–100)", count: high },
    ],
    avg_readiness_score: scored.length ? Math.round(scored.reduce((a, m) => a + m.score, 0) / scored.length) : 0,
    ready_merchants: scored.filter((m) => m.is_ready).length,
    total_merchants: scored.length,
  };
}

function makeMerchants(count) {
  const scores = [14, 29, 43, 57, 71, 86, 100];
  return Array.from({ length: count }, (_, i) => ({
    merchant_id: `merchant-${String(i + 1).padStart(4, "0")}`,
    display_name: `متجر ${String(i + 1).padStart(4, "0")}`,
    status: i % 3 === 0 ? "active" : "draft",
    score: scores[i % scores.length],
  }));
}

function makeMerchantsService(spy) {
  return new MerchantsService({ client: spy.client }, { resolveMerchantScope: async (id) => id ?? null });
}

test("platform readiness summary issues exactly ONE rpc and no per-merchant table reads", async () => {
  const payload = summaryPayload(makeMerchants(22));
  const spy = makeSupabaseSpy({ rpcHandlers: { [RPC_NAME]: async () => ({ data: payload, error: null }) } });
  const service = makeMerchantsService(spy);

  const result = await service.getPlatformMerchantReadinessSummariesForAdmin();

  assert.equal(spy.calls.rpc.length, 1, "exactly one RPC call");
  assert.equal(spy.calls.rpc[0].name, RPC_NAME);
  assert.deepEqual(spy.calls.from, [], "no table queries at all — the old loop hit merchants/products/settings");
  assert.equal(result.total_merchants, 22);
  assert.equal(result.merchants.length, 22);
});

test("call count is constant as the merchant population grows (no N+1)", async () => {
  const counts = [0, 1, 22, 200, 2000];
  const observed = [];

  for (const n of counts) {
    const spy = makeSupabaseSpy({
      rpcHandlers: { [RPC_NAME]: async () => ({ data: summaryPayload(makeMerchants(n)), error: null }) },
    });
    const service = makeMerchantsService(spy);
    const result = await service.getPlatformMerchantReadinessSummariesForAdmin();

    observed.push({ n, rpc: spy.calls.rpc.length, from: spy.calls.from.length, total: result.total_merchants });
  }

  for (const row of observed) {
    assert.equal(row.rpc, 1, `merchant count ${row.n}: exactly 1 RPC`);
    assert.equal(row.from, 0, `merchant count ${row.n}: zero table round-trips`);
    assert.equal(row.total, row.n);
  }
  // The old implementation would have been 1 + 6N here (e.g. 12 001 operations at n=2000).
  assert.deepEqual(observed.map((r) => r.rpc), [1, 1, 1, 1, 1]);
});

test("response contract is unchanged", async () => {
  const payload = summaryPayload([
    { merchant_id: "m-1", display_name: "ألف", status: "active", score: 100 },
    { merchant_id: "m-2", display_name: "باء", status: "draft", score: 57 },
    { merchant_id: "m-3", display_name: "جيم", status: "suspended", score: 29 },
  ]);
  const spy = makeSupabaseSpy({ rpcHandlers: { [RPC_NAME]: async () => ({ data: payload, error: null }) } });
  const result = await makeMerchantsService(spy).getPlatformMerchantReadinessSummariesForAdmin();

  assert.deepEqual(Object.keys(result).sort(), [
    "avg_readiness_score",
    "distribution",
    "merchants",
    "ready_merchants",
    "total_merchants",
  ]);
  assert.deepEqual(Object.keys(result.merchants[0]).sort(), [
    "display_name",
    "is_ready",
    "merchant_id",
    "score",
    "status",
  ]);
  assert.deepEqual(
    result.distribution.map((d) => d.key),
    ["0-49", "50-79", "80-100"],
  );
  assert.deepEqual(
    result.distribution.map((d) => d.label),
    ["منخفض (0–49)", "متوسط (50–79)", "مرتفع (80–100)"],
  );
  assert.deepEqual(
    result.distribution.map((d) => d.count),
    [1, 1, 1],
  );
  assert.equal(result.avg_readiness_score, 62); // round((100 + 57 + 29) / 3)
  assert.equal(result.ready_merchants, 1);
  assert.equal(result.total_merchants, 3);
});

test("empty platform returns the documented zero-state", async () => {
  const spy = makeSupabaseSpy({ rpcHandlers: { [RPC_NAME]: async () => ({ data: summaryPayload([]), error: null }) } });
  const result = await makeMerchantsService(spy).getPlatformMerchantReadinessSummariesForAdmin();

  assert.deepEqual(result.merchants, []);
  assert.deepEqual(result.distribution.map((d) => d.count), [0, 0, 0]);
  assert.equal(result.avg_readiness_score, 0);
  assert.equal(result.ready_merchants, 0);
  assert.equal(result.total_merchants, 0);
});

test("a database failure fails closed instead of returning a partial platform summary", async () => {
  const spy = makeSupabaseSpy({
    rpcHandlers: { [RPC_NAME]: async () => ({ data: null, error: { message: "connection lost" } }) },
  });

  await assert.rejects(
    () => makeMerchantsService(spy).getPlatformMerchantReadinessSummariesForAdmin(),
    (error) => /connection lost/.test(String(error?.message ?? error)),
  );
});

test("a missing payload is an error, never an empty-looking platform", async () => {
  const spy = makeSupabaseSpy({ rpcHandlers: { [RPC_NAME]: async () => ({ data: null, error: null }) } });

  await assert.rejects(
    () => makeMerchantsService(spy).getPlatformMerchantReadinessSummariesForAdmin(),
    (error) => /returned no payload/.test(String(error?.message ?? error)),
  );
});

// ── Executive governance contract ────────────────────────────────────────────

function makeAdminAnalytics(spy, merchantsService) {
  return new AdminAnalyticsService({ client: spy.client }, merchantsService);
}

const METRICS = {
  delayed_order_risk: { total_delayed: 3, by_governorate: [{ governorate_name: "بغداد", delayed_orders: 3, delayed_revenue: 120 }] },
  weekly_commercial_throughput: [{ label: "W1", order_count: 5, revenue: 500 }],
};

test("executive governance uses a constant number of data calls and keeps its response shape", async () => {
  const merchants = makeMerchants(40);
  const spy = makeSupabaseSpy({
    rpcHandlers: {
      [RPC_NAME]: async () => ({ data: summaryPayload(merchants), error: null }),
      executive_governance_metrics: async () => ({ data: METRICS, error: null }),
    },
  });
  const service = makeAdminAnalytics(spy, makeMerchantsService(spy));

  const result = await service.getExecutiveGovernance();

  // exactly two data calls, regardless of merchant count
  assert.equal(spy.calls.rpc.length, 2);
  assert.deepEqual(spy.calls.rpc.map((c) => c.name).sort(), ["admin_merchant_readiness_summary", "executive_governance_metrics"]);
  assert.deepEqual(spy.calls.from, []);

  assert.deepEqual(Object.keys(result).sort(), [
    "contract_version",
    "delayed_order_risk",
    "generated_at",
    "merchant_health",
    "weekly_commercial_throughput",
  ]);
  assert.equal(result.contract_version, 1);
  assert.ok(typeof result.generated_at === "string");
  assert.deepEqual(Object.keys(result.merchant_health).sort(), [
    "avg_readiness_score",
    "distribution",
    "lowest_readiness_merchants",
    "ready_merchants",
    "total_merchants",
  ]);
  assert.deepEqual(result.delayed_order_risk, METRICS.delayed_order_risk);
  assert.deepEqual(result.weekly_commercial_throughput, METRICS.weekly_commercial_throughput);
});

test("lowest_readiness_merchants stays the ascending-by-score first 8 with the same shape", async () => {
  const merchants = makeMerchants(40);
  const spy = makeSupabaseSpy({
    rpcHandlers: {
      [RPC_NAME]: async () => ({ data: summaryPayload(merchants), error: null }),
      executive_governance_metrics: async () => ({ data: METRICS, error: null }),
    },
  });
  const result = await makeAdminAnalytics(spy, makeMerchantsService(spy)).getExecutiveGovernance();

  const lowest = result.merchant_health.lowest_readiness_merchants;
  assert.equal(lowest.length, 8);
  for (let i = 1; i < lowest.length; i += 1) {
    assert.ok(lowest[i - 1].score <= lowest[i].score, "ascending by score");
  }
  const expectedLowest = [...merchants].sort((a, b) => a.score - b.score).slice(0, 8).map((m) => m.score);
  assert.deepEqual(lowest.map((m) => m.score), expectedLowest);
  assert.deepEqual(Object.keys(lowest[0]).sort(), ["display_name", "is_ready", "merchant_id", "score"]);
  // `status` is deliberately NOT part of this projection
  assert.equal("status" in lowest[0], false);
});

test("fewer than 8 merchants returns all of them, still ascending", async () => {
  const merchants = makeMerchants(3);
  const spy = makeSupabaseSpy({
    rpcHandlers: {
      [RPC_NAME]: async () => ({ data: summaryPayload(merchants), error: null }),
      executive_governance_metrics: async () => ({ data: METRICS, error: null }),
    },
  });
  const result = await makeAdminAnalytics(spy, makeMerchantsService(spy)).getExecutiveGovernance();

  assert.equal(result.merchant_health.lowest_readiness_merchants.length, 3);
  assert.deepEqual(result.merchant_health.lowest_readiness_merchants.map((m) => m.score), [14, 29, 43]);
});

/**
 * Fail-closed payload contract.
 *
 * The service used to finish with `summary.merchants ?? []`, `summary.total_merchants ?? 0` and
 * friends, so a malformed or partial RPC payload — `{}` being the worst case — rendered as a
 * perfectly healthy, empty platform on the executive governance page. Every case below must
 * THROW instead; the legitimate empty platform (the RPC explicitly returning the full contract
 * with zeros) must still succeed.
 */
function malformedRejects(payload) {
  const spy = makeSupabaseSpy({ rpcHandlers: { [RPC_NAME]: async () => ({ data: payload, error: null }) } });
  return assert.rejects(
    () => makeMerchantsService(spy).getPlatformMerchantReadinessSummariesForAdmin(),
    (error) => /malformed payload/.test(String(error?.message ?? error)),
  );
}

test("an empty object payload fails closed instead of reading as an empty platform", async () => {
  await malformedRejects({});
});

test("a payload missing distribution is rejected, never defaulted to []", async () => {
  const payload = summaryPayload(makeMerchants(3));
  delete payload.distribution;
  await malformedRejects(payload);
});

test("an empty distribution array is rejected even when the counters agree", async () => {
  const payload = summaryPayload(makeMerchants(0));
  payload.distribution = [];
  await malformedRejects(payload);
});

test("a payload missing total_merchants is rejected, never defaulted to 0", async () => {
  const payload = summaryPayload(makeMerchants(3));
  delete payload.total_merchants;
  await malformedRejects(payload);
});

test("a payload missing merchants is rejected, never defaulted to []", async () => {
  const payload = summaryPayload(makeMerchants(3));
  delete payload.merchants;
  await malformedRejects(payload);
});

test("a malformed merchant row is rejected", async () => {
  const missingField = summaryPayload(makeMerchants(3));
  delete missingField.merchants[1].is_ready;
  await malformedRejects(missingField);

  const wrongType = summaryPayload(makeMerchants(3));
  wrongType.merchants[2].score = "43";
  await malformedRejects(wrongType);

  const nullRow = summaryPayload(makeMerchants(3));
  nullRow.merchants[0] = null;
  await malformedRejects(nullRow);

  const blankId = summaryPayload(makeMerchants(3));
  blankId.merchants[0].merchant_id = "";
  await malformedRejects(blankId);
});

test("invalid numeric fields are rejected", async () => {
  for (const invalid of [null, "55", Number.NaN, Infinity, -1, 55.5, 101]) {
    const payload = summaryPayload(makeMerchants(3));
    payload.avg_readiness_score = invalid;
    await malformedRejects(payload);
  }

  const negativeCount = summaryPayload(makeMerchants(3));
  negativeCount.distribution[0].count = -1;
  await malformedRejects(negativeCount);

  const stringTotal = summaryPayload(makeMerchants(3));
  stringTotal.total_merchants = "3";
  await malformedRejects(stringTotal);
});

test("a truncated payload whose counters disagree with its rows is rejected", async () => {
  const droppedRows = summaryPayload(makeMerchants(7));
  droppedRows.merchants = droppedRows.merchants.slice(0, 4);
  await malformedRejects(droppedRows);

  const wrongBuckets = summaryPayload(makeMerchants(7));
  wrongBuckets.distribution[0].count += 1;
  await malformedRejects(wrongBuckets);

  const wrongReady = summaryPayload(makeMerchants(7));
  wrongReady.ready_merchants += 1;
  await malformedRejects(wrongReady);
});

test("a non-object payload is rejected", async () => {
  await malformedRejects([]);
  await malformedRejects("{}");
  await malformedRejects(0);
});

test("the legitimate empty platform contract is still accepted", async () => {
  const payload = summaryPayload(makeMerchants(0));
  const spy = makeSupabaseSpy({ rpcHandlers: { [RPC_NAME]: async () => ({ data: payload, error: null }) } });

  const result = await makeMerchantsService(spy).getPlatformMerchantReadinessSummariesForAdmin();

  assert.deepEqual(result.merchants, []);
  assert.equal(result.distribution.length, 3);
  assert.deepEqual(result.distribution.map((bucket) => bucket.count), [0, 0, 0]);
  assert.deepEqual(result.distribution.map((bucket) => bucket.key), ["0-49", "50-79", "80-100"]);
  assert.equal(result.avg_readiness_score, 0);
  assert.equal(result.ready_merchants, 0);
  assert.equal(result.total_merchants, 0);
  assert.equal(spy.calls.rpc.length, 1);
});
