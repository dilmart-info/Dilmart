/**
 * `admin_schedule_merchant_commercial_agreement`'s audit-payload construction, verified as an
 * algorithm mirror — same caveat as merchant-commercial-agreement-replace-pending-logic.test.mjs:
 * this proves the ALGORITHM (what "previous"/"pending_replaced"/"new" should contain for each
 * scenario), not that the deployed SQL matches it, since no live Postgres is available here (this
 * workspace's SUPABASE_URL points at Production).
 *
 * The real function captures previous_value/previous_value_type/previous_start_at/previous_end_at
 * and replaced_pending_value/value_type/start_at from the SAME locked rows it mutates (see
 * admin_schedule_merchant_commercial_term's RETURNS TABLE and the wrapper's jsonb_build_object
 * calls in supabase/migrations/20260815180000_merchant_commercial_agreement_versioning.sql) — i.e.
 * captured before mutation, never re-inferred afterwards.
 */

import test from "node:test";
import assert from "node:assert/strict";

const NOW = "2026-08-15T00:00:00.000Z";

/** Mirrors admin_schedule_merchant_commercial_term, extended to also report the previous state
 *  the way the real function's RETURNS TABLE does. */
function scheduleTermWithAudit(rows, { effectiveFrom, replacePending }) {
  const current = rows.find((r) => r.is_active && r.start_at <= NOW && (r.end_at == null || r.end_at > NOW)) ?? null;
  const previous = current ? { value: current.value, value_type: current.value_type, start_at: current.start_at, end_at: current.end_at } : null;

  const pending =
    rows
      .filter((r) => r.is_active && r.start_at > NOW)
      .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))[0] ?? null;
  const pendingReplaced = pending ? { value: pending.value, value_type: pending.value_type, start_at: pending.start_at } : null;

  if (pending) {
    if (!replacePending) throw Object.assign(new Error("PENDING_AGREEMENT_EXISTS"), { code: "23P01" });
    pending.is_active = false;
    if (current && current.end_at === pending.start_at) current.end_at = null;
  }

  if (current) {
    if (current.end_at != null && current.end_at !== effectiveFrom) {
      throw Object.assign(new Error("CURRENT_HAS_DIFFERENT_END_DATE"), { code: "23P01" });
    }
    if (effectiveFrom < current.start_at) {
      throw Object.assign(new Error("EFFECTIVE_FROM_BEFORE_CURRENT_START"), { code: "23P01" });
    }
    current.end_at = effectiveFrom;
  }

  const newRow = { id: `new-${rows.length}`, start_at: effectiveFrom, end_at: null, is_active: true };
  rows.push(newRow);

  return { newRow, previous, pendingReplaced };
}

/** Mirrors the wrapper's per-term change record. */
function buildChangeRecord(ruleType, { previous, pendingReplaced, newRow }, submittedValue, submittedValueType) {
  return {
    rule_type: ruleType,
    previous_value: previous?.value ?? null,
    previous_value_type: previous?.value_type ?? null,
    previous_effective_from: previous?.start_at ?? null,
    previous_effective_to: previous?.end_at ?? null,
    pending_replaced_value: pendingReplaced?.value ?? null,
    pending_replaced_value_type: pendingReplaced?.value_type ?? null,
    pending_replaced_effective_from: pendingReplaced?.start_at ?? null,
    new_value: submittedValue,
    new_value_type: submittedValueType,
    new_rule_id: newRow.id,
  };
}

test("first-ever agreement for a merchant: previous and pending_replaced are both null", () => {
  const rows = [];
  const result = scheduleTermWithAudit(rows, { effectiveFrom: NOW, replacePending: false });
  const change = buildChangeRecord("commission", result, 12, "percentage");

  assert.equal(change.previous_value, null);
  assert.equal(change.pending_replaced_value, null);
  assert.equal(change.new_value, 12);
});

test("changing an existing current agreement: previous_value/value_type capture the OLD rate before mutation", () => {
  const rows = [{ id: "current-12", value: 12, value_type: "percentage", start_at: "2026-01-01T00:00:00.000Z", end_at: null, is_active: true }];
  const result = scheduleTermWithAudit(rows, { effectiveFrom: NOW, replacePending: false });
  const change = buildChangeRecord("commission", result, 14, "percentage");

  assert.equal(change.previous_value, 12);
  assert.equal(change.previous_value_type, "percentage");
  assert.equal(change.previous_effective_from, "2026-01-01T00:00:00.000Z");
  assert.equal(change.pending_replaced_value, null, "no pending row existed — must not be confused with the previous current row");
  assert.equal(change.new_value, 14);
});

test("replace_pending: audit distinguishes CURRENT, the REPLACED PENDING agreement, and the new replacement — three distinct values", () => {
  const rows = [
    { id: "current-12", value: 12, value_type: "percentage", start_at: "2026-01-01T00:00:00.000Z", end_at: "2026-11-01T00:00:00.000Z", is_active: true },
    { id: "pending-14", value: 14, value_type: "percentage", start_at: "2026-11-01T00:00:00.000Z", end_at: null, is_active: true },
  ];
  const result = scheduleTermWithAudit(rows, { effectiveFrom: "2026-12-01T00:00:00.000Z", replacePending: true });
  const change = buildChangeRecord("commission", result, 16, "percentage");

  assert.equal(change.previous_value, 12, "the agreement in effect right now");
  assert.equal(change.previous_effective_from, "2026-01-01T00:00:00.000Z");
  assert.equal(change.pending_replaced_value, 14, "the future agreement being superseded");
  assert.equal(change.pending_replaced_effective_from, "2026-11-01T00:00:00.000Z");
  assert.equal(change.new_value, 16, "the replacement agreement being scheduled");

  // All three are distinct — never collapsed into one another.
  const values = new Set([change.previous_value, change.pending_replaced_value, change.new_value]);
  assert.equal(values.size, 3);
});
