/**
 * STORE-PR4 Final Closure B1 — cross-family logout-all concurrency. TWO ACTIVE families of the SAME identity,
 * each with its OWN valid current token, are logged out concurrently via Promise.all (real parallel DB ops).
 * The identity mutex (store_linked_profiles FOR UPDATE, taken before any family lock) makes this deadlock-free
 * in BOTH UUID orderings. Also races logout-all against refresh/logout/revoke on the sibling family.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeCustomer, makeLink, makeLinkedHandoff, createSession, rotate, logout, logoutAll, cleanupIdentity } from "./federated-helpers.mjs";

const fam = async (id) => (await supabase.from("store_federated_session_families").select("status, session_version").eq("id", id).single()).data;
const activeTokens = async (fid) => (await supabase.from("store_federated_refresh_tokens").select("id", { count: "exact", head: true }).eq("session_family_id", fid).is("revoked_at", null)).count;
const logoutAllAudits = async (fid) => (await supabase.from("store_federated_session_audit_events").select("id", { count: "exact", head: true }).eq("session_family_id", fid).eq("event_type", "FEDERATED_SESSION_LOGOUT_ALL")).count;

/**
 * One identity, two ACTIVE families A/B each with a valid token. `aLess` controls whether A.id < B.id so both
 * lock orderings are exercised. Family A is created via the real redeem path; B is inserted for the same triple.
 */
async function twoFamilyIdentity(aLess) {
  const h = await makeLinkedHandoff();
  const [lo, hi] = [crypto.randomUUID(), crypto.randomUUID()].sort();
  const aId = aLess ? lo : hi, bId = aLess ? hi : lo;
  const tA = "A-" + crypto.randomUUID(), tB = "B-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId: aId, refreshHash: tA });
  await supabase.from("store_federated_session_families").insert({ id: bId, store_customer_id: h.custId, linked_profile_id: h.linkId, DilMart_user_id: h.DilMartUserId, absolute_expires_at: new Date(Date.now() + 1e9).toISOString(), last_used_at: new Date().toISOString() });
  await supabase.from("store_federated_refresh_tokens").insert({ id: crypto.randomUUID(), session_family_id: bId, token_hash: tB, expires_at: new Date(Date.now() + 1e9).toISOString() });
  return { h, aId, bId, tA, tB };
}

test("B1 50× cross-family logoutAll(A) vs logoutAll(B) — no deadlock; both families end REVOKED (both id orders)", async () => {
  // An unrelated identity that must never be touched.
  const other = await makeLinkedHandoff();
  const ofid = crypto.randomUUID();
  await createSession(other.codeHash, other.stateHash, { familyId: ofid, refreshHash: "O-" + crypto.randomUUID() });

  for (let i = 0; i < 50; i++) {
    const s = await twoFamilyIdentity(i % 2 === 0); // 25 with A.id<B.id, 25 with A.id>B.id
    const [ra, rb] = await Promise.all([logoutAll(s.tA), logoutAll(s.tB)]);
    assert.equal(ra.error, null, `iter ${i} A db error: ${ra.error?.message ?? ""}`);
    assert.equal(rb.error, null, `iter ${i} B db error: ${rb.error?.message ?? ""}`);
    assert.equal(ra.data[0].status, "logged_out");
    assert.equal(rb.data[0].status, "logged_out");
    const fa = await fam(s.aId), fb = await fam(s.bId);
    assert.equal(fa.status, "REVOKED", `iter ${i}: A revoked`);
    assert.equal(fb.status, "REVOKED", `iter ${i}: B revoked`);
    assert.equal(fa.session_version, 2, `iter ${i}: A version bumped exactly once`);
    assert.equal(fb.session_version, 2, `iter ${i}: B version bumped exactly once`);
    assert.equal(await activeTokens(s.aId), 0, `iter ${i}: A tokens revoked`);
    assert.equal(await activeTokens(s.bId), 0, `iter ${i}: B tokens revoked`);
    assert.equal(await logoutAllAudits(s.aId), 1, `iter ${i}: exactly one logout-all audit for A`);
    assert.equal(await logoutAllAudits(s.bId), 1, `iter ${i}: exactly one logout-all audit for B`);
    await cleanupIdentity(s.h);
  }

  assert.equal((await fam(ofid)).status, "ACTIVE", "the unrelated identity is never touched");
  await cleanupIdentity(other);
});

test("B1 25× logoutAll(A) vs refresh(B) — no deadlock; both families end REVOKED (refresh either commits then is revoked, or is rejected)", async () => {
  for (let i = 0; i < 25; i++) {
    const s = await twoFamilyIdentity(i % 2 === 0);
    const [ra, rr] = await Promise.all([logoutAll(s.tA), rotate(s.tB, { newHash: "nb-" + crypto.randomUUID() })]);
    assert.equal(ra.error, null, `iter ${i} logout-all db error`);
    assert.equal(rr.error, null, `iter ${i} refresh db error`);
    // Documented winners: refresh commits before logout-all (OK) OR after (FEDERATED_SESSION_EXPIRED); either way both revoked.
    assert.ok(rr.data[0].status === "OK" || rr.data[0].error_code === "FEDERATED_SESSION_EXPIRED", `iter ${i}: refresh outcome`);
    assert.equal((await fam(s.aId)).status, "REVOKED");
    assert.equal((await fam(s.bId)).status, "REVOKED");
    assert.equal(await activeTokens(s.bId), 0, `iter ${i}: B fully revoked`);
    await cleanupIdentity(s.h);
  }
});

test("B1 25× logoutAll(A) vs logout(B) — no deadlock; both families end REVOKED", async () => {
  for (let i = 0; i < 25; i++) {
    const s = await twoFamilyIdentity(i % 2 === 0);
    const [ra, rl] = await Promise.all([logoutAll(s.tA), logout(s.tB)]);
    assert.equal(ra.error, null); assert.equal(rl.error, null);
    assert.equal(rl.data[0].status, "logged_out");
    assert.equal((await fam(s.aId)).status, "REVOKED");
    assert.equal((await fam(s.bId)).status, "REVOKED");
    await cleanupIdentity(s.h);
  }
});

test("B1 25× logoutAll(A) vs revokeForIdentity(identity) — no deadlock; both REVOKED; one version bump each", async () => {
  for (let i = 0; i < 25; i++) {
    const s = await twoFamilyIdentity(i % 2 === 0);
    const revoke = supabase.rpc("revoke_federated_sessions_for_identity", { p_DilMart_user_id: s.h.DilMartUserId, p_linked_profile_id: s.h.linkId, p_reason: "TEST", p_request_id: crypto.randomUUID() });
    const [ra, rv] = await Promise.all([logoutAll(s.tA), revoke]);
    assert.equal(ra.error, null, `iter ${i} logout-all db error`);
    assert.equal(rv.error, null, `iter ${i} revoke db error`);
    const fa = await fam(s.aId), fb = await fam(s.bId);
    assert.equal(fa.status, "REVOKED"); assert.equal(fb.status, "REVOKED");
    assert.equal(fa.session_version, 2, `iter ${i}: A exactly one revoker wins`);
    assert.equal(fb.session_version, 2, `iter ${i}: B exactly one revoker wins`);
    await cleanupIdentity(s.h);
  }
});
