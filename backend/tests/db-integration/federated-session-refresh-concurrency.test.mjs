/**
 * STORE-PR4 — 25 iterations × 2 concurrent refreshes of the SAME current token (spec §21).
 * Each iteration: one rotation succeeds, the other detects reuse; the family becomes COMPROMISED, all its
 * refresh tokens are revoked, session_version increments, and the pre-rotation family version no longer
 * validates (so any access token bound to it is rejected).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeLinkedHandoff, createSession, rotate, cleanupIdentity } from "./federated-helpers.mjs";

test("25× × 2 concurrent refreshes of the same token → one rotates, one reuse → family COMPROMISED", async () => {
  for (let i = 0; i < 25; i++) {
    const h = await makeLinkedHandoff();
    const familyId = crypto.randomUUID(), t1 = crypto.randomUUID(), t1h = "t1-" + crypto.randomUUID();
    await createSession(h.codeHash, h.stateHash, { familyId, refreshTokenId: t1, refreshHash: t1h });

    const [a, b] = await Promise.all([
      rotate(t1h, { newId: crypto.randomUUID(), newHash: "na-" + crypto.randomUUID() }),
      rotate(t1h, { newId: crypto.randomUUID(), newHash: "nb-" + crypto.randomUUID() }),
    ]);
    assert.equal(a.error, null, `iter ${i} a: ${a.error?.message}`);
    assert.equal(b.error, null, `iter ${i} b: ${b.error?.message}`);
    const rows = [a.data[0], b.data[0]];
    assert.equal(rows.filter((r) => r.status === "OK").length, 1, `iter ${i}: exactly one rotation succeeds`);
    assert.equal(rows.filter((r) => r.error_code === "FEDERATED_REFRESH_REUSE_DETECTED").length, 1, `iter ${i}: the other detects reuse`);

    const { data: fam } = await supabase.from("store_federated_session_families").select("status, session_version").eq("id", familyId).single();
    assert.equal(fam.status, "COMPROMISED", `iter ${i}: family compromised`);
    assert.equal(fam.session_version, 2, `iter ${i}: session_version incremented`);
    const { count: active } = await supabase.from("store_federated_refresh_tokens").select("id", { count: "exact", head: true }).eq("session_family_id", familyId).is("revoked_at", null);
    assert.equal(active, 0, `iter ${i}: all refresh tokens revoked`);
    // A token bound to the pre-compromise family version (1) no longer validates.
    const { data: v } = await supabase.rpc("validate_federated_session_family", { p_family_id: familyId, p_session_version: 1 });
    assert.equal(v[0].valid, false, `iter ${i}: pre-compromise access token rejected`);
    await cleanupIdentity(h);
  }
});
