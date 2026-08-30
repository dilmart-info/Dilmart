/**
 * STORE-PR3 — Shadow federated identity ownership + reserved-domain enforcement (task B4). Local Supabase.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient, getAnonClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

const supabase = getTestClient();
const anon = getAnonClient();
const fedId = () => "fed" + crypto.randomBytes(16).toString("hex");
const emailFor = (fid) => `DilMart-federated+${fid}@federated.DilMart.internal`;
const provision = (uuid, fid) => supabase.rpc("provision_DilMart_federated_customer", { p_DilMart_user_id: uuid, p_federated_id: fid });
const resolve = (uuid, email) => supabase.rpc("resolve_DilMart_federated_customer", { p_DilMart_user_id: uuid, p_internal_email: email });

test("1. provisioning creates a shadow customer, is idempotent, and is owner-resolvable", async () => {
  const uuid = crypto.randomUUID();
  const fid = fedId();
  const { data: d1, error } = await provision(uuid, fid);
  assert.equal(error, null, error?.message);
  const custId = d1[0].store_customer_id;
  assert.ok(custId, "customer id returned");
  assert.equal(d1[0].error_code, null);

  const { data: d2 } = await provision(uuid, fid);
  assert.equal(d2[0].store_customer_id, custId, "idempotent — same customer");

  const { data: rid } = await resolve(uuid, emailFor(fid));
  assert.equal(rid, custId, "owner resolves the shadow customer");

  // profiles.id === customer id (valid Store customer).
  const { data: profile } = await supabase.from("profiles").select("id, role").eq("id", custId).maybeSingle();
  assert.ok(profile && profile.role === "customer");
  await supabase.auth.admin.deleteUser(custId);
});

test("2. a foreign DilMart user cannot claim an existing shadow email (collision → IDENTITY_BLOCKED)", async () => {
  const owner = crypto.randomUUID();
  const fid = fedId();
  const { data: d1 } = await provision(owner, fid);
  const custId = d1[0].store_customer_id;

  const { data: d2 } = await provision(crypto.randomUUID(), fid); // different DilMart user, same fed email
  assert.equal(d2[0].store_customer_id, null);
  assert.equal(d2[0].error_code, "IDENTITY_BLOCKED", "foreign claim is blocked");

  const { data: rid } = await resolve(crypto.randomUUID(), emailFor(fid));
  assert.equal(rid, null, "recovery never links a foreign account");
  await supabase.auth.admin.deleteUser(custId);
});

test("3. resolve rejects wrong account_type / missing metadata", async () => {
  // A normal (non-federated) confirmed user — resolve must return null.
  const email = `plain-${crypto.randomBytes(6).toString("hex")}@example.com`;
  const { data } = await supabase.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomBytes(20).toString("base64url") });
  const { data: rid } = await resolve(crypto.randomUUID(), email);
  assert.equal(rid, null);
  await supabase.auth.admin.deleteUser(data.user.id);
});

test("4. public signup / admin arbitrary-email on the reserved domain is rejected at the Auth boundary", async (t) => {
  if (anon) {
    const { error } = await anon.auth.signUp({ email: emailFor(fedId()), password: "Password123!x" });
    assert.ok(error, "public signup on the reserved domain is rejected");
  } else {
    t.diagnostic("no anon key — skipping public-signup leg");
  }
  // Admin create with no federation metadata → trigger rejects.
  const { error: adminErr } = await supabase.auth.admin.createUser({ email: emailFor(fedId()), email_confirm: false, password: crypto.randomBytes(20).toString("base64url") });
  assert.ok(adminErr, "admin arbitrary create on the reserved domain (no metadata) is rejected");
});

test("5. UPDATE of a normal account's email to the reserved domain is rejected", async () => {
  const email = `mover-${crypto.randomBytes(6).toString("hex")}@example.com`;
  const { data } = await supabase.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomBytes(20).toString("base64url") });
  const uid = data.user.id;
  const { error: updErr } = await supabase.auth.admin.updateUserById(uid, { email: emailFor(fedId()) });
  assert.ok(updErr, "changing an account email to the reserved domain is rejected");
  await supabase.auth.admin.deleteUser(uid);
});

test("6. eligibility: a non-customer (admin) profile is NOT a confirmed phone/email candidate", async () => {
  const phone = "96479" + Math.floor(10000000 + Math.random() * 90000000);
  const email = `adminacct-${crypto.randomBytes(6).toString("hex")}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({ phone, email, email_confirm: true, phone_confirm: true, password: crypto.randomBytes(20).toString("base64url") });
  assert.equal(error, null, error?.message);
  const uid = data.user.id;
  await supabase.from("profiles").update({ role: "admin" }).eq("id", uid);
  const { data: byPhone } = await supabase.rpc("find_confirmed_auth_users_by_phone", { p_phone_digits: phone });
  const { data: byEmail } = await supabase.rpc("find_confirmed_auth_users_by_email", { p_email_normalized: email.toLowerCase() });
  assert.ok(!(byPhone ?? []).some((r) => r.store_customer_id === uid), "admin excluded from phone candidates");
  assert.ok(!(byEmail ?? []).some((r) => r.store_customer_id === uid), "admin excluded from email candidates");
  await supabase.auth.admin.deleteUser(uid);
});
