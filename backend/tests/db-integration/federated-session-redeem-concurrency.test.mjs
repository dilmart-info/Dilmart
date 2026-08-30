/**
 * STORE-PR4 — 25 iterations × 2 concurrent redeem-and-create consumers of the same handoff (spec §21).
 * Each iteration: exactly one authenticated success, one HANDOFF_ALREADY_REDEEMED, one family, one initial
 * refresh row, one HANDOFF_REDEEMED audit, one FEDERATED_SESSION_CREATED audit.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { supabase, makeLinkedHandoff, createSession, cleanupIdentity } from "./federated-helpers.mjs";

test("25× × 2 concurrent redeem_and_create → exactly one authenticated winner each", async () => {
  for (let i = 0; i < 25; i++) {
    const h = await makeLinkedHandoff();
    // Each caller brings its own family/refresh ids (only the consuming winner persists them).
    const [a, b] = await Promise.all([
      createSession(h.codeHash, h.stateHash, { familyId: crypto.randomUUID(), refreshTokenId: crypto.randomUUID(), refreshHash: "a-" + crypto.randomUUID() }),
      createSession(h.codeHash, h.stateHash, { familyId: crypto.randomUUID(), refreshTokenId: crypto.randomUUID(), refreshHash: "b-" + crypto.randomUUID() }),
    ]);
    assert.equal(a.error, null, `iter ${i} a: ${a.error?.message}`);
    assert.equal(b.error, null, `iter ${i} b: ${b.error?.message}`);
    const rows = [a.data[0], b.data[0]];
    assert.equal(rows.filter((r) => r.status === "OK").length, 1, `iter ${i}: exactly one OK`);
    assert.equal(rows.filter((r) => r.error_code === "HANDOFF_ALREADY_REDEEMED").length, 1, `iter ${i}: one ALREADY_REDEEMED`);

    const { data: fams } = await supabase.from("store_federated_session_families").select("id").eq("DilMart_user_id", h.DilMartUserId);
    assert.equal(fams.length, 1, `iter ${i}: one family`);
    const { count: refresh } = await supabase.from("store_federated_refresh_tokens").select("id", { count: "exact", head: true }).eq("session_family_id", fams[0].id);
    assert.equal(refresh, 1, `iter ${i}: one initial refresh row`);
    const { data: sAudit } = await supabase.from("store_federated_session_audit_events").select("event_type").eq("session_family_id", fams[0].id);
    assert.equal(sAudit.filter((e) => e.event_type === "FEDERATED_SESSION_CREATED").length, 1, `iter ${i}: one CREATED audit`);
    const { data: hAudit } = await supabase.from("DilMart_customer_handoff_audit_events").select("event_type").eq("handoff_id", h.handoffId);
    assert.equal(hAudit.filter((e) => e.event_type === "HANDOFF_REDEEMED").length, 1, `iter ${i}: one HANDOFF_REDEEMED audit`);
    await cleanupIdentity(h);
  }
});
