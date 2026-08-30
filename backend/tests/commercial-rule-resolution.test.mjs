import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const m = require("../dist/modules/finance/commercial-rule-resolution.js");

const rid = (suffix) => `00000000-0000-4000-8000-${suffix}`;

test("M13-R: merchant override wins over higher category commission", () => {
  const merchantId = rid("000000000002");
  const catA = rid("aaaaaaaaaaaa");
  const catB = rid("bbbbbbbbbbbb");
  const candidates = [
    {
      id: rid("000000000010"),
      rule_type: "commission",
      scope_type: "category",
      scope_reference_id: catA,
      priority: 0,
      value_type: "percentage",
      value: 10,
      conditions: {},
      created_at: "2020-01-01T00:00:00Z",
    },
    {
      id: rid("000000000011"),
      rule_type: "commission",
      scope_type: "merchant",
      scope_reference_id: merchantId,
      priority: 0,
      value_type: "percentage",
      value: 2,
      conditions: {},
      created_at: "2020-01-02T00:00:00Z",
    },
  ];
  const { selected } = m.resolveWinningRuleForType(candidates, { category_ids: [catA, catB] });
  assert.equal(selected?.id, rid("000000000011"));
  assert.equal(Number(selected?.value), 2);
});

test("M13-R: multi-category at category tier picks highest commission value", () => {
  const catA = rid("aaaaaaaaaaaa");
  const catB = rid("bbbbbbbbbbbb");
  const candidates = [
    {
      id: rid("000000000020"),
      rule_type: "commission",
      scope_type: "category",
      scope_reference_id: catA,
      priority: 10,
      value_type: "percentage",
      value: 5,
      conditions: {},
      created_at: "2020-01-03T00:00:00Z",
    },
    {
      id: rid("000000000021"),
      rule_type: "commission",
      scope_type: "category",
      scope_reference_id: catB,
      priority: 0,
      value_type: "percentage",
      value: 10,
      conditions: {},
      created_at: "2020-01-01T00:00:00Z",
    },
  ];
  const { selected } = m.resolveWinningRuleForType(candidates, { category_ids: [catA, catB] });
  assert.equal(selected?.id, rid("000000000021"));
});

test("M13-R: channel wins over global", () => {
  const candidates = [
    {
      id: rid("000000000030"),
      rule_type: "commission",
      scope_type: "global",
      priority: 100,
      value_type: "percentage",
      value: 3,
      conditions: {},
      created_at: "2020-01-01T00:00:00Z",
    },
    {
      id: rid("000000000031"),
      rule_type: "commission",
      scope_type: "channel",
      priority: 0,
      value_type: "percentage",
      value: 5,
      conditions: { channel: "web_checkout" },
      created_at: "2020-01-01T00:00:00Z",
    },
  ];
  const { selected } = m.resolveWinningRuleForType(candidates, { category_ids: [] });
  assert.equal(selected?.id, rid("000000000031"));
});

test("M13-R: no candidates → null (plan fallback upstream)", () => {
  const { selected } = m.resolveWinningRuleForType([], { category_ids: [] });
  assert.equal(selected, null);
});

test("M13-R: hybrid value_type detected", () => {
  assert.equal(m.isHybridRule({ value_type: "hybrid" }), true);
  assert.equal(m.isHybridRule({ value_type: "percentage" }), false);
});

test("M13-R: same scope tier uses priority DESC then created_at DESC", () => {
  const merchantId = rid("000000000040");
  const candidates = [
    {
      id: rid("000000000041"),
      rule_type: "commission",
      scope_type: "merchant",
      scope_reference_id: merchantId,
      priority: 1,
      value_type: "percentage",
      value: 5,
      conditions: {},
      created_at: "2020-01-02T00:00:00Z",
    },
    {
      id: rid("000000000042"),
      rule_type: "commission",
      scope_type: "merchant",
      scope_reference_id: merchantId,
      priority: 5,
      value_type: "percentage",
      value: 3,
      conditions: {},
      created_at: "2020-01-01T00:00:00Z",
    },
  ];
  const { selected } = m.resolveWinningRuleForType(candidates, { category_ids: [] });
  assert.equal(selected?.id, rid("000000000042"));
});

// ─── Merchant Commercial Agreement: precedence guarantees ─────────────────────

test("merchant agreement: merchant commission overrides global rule", () => {
  const merchantId = rid("000000000050");
  const candidates = [
    {
      id: rid("000000000051"),
      rule_type: "commission",
      scope_type: "global",
      priority: 100,
      value_type: "percentage",
      value: 6,
      conditions: {},
      created_at: "2020-01-01T00:00:00Z",
    },
    {
      id: rid("000000000052"),
      rule_type: "commission",
      scope_type: "merchant",
      scope_reference_id: merchantId,
      priority: 0,
      value_type: "percentage",
      value: 12,
      conditions: {},
      created_at: "2020-01-01T00:00:00Z",
    },
  ];
  const { selected } = m.resolveWinningRuleForType(candidates, { category_ids: [] });
  assert.equal(selected?.id, rid("000000000052"));
  assert.equal(Number(selected?.value), 12);
});

test("merchant agreement: merchant commission overrides a generic channel rule", () => {
  const merchantId = rid("000000000060");
  const candidates = [
    {
      id: rid("000000000061"),
      rule_type: "commission",
      scope_type: "channel",
      priority: 0,
      value_type: "percentage",
      value: 8,
      conditions: { channel: "web_checkout" },
      created_at: "2020-01-01T00:00:00Z",
    },
    {
      id: rid("000000000062"),
      rule_type: "commission",
      scope_type: "merchant",
      scope_reference_id: merchantId,
      priority: 0,
      value_type: "percentage",
      value: 15,
      conditions: {},
      created_at: "2020-01-01T00:00:00Z",
    },
  ];
  const { selected } = m.resolveWinningRuleForType(candidates, { category_ids: [] });
  assert.equal(selected?.id, rid("000000000062"));
  assert.equal(Number(selected?.value), 15);
});
