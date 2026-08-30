/**
 * STORE-PR3 — Real PostgreSQL concurrency proof (task H2 + "Real Concurrency Test").
 * 15 iterations × 2 parallel consumers of the SAME one-time code. Every iteration must have
 * exactly one REDEEMED winner, exactly one HANDOFF_ALREADY_REDEEMED loser, and exactly one
 * redeemed_at. Not a JS mock — two concurrent service-role RPC calls to Postgres.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

const supabase = getTestClient();
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

test("15 iterations × 2 parallel redeems → exactly one winner each", async () => {
  const ITERATIONS = 15;
  for (let i = 0; i < ITERATIONS; i++) {
    const code = crypto.randomBytes(32).toString("base64url");
    const state = crypto.randomBytes(32).toString("base64url");
    const codeHash = sha256(code);
    const stateHash = sha256(state);

    const { data: row, error: insErr } = await supabase
      .from("DilMart_customer_handoffs")
      .insert({
        code_hash: codeHash,
        state_hash: stateHash,
        assertion_jti: `jti-${crypto.randomUUID()}`,
        DilMart_user_id: crypto.randomUUID(),
        target_path: "/product/x",
        source_surface: "customer_home_gateway",
        status: "PENDING",
        identity_outcome: "LINKED",
        expires_at: new Date(Date.now() + 120000).toISOString(),
      })
      .select("id")
      .single();
    assert.equal(insErr, null, insErr?.message);

    const [a, b] = await Promise.all([
      supabase.rpc("redeem_customer_handoff", { p_code_hash: codeHash, p_state_hash: stateHash }),
      supabase.rpc("redeem_customer_handoff", { p_code_hash: codeHash, p_state_hash: stateHash }),
    ]);
    assert.equal(a.error, null, a.error?.message);
    assert.equal(b.error, null, b.error?.message);

    const outcomes = [a.data[0].outcome_status, b.data[0].outcome_status].sort();
    const winners = outcomes.filter((o) => o === "REDEEMED");
    assert.equal(winners.length, 1, `iter ${i}: exactly one REDEEMED winner (got ${JSON.stringify(outcomes)})`);

    const loser = [a.data[0], b.data[0]].find((r) => r.outcome_status !== "REDEEMED");
    assert.equal(loser.outcome_status, "ERROR");
    assert.equal(loser.error_code, "HANDOFF_ALREADY_REDEEMED", `iter ${i}: loser gets already-redeemed`);

    const { data: finalRow } = await supabase
      .from("DilMart_customer_handoffs")
      .select("status, redeemed_at")
      .eq("id", row.id)
      .single();
    assert.equal(finalRow.status, "REDEEMED", `iter ${i}: exactly one REDEEMED transition`);
    assert.ok(finalRow.redeemed_at, `iter ${i}: exactly one redeemed_at`);

    // Audit rows are immutable — leave them. Deleting the handoff is unaffected (no audit FK).
    await supabase.from("DilMart_customer_handoffs").delete().eq("id", row.id);
  }
});
