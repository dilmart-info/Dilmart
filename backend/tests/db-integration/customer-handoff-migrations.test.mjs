/**
 * STORE-PR3 — migrations, RLS, permissions & constraints (task "Required PostgreSQL
 * Integration Tests" 1–11). Runs against the clean local Supabase replay.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { getTestClient, getAnonClient } from "./db-client-helper.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as crypto from "crypto";

const supabase = getTestClient();
const anon = getAnonClient();
const sha256 = (s) => crypto.createHash("sha256").update(s, "utf8").digest("hex");

const NEW_TABLES = [
  "DilMart_customer_handoffs",
  "DilMart_customer_handoff_audit_events",
  "store_federated_session_families",
  "store_federated_refresh_tokens",
];

function baseHandoff(over = {}) {
  return {
    code_hash: sha256(crypto.randomUUID()),
    state_hash: sha256(crypto.randomUUID()),
    assertion_jti: `jti-${crypto.randomUUID()}`,
    DilMart_user_id: crypto.randomUUID(),
    target_path: "/product/x",
    source_surface: "customer_home_gateway",
    status: "PENDING",
    identity_outcome: "LINKED",
    expires_at: new Date(Date.now() + 120000).toISOString(),
    ...over,
  };
}

test("service_role can insert a handoff; new tables exist", async () => {
  const { data, error } = await supabase.from("DilMart_customer_handoffs").insert(baseHandoff()).select("id").single();
  assert.equal(error, null, error?.message);
  assert.ok(data.id);
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", data.id);
});

test("RLS: anon cannot read or write the security tables", async (t) => {
  if (!anon) return t.skip("no anon key resolved");
  // Seed a row as service role.
  const { data: seed } = await supabase.from("DilMart_customer_handoffs").insert(baseHandoff()).select("id").single();

  for (const table of NEW_TABLES) {
    const { data: rows } = await anon.from(table).select("*").limit(5);
    assert.equal((rows ?? []).length, 0, `anon must read 0 rows from ${table}`);
  }
  // anon insert must be rejected by RLS.
  const { error: insErr } = await anon.from("DilMart_customer_handoffs").insert(baseHandoff());
  assert.ok(insErr, "anon insert must be blocked by RLS");

  await supabase.from("DilMart_customer_handoffs").delete().eq("id", seed.id);
});

test("assertion_jti is unique", async () => {
  const jti = `jti-${crypto.randomUUID()}`;
  const a = await supabase.from("DilMart_customer_handoffs").insert(baseHandoff({ assertion_jti: jti })).select("id").single();
  assert.equal(a.error, null, a.error?.message);
  const b = await supabase.from("DilMart_customer_handoffs").insert(baseHandoff({ assertion_jti: jti }));
  assert.ok(b.error && b.error.code === "23505", "duplicate assertion_jti rejected");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", a.data.id);
});

test("code_hash is unique", async () => {
  const codeHash = sha256(crypto.randomUUID());
  const a = await supabase.from("DilMart_customer_handoffs").insert(baseHandoff({ code_hash: codeHash })).select("id").single();
  assert.equal(a.error, null, a.error?.message);
  const b = await supabase.from("DilMart_customer_handoffs").insert(baseHandoff({ code_hash: codeHash }));
  assert.ok(b.error && b.error.code === "23505", "duplicate code_hash rejected");
  await supabase.from("DilMart_customer_handoffs").delete().eq("id", a.data.id);
});

test("store_customer_id one-to-one on store_linked_profiles", async () => {
  const email = `m11-${crypto.randomBytes(6).toString("hex")}@example.com`;
  const { data: u } = await supabase.auth.admin.createUser({ email, password: crypto.randomBytes(24).toString("base64url"), email_confirm: true });
  const custId = u.user.id;
  const a = await supabase.from("store_linked_profiles").insert({ DilMart_user_id: crypto.randomUUID(), store_customer_id: custId, segment: "DilMart_APP_CUSTOMER", source_app: "customer_app" }).select("id").single();
  assert.equal(a.error, null, a.error?.message);
  const b = await supabase.from("store_linked_profiles").insert({ DilMart_user_id: crypto.randomUUID(), store_customer_id: custId, segment: "DilMart_APP_CUSTOMER", source_app: "customer_app" });
  assert.ok(b.error && b.error.code === "23505", "a Store customer cannot link to two DilMart users");
  await supabase.from("store_linked_profiles").delete().eq("id", a.data.id);
  await supabase.auth.admin.deleteUser(custId);
});

test("SECURITY DEFINER functions pin search_path = pg_catalog, public (static)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const migDir = join(here, "../../../supabase/migrations");
  const file = readdirSync(migDir).find((f) => f.endsWith("_customer_handoff_functions.sql"));
  assert.ok(file, "functions migration present");
  const sql = readFileSync(join(migDir, file), "utf8");
  const definers = sql.match(/SECURITY DEFINER/g) ?? [];
  const pinned = sql.match(/SET search_path = pg_catalog, public/g) ?? [];
  assert.ok(definers.length >= 4, "expected >=4 SECURITY DEFINER functions");
  assert.equal(pinned.length, definers.length, "every SECURITY DEFINER function pins the hardened search_path");
  // and each is revoked from PUBLIC/anon/authenticated + granted to service_role.
  assert.ok(/REVOKE ALL ON FUNCTION public\.redeem_customer_handoff.*FROM PUBLIC/s.test(sql));
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.redeem_customer_handoff.*TO service_role/s.test(sql));
});

test("finalize RPC is SECURITY DEFINER with a hardened search_path (static)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const migDir = join(here, "../../../supabase/migrations");
  const file = readdirSync(migDir).find((f) => f.endsWith("_customer_handoff_finalize_and_guards.sql"));
  assert.ok(file, "finalize/guards migration present");
  const sql = readFileSync(join(migDir, file), "utf8");
  assert.ok(/CREATE OR REPLACE FUNCTION public\.finalize_customer_handoff[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = pg_catalog, public/.test(sql), "finalize is SECURITY DEFINER + pinned search_path");
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.finalize_customer_handoff[\s\S]*?TO service_role/.test(sql), "finalize granted to service_role");
  assert.ok(/BEFORE UPDATE OR DELETE ON public\.DilMart_customer_handoff_audit_events/.test(sql), "audit immutability trigger present");
});

test("PR3/PR4 boundary: the session foundation tables carry NO rows and no redeem-and-issue RPC exists", async () => {
  const { count: fam } = await supabase.from("store_federated_session_families").select("id", { count: "exact", head: true });
  const { count: refresh } = await supabase.from("store_federated_refresh_tokens").select("id", { count: "exact", head: true });
  assert.equal(fam ?? 0, 0, "PR3 issues no session families");
  assert.equal(refresh ?? 0, 0, "PR3 inserts no refresh-token rows");
  // The atomic redeem-and-issue RPC is intentionally NOT present in PR3 (final issuance is STORE-PR4).
  const { error } = await supabase.rpc("redeem_and_issue_customer_handoff", { p_code_hash: sha256("x"), p_state_hash: sha256("y"), p_device_hash: "d" });
  assert.ok(error, "redeem_and_issue_customer_handoff must not exist in PR3");
});

test("anon is DENIED EXECUTE (permission error, not signature mismatch) on redeem + finalize RPCs", async (t) => {
  if (!anon) return t.skip("no anon key resolved");
  // 42501 = insufficient_privilege. We assert the error is a genuine permission denial, so the test cannot
  // pass merely because a parameter was omitted or the function signature was not found (PGRST202).
  const isPermissionDenied = (err) =>
    !!err && (err.code === "42501" || /permission denied/i.test(err.message ?? "") || /permission denied/i.test(err.details ?? ""));

  const r1 = await anon.rpc("redeem_customer_handoff", { p_code_hash: sha256("x"), p_state_hash: sha256("y") });
  assert.ok(isPermissionDenied(r1.error), `redeem denial must be a permission error, got ${JSON.stringify(r1.error)}`);

  // Complete current 20-parameter signature (including p_request_id) so PostgREST resolves the function and
  // the failure is EXECUTE privilege denial.
  const r2 = await anon.rpc("finalize_customer_handoff", {
    p_DilMart_user_id: crypto.randomUUID(), p_store_customer_id: null, p_identity_outcome: "LINK_REQUIRED",
    p_link_method: null, p_link_status: null, p_identity_assurance: null, p_reuse_existing: false,
    p_conflict_reason: "x", p_code_hash: sha256("a"), p_state_hash: sha256("b"), p_assertion_jti: "j",
    p_target_path: "/", p_source_surface: "s", p_campaign: null, p_code_ttl_seconds: 120, p_kid: "k",
    p_email: null, p_phone_verified_at: null, p_email_verified_at: null, p_request_id: crypto.randomUUID(),
  });
  assert.ok(isPermissionDenied(r2.error), `finalize denial must be a permission error, got ${JSON.stringify(r2.error)}`);
});
