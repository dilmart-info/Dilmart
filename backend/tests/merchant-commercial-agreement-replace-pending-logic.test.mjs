/**
 * `admin_schedule_merchant_commercial_term`'s replace_pending boundary-recalculation fix,
 * verified as an algorithm mirror.
 *
 * IMPORTANT — what this test does and does not prove: this repo's unit tests run against
 * hand-rolled Supabase-client mocks (see other files in this directory), which cannot execute
 * real PL/pgSQL or exercise real transaction/locking semantics. There is no local Postgres
 * available in this environment to run `backend/tests/db-integration/*` against safely (this
 * workspace's configured SUPABASE_URL points at the Production project — those tests insert real
 * fixture rows and must only ever run against a dedicated staging/test Supabase project, never
 * here). `scheduleTerm` below is therefore a deliberate line-for-line mirror of the control flow
 * in `admin_schedule_merchant_commercial_term` (see
 * supabase/migrations/20260815180000_merchant_commercial_agreement_versioning.sql) — it proves the
 * ALGORITHM is correct for these scenarios, not that the deployed SQL matches it. Before the
 * Ard Al Khaleej rollout, run (or add) the equivalent test in `backend/tests/db-integration/`
 * against a real staging Postgres to confirm the SQL itself behaves the same way.
 */

import test from "node:test";
import assert from "node:assert/strict";

const NOW = "2026-08-15T00:00:00.000Z";

/** Mirrors admin_schedule_merchant_commercial_term's control flow (single rule_type, one row set). */
function scheduleTerm(rows, { effectiveFrom, replacePending }) {
  const current = rows.find((r) => r.is_active && r.start_at <= NOW && (r.end_at == null || r.end_at > NOW)) ?? null;
  const pending =
    rows
      .filter((r) => r.is_active && r.start_at > NOW)
      .sort((a, b) => (a.start_at < b.start_at ? -1 : 1))[0] ?? null;

  let replacedId = null;
  if (pending) {
    if (!replacePending) {
      throw Object.assign(new Error("PENDING_AGREEMENT_EXISTS"), { code: "23P01" });
    }
    pending.is_active = false;
    replacedId = pending.id;
    // The fix: if the current row's end_at was bounded by the pending row we just replaced,
    // reopen it so the boundary is recalculated against the NEW effective date below.
    if (current && current.end_at === pending.start_at) {
      current.end_at = null;
    }
  }

  let closedId = null;
  if (current) {
    if (current.end_at != null && current.end_at !== effectiveFrom) {
      throw Object.assign(new Error("CURRENT_HAS_DIFFERENT_END_DATE"), { code: "23P01" });
    }
    if (effectiveFrom < current.start_at) {
      throw Object.assign(new Error("EFFECTIVE_FROM_BEFORE_CURRENT_START"), { code: "23P01" });
    }
    current.end_at = effectiveFrom;
    closedId = current.id;
  }

  const newRow = { id: `new-${rows.length}`, start_at: effectiveFrom, end_at: null, is_active: true };
  rows.push(newRow);
  return { newRow, closedId, replacedId };
}

function baseState() {
  // Current: 12%, open since 2026-01-01, closed at the pending row's start (2026-11-01) because
  // that pending row was already scheduled — this is the exact state the SQL function leaves
  // things in after a normal (non-replace) future schedule.
  return [
    { id: "current-12", value: 12, start_at: "2026-01-01T00:00:00.000Z", end_at: "2026-11-01T00:00:00.000Z", is_active: true },
    { id: "pending-14", value: 14, start_at: "2026-11-01T00:00:00.000Z", end_at: null, is_active: true },
  ];
}

test("replace_pending: same-date replacement keeps the current agreement's boundary unchanged", () => {
  const rows = baseState();
  const { newRow, replacedId } = scheduleTerm(rows, { effectiveFrom: "2026-11-01T00:00:00.000Z", replacePending: true });

  const current = rows.find((r) => r.id === "current-12");
  assert.equal(replacedId, "pending-14");
  assert.equal(current.end_at, "2026-11-01T00:00:00.000Z", "current 12% still ends exactly when the replacement starts");
  assert.equal(newRow.start_at, "2026-11-01T00:00:00.000Z");
  assert.equal(rows.find((r) => r.id === "pending-14").is_active, false);
});

test("replace_pending: later-date replacement extends the current agreement to the new date (no gap, no overlap)", () => {
  const rows = baseState();
  const { newRow } = scheduleTerm(rows, { effectiveFrom: "2026-12-01T00:00:00.000Z", replacePending: true });

  const current = rows.find((r) => r.id === "current-12");
  assert.equal(current.end_at, "2026-12-01T00:00:00.000Z", "current 12% now runs through the NEW replacement date, not the old pending date");
  assert.equal(newRow.start_at, "2026-12-01T00:00:00.000Z");
});

test("replace_pending: earlier-but-still-valid-date replacement moves the boundary earlier", () => {
  const rows = baseState();
  const { newRow } = scheduleTerm(rows, { effectiveFrom: "2026-10-15T00:00:00.000Z", replacePending: true });

  const current = rows.find((r) => r.id === "current-12");
  assert.equal(current.end_at, "2026-10-15T00:00:00.000Z");
  assert.equal(newRow.start_at, "2026-10-15T00:00:00.000Z");
});

test("replace_pending: a replacement date before the current agreement's own start is rejected", () => {
  const rows = baseState();
  assert.throws(
    () => scheduleTerm(rows, { effectiveFrom: "2025-06-01T00:00:00.000Z", replacePending: true }),
    (err) => {
      assert.equal(err.message, "EFFECTIVE_FROM_BEFORE_CURRENT_START");
      assert.equal(err.code, "23P01");
      return true;
    },
  );
});

test("a pending agreement blocks a new schedule unless replace_pending is set — never a silent 'latest wins'", () => {
  const rows = baseState();
  assert.throws(
    () => scheduleTerm(rows, { effectiveFrom: "2026-12-01T00:00:00.000Z", replacePending: false }),
    (err) => {
      assert.equal(err.message, "PENDING_AGREEMENT_EXISTS");
      return true;
    },
  );
  // Nothing was mutated by the rejected attempt.
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.id === "current-12").end_at, "2026-11-01T00:00:00.000Z");
});
