/**
 * STORE-PR4 Security Closure B7 — the internal identity revoke uses AND semantics. When both selectors are
 * supplied a family must match BOTH; a single selector is allowed; the widening OR of two unrelated identity
 * sets is never used. (No HTTP endpoint — service-role RPC only.)
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeCustomer, makeLink, cleanupIdentity } from "./federated-helpers.mjs";

const revoke = (su, lp) => supabase.rpc("revoke_federated_sessions_for_identity", { p_DilMart_user_id: su, p_linked_profile_id: lp, p_reason: "TEST", p_request_id: crypto.randomUUID() });
const statusOf = async (id) => (await supabase.from("store_federated_session_families").select("status").eq("id", id).single()).data.status;

async function familyFor() {
  const cust = await makeCustomer();
  const link = await makeLink(cust);
  const fid = crypto.randomUUID();
  await supabase.from("store_federated_session_families").insert({ id: fid, store_customer_id: cust, linked_profile_id: link.linkId, DilMart_user_id: link.DilMartUserId, absolute_expires_at: new Date(Date.now() + 1e9).toISOString(), last_used_at: new Date().toISOString() });
  return { cust, linkId: link.linkId, DilMartUserId: link.DilMartUserId, fid };
}

test("B7 both selectors from DIFFERENT identities revoke NOTHING (no widening OR)", async () => {
  const a = await familyFor(), b = await familyFor();
  const { data } = await revoke(a.DilMartUserId, b.linkId); // A's user + B's profile: no single family matches both
  assert.equal(data[0].revoked_count, 0);
  assert.equal(await statusOf(a.fid), "ACTIVE", "A untouched");
  assert.equal(await statusOf(b.fid), "ACTIVE", "B untouched");
  await cleanupIdentity({ DilMartUserId: a.DilMartUserId, custId: a.cust });
  await cleanupIdentity({ DilMartUserId: b.DilMartUserId, custId: b.cust });
});

test("B7 both selectors from the SAME identity revoke exactly that family", async () => {
  const a = await familyFor(), b = await familyFor();
  const { data } = await revoke(a.DilMartUserId, a.linkId);
  assert.equal(data[0].revoked_count, 1);
  assert.equal(await statusOf(a.fid), "REVOKED");
  assert.equal(await statusOf(b.fid), "ACTIVE", "unrelated identity untouched");
  await cleanupIdentity({ DilMartUserId: a.DilMartUserId, custId: a.cust });
  await cleanupIdentity({ DilMartUserId: b.DilMartUserId, custId: b.cust });
});

test("B7 a single selector (DilMart_user only / linked_profile only) still works", async () => {
  const a = await familyFor(), b = await familyFor();
  assert.equal((await revoke(a.DilMartUserId, null)).data[0].revoked_count, 1);
  assert.equal(await statusOf(a.fid), "REVOKED");
  assert.equal((await revoke(null, b.linkId)).data[0].revoked_count, 1);
  assert.equal(await statusOf(b.fid), "REVOKED");
  await cleanupIdentity({ DilMartUserId: a.DilMartUserId, custId: a.cust });
  await cleanupIdentity({ DilMartUserId: b.DilMartUserId, custId: b.cust });
});

test("B7 no selector at all is a hard error (fail closed)", async () => {
  const { error } = await revoke(null, null);
  assert.ok(error, "an identity key is required");
});
