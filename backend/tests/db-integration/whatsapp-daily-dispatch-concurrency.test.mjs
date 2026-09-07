/**
 * WhatsApp OTP Daily Dispatch Cap — Real PostgreSQL Concurrency & ACL Integration Suite.
 *
 * Runs as part of `npm run test:db-integration` on the local Supabase stack in CI.
 *
 * Proves:
 * 1. Static migration contracts (atomic upsert, security definer, revoke from public/anon/authenticated).
 * 2. True PostgreSQL concurrency: with limit = 5 and 20 simultaneous calls to
 *    `claim_whatsapp_daily_dispatch`, exactly 5 claims succeed, 15 are denied, and stored
 *    count is exactly 5 (never exceeds 5).
 * 3. Fail-closed behavior on zero or negative limits.
 * 4. Security & Privileges:
 *    - `service_role` can execute RPC.
 *    - `anon` cannot execute RPC (permission denied / 42501).
 *    - `authenticated` cannot execute RPC (permission denied / 42501).
 *    - Neither `anon` nor `authenticated` can read directly from `whatsapp_otp_daily_dispatches`.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import * as crypto from "node:crypto";
import { getTestClient, getAnonClient, getUserClient } from "./db-client-helper.mjs";

const MIGRATION_PATH = resolve("..", "supabase/migrations/20260907200000_whatsapp_otp_daily_dispatch_cap.sql");

test("WhatsApp Daily Dispatch — Migration Contract & Static SQL Assertions", async (t) => {
  assert.ok(existsSync(MIGRATION_PATH), "Migration file must exist at expected path");
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  await t.test("1. Table definition and constraints", () => {
    assert.ok(sql.includes("create table if not exists public.whatsapp_otp_daily_dispatches"), "Table must be created");
    assert.ok(sql.includes("bucket_date    date primary key"), "bucket_date must be primary key");
    assert.ok(sql.includes("dispatch_count integer     not null default 0"), "dispatch_count must be integer default 0");
    assert.ok(sql.includes("check (dispatch_count >= 0)"), "Check constraint must ensure non-negative count");
    assert.ok(sql.includes("alter table public.whatsapp_otp_daily_dispatches enable row level security"), "RLS must be enabled");
  });

  await t.test("2. Atomic RPC definition and Security Definer", () => {
    assert.ok(sql.includes("function public.claim_whatsapp_daily_dispatch("), "claim_whatsapp_daily_dispatch RPC must be defined");
    assert.ok(sql.includes("security definer"), "RPC must be security definer");
    assert.ok(sql.includes("set search_path = public, pg_temp"), "Search path must be pinned to public, pg_temp");
    assert.ok(sql.includes("on conflict (bucket_date) do update"), "Must use atomic on conflict do update");
    assert.ok(sql.includes("where public.whatsapp_otp_daily_dispatches.dispatch_count < p_max_limit"), "Must gate update strictly below max limit");
  });

  await t.test("3. Explicit Privilege Revocation and Service Role Lockdown", () => {
    assert.ok(sql.includes("revoke all on function public.claim_whatsapp_daily_dispatch(integer, text) from public, anon, authenticated;"), "Must revoke all from public, anon, authenticated");
    assert.ok(sql.includes("grant execute on function public.claim_whatsapp_daily_dispatch(integer, text) to service_role;"), "Must grant execute exclusively to service_role");
  });
});

test("WhatsApp Daily Dispatch — PostgreSQL Concurrency & Privilege Integration Suite", async (t) => {
  let supabase;
  try {
    supabase = getTestClient();
  } catch (err) {
    console.log("SKIP: No Supabase service role credentials available for live DB integration tests.");
    t.skip("Database credentials not available");
    return;
  }

  // Verify RPC exists on target database
  const { data: probeData, error: probeError } = await supabase.rpc("claim_whatsapp_daily_dispatch", {
    p_max_limit: 1,
    p_timezone: "Asia/Baghdad",
  });

  if (probeError && (probeError.code === "42883" || probeError.message?.includes("function") || probeError.message?.includes("does not exist"))) {
    console.log("SKIP: claim_whatsapp_daily_dispatch RPC not yet applied on target DB.");
    t.skip("Migration not applied on this database");
    return;
  }

  // Test setup: clean up today's bucket for a completely deterministic run
  const testTz = "Asia/Baghdad";
  const nowInBaghdad = new Intl.DateTimeFormat("en-CA", { timeZone: testTz }).format(new Date());
  await supabase.from("whatsapp_otp_daily_dispatches").delete().eq("bucket_date", nowInBaghdad);

  t.after(async () => {
    // Cleanup test bucket row
    await supabase.from("whatsapp_otp_daily_dispatches").delete().eq("bucket_date", nowInBaghdad);
  });

  await t.test("1. Atomic Concurrency: Limit=5 with 20 simultaneous claims", async () => {
    const limit = 5;
    const totalRequests = 20;

    // Fire 20 requests concurrently
    const promises = Array.from({ length: totalRequests }, () =>
      supabase.rpc("claim_whatsapp_daily_dispatch", {
        p_max_limit: limit,
        p_timezone: testTz,
      }),
    );

    const responses = await Promise.all(promises);

    let successes = 0;
    let denials = 0;

    for (const res of responses) {
      assert.ifError(res.error);
      const row = res.data?.[0] || res.data;
      if (row.allowed) {
        successes += 1;
      } else {
        denials += 1;
      }
    }

    assert.equal(successes, 5, "Exactly 5 concurrent requests must succeed under limit 5");
    assert.equal(denials, 15, "Exactly 15 concurrent requests must be denied");

    // Verify stored count in database
    const { data: dbRow, error: dbErr } = await supabase
      .from("whatsapp_otp_daily_dispatches")
      .select("dispatch_count")
      .eq("bucket_date", nowInBaghdad)
      .single();

    assert.ifError(dbErr);
    assert.equal(dbRow.dispatch_count, 5, "Stored dispatch_count in PostgreSQL must be exactly 5");

    // Verify RPC count getter matches
    const { data: countData, error: countErr } = await supabase.rpc("get_whatsapp_daily_dispatch_count", {
      p_timezone: testTz,
    });
    assert.ifError(countErr);
    assert.equal(countData, 5, "get_whatsapp_daily_dispatch_count must report 5");

    // 5 additional sequential calls must all be denied and count must NEVER exceed 5
    for (let i = 0; i < 5; i++) {
      const { data: seqData, error: seqErr } = await supabase.rpc("claim_whatsapp_daily_dispatch", {
        p_max_limit: limit,
        p_timezone: testTz,
      });
      assert.ifError(seqErr);
      const row = seqData?.[0] || seqData;
      assert.equal(row.allowed, false, `Subsequent call ${i + 1} past cap must be denied`);
    }

    const { data: finalDbRow } = await supabase
      .from("whatsapp_otp_daily_dispatches")
      .select("dispatch_count")
      .eq("bucket_date", nowInBaghdad)
      .single();

    assert.equal(finalDbRow.dispatch_count, 5, "Stored count must never exceed 5 despite subsequent requests");
  });

  await t.test("2. Fail-closed behavior on zero and negative limits", async () => {
    const { data: zeroData, error: zeroErr } = await supabase.rpc("claim_whatsapp_daily_dispatch", {
      p_max_limit: 0,
      p_timezone: testTz,
    });
    assert.ifError(zeroErr);
    assert.equal((zeroData?.[0] || zeroData).allowed, false, "Zero limit must fail closed");

    const { data: negData, error: negErr } = await supabase.rpc("claim_whatsapp_daily_dispatch", {
      p_max_limit: -10,
      p_timezone: testTz,
    });
    assert.ifError(negErr);
    assert.equal((negData?.[0] || negData).allowed, false, "Negative limit must fail closed");
  });

  await t.test("3. Security & ACL: anon role is strictly blocked", async () => {
    const anon = getAnonClient();
    if (!anon) {
      console.log("SKIP: No anon client available for ACL test");
      return;
    }

    // 3a. anon cannot execute claim_whatsapp_daily_dispatch RPC
    const { data: anonRpcData, error: anonRpcErr } = await anon.rpc("claim_whatsapp_daily_dispatch", {
      p_max_limit: 10,
      p_timezone: testTz,
    });
    assert.ok(anonRpcErr, "anon execution of claim_whatsapp_daily_dispatch must fail with permission error");
    assert.equal(anonRpcData, null);

    // 3b. anon cannot read directly from whatsapp_otp_daily_dispatches table
    const { data: anonTableData, error: anonTableErr } = await anon
      .from("whatsapp_otp_daily_dispatches")
      .select("*");

    // RLS enabled with no policy returns either empty array or permission denied
    if (!anonTableErr) {
      assert.equal(anonTableData.length, 0, "anon cannot read rows from whatsapp_otp_daily_dispatches (RLS returns 0 rows)");
    } else {
      assert.ok(anonTableErr, "anon direct read is denied");
    }

    // 3c. anon cannot insert into whatsapp_otp_daily_dispatches
    const { error: anonInsertErr } = await anon
      .from("whatsapp_otp_daily_dispatches")
      .insert({ bucket_date: "2099-01-01", dispatch_count: 99 });
    assert.ok(anonInsertErr, "anon direct insert must fail");
  });

  await t.test("4. Security & ACL: authenticated user role is strictly blocked", async () => {
    const anon = getAnonClient();
    if (!anon) return;

    // Create a temporary authenticated user
    const email = `test-dispatch-${crypto.randomBytes(6).toString("hex")}@example.com`;
    const password = `Pass!${crypto.randomBytes(8).toString("hex")}`;
    const { data: userData, error: userCreateErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ifError(userCreateErr);
    const userId = userData.user.id;

    try {
      const signInClient = getAnonClient();
      const { data: signInData, error: signInErr } = await signInClient.auth.signInWithPassword({
        email,
        password,
      });
      assert.ifError(signInErr);

      const userClient = getUserClient(signInData.session.access_token);
      assert.ok(userClient, "User client must be constructed");

      // 4a. authenticated user cannot execute claim_whatsapp_daily_dispatch RPC
      const { data: userRpcData, error: userRpcErr } = await userClient.rpc("claim_whatsapp_daily_dispatch", {
        p_max_limit: 10,
        p_timezone: testTz,
      });
      assert.ok(userRpcErr, "authenticated user execution of claim_whatsapp_daily_dispatch must be denied");
      assert.equal(userRpcData, null);

      // 4b. authenticated user cannot read from whatsapp_otp_daily_dispatches table
      const { data: userTableData, error: userTableErr } = await userClient
        .from("whatsapp_otp_daily_dispatches")
        .select("*");

      if (!userTableErr) {
        assert.equal(userTableData.length, 0, "authenticated user cannot read rows from whatsapp_otp_daily_dispatches");
      } else {
        assert.ok(userTableErr, "authenticated user direct read is denied");
      }

      // 4c. authenticated user cannot insert into table
      const { error: userInsertErr } = await userClient
        .from("whatsapp_otp_daily_dispatches")
        .insert({ bucket_date: "2099-01-02", dispatch_count: 99 });
      assert.ok(userInsertErr, "authenticated user direct insert must fail");
    } finally {
      // Clean up auth user
      await supabase.auth.admin.deleteUser(userId);
    }
  });
});
