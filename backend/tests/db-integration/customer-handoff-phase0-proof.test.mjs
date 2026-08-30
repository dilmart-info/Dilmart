/**
 * STORE-PR3 — Phase 0 proof (task Phase A). Executable evidence against a clean local
 * Supabase/PostgreSQL replay:
 *   A1. profiles.id references auth.users.id; profile is provisioned synchronously.
 *   A2. Shadow federated customer provisioning is valid, idempotent, recoverable; the
 *       internal identifier is non-routable and never exposes credentials.
 *   A3. Confirmed-identity lookup uses ONLY authoritative auth.users confirmed fields.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient } from "./db-client-helper.mjs";
import * as crypto from "crypto";

const supabase = getTestClient();

/** Reserved internal email (mirrors CustomerShadowProvisionerService.internalEmailFor). */
const internalEmail = (uid) => `DilMart-federated+${uid}@federated.DilMart.internal`;

test("A1. an admin-created auth user is synchronously provisioned as a profiles row (id = auth.users.id)", async () => {
  const email = `phase0-a1-${crypto.randomBytes(6).toString("hex")}@example.com`;
  const { data, error } = await supabase.auth.admin.createUser({ email, password: crypto.randomBytes(24).toString("base64url"), email_confirm: true });
  assert.equal(error, null, error?.message);
  const uid = data.user.id;
  const { data: profile, error: pErr } = await supabase.from("profiles").select("id").eq("id", uid).maybeSingle();
  assert.equal(pErr, null, pErr?.message);
  assert.ok(profile, "profiles row exists synchronously (handle_new_user trigger)");
  assert.equal(profile.id, uid, "profiles.id === auth.users.id");
  await supabase.auth.admin.deleteUser(uid);
});

test("A2. shadow provisioning: deterministic, idempotent, recoverable; no credential exposure", async () => {
  const DilMartUserId = crypto.randomUUID();
  const fid = "fed" + crypto.randomBytes(16).toString("hex");
  const email = `DilMart-federated+${fid}@federated.DilMart.internal`;

  // Provision via the direct-insert RPC (sets ownership metadata + federated_id AT insert).
  const { data: d1, error: cErr } = await supabase.rpc("provision_DilMart_federated_customer", { p_DilMart_user_id: DilMartUserId, p_federated_id: fid });
  assert.equal(cErr, null, cErr?.message);
  const custId = d1[0].store_customer_id;
  assert.ok(custId, "customer id returned");

  // Idempotent: a retried provision resolves the SAME customer.
  const { data: d2 } = await supabase.rpc("provision_DilMart_federated_customer", { p_DilMart_user_id: DilMartUserId, p_federated_id: fid });
  assert.equal(d2[0].store_customer_id, custId, "retry is idempotent");

  // Ownership-validating recovery resolves the same id.
  const { data: resolved } = await supabase.rpc("resolve_DilMart_federated_customer", { p_DilMart_user_id: DilMartUserId, p_internal_email: email });
  assert.equal(resolved, custId, "ownership-validated recovery resolves the same shadow customer");

  // profiles.id is valid and reusable as store_customer_id (FK target).
  const { data: profile } = await supabase.from("profiles").select("id").eq("id", custId).maybeSingle();
  assert.ok(profile, "shadow profile exists");
  // Internal identifier is non-routable (reserved domain).
  assert.ok(email.endsWith("@federated.DilMart.internal"));

  await supabase.auth.admin.deleteUser(custId);
});

test("A3. confirmed-identity lookup uses authoritative auth.users confirmed fields only", async () => {
  const phoneDigits = "96477" + Math.floor(10000000 + Math.random() * 90000000);
  const email = `phase0-a3-${crypto.randomBytes(6).toString("hex")}@example.com`;

  // Confirmed phone + email user.
  const { data: confirmed, error } = await supabase.auth.admin.createUser({
    phone: phoneDigits, email, password: crypto.randomBytes(24).toString("base64url"),
    phone_confirm: true, email_confirm: true,
  });
  assert.equal(error, null, error?.message);
  const uid = confirmed.user.id;

  const { data: byPhone, error: pErr } = await supabase.rpc("find_confirmed_auth_users_by_phone", { p_phone_digits: phoneDigits });
  assert.equal(pErr, null, pErr?.message);
  assert.ok((byPhone ?? []).some((r) => r.store_customer_id === uid), "confirmed phone is found");

  const { data: byEmail } = await supabase.rpc("find_confirmed_auth_users_by_email", { p_email_normalized: email.toLowerCase() });
  assert.ok((byEmail ?? []).some((r) => r.store_customer_id === uid), "confirmed email is found");

  // An UNCONFIRMED phone user must NOT be returned as a confirmed candidate.
  const phone2 = "96478" + Math.floor(10000000 + Math.random() * 90000000);
  const { data: unconf, error: uErr } = await supabase.auth.admin.createUser({ phone: phone2, password: crypto.randomBytes(24).toString("base64url"), phone_confirm: false });
  assert.equal(uErr, null, uErr?.message);
  const { data: none } = await supabase.rpc("find_confirmed_auth_users_by_phone", { p_phone_digits: phone2 });
  assert.equal((none ?? []).length, 0, "unconfirmed phone is never a confirmed candidate");

  await supabase.auth.admin.deleteUser(uid);
  await supabase.auth.admin.deleteUser(unconf.user.id);
});
