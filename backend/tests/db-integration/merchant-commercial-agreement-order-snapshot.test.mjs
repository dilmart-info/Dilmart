/**
 * Persistence-level proof that a later commercial_rules change does not retroactively change what
 * an already-computed order snapshot resolves to.
 *
 * NOT run manually as part of local PR verification in this sandbox — see
 * merchant-commercial-agreement-concurrency.test.mjs in this directory for why (this local
 * workspace's SUPABASE_URL points at Production). It IS run automatically by CI against its own
 * ephemeral Supabase stack.
 *
 * Scope note: a full end-to-end proof would create+persist a real order via the checkout RPC, then
 * re-read its stored `platform_commission_amount` after changing the merchant's agreement. That
 * requires the full checkout fixture set (governorate, category, product, authenticated customer,
 * cart) and is out of scope to author blind in a sandbox with no live schema access — getting a
 * required-column wrong would produce a test that silently never validates anything useful. This
 * test instead proves the same underlying guarantee one level down, against a REAL database
 * (not a mock): `CommercialEngineService.resolveCommercialTerms` — the function whose return value
 * is frozen into an order's financial snapshot at checkout time (see
 * backend/src/modules/finance/order-finance.service.ts computeOrderFinancialSnapshot) — must keep
 * resolving a past `effective_at` to the rate that was active THEN, even after a newer agreement
 * row exists. Combined with the pure-function test in
 * merchant-commercial-agreement-order-finance.test.mjs (which proves computeOrderFinancialSnapshot
 * itself never re-derives from current DB state), this closes the loop without needing to guess at
 * the orders table's full NOT NULL contract.
 */

import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { getTestClient } from "./db-client-helper.mjs";

test("resolveCommercialTerms for a PAST effective_at still returns the rate that was active then, after a newer agreement is added", async () => {
  const supabase = getTestClient();
  const { CommercialEngineService } = await import("../../dist/modules/finance/commercial-engine.service.js");
  const engine = new CommercialEngineService({ client: supabase });

  const merchantId = crypto.randomUUID();
  const { error: merchErr } = await supabase.from("merchants").insert({
    id: merchantId,
    slug: `merch-${crypto.randomBytes(6).toString("hex")}`,
    name_ar: "تاجر فحص اللقطة",
    name_en: "Snapshot Test Merchant",
    display_name: "Snapshot Test Merchant",
    status: "draft",
  });
  if (merchErr) throw merchErr;

  const checkoutTime = new Date(Date.now() - 3600_000).toISOString(); // one hour ago
  const { error: rule12Err } = await supabase.from("commercial_rules").insert({
    id: crypto.randomUUID(),
    name: "Test 12% agreement",
    rule_type: "commission",
    scope_type: "merchant",
    scope_reference_id: merchantId,
    priority: 1000,
    value_type: "percentage",
    value: 12,
    conditions: {},
    is_active: true,
    start_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    end_at: null,
  });
  if (rule12Err) throw rule12Err;

  const resolvedAtCheckoutTime = await engine.resolveCommercialTerms({ merchant_id: merchantId, channel: "web_checkout", effective_at: checkoutTime });
  assert.equal(resolvedAtCheckoutTime.commission_rate, 12, "sanity check before the rate change");

  // commercial_rules.created_by has a FK to profiles(id) — p_actor_id is forwarded into it, so it
  // must be a real profile, not an arbitrary UUID. A real auth user gets one via the profiles
  // trigger, matching the pattern used elsewhere in this suite (see checkout-concurrency.test.mjs).
  const actorEmail = `agreement-snapshot-test-${crypto.randomBytes(6).toString("hex")}@example.com`;
  const { data: actorAuth, error: actorErr } = await supabase.auth.admin.createUser({
    email: actorEmail,
    password: "password123",
    email_confirm: true,
  });
  if (actorErr) throw actorErr;
  const testActorId = actorAuth.user.id;

  // Now the merchant's agreement changes to 14%, effective now.
  const { error: scheduleErr } = await supabase.rpc("admin_schedule_merchant_commercial_agreement", {
    p_merchant_id: merchantId,
    p_effective_from: new Date().toISOString(),
    p_terms: [{ rule_type: "commission", value_type: "percentage", value: 14, conditions: {} }],
    p_actor_id: testActorId,
    p_actor_role: "admin",
    p_replace_pending: false,
  });
  if (scheduleErr) throw scheduleErr;

  // Re-resolving with the SAME past effective_at (as if re-deriving what an already-placed order's
  // snapshot should have been) must still return 12% — the historical instant is unaffected by the
  // later change.
  const reResolvedAtSameCheckoutTime = await engine.resolveCommercialTerms({
    merchant_id: merchantId,
    channel: "web_checkout",
    effective_at: checkoutTime,
  });
  assert.equal(reResolvedAtSameCheckoutTime.commission_rate, 12, "a past instant must never re-resolve to the new rate");

  // And resolving for "now" correctly picks up the new rate — proving the change did take effect,
  // just not retroactively.
  const resolvedNow = await engine.resolveCommercialTerms({ merchant_id: merchantId, channel: "web_checkout" });
  assert.equal(resolvedNow.commission_rate, 14);

  // Cleanup.
  await supabase.from("commercial_rules").delete().eq("scope_type", "merchant").eq("scope_reference_id", merchantId);
  await supabase.from("audit_logs").delete().eq("merchant_id", merchantId);
  await supabase.from("merchants").delete().eq("id", merchantId);
  await supabase.auth.admin.deleteUser(testActorId);
});
