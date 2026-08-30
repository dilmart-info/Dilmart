/**
 * STORE-PR3 — finalize concurrency (task C1). Local Supabase.
 * 25 iterations each for: same-identity race (both OK, one link, two handoffs, two PREPARED audits),
 * conflicting-identity race (one OK / one IDENTITY_BLOCKED), and Barber collision (BLOCKED, no mutation).
 * Determinism comes from the per-DilMart-user transaction-scoped advisory lock inside finalize.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

const supabase = getTestClient();
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");
const ITER = 25;

async function makeCustomer() {
  const email = `fc-${crypto.randomBytes(8).toString("hex")}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomBytes(20).toString("base64url") });
  assert.equal(error, null, error?.message);
  return data.user.id;
}
function params(over) {
  return {
    p_DilMart_user_id: over.DilMartUserId, p_store_customer_id: over.storeCustomerId ?? null,
    p_identity_outcome: over.identityOutcome ?? "LINKED", p_link_method: over.linkMethod ?? "NEW_FEDERATED",
    p_link_status: over.linkStatus ?? "LINKED", p_identity_assurance: over.identityAssurance ?? "DilMart_SESSION",
    p_reuse_existing: false, p_conflict_reason: over.conflictReason ?? null,
    p_code_hash: sha256(crypto.randomUUID()), p_state_hash: sha256(crypto.randomUUID()), p_assertion_jti: `jti-${crypto.randomUUID()}`,
    p_target_path: "/product/x", p_source_surface: "s", p_campaign: null, p_code_ttl_seconds: 120, p_kid: "k",
    p_email: null, p_phone_verified_at: null, p_email_verified_at: null, p_request_id: crypto.randomUUID(),
  };
}
const finalize = (p) => supabase.rpc("finalize_customer_handoff", p);

test(`Case A — same DilMart user + same Store customer, ${ITER}× parallel → 2 OK / 1 link / 2 handoffs / 2 audits`, async () => {
  for (let i = 0; i < ITER; i++) {
    const DilMartUserId = crypto.randomUUID();
    const custId = await makeCustomer();
    const [a, b] = await Promise.all([
      finalize(params({ DilMartUserId, storeCustomerId: custId })),
      finalize(params({ DilMartUserId, storeCustomerId: custId })),
    ]);
    assert.equal(a.error, null, `iter ${i} a: ${a.error?.message}`);
    assert.equal(b.error, null, `iter ${i} b: ${b.error?.message}`);
    assert.equal(a.data[0].status, "OK", `iter ${i} a OK`);
    assert.equal(b.data[0].status, "OK", `iter ${i} b OK`);
    const { data: links } = await supabase.from("store_linked_profiles").select("id").eq("DilMart_user_id", DilMartUserId);
    assert.equal(links.length, 1, `iter ${i}: exactly one link`);
    const { data: handoffs } = await supabase.from("DilMart_customer_handoffs").select("id").eq("DilMart_user_id", DilMartUserId);
    assert.equal(handoffs.length, 2, `iter ${i}: two handoffs`);
    const ids = handoffs.map((h) => h.id);
    const { data: audits } = await supabase.from("DilMart_customer_handoff_audit_events").select("id").in("handoff_id", ids).eq("event_type", "HANDOFF_PREPARED");
    assert.equal(audits.length, 2, `iter ${i}: two PREPARED audits`);
    await supabase.from("DilMart_customer_handoffs").delete().eq("DilMart_user_id", DilMartUserId);
    await supabase.from("store_linked_profiles").delete().eq("DilMart_user_id", DilMartUserId);
    await supabase.auth.admin.deleteUser(custId);
  }
});

test(`Case B — same DilMart user + different Store customers, ${ITER}× parallel → 1 OK / 1 IDENTITY_BLOCKED`, async () => {
  for (let i = 0; i < ITER; i++) {
    const DilMartUserId = crypto.randomUUID();
    const custA = await makeCustomer();
    const custB = await makeCustomer();
    const [a, b] = await Promise.all([
      finalize(params({ DilMartUserId, storeCustomerId: custA })),
      finalize(params({ DilMartUserId, storeCustomerId: custB })),
    ]);
    const rows = [a.data[0], b.data[0]];
    assert.equal(rows.filter((r) => r.status === "OK").length, 1, `iter ${i}: exactly one OK`);
    assert.equal(rows.filter((r) => r.error_code === "IDENTITY_BLOCKED").length, 1, `iter ${i}: exactly one BLOCKED`);
    const { data: links } = await supabase.from("store_linked_profiles").select("store_customer_id").eq("DilMart_user_id", DilMartUserId);
    assert.equal(links.length, 1, `iter ${i}: one link`);
    const winner = links[0].store_customer_id;
    assert.ok([custA, custB].includes(winner));
    // The one linked handoff references the winning customer; no mismatch.
    const { data: linkedHandoffs } = await supabase.from("DilMart_customer_handoffs").select("store_customer_id, linked_profile_id").eq("DilMart_user_id", DilMartUserId).not("linked_profile_id", "is", null);
    assert.equal(linkedHandoffs.length, 1, `iter ${i}: one linked handoff`);
    assert.equal(linkedHandoffs[0].store_customer_id, winner, `iter ${i}: no customer mismatch`);
    await supabase.from("DilMart_customer_handoffs").delete().eq("DilMart_user_id", DilMartUserId);
    await supabase.from("store_linked_profiles").delete().eq("DilMart_user_id", DilMartUserId);
    await supabase.auth.admin.deleteUser(custA);
    await supabase.auth.admin.deleteUser(custB);
  }
});

test(`Case C — existing Barber link + parallel Customer finalize, ${ITER}× → BLOCKED, Barber row unchanged`, async () => {
  for (let i = 0; i < ITER; i++) {
    const DilMartUserId = crypto.randomUUID();
    const cust = await makeCustomer();
    const { data: barber } = await supabase.from("store_linked_profiles")
      .insert({ DilMart_user_id: DilMartUserId, DilMart_role: "OWNER", segment: "DilMart_APP_BARBER_OWNER", source_app: "barber_app", link_status: "LINKED" })
      .select("DilMart_role, segment, source_app, store_customer_id, link_status, updated_at").single();
    const [a, b] = await Promise.all([
      finalize(params({ DilMartUserId, storeCustomerId: cust })),
      finalize(params({ DilMartUserId, storeCustomerId: cust })),
    ]);
    for (const r of [a.data[0], b.data[0]]) {
      assert.equal(r.error_code, "IDENTITY_BLOCKED", `iter ${i}: customer finalize BLOCKED by the Barber link`);
    }
    const { data: after } = await supabase.from("store_linked_profiles").select("DilMart_role, segment, source_app, store_customer_id, link_status, updated_at").eq("DilMart_user_id", DilMartUserId).single();
    assert.deepEqual(after, barber, `iter ${i}: Barber row unchanged`);
    await supabase.from("DilMart_customer_handoffs").delete().eq("DilMart_user_id", DilMartUserId);
    await supabase.from("store_linked_profiles").delete().eq("DilMart_user_id", DilMartUserId);
    await supabase.auth.admin.deleteUser(cust);
  }
});
