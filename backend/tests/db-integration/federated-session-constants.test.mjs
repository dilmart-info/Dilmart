/**
 * STORE-PR4 Security Closure B3 — approved security constants live INSIDE PostgreSQL, not in trusted caller
 * params. The trusted params are gone (old signatures no longer callable), and the fixed 30/3600 rate window
 * is enforced by the DB regardless of the caller. B4 near-absolute-expiry lifetime is also proven here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeCustomer, makeLink, rotate, cleanupIdentity } from "./federated-helpers.mjs";

// A "no function matches these params" error (old trusted-param signatures were dropped).
const noOverload = (e) => !!e && (e.code === "PGRST202" || /Could not find the function|does not exist|schema cache/i.test(e.message ?? ""));

test("B3 old trusted-param signatures are no longer callable (params removed)", async () => {
  const r = await supabase.rpc("rotate_federated_refresh_token", {
    p_current_token_hash: "x", p_new_token_id: crypto.randomUUID(), p_new_token_hash: "y", p_device_hash: null,
    p_refresh_ttl_seconds: 2592000, p_inactive_ttl_seconds: 2592000, p_rate_limit: 30, p_rate_window_seconds: 3600, p_request_id: crypto.randomUUID(),
  });
  assert.ok(noOverload(r.error), `rotate old signature rejected (${r.error?.code})`);
  const v = await supabase.rpc("validate_federated_session_family", { p_family_id: crypto.randomUUID(), p_session_version: 1, p_inactive_ttl_seconds: 2592000 });
  assert.ok(noOverload(v.error), "validate old signature rejected");
  const c = await supabase.rpc("redeem_and_create_federated_session", {
    p_code_hash: "x", p_state_hash: "y", p_family_id: crypto.randomUUID(), p_refresh_token_id: crypto.randomUUID(),
    p_refresh_token_hash: "z", p_access_jti: crypto.randomUUID(), p_device_hash: null,
    p_refresh_ttl_seconds: 2592000, p_absolute_ttl_seconds: 7776000, p_request_id: crypto.randomUUID(),
  });
  assert.ok(noOverload(c.error), "redeem old signature rejected");
});

/** Build a family at a chosen refresh_count/window with one valid token. Returns { cust, DilMartUserId, tokenHash }. */
async function familyAt({ refreshCount, windowStartedAt }) {
  const cust = await makeCustomer();
  const link = await makeLink(cust);
  const fid = crypto.randomUUID(), tid = crypto.randomUUID(), th = "rc-" + crypto.randomUUID();
  await supabase.from("store_federated_session_families").insert({
    id: fid, store_customer_id: cust, linked_profile_id: link.linkId, DilMart_user_id: link.DilMartUserId,
    absolute_expires_at: new Date(Date.now() + 1e9).toISOString(), last_used_at: new Date().toISOString(),
    refresh_count: refreshCount, refresh_window_started_at: windowStartedAt,
  });
  await supabase.from("store_federated_refresh_tokens").insert({ id: tid, session_family_id: fid, token_hash: th, expires_at: new Date(Date.now() + 1e9).toISOString() });
  return { cust, DilMartUserId: link.DilMartUserId, th };
}

test("B3 the DB-fixed rate limit is exactly 30 within the window (29→OK, 30→RATE_LIMITED)", async () => {
  const nowIso = new Date().toISOString();
  const at29 = await familyAt({ refreshCount: 29, windowStartedAt: nowIso });
  assert.equal((await rotate(at29.th, { newHash: "n29-" + crypto.randomUUID() })).data[0].status, "OK", "29th allowed");
  await cleanupIdentity({ DilMartUserId: at29.DilMartUserId, custId: at29.cust });

  const at30 = await familyAt({ refreshCount: 30, windowStartedAt: nowIso });
  assert.equal((await rotate(at30.th, { newHash: "n30-" + crypto.randomUUID() })).data[0].error_code, "FEDERATED_REFRESH_RATE_LIMITED", "30th blocked");
  await cleanupIdentity({ DilMartUserId: at30.DilMartUserId, custId: at30.cust });
});

test("B3 the window is 3600s: a count at the cap but an elapsed window resets and allows the rotation", async () => {
  const old = new Date(Date.now() - 3601 * 1000).toISOString();
  const capped = await familyAt({ refreshCount: 30, windowStartedAt: old });
  assert.equal((await rotate(capped.th, { newHash: "reset-" + crypto.randomUUID() })).data[0].status, "OK", "elapsed window resets the DB counter");
  await cleanupIdentity({ DilMartUserId: capped.DilMartUserId, custId: capped.cust });
});

test("B4 rotate returns the ACTUAL committed refresh lifetime (small when near the absolute cap)", async () => {
  const cust = await makeCustomer();
  const link = await makeLink(cust);
  const fid = crypto.randomUUID(), tid = crypto.randomUUID(), th = "near-" + crypto.randomUUID();
  // Family whose absolute expiry is ~300s away → the rotated refresh cannot exceed it.
  await supabase.from("store_federated_session_families").insert({ id: fid, store_customer_id: cust, linked_profile_id: link.linkId, DilMart_user_id: link.DilMartUserId, absolute_expires_at: new Date(Date.now() + 300 * 1000).toISOString(), last_used_at: new Date().toISOString() });
  await supabase.from("store_federated_refresh_tokens").insert({ id: tid, session_family_id: fid, token_hash: th, expires_at: new Date(Date.now() + 1e9).toISOString() });
  const r = await rotate(th, { newHash: "near2-" + crypto.randomUUID() });
  assert.equal(r.data[0].status, "OK");
  const secs = r.data[0].refresh_expires_in_seconds;
  assert.ok(secs > 250 && secs <= 300, `~300s, not 2592000 (got ${secs})`);
  await cleanupIdentity({ DilMartUserId: link.DilMartUserId, custId: cust });
});
