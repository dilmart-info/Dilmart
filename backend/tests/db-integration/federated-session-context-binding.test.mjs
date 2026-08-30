/**
 * STORE-PR4 Security Closure B6 — the identity context a caller pre-signed the access token for must still
 * match the locked handoff (redeem) / family (rotate) at commit time. Any mismatch performs a COMPLETE
 * rollback / no rotation, and a successful call returns identity values equal to what was signed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeLinkedHandoff, createSession, rotate, cleanupIdentity } from "./federated-helpers.mjs";

async function handoffRedeemed(h) {
  const { data } = await supabase.from("DilMart_customer_handoffs").select("redeemed_at, status").eq("id", h.handoffId).single();
  return data;
}
async function familyCount(DilMartUserId) {
  const { count } = await supabase.from("store_federated_session_families").select("id", { count: "exact", head: true }).eq("DilMart_user_id", DilMartUserId);
  return count;
}

for (const [label, over] of [
  ["store_customer mismatch", { expectedStoreCustomerId: crypto.randomUUID() }],
  ["linked_profile mismatch", { expectedLinkedProfileId: crypto.randomUUID() }],
  ["DilMart_user mismatch", { expectedDilMartUserId: crypto.randomUUID() }],
  ["target mismatch", { expectedTargetPath: "/somewhere-else" }],
  ["handoff_id mismatch", { expectedHandoffId: crypto.randomUUID() }],
]) {
  test(`B6 redeem: ${label} → HANDOFF_CONTEXT_MISMATCH, complete rollback (unredeemed, no family)`, async () => {
    const h = await makeLinkedHandoff();
    const { data } = await createSession(h.codeHash, h.stateHash, { familyId: crypto.randomUUID(), ...over });
    assert.equal(data[0].error_code, "HANDOFF_CONTEXT_MISMATCH");
    assert.equal((await handoffRedeemed(h)).redeemed_at, null, "handoff NOT consumed");
    assert.equal(await familyCount(h.DilMartUserId), 0, "no family created");
    // A subsequent correctly-bound redeem still works (the code was never spent).
    const ok = await createSession(h.codeHash, h.stateHash, { familyId: crypto.randomUUID() });
    assert.equal(ok.data[0].status, "OK");
    await cleanupIdentity(h);
  });
}

test("B6 rotate: a changed family session_version before rotation → no new token", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), t1 = "v1-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: t1 });
  const { count: before } = await supabase.from("store_federated_refresh_tokens").select("id", { count: "exact", head: true }).eq("session_family_id", familyId);
  // Caller pre-signed for version 1, but the committed family is version 2 → reject, no rotation.
  const r = await rotate(t1, { expectedSessionVersion: 2, newHash: "v2-" + crypto.randomUUID() });
  assert.equal(r.data[0].status, "ERROR");
  assert.equal(r.data[0].error_code, "FEDERATED_SESSION_EXPIRED");
  const { count: after } = await supabase.from("store_federated_refresh_tokens").select("id", { count: "exact", head: true }).eq("session_family_id", familyId);
  assert.equal(after, before, "no child token inserted");
  await cleanupIdentity(h);
});

test("B6 rotate: a changed linked identity before rotation → no rotation", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), t1 = "id1-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: t1 });
  const r = await rotate(t1, { expectedDilMartUserId: crypto.randomUUID(), newHash: "id2-" + crypto.randomUUID() });
  assert.equal(r.data[0].error_code, "FEDERATED_SESSION_EXPIRED");
  // original token still usable (not consumed) with correct context.
  const ok = await rotate(t1, { newHash: "id3-" + crypto.randomUUID() });
  assert.equal(ok.data[0].status, "OK");
  await cleanupIdentity(h);
});

test("B6 rotate success returns identity values equal to the pre-signed context", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), t1 = "s1-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshHash: t1 });
  const r = await rotate(t1, { newHash: "s2-" + crypto.randomUUID() });
  const row = r.data[0];
  assert.equal(row.status, "OK");
  assert.equal(row.family_id, familyId);
  assert.equal(row.store_customer_id, h.custId);
  assert.equal(row.linked_profile_id, h.linkId);
  assert.equal(row.DilMart_user_id, h.DilMartUserId);
  assert.equal(row.session_version, 1);
  assert.ok(Number.isInteger(row.refresh_expires_in_seconds) && row.refresh_expires_in_seconds > 0);
  await cleanupIdentity(h);
});
