/**
 * STORE-PR4 Security Closure B1 — a used/revoked/expired/unknown refresh token must NOT authorize logout or
 * logout-all. Only a currently-valid, locked token grants revocation authority; logout-all is scoped to the
 * exact (store_customer_id, linked_profile_id, DilMart_user_id) triple. The public response is always the
 * generic logged_out (no token-existence oracle).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeCustomer, makeLink, makeLinkedHandoff, createSession, rotate, logout, logoutAll, cleanupIdentity } from "./federated-helpers.mjs";

const status = async (id) => (await supabase.from("store_federated_session_families").select("status, session_version").eq("id", id).single()).data;
/** Insert a second ACTIVE family for the SAME identity as handoff h; returns its id + a token hash. */
async function siblingFamily(h, { expiresInMs = 1e9, tokenHash } = {}) {
  const fid = crypto.randomUUID(), tid = crypto.randomUUID(), th = tokenHash ?? ("sib-" + crypto.randomUUID());
  await supabase.from("store_federated_session_families").insert({ id: fid, store_customer_id: h.custId, linked_profile_id: h.linkId, DilMart_user_id: h.DilMartUserId, absolute_expires_at: new Date(Date.now() + 1e9).toISOString(), last_used_at: new Date().toISOString() });
  await supabase.from("store_federated_refresh_tokens").insert({ id: tid, session_family_id: fid, token_hash: th, expires_at: new Date(Date.now() + expiresInMs).toISOString() });
  return { fid, th };
}

test("B1.1 current active token CAN logout (family revoked, version bumped)", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), th = "ok-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: th });
  const r = await logout(th);
  assert.equal(r.data[0].status, "logged_out");
  const f = await status(familyId);
  assert.equal(f.status, "REVOKED");
  assert.equal(f.session_version, 2);
  await cleanupIdentity(h);
});

test("B1.2 current active token CAN logout-all (all sibling families for the identity revoked)", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), th = "ok2-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: th });
  const sib = await siblingFamily(h);
  await logoutAll(th);
  assert.equal((await status(familyId)).status, "REVOKED");
  assert.equal((await status(sib.fid)).status, "REVOKED");
  await cleanupIdentity(h);
});

test("B1.3 a USED (rotated) parent token CANNOT logout", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), t1 = "u1-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: t1 });
  await rotate(t1, { newHash: "u2-" + crypto.randomUUID() }); // t1 now used
  await logout(t1);
  assert.equal((await status(familyId)).status, "ACTIVE", "used token grants no logout authority");
  assert.equal((await status(familyId)).session_version, 1);
  await cleanupIdentity(h);
});

test("B1.4 a USED parent token CANNOT logout-all", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), t1 = "u4-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: t1 });
  const sib = await siblingFamily(h);
  await rotate(t1, { newHash: "u4b-" + crypto.randomUUID() });
  await logoutAll(t1);
  assert.equal((await status(familyId)).status, "ACTIVE");
  assert.equal((await status(sib.fid)).status, "ACTIVE", "sibling not revoked by a used token");
  await cleanupIdentity(h);
});

test("B1.5 a REVOKED token CANNOT authorize logout-all (sibling stays ACTIVE)", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), t1 = "r5-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: t1 });
  const sib = await siblingFamily(h);
  await logout(t1); // revokes family1 + t1
  await logoutAll(t1); // t1 is now revoked → must not widen
  assert.equal((await status(sib.fid)).status, "ACTIVE", "revoked token cannot revoke the sibling");
  await cleanupIdentity(h);
});

test("B1.6 an EXPIRED token CANNOT authorize logout-all", async () => {
  const h = await makeLinkedHandoff();
  // family1 ACTIVE but its presented token is already expired.
  const f1 = crypto.randomUUID(), te = "e6-" + crypto.randomUUID(), teId = crypto.randomUUID();
  await supabase.from("store_federated_session_families").insert({ id: f1, store_customer_id: h.custId, linked_profile_id: h.linkId, DilMart_user_id: h.DilMartUserId, absolute_expires_at: new Date(Date.now() + 1e9).toISOString(), last_used_at: new Date().toISOString() });
  await supabase.from("store_federated_refresh_tokens").insert({ id: teId, session_family_id: f1, token_hash: te, expires_at: new Date(Date.now() - 1000).toISOString() });
  const sib = await siblingFamily(h);
  await logoutAll(te);
  assert.equal((await status(f1)).status, "ACTIVE");
  assert.equal((await status(sib.fid)).status, "ACTIVE", "expired token cannot revoke the sibling");
  await cleanupIdentity(h);
});

test("B1.7 an UNKNOWN token makes no state change and returns the generic response", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), th = "k7-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: th });
  const unknown = "does-not-exist-" + crypto.randomUUID();
  assert.equal((await logout(unknown)).data[0].status, "logged_out");
  assert.equal((await logoutAll(unknown)).data[0].status, "logged_out");
  assert.equal((await status(familyId)).status, "ACTIVE", "no family touched by an unknown token");
  await cleanupIdentity(h);
});

test("B1.8 a token from ANOTHER linked profile cannot widen revocation to it", async () => {
  const a = await makeLinkedHandoff();
  const fa = crypto.randomUUID(), ta = "a8-" + crypto.randomUUID();
  await createSession(a.codeHash, a.stateHash, { familyId: fa, refreshHash: ta });
  const b = await makeLinkedHandoff();
  const fb = crypto.randomUUID(), tb = "b8-" + crypto.randomUUID();
  await createSession(b.codeHash, b.stateHash, { familyId: fb, refreshHash: tb });
  await logoutAll(ta); // A's token
  assert.equal((await status(fa)).status, "REVOKED");
  assert.equal((await status(fb)).status, "ACTIVE", "the other profile's family is untouched");
  await cleanupIdentity(a);
  await cleanupIdentity(b);
});

test("B1.9 an INVALID token returns the generic public response (no oracle)", async () => {
  assert.equal((await logout("garbage-" + crypto.randomUUID())).data[0].status, "logged_out");
  assert.equal((await logoutAll("garbage-" + crypto.randomUUID())).data[0].status, "logged_out");
});
