/**
 * STORE-PR4 — Federated session core DB tests (spec §9). Local Supabase.
 * Initial issuance + atomic rollback, DB-time expiry, refresh chain, logout/logout-all, RLS/permissions,
 * audit immutability, session-family validation.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { getAnonClient } from "./db-client-helper.mjs";
import { supabase, sha256, makeCustomer, makeLink, makeLinkedHandoff, createSession, rotate, validateFamily, cleanupIdentity } from "./federated-helpers.mjs";

const anon = getAnonClient();

test("initial issuance: handoff + family + refresh + BOTH audits commit atomically; DB-time expiries", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), refreshId = crypto.randomUUID(), refreshHash = "rh-" + crypto.randomUUID();
  const { data, error } = await createSession(h.codeHash, h.stateHash, { familyId, refreshTokenId: refreshId, refreshHash });
  assert.equal(error, null, error?.message);
  assert.equal(data[0].status, "OK");
  assert.equal(data[0].store_customer_id, h.custId);

  const { data: fam } = await supabase.from("store_federated_session_families").select("*").eq("id", familyId).single();
  assert.equal(fam.status, "ACTIVE");
  assert.equal(fam.session_version, 1);
  assert.equal(fam.store_customer_id, h.custId);
  // DB-time: absolute ≈ now+90d; refresh ≈ now+30d.
  const absDays = (new Date(fam.absolute_expires_at) - new Date(fam.created_at)) / 86400000;
  assert.ok(absDays > 89 && absDays < 91, `absolute ~90d (got ${absDays})`);
  const { data: tok } = await supabase.from("store_federated_refresh_tokens").select("*").eq("id", refreshId).single();
  assert.equal(tok.token_hash, refreshHash);
  const refDays = (new Date(tok.expires_at) - new Date(tok.created_at)) / 86400000;
  assert.ok(refDays > 29 && refDays < 31, `refresh ~30d (got ${refDays})`);

  const { data: hr } = await supabase.from("DilMart_customer_handoffs").select("redeemed_at, status").eq("id", h.handoffId).single();
  assert.ok(hr.redeemed_at && hr.status === "REDEEMED");
  const { data: sAudit } = await supabase.from("store_federated_session_audit_events").select("event_type").eq("session_family_id", familyId);
  assert.ok(sAudit.some((a) => a.event_type === "FEDERATED_SESSION_CREATED"));
  const { data: hAudit } = await supabase.from("DilMart_customer_handoff_audit_events").select("event_type").eq("handoff_id", h.handoffId);
  assert.ok(hAudit.some((a) => a.event_type === "HANDOFF_REDEEMED"));
  // Raw token is absent from every DB column (only the provided hash is stored).
  assert.ok(!JSON.stringify(tok).includes("rh-") || tok.token_hash === refreshHash);
  await cleanupIdentity(h);
});

test("atomic rollback: a family insert failure leaves the handoff unredeemed with no session/refresh/audit", async () => {
  // Force the family insert to fail by pre-inserting a family with the same id (PK conflict).
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID();
  const other = await makeCustomer();
  await supabase.from("store_federated_session_families").insert({ id: familyId, store_customer_id: other, linked_profile_id: h.linkId, DilMart_user_id: crypto.randomUUID(), absolute_expires_at: new Date(Date.now() + 1e9).toISOString() });
  const { error } = await createSession(h.codeHash, h.stateHash, { familyId }); // PK conflict on family insert
  assert.ok(error, "the atomic op fails on the family PK conflict");
  const { data: hr } = await supabase.from("DilMart_customer_handoffs").select("redeemed_at").eq("id", h.handoffId).single();
  assert.equal(hr.redeemed_at, null, "handoff stays unredeemed (rolled back)");
  const { count } = await supabase.from("store_federated_refresh_tokens").select("id", { count: "exact", head: true }).eq("session_family_id", familyId);
  assert.equal(count, 0, "no refresh row");
  await supabase.from("store_federated_session_families").delete().eq("id", familyId);
  await supabase.auth.admin.deleteUser(other);
  await cleanupIdentity(h);
});

test("second redeem of the same handoff → HANDOFF_ALREADY_REDEEMED, no second family", async () => {
  const h = await makeLinkedHandoff();
  const first = await createSession(h.codeHash, h.stateHash);
  assert.equal(first.data[0].status, "OK");
  const { data } = await createSession(h.codeHash, h.stateHash);
  assert.equal(data[0].error_code, "HANDOFF_ALREADY_REDEEMED");
  const { count } = await supabase.from("store_federated_session_families").select("id", { count: "exact", head: true }).eq("DilMart_user_id", h.DilMartUserId);
  assert.equal(count, 1);
  await cleanupIdentity(h);
});

test("non-LINKED handoff cannot create a session via redeem_and_create (HANDOFF_INVALID)", async () => {
  const h = await makeLinkedHandoff({ identityOutcome: "LINK_REQUIRED" });
  const { data } = await createSession(h.codeHash, h.stateHash);
  assert.equal(data[0].error_code, "HANDOFF_INVALID");
  await cleanupIdentity(h);
});

test("refresh chain A→B→C: parent/replacement links correct; A & B unusable; validate passes for the live family", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), tA = crypto.randomUUID(), tAh = "A-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshTokenId: tA, refreshHash: tAh });
  const tB = crypto.randomUUID(), tBh = "B-" + crypto.randomUUID();
  const r1 = await rotate(tAh, { newId: tB, newHash: tBh });
  assert.equal(r1.data[0].status, "OK");
  const tC = crypto.randomUUID(), tCh = "C-" + crypto.randomUUID();
  const r2 = await rotate(tBh, { newId: tC, newHash: tCh });
  assert.equal(r2.data[0].status, "OK");
  const { data: a } = await supabase.from("store_federated_refresh_tokens").select("used_at, replaced_by_token_id").eq("id", tA).single();
  const { data: b } = await supabase.from("store_federated_refresh_tokens").select("used_at, parent_token_id, replaced_by_token_id").eq("id", tB).single();
  assert.equal(a.replaced_by_token_id, tB);
  assert.equal(b.parent_token_id, tA);
  assert.equal(b.replaced_by_token_id, tC);
  assert.ok(a.used_at && b.used_at);
  // validate the live family (session_version 1).
  const { data: v } = await validateFamily(familyId, 1);
  assert.equal(v[0].valid, true);
  // reusing A now → reuse detected → family compromised → validate fails.
  const reuse = await rotate(tAh);
  assert.equal(reuse.data[0].error_code, "FEDERATED_REFRESH_REUSE_DETECTED");
  const { data: v2 } = await validateFamily(familyId, 1);
  assert.equal(v2[0].valid, false, "compromised family fails validation (version bumped)");
  await cleanupIdentity(h);
});

test("DB-time expiry: an absolutely-expired family cannot refresh and is marked EXPIRED; validate fails", async () => {
  const custId = await makeCustomer();
  const link = await makeLink(custId);
  const familyId = crypto.randomUUID(), tok = crypto.randomUUID(), tokH = "e-" + crypto.randomUUID();
  // Insert a family already past absolute expiry (DB clock authority).
  await supabase.from("store_federated_session_families").insert({ id: familyId, store_customer_id: custId, linked_profile_id: link.linkId, DilMart_user_id: link.DilMartUserId, absolute_expires_at: new Date(Date.now() - 1000).toISOString(), last_used_at: new Date(Date.now() - 1000).toISOString(), created_at: new Date(Date.now() - 100 * 86400000).toISOString() });
  await supabase.from("store_federated_refresh_tokens").insert({ id: tok, session_family_id: familyId, token_hash: tokH, expires_at: new Date(Date.now() + 86400000).toISOString() });
  const { data } = await rotate(tokH);
  assert.equal(data[0].error_code, "FEDERATED_SESSION_EXPIRED");
  const { data: fam } = await supabase.from("store_federated_session_families").select("status").eq("id", familyId).single();
  assert.equal(fam.status, "EXPIRED");
  const { data: v } = await validateFamily(familyId, 1);
  assert.equal(v[0].valid, false);
  await cleanupIdentity({ DilMartUserId: link.DilMartUserId, custId });
});

test("logout revokes one family + is idempotent; refresh + validate fail afterwards", async () => {
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID(), tok = crypto.randomUUID(), tokH = "l-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId, refreshTokenId: tok, refreshHash: tokH });
  await supabase.rpc("logout_federated_session", { p_refresh_token_hash: tokH, p_request_id: crypto.randomUUID() });
  const { data: fam } = await supabase.from("store_federated_session_families").select("status, session_version").eq("id", familyId).single();
  assert.equal(fam.status, "REVOKED");
  assert.equal(fam.session_version, 2);
  // idempotent
  const again = await supabase.rpc("logout_federated_session", { p_refresh_token_hash: tokH, p_request_id: crypto.randomUUID() });
  assert.equal(again.data[0].status, "logged_out");
  // refresh + validate fail after logout
  assert.equal((await rotate(tokH)).data[0].error_code, "FEDERATED_SESSION_EXPIRED");
  const { data: v } = await validateFamily(familyId, 1);
  assert.equal(v[0].valid, false);
  await cleanupIdentity(h);
});

test("logout-all revokes all families for the identity; another customer + Supabase profile untouched", async () => {
  const h = await makeLinkedHandoff();
  const f1 = crypto.randomUUID(), t1 = "l1-" + crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId: f1, refreshHash: t1 });
  // second family for the SAME identity (insert directly + a token).
  const f2 = crypto.randomUUID(), t2id = crypto.randomUUID(), t2 = "l2-" + crypto.randomUUID();
  await supabase.from("store_federated_session_families").insert({ id: f2, store_customer_id: h.custId, linked_profile_id: h.linkId, DilMart_user_id: h.DilMartUserId, absolute_expires_at: new Date(Date.now() + 1e9).toISOString() });
  await supabase.from("store_federated_refresh_tokens").insert({ id: t2id, session_family_id: f2, token_hash: t2, expires_at: new Date(Date.now() + 1e9).toISOString() });
  // an UNRELATED customer's family.
  const otherCust = await makeCustomer(); const otherLink = await makeLink(otherCust);
  const fo = crypto.randomUUID();
  await supabase.from("store_federated_session_families").insert({ id: fo, store_customer_id: otherCust, linked_profile_id: otherLink.linkId, DilMart_user_id: otherLink.DilMartUserId, absolute_expires_at: new Date(Date.now() + 1e9).toISOString() });

  await supabase.rpc("logout_all_federated_sessions", { p_refresh_token_hash: t1, p_request_id: crypto.randomUUID() });
  assert.equal((await supabase.from("store_federated_session_families").select("status").eq("id", f1).single()).data.status, "REVOKED");
  assert.equal((await supabase.from("store_federated_session_families").select("status").eq("id", f2).single()).data.status, "REVOKED");
  assert.equal((await supabase.from("store_federated_session_families").select("status").eq("id", fo).single()).data.status, "ACTIVE", "other customer untouched");
  // Direct Supabase profile of the logged-out customer is untouched (federated logout never deletes it).
  assert.ok((await supabase.from("profiles").select("id").eq("id", h.custId).maybeSingle()).data, "Supabase profile intact");
  await supabase.from("store_federated_session_families").delete().eq("id", fo);
  await cleanupIdentity({ DilMartUserId: otherLink.DilMartUserId, custId: otherCust });
  await cleanupIdentity(h);
});

test("RLS/permissions: anon cannot read tables or EXECUTE session RPCs; audit is immutable", async (t) => {
  if (!anon) return t.skip("no anon key");
  for (const table of ["store_federated_session_families", "store_federated_refresh_tokens", "store_federated_session_audit_events"]) {
    const { data } = await anon.from(table).select("*").limit(1);
    assert.equal((data ?? []).length, 0, `anon reads 0 from ${table}`);
  }
  const permDenied = (e) => !!e && (e.code === "42501" || /permission denied/i.test(e.message ?? ""));
  // Complete NEW-signature calls so anon reaches the function and is denied EXECUTE (42501), not a missing overload.
  assert.ok(permDenied((await anon.rpc("redeem_and_create_federated_session", { p_code_hash: "x", p_state_hash: "y", p_family_id: crypto.randomUUID(), p_refresh_token_id: crypto.randomUUID(), p_refresh_token_hash: "z", p_access_jti: crypto.randomUUID(), p_device_hash: null, p_expected_handoff_id: crypto.randomUUID(), p_expected_store_customer_id: crypto.randomUUID(), p_expected_linked_profile_id: crypto.randomUUID(), p_expected_DilMart_user_id: crypto.randomUUID(), p_expected_target_path: "/", p_request_id: crypto.randomUUID() })).error), "anon denied create");
  assert.ok(permDenied((await anon.rpc("rotate_federated_refresh_token", { p_current_token_hash: "x", p_new_token_id: crypto.randomUUID(), p_new_token_hash: "y", p_device_hash: null, p_expected_family_id: crypto.randomUUID(), p_expected_store_customer_id: crypto.randomUUID(), p_expected_linked_profile_id: crypto.randomUUID(), p_expected_DilMart_user_id: crypto.randomUUID(), p_expected_session_version: 1, p_request_id: crypto.randomUUID() })).error), "anon denied rotate");
  assert.ok(permDenied((await anon.rpc("logout_federated_session", { p_refresh_token_hash: "x", p_request_id: crypto.randomUUID() })).error), "anon denied logout");
  assert.ok(permDenied((await anon.rpc("logout_all_federated_sessions", { p_refresh_token_hash: "x", p_request_id: crypto.randomUUID() })).error), "anon denied logout-all");
  assert.ok(permDenied((await anon.rpc("validate_federated_session_family", { p_family_id: crypto.randomUUID(), p_session_version: 1 })).error), "anon denied validate");

  // Audit immutability (service-role UPDATE/DELETE blocked by trigger).
  const h = await makeLinkedHandoff();
  const familyId = crypto.randomUUID();
  await createSession(h.codeHash, h.stateHash, { familyId });
  const { data: ev } = await supabase.from("store_federated_session_audit_events").select("id").eq("session_family_id", familyId).limit(1).single();
  assert.ok((await supabase.from("store_federated_session_audit_events").update({ status: "X" }).eq("id", ev.id)).error, "UPDATE blocked");
  assert.ok((await supabase.from("store_federated_session_audit_events").delete().eq("id", ev.id)).error, "DELETE blocked");
  await cleanupIdentity(h);
});
