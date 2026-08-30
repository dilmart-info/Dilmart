/**
 * STORE-PR3 — Atomic redeem RPC behaviour (task H1/H3/H4, integration 12–14).
 * DB is the sole authority: clock_timestamp() expiry, single-use, state-mismatch/expiry
 * never consume. Runs against the clean local Supabase replay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

const supabase = getTestClient();
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

async function insertHandoff({ code, state, outcome = "LINKED", ttlMs = 120000 }) {
  const row = {
    code_hash: sha256(code),
    state_hash: sha256(state),
    assertion_jti: `jti-${crypto.randomUUID()}`,
    DilMart_user_id: crypto.randomUUID(),
    target_path: "/product/x",
    source_surface: "customer_home_gateway",
    status: outcome === "LINKED" ? "PENDING" : outcome,
    identity_outcome: outcome,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  };
  const { data, error } = await supabase.from("DilMart_customer_handoffs").insert(row).select("id").single();
  assert.equal(error, null, error?.message);
  return data.id;
}
const redeem = (code, state) => supabase.rpc("redeem_customer_handoff", { p_code_hash: sha256(code), p_state_hash: sha256(state) });

test("valid code+state → REDEEMED, redeemed_at set once", async () => {
  const code = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const id = await insertHandoff({ code, state });

  const { data, error } = await redeem(code, state);
  assert.equal(error, null, error?.message);
  assert.equal(data[0].outcome_status, "REDEEMED");
  assert.equal(data[0].target_path, "/product/x");

  const { data: row } = await supabase.from("DilMart_customer_handoffs").select("status, redeemed_at").eq("id", id).single();
  assert.equal(row.status, "REDEEMED");
  assert.ok(row.redeemed_at, "redeemed_at is set");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", id);
});

test("second redeem of the same code → HANDOFF_ALREADY_REDEEMED (single-use)", async () => {
  const code = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const id = await insertHandoff({ code, state });
  await redeem(code, state);
  const { data } = await redeem(code, state);
  assert.equal(data[0].outcome_status, "ERROR");
  assert.equal(data[0].error_code, "HANDOFF_ALREADY_REDEEMED");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", id);
});

test("wrong state → HANDOFF_STATE_MISMATCH and does NOT consume", async () => {
  const code = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const id = await insertHandoff({ code, state });

  const { data } = await redeem(code, "the-wrong-state");
  assert.equal(data[0].error_code, "HANDOFF_STATE_MISMATCH");

  const { data: row } = await supabase.from("DilMart_customer_handoffs").select("redeemed_at, status").eq("id", id).single();
  assert.equal(row.redeemed_at, null, "state mismatch must not consume");
  assert.equal(row.status, "PENDING");
  // The correct state still redeems afterwards (proves it was untouched).
  const { data: ok } = await redeem(code, state);
  assert.equal(ok[0].outcome_status, "REDEEMED");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", id);
});

test("expired code → HANDOFF_EXPIRED and never produces a session", async () => {
  const code = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const id = await insertHandoff({ code, state, ttlMs: -1000 }); // already expired (DB clock authority)

  const { data } = await redeem(code, state);
  assert.equal(data[0].error_code, "HANDOFF_EXPIRED");
  const { data: row } = await supabase.from("DilMart_customer_handoffs").select("redeemed_at").eq("id", id).single();
  assert.equal(row.redeemed_at, null, "expired handoff is not consumed");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", id);
});

test("LINK_REQUIRED outcome is surfaced (single-use) without a REDEEMED transition", async () => {
  const code = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const id = await insertHandoff({ code, state, outcome: "LINK_REQUIRED" });
  const { data } = await redeem(code, state);
  assert.equal(data[0].outcome_status, "LINK_REQUIRED");
  const { data: row } = await supabase.from("DilMart_customer_handoffs").select("status, redeemed_at").eq("id", id).single();
  assert.equal(row.status, "LINK_REQUIRED");
  assert.ok(row.redeemed_at, "consumed once (no replay) but not REDEEMED");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", id);
});

test("unknown code → HANDOFF_INVALID", async () => {
  const { data } = await redeem(crypto.randomBytes(32).toString("base64url"), "s");
  assert.equal(data[0].error_code, "HANDOFF_INVALID");
});

test("an audit event is written for a successful redeem", async () => {
  const code = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");
  const id = await insertHandoff({ code, state });
  await redeem(code, state);
  const { data: events } = await supabase.from("DilMart_customer_handoff_audit_events").select("event_type").eq("handoff_id", id);
  assert.ok((events ?? []).some((e) => e.event_type === "HANDOFF_REDEEMED"), "redeem writes an audit event");
  // Audit rows are immutable (append-only) — do not delete them. The handoff row has no FK from audit.
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", id);
});
