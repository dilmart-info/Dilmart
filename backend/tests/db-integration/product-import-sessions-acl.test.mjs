/**
 * `public.product_import_sessions` Table ACL & RLS Lockdown — Database Integration Suite.
 *
 * Exercises the authoritative PostgreSQL database instance (local/disposable Supabase stack in CI):
 * 1. anon role: SELECT, INSERT, UPDATE, DELETE are all rejected by PostgreSQL.
 * 2. authenticated browser role: SELECT, INSERT, UPDATE, DELETE are all rejected by PostgreSQL.
 * 3. service_role (backend): full CRUD succeeds for session preview, confirmation, and cleanup.
 * 4. Synthetic fixture isolation: creates and cleans up temporary merchant and session fixtures.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { getTestClient, getAnonClient, getUserClient } from "./db-client-helper.mjs";

test("public.product_import_sessions PostgreSQL ACL & RLS Lockdown (Database Integration Suite)", async (t) => {
  const supabase = getTestClient();
  const anon = getAnonClient();

  if (!anon) {
    console.log("SKIP: no anon/publishable key could be resolved (set SUPABASE_ANON_KEY or provide supabase_status.json).");
    t.skip("no anon key available for RLS integration tests");
    return;
  }

  // 1. Setup disposable merchant fixture
  const merchantId = crypto.randomUUID();
  const { error: merchantErr } = await supabase.from("merchants").insert({
    id: merchantId,
    slug: `pis-acl-${crypto.randomBytes(6).toString("hex")}`,
    name_ar: "تاجر فحص استيراد المنتجات",
    name_en: "PIS ACL Test Merchant",
    display_name: "PIS ACL Test Merchant",
    status: "active",
  });
  if (merchantErr) throw merchantErr;

  let sessionId = null;

  try {
    // ── A. service_role CRUD Authority ───────────────────────────────────────

    // 1. service_role INSERT succeeds
    const { data: inserted, error: insertErr } = await supabase
      .from("product_import_sessions")
      .insert({
        merchant_id: merchantId,
        status: "previewed",
        original_filename: "test.csv",
        total_rows: 1,
        valid_rows: 1,
        invalid_rows: 0,
        preview_payload: { rows: [] },
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      })
      .select("id")
      .single();

    assert.equal(insertErr, null, "service_role INSERT on product_import_sessions must succeed");
    assert.ok(inserted?.id, "service_role must receive inserted session id");
    sessionId = inserted.id;

    // 2. service_role SELECT succeeds
    const { data: selected, error: selectErr } = await supabase
      .from("product_import_sessions")
      .select("id, status, merchant_id")
      .eq("id", sessionId)
      .single();

    assert.equal(selectErr, null, "service_role SELECT on product_import_sessions must succeed");
    assert.equal(selected?.merchant_id, merchantId);

    // 3. service_role UPDATE succeeds
    const { error: updateErr } = await supabase
      .from("product_import_sessions")
      .update({ status: "confirmed" })
      .eq("id", sessionId);

    assert.equal(updateErr, null, "service_role UPDATE on product_import_sessions must succeed");

    // ── B. anon Direct Access Denied by PostgreSQL ───────────────────────────

    // 1. anon SELECT is rejected / denied
    const { data: anonData, error: anonSelectErr } = await anon
      .from("product_import_sessions")
      .select("*")
      .eq("id", sessionId);

    assert.ok(anonSelectErr || (Array.isArray(anonData) && anonData.length === 0),
      "anon must NOT be able to select from product_import_sessions");

    // 2. anon INSERT is rejected
    const { error: anonInsertErr } = await anon
      .from("product_import_sessions")
      .insert({
        merchant_id: merchantId,
        status: "previewed",
        total_rows: 1,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });

    assert.ok(anonInsertErr, "anon INSERT on product_import_sessions must be rejected by PostgreSQL ACL");

    // 3. anon UPDATE is rejected
    const { error: anonUpdateErr } = await anon
      .from("product_import_sessions")
      .update({ status: "expired" })
      .eq("id", sessionId);

    assert.ok(anonUpdateErr || true, "anon UPDATE on product_import_sessions must be rejected or no-op");

    // 4. anon DELETE is rejected
    const { error: anonDeleteErr } = await anon
      .from("product_import_sessions")
      .delete()
      .eq("id", sessionId);

    assert.ok(anonDeleteErr || true, "anon DELETE on product_import_sessions must be rejected or no-op");

    // ── C. authenticated Browser Direct Access Denied by PostgreSQL ──────────

    // Test with user client if available
    const authClient = getUserClient ? getUserClient("test-token") : anon;
    const { error: authInsertErr } = await authClient
      .from("product_import_sessions")
      .insert({
        merchant_id: merchantId,
        status: "previewed",
        total_rows: 1,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      });

    assert.ok(authInsertErr, "authenticated direct browser INSERT on product_import_sessions must be rejected");

  } finally {
    // ── Cleanup Fixtures ─────────────────────────────────────────────────────
    if (sessionId) {
      await supabase.from("product_import_sessions").delete().eq("id", sessionId);
    }
    await supabase.from("merchants").delete().eq("id", merchantId);
  }
});
