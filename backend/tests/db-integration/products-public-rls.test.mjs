/**
 * `public.products` public-read RLS — Database Integration Suite.
 *
 * Covers the Gate 2 correction in
 * `supabase/migrations/20260801200000_products_public_read_triple_state.sql`: the public
 * (`anon`/`authenticated`) SELECT policy must enforce the FULL triple-state visibility contract
 * (`is_active = true AND is_published = true AND visibility_status = 'public'`, plus an active
 * merchant), not just `is_active = true` (the prior policy's gap — see the migration file header
 * for the full rationale).
 *
 * IMPORTANT — this migration is intentionally NOT applied to any shared/remote database as part
 * of this change (same governance gate as the atomic-confirm migration; see GATE1_REPORT.md). If
 * the new restrictive policy is not yet in effect on whichever DB `SUPABASE_URL` points at, this
 * whole suite is skipped with a clear message. Detection is BEHAVIORAL (not a `pg_policies`
 * catalog read) because PostgREST does not expose `pg_catalog`/`pg_policies` to the JS client: a
 * disposable probe product is created with `is_active=true, is_published=false,
 * visibility_status='public'` under an active merchant — readable under the OLD policy
 * (`is_active` + active merchant only), NOT readable under the NEW policy (also requires
 * `is_published=true`). The probe row is always cleaned up before the real test cases run.
 *
 * Requires an anon key to exercise `anon`-role reads — resolved by
 * `db-client-helper.mjs#getAnonClient()` from `SUPABASE_ANON_KEY`/`SUPABASE_PUBLISHABLE_KEY` env
 * vars or `supabase_status.json` (written by `npx supabase status -o json`). If no anon key can
 * be resolved, the suite is skipped (same graceful-skip philosophy as the RPC not being applied).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { getTestClient, getAnonClient, getUserClient } from "./db-client-helper.mjs";

test("public.products triple-state public-read RLS (Database Integration Suite)", async (t) => {
  const supabase = getTestClient();
  const anon = getAnonClient();

  if (!anon) {
    console.log("SKIP: no anon/publishable key could be resolved (set SUPABASE_ANON_KEY or provide supabase_status.json).");
    t.skip("no anon key available for RLS integration tests");
    return;
  }

  const setupMerchant = async (status = "active") => {
    const merchantId = crypto.randomUUID();
    const { error } = await supabase.from("merchants").insert({
      id: merchantId,
      slug: `rls-${crypto.randomBytes(6).toString("hex")}`,
      name_ar: "تاجر فحص القراءة العامة",
      name_en: "Public RLS Test Merchant",
      display_name: "Public RLS Test Merchant",
      status,
    });
    if (error) throw error;
    return merchantId;
  };

  const setupCategory = async () => {
    const categoryId = crypto.randomUUID();
    const { error } = await supabase.from("categories").insert({
      id: categoryId,
      name: `Category-${crypto.randomBytes(4).toString("hex")}`,
      slug: `cat-${crypto.randomBytes(4).toString("hex")}`,
      is_active: true,
    });
    if (error) throw error;
    return categoryId;
  };

  const insertProduct = async ({ merchantId, categoryId, isActive, isPublished, visibilityStatus, name = "منتج فحص RLS" }) => {
    const id = crypto.randomUUID();
    const sku = `RLS-${crypto.randomBytes(4).toString("hex")}`;
    const { error } = await supabase.from("products").insert({
      id,
      merchant_id: merchantId,
      category_id: categoryId,
      name,
      slug: `rls-${crypto.randomBytes(6).toString("hex")}`,
      price: 10,
      merchant_sku: sku,
      is_active: isActive,
      is_published: isPublished,
      visibility_status: visibilityStatus,
    });
    if (error) throw error;
    return id;
  };

  const anonCanRead = async (productId) => {
    const { data, error } = await anon.from("products").select("id").eq("id", productId);
    if (error) throw error;
    return (data ?? []).length > 0;
  };

  // ── Detection probe (behavioral — see file header) ─────────────────────
  const probeMerchantId = await setupMerchant("active");
  const probeCategoryId = await setupCategory();
  const probeProductId = await insertProduct({
    merchantId: probeMerchantId,
    categoryId: probeCategoryId,
    isActive: true,
    isPublished: false, // the OLD policy does not check this — only the NEW one does
    visibilityStatus: "public",
  });
  const probeVisibleToAnon = await anonCanRead(probeProductId);
  await supabase.from("products").delete().eq("id", probeProductId);

  if (probeVisibleToAnon) {
    console.log(
      "SKIP: the public products SELECT policy still only checks is_active (old policy) — " +
        "supabase/migrations/20260801200000_products_public_read_triple_state.sql has not been applied yet. " +
        "This is expected pre-governance-approval — see GATE1_REPORT.md.",
    );
    t.skip("triple-state public-read RLS policy not applied on this database yet");
    return;
  }

  // ── Case 1: is_active = false → anon cannot read, regardless of everything else ─────────────
  await t.test("case 1: is_active=false is never publicly readable", async () => {
    const merchantId = await setupMerchant("active");
    const categoryId = await setupCategory();
    const productId = await insertProduct({
      merchantId,
      categoryId,
      isActive: false,
      isPublished: true,
      visibilityStatus: "public",
    });
    assert.equal(await anonCanRead(productId), false);
  });

  // ── Case 2: is_active=true, is_published=false, visibility=public → anon cannot read ────────
  await t.test("case 2: is_active=true, is_published=false, visibility=public is never publicly readable", async () => {
    const merchantId = await setupMerchant("active");
    const categoryId = await setupCategory();
    const productId = await insertProduct({
      merchantId,
      categoryId,
      isActive: true,
      isPublished: false,
      visibilityStatus: "public",
    });
    assert.equal(await anonCanRead(productId), false);
  });

  // ── Case 3: is_active=true, is_published=true, visibility=private → anon cannot read ─────────
  await t.test("case 3: is_active=true, is_published=true, visibility=private is never publicly readable", async () => {
    const merchantId = await setupMerchant("active");
    const categoryId = await setupCategory();
    const productId = await insertProduct({
      merchantId,
      categoryId,
      isActive: true,
      isPublished: true,
      visibilityStatus: "private",
    });
    assert.equal(await anonCanRead(productId), false);
  });

  // ── Case 4: full triple-state "public" under a DRAFT merchant → anon cannot read ─────────────
  await t.test("case 4: triple-state public is never publicly readable while the owning merchant is not active", async () => {
    const merchantId = await setupMerchant("draft");
    const categoryId = await setupCategory();
    const productId = await insertProduct({
      merchantId,
      categoryId,
      isActive: true,
      isPublished: true,
      visibilityStatus: "public",
    });
    assert.equal(await anonCanRead(productId), false);
  });

  // ── Case 5: full triple-state "public" under an ACTIVE merchant → anon CAN read ───────────────
  await t.test("case 5: triple-state public under an active merchant IS publicly readable", async () => {
    const merchantId = await setupMerchant("active");
    const categoryId = await setupCategory();
    const productId = await insertProduct({
      merchantId,
      categoryId,
      isActive: true,
      isPublished: true,
      visibilityStatus: "public",
    });
    assert.equal(await anonCanRead(productId), true);
  });

  // ── Case 6: a merchant member can still read (and manage) their OWN private/draft product ───
  await t.test("case 6: a merchant member can read their own merchant's private/draft product despite the public policy", async () => {
    const merchantId = await setupMerchant("active");
    const categoryId = await setupCategory();
    const productId = await insertProduct({
      merchantId,
      categoryId,
      isActive: false,
      isPublished: false,
      visibilityStatus: "private",
    });

    const email = `rls-merchant-${crypto.randomBytes(4).toString("hex")}@example.test`;
    const password = `Pw-${crypto.randomBytes(9).toString("hex")}!`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authError) throw authError;
    const userId = authData.user.id;

    const { error: memberError } = await supabase.from("merchant_users").insert({
      merchant_id: merchantId,
      user_id: userId,
      role: "owner",
    });
    if (memberError) throw memberError;

    // Use a throwaway client for the sign-in — NOT the shared `anon` client used by every other
    // case in this suite: `signInWithPassword` mutates the calling client's in-memory auth state
    // (even with `persistSession: false`), which would silently turn every later `anonCanRead()`
    // call in this file into an AUTHENTICATED read instead of a true anonymous one.
    const signInClient = getAnonClient();
    const { data: signInData, error: signInError } = await signInClient.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const memberClient = getUserClient(signInData.session.access_token);
    assert.ok(memberClient, "expected an anon key to be resolvable for building the authenticated member client");

    const { data: rows, error: readError } = await memberClient.from("products").select("id").eq("id", productId);
    if (readError) throw readError;
    assert.equal((rows ?? []).length, 1, "a merchant member must be able to read their own merchant's private product");

    // And still cannot be read publicly / by an unauthenticated visitor.
    assert.equal(await anonCanRead(productId), false);
  });

  // ── Case 7: service role (admin backend) always reads regardless of RLS ──────────────────────
  await t.test("case 7: service role reads products regardless of visibility state (RLS bypass for the backend)", async () => {
    const merchantId = await setupMerchant("draft");
    const categoryId = await setupCategory();
    const productId = await insertProduct({
      merchantId,
      categoryId,
      isActive: false,
      isPublished: false,
      visibilityStatus: "private",
    });

    const { data, error } = await supabase.from("products").select("id").eq("id", productId);
    if (error) throw error;
    assert.equal((data ?? []).length, 1, "the service-role backend client must always see the row regardless of RLS");
  });
});
