/**
 * Real-Postgres concurrency proof for admin_schedule_merchant_commercial_term's
 * pg_advisory_xact_lock fix: two concurrent FIRST-TIME saves for the same (merchant_id, rule_type)
 * — where no row exists yet for `FOR UPDATE` to lock — must never both insert an open-ended row.
 *
 * NOT run manually as part of local PR verification in this sandbox: this repo's db-integration
 * suite (`npm run test:db-integration`) connects via SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, and in
 * this local workspace those point at the Production project — running any *-db script here would
 * insert real fixture rows into Production, which is out of bounds. It IS run automatically by CI's
 * "Build, Lint, Test & Guard Baseline" workflow, which provisions its own ephemeral Supabase stack
 * via `supabase db reset` first — that's a real, isolated database, not Production.
 *
 * To run it yourself against a dedicated staging/test project:
 *   SUPABASE_URL=https://<staging-ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node --test backend/tests/db-integration/merchant-commercial-agreement-concurrency.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { getTestClient } from "./db-client-helper.mjs";

test("two concurrent first-time commission saves for the same merchant never both become open-ended", async () => {
  const supabase = getTestClient();

  const merchantId = crypto.randomUUID();
  const { error: merchErr } = await supabase.from("merchants").insert({
    id: merchantId,
    slug: `merch-${crypto.randomBytes(6).toString("hex")}`,
    name_ar: "تاجر فحص التزامن",
    name_en: "Concurrency Test Merchant",
    display_name: "Concurrency Test Merchant",
    status: "draft",
  });
  if (merchErr) throw merchErr;

  // commercial_rules.created_by has a FK to profiles(id) — p_actor_id is forwarded into it, so it
  // must be a real profile, not an arbitrary UUID. A real auth user gets one via the profiles
  // trigger, matching the pattern used elsewhere in this suite (see checkout-concurrency.test.mjs).
  const actorEmail = `agreement-concurrency-test-${crypto.randomBytes(6).toString("hex")}@example.com`;
  const { data: actorAuth, error: actorErr } = await supabase.auth.admin.createUser({
    email: actorEmail,
    password: "password123",
    email_confirm: true,
  });
  if (actorErr) throw actorErr;
  const testActorId = actorAuth.user.id;

  const effectiveFrom = new Date().toISOString();

  const callOnce = (value) =>
    supabase.rpc("admin_schedule_merchant_commercial_agreement", {
      p_merchant_id: merchantId,
      p_effective_from: effectiveFrom,
      p_terms: [{ rule_type: "commission", value_type: "percentage", value, conditions: {} }],
      p_actor_id: testActorId,
      p_actor_role: "admin",
      p_replace_pending: false,
    });

  const [first, second] = await Promise.all([callOnce(12), callOnce(14)]);

  const outcomes = [first, second];
  const succeeded = outcomes.filter((o) => !o.error);
  const failed = outcomes.filter((o) => o.error);

  // Either both raced into a legitimate conflict (acceptable — the lock serialized them and the
  // second one's own internal logic then found a "current" row from the first and still handled
  // it correctly), or exactly one produced a new row and the other's effect is consistent with a
  // strictly serialized second write. What must NEVER happen is described below.
  assert.ok(succeeded.length >= 1, "at least one concurrent save must succeed");

  const { data: activeRows, error: readError } = await supabase
    .from("commercial_rules")
    .select("id,start_at,end_at,is_active")
    .eq("scope_type", "merchant")
    .eq("scope_reference_id", merchantId)
    .eq("rule_type", "commission")
    .eq("is_active", true);
  if (readError) throw readError;

  const openEnded = (activeRows ?? []).filter((r) => r.end_at === null);
  assert.equal(openEnded.length, 1, "exactly one open-ended active commission row must exist — never two overlapping agreements");

  // Cleanup.
  await supabase.from("commercial_rules").delete().eq("scope_type", "merchant").eq("scope_reference_id", merchantId);
  await supabase.from("audit_logs").delete().eq("merchant_id", merchantId);
  await supabase.from("merchants").delete().eq("id", merchantId);
  await supabase.auth.admin.deleteUser(testActorId);
});
