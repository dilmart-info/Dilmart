/**
 * STORE-PR3 — Atomic prepare finalization + audit immutability (task B4/B5/B6/B8).
 * finalize_customer_handoff persists link + handoff + PREPARED audit in ONE transaction, uses DB-clock
 * expiry, preserves linked_at, persists the correct link metadata, and rolls back on any failure.
 * Runs against the clean local Supabase replay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

const supabase = getTestClient();
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

async function makeCustomer() {
  const email = `fin-${crypto.randomBytes(8).toString("hex")}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomBytes(20).toString("base64url") });
  assert.equal(error, null, error?.message);
  return data.user.id;
}

function params(over = {}) {
  return {
    p_DilMart_user_id: over.DilMartUserId ?? crypto.randomUUID(),
    p_store_customer_id: over.storeCustomerId ?? null,
    p_identity_outcome: over.identityOutcome ?? "LINKED",
    p_link_method: over.linkMethod ?? "NEW_FEDERATED",
    p_link_status: over.linkStatus ?? "LINKED",
    p_identity_assurance: over.identityAssurance ?? "DilMart_SESSION",
    p_reuse_existing: over.reuseExisting ?? false,
    p_conflict_reason: over.conflictReason ?? null,
    p_code_hash: over.codeHash ?? sha256(crypto.randomUUID()),
    p_state_hash: over.stateHash ?? sha256(crypto.randomUUID()),
    p_assertion_jti: over.jti ?? `jti-${crypto.randomUUID()}`,
    p_target_path: "/product/x",
    p_source_surface: "customer_home_gateway",
    p_campaign: over.campaign ?? null,
    p_code_ttl_seconds: over.ttl ?? 120,
    p_kid: "main-current",
    p_email: over.email ?? null,
    p_phone_verified_at: over.phoneVerifiedAt ?? null,
    p_email_verified_at: over.emailVerifiedAt ?? null,
    p_request_id: over.requestId ?? crypto.randomUUID(),
  };
}
const finalize = (p) => supabase.rpc("finalize_customer_handoff", p);

test("NEW_FEDERATED: link + handoff + PREPARED audit persisted atomically with correct metadata", async () => {
  const DilMartUserId = crypto.randomUUID();
  const custId = await makeCustomer();
  const { data, error } = await finalize(params({ DilMartUserId, storeCustomerId: custId, linkMethod: "NEW_FEDERATED", identityAssurance: "DilMart_SESSION" }));
  assert.equal(error, null, error?.message);
  const row = data[0];
  assert.equal(row.status, "OK");
  assert.ok(row.handoff_id && row.expires_at && row.linked_profile_id);

  const { data: link } = await supabase.from("store_linked_profiles").select("*").eq("DilMart_user_id", DilMartUserId).single();
  assert.equal(link.link_method, "NEW_FEDERATED");
  assert.equal(link.identity_assurance, "DilMart_SESSION");
  assert.equal(link.link_status, "LINKED");
  assert.equal(link.store_customer_id, custId);
  assert.ok(link.linked_at && link.last_handoff_at);

  const { data: handoff } = await supabase.from("DilMart_customer_handoffs").select("status, identity_outcome, linked_profile_id").eq("id", row.handoff_id).single();
  assert.equal(handoff.status, "PENDING");
  assert.equal(handoff.linked_profile_id, row.linked_profile_id);

  const { data: audit } = await supabase.from("DilMart_customer_handoff_audit_events").select("event_type, metadata").eq("handoff_id", row.handoff_id);
  assert.ok(audit.some((a) => a.event_type === "HANDOFF_PREPARED"), "PREPARED audit written atomically");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", row.handoff_id);
  await supabase.from("store_linked_profiles").delete().eq("id", row.linked_profile_id);
  await supabase.auth.admin.deleteUser(custId);
});

test("VERIFIED_PHONE / VERIFIED_EMAIL persist the correct link metadata", async () => {
  for (const [method, assurance] of [["VERIFIED_PHONE", "OTP_PHONE"], ["VERIFIED_EMAIL", "OTP_EMAIL"]]) {
    const DilMartUserId = crypto.randomUUID();
    const custId = await makeCustomer();
    const { data } = await finalize(params({ DilMartUserId, storeCustomerId: custId, linkMethod: method, identityAssurance: assurance }));
    const { data: link } = await supabase.from("store_linked_profiles").select("link_method, identity_assurance").eq("DilMart_user_id", DilMartUserId).single();
    assert.equal(link.link_method, method);
    assert.equal(link.identity_assurance, assurance);
    await supabase.from("DilMart_customer_handoffs").delete().eq("id", data[0].handoff_id);
    await supabase.from("store_linked_profiles").delete().eq("id", data[0].linked_profile_id);
    await supabase.auth.admin.deleteUser(custId);
  }
});

test("linked_at is preserved across handoffs; last_handoff_at advances", async () => {
  const DilMartUserId = crypto.randomUUID();
  const custId = await makeCustomer();
  const first = await finalize(params({ DilMartUserId, storeCustomerId: custId }));
  const { data: l1 } = await supabase.from("store_linked_profiles").select("linked_at, last_handoff_at").eq("DilMart_user_id", DilMartUserId).single();
  // Second handoff, reusing the existing link.
  const second = await finalize(params({ DilMartUserId, storeCustomerId: custId, reuseExisting: true, linkMethod: "EXISTING_LINK" }));
  const { data: l2 } = await supabase.from("store_linked_profiles").select("linked_at, last_handoff_at").eq("DilMart_user_id", DilMartUserId).single();
  assert.equal(new Date(l2.linked_at).toISOString(), new Date(l1.linked_at).toISOString(), "linked_at is preserved (first link time)");
  assert.ok(new Date(l2.last_handoff_at) >= new Date(l1.last_handoff_at), "last_handoff_at advances");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", first.data[0].handoff_id);
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", second.data[0].handoff_id);
  await supabase.from("store_linked_profiles").delete().eq("DilMart_user_id", DilMartUserId);
  await supabase.auth.admin.deleteUser(custId);
});

test("B6: expires_at is derived from the DATABASE clock (~120s), independent of the app clock", async () => {
  const custId = await makeCustomer();
  const { data } = await finalize(params({ storeCustomerId: custId }));
  const { data: nowRow } = await supabase.rpc("redeem_customer_handoff", { p_code_hash: sha256("nope"), p_state_hash: sha256("nope") }); // harmless call
  void nowRow;
  const { data: hr } = await supabase.from("DilMart_customer_handoffs").select("expires_at, created_at").eq("id", data[0].handoff_id).single();
  const deltaSec = (new Date(hr.expires_at) - new Date(hr.created_at)) / 1000;
  assert.ok(deltaSec > 110 && deltaSec < 130, `expires_at is ~120s after created_at (got ${deltaSec}s)`);
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", data[0].handoff_id);
  await supabase.from("store_linked_profiles").delete().eq("id", data[0].linked_profile_id);
  await supabase.auth.admin.deleteUser(custId);
});

test("atomic rollback: a duplicate assertion_jti inserts NO partial handoff/audit", async () => {
  const custId = await makeCustomer();
  const jti = `jti-${crypto.randomUUID()}`;
  const first = await finalize(params({ storeCustomerId: custId, jti }));
  assert.equal(first.data[0].status, "OK");
  // Second finalize with the SAME jti (new user/code) must fail-map and write nothing new.
  const dupUser = crypto.randomUUID();
  const dup = await finalize(params({ DilMartUserId: dupUser, storeCustomerId: await makeCustomer(), jti }));
  assert.equal(dup.data[0].status, "ERROR");
  assert.equal(dup.data[0].error_code, "HANDOFF_INVALID");
  assert.equal(dup.data[0].handoff_id, null, "no handoff row created on the failed finalize");
  // Scoped (parallel-safe): exactly one handoff for the jti; the dup created no link and no audit.
  const { count: jtiHandoffs } = await supabase.from("DilMart_customer_handoffs").select("id", { count: "exact", head: true }).eq("assertion_jti", jti);
  assert.equal(jtiHandoffs, 1, "only the first handoff exists for the jti");
  const { count: dupLinks } = await supabase.from("store_linked_profiles").select("id", { count: "exact", head: true }).eq("DilMart_user_id", dupUser);
  assert.equal(dupLinks ?? 0, 0, "the rolled-back finalize created no link");
  const { count: firstAudit } = await supabase.from("DilMart_customer_handoff_audit_events").select("id", { count: "exact", head: true }).eq("handoff_id", first.data[0].handoff_id);
  assert.equal(firstAudit, 1, "only the first PREPARED audit exists (dup rolled back)");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", first.data[0].handoff_id);
});

test("B3: finalize enforces EXACTLY 120s ttl (119/121/600 rejected, 120 accepted)", async () => {
  const custId = await makeCustomer();
  for (const bad of [119, 121, 600, 60]) {
    const { data, error } = await finalize(params({ storeCustomerId: custId, ttl: bad }));
    // A hard RAISE surfaces as an rpc error (not a returned row).
    assert.ok(error || (data && data[0] && data[0].status === "ERROR"), `ttl ${bad} must be rejected`);
  }
  const ok = await finalize(params({ storeCustomerId: custId, ttl: 120 }));
  assert.equal(ok.error, null);
  assert.equal(ok.data[0].status, "OK");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", ok.data[0].handoff_id);
  await supabase.from("store_linked_profiles").delete().eq("id", ok.data[0].linked_profile_id);
  await supabase.auth.admin.deleteUser(custId);
});

test("B8: the PREPARED audit request_id equals the request id passed to finalize", async () => {
  const custId = await makeCustomer();
  const reqId = crypto.randomUUID();
  const { data } = await finalize(params({ storeCustomerId: custId, requestId: reqId }));
  const { data: ev } = await supabase.from("DilMart_customer_handoff_audit_events").select("request_id").eq("handoff_id", data[0].handoff_id).eq("event_type", "HANDOFF_PREPARED").single();
  assert.equal(ev.request_id, reqId, "audit request_id matches the API request id");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", data[0].handoff_id);
  await supabase.from("store_linked_profiles").delete().eq("id", data[0].linked_profile_id);
  await supabase.auth.admin.deleteUser(custId);
});

test("C3: a Customer BLOCKED finalize leaves a complete Barber row byte-for-byte unchanged", async () => {
  const DilMartUserId = crypto.randomUUID();
  const cust = await makeCustomer();
  const barberCust = await makeCustomer();
  // Seed a fully-populated Barber/OWNER link.
  const seed = {
    DilMart_user_id: DilMartUserId, DilMart_role: "OWNER", segment: "DilMart_APP_BARBER_OWNER", source_app: "barber_app",
    store_customer_id: barberCust, link_status: "LINKED", link_method: "EXISTING_LINK", identity_assurance: "DilMart_SESSION",
    conflict_reason: "seed-reason", linked_at: "2026-08-01T00:00:00Z", last_handoff_at: "2026-08-01T00:00:00Z",
  };
  const { data: barber } = await supabase.from("store_linked_profiles").insert(seed)
    .select("DilMart_role, segment, source_app, store_customer_id, link_status, link_method, identity_assurance, conflict_reason, linked_at, last_handoff_at, updated_at").single();

  // Customer finalize with an explicit BLOCKED outcome must NOT touch the Barber row.
  const res = await finalize(params({ DilMartUserId, storeCustomerId: cust, identityOutcome: "BLOCKED", linkMethod: null, linkStatus: null, identityAssurance: null, conflictReason: "customer_conflict" }));
  assert.equal(res.data[0].status, "OK");
  assert.equal(res.data[0].handoff_id != null, true, "the BLOCKED handoff is created (unattached to the Barber row)");

  const { data: after } = await supabase.from("store_linked_profiles").select("DilMart_role, segment, source_app, store_customer_id, link_status, link_method, identity_assurance, conflict_reason, linked_at, last_handoff_at, updated_at").eq("DilMart_user_id", DilMartUserId).single();
  assert.deepEqual(after, barber, "every Barber field is unchanged");
  // The BLOCKED handoff carries the conflict; it is NOT attached to the Barber linked profile.
  const { data: h } = await supabase.from("DilMart_customer_handoffs").select("status, identity_outcome, linked_profile_id").eq("id", res.data[0].handoff_id).single();
  assert.equal(h.identity_outcome, "BLOCKED");
  assert.equal(h.linked_profile_id, null);

  await supabase.from("DilMart_customer_handoffs").delete().eq("id", res.data[0].handoff_id);
  await supabase.from("store_linked_profiles").delete().eq("DilMart_user_id", DilMartUserId);
  await supabase.auth.admin.deleteUser(cust);
  await supabase.auth.admin.deleteUser(barberCust);
});

test("B2: a revoked/blocked link changed after the resolver → finalize fails closed", async () => {
  const DilMartUserId = crypto.randomUUID();
  const cust = await makeCustomer();
  const { data: link } = await supabase.from("store_linked_profiles")
    .insert({ DilMart_user_id: DilMartUserId, DilMart_role: "CUSTOMER", store_customer_id: cust, segment: "DilMart_APP_CUSTOMER", source_app: "customer_app", link_status: "REVOKED" })
    .select("id").single();
  // Resolver thought it was reusable; finalize rechecks the (now REVOKED) row under lock.
  const res = await finalize(params({ DilMartUserId, storeCustomerId: cust, reuseExisting: true, linkMethod: "EXISTING_LINK" }));
  assert.equal(res.data[0].error_code, "IDENTITY_BLOCKED");
  await supabase.from("store_linked_profiles").delete().eq("id", link.id);
  await supabase.auth.admin.deleteUser(cust);
});

test("B8: audit events cannot be UPDATEd or DELETEd (append-only), even by service-role", async () => {
  const custId = await makeCustomer();
  const { data } = await finalize(params({ storeCustomerId: custId }));
  const { data: ev } = await supabase.from("DilMart_customer_handoff_audit_events").select("id").eq("handoff_id", data[0].handoff_id).limit(1).single();

  const upd = await supabase.from("DilMart_customer_handoff_audit_events").update({ status: "TAMPERED" }).eq("id", ev.id);
  assert.ok(upd.error, "UPDATE on an audit event is rejected");
  const del = await supabase.from("DilMart_customer_handoff_audit_events").delete().eq("id", ev.id);
  assert.ok(del.error, "DELETE on an audit event is rejected");

  await supabase.from("DilMart_customer_handoffs").delete().eq("id", data[0].handoff_id);
  await supabase.from("store_linked_profiles").delete().eq("id", data[0].linked_profile_id);
  await supabase.auth.admin.deleteUser(custId);
});
