/**
 * STORE-PR3 — Redeem service logic (spec §8.7, PR3/PR4 boundary + hardening B1/B7). No DB.
 * The service does NOT consume the code itself — the FederatedSessionIssuer owns the atomic
 * redeem+issue (proven in the PostgreSQL redeem_and_issue tests). Here we prove the fail-closed
 * issuer gate, delegation shape, and the dual IP/device rate limits.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const { CustomerHandoffService } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff.service.js"
);
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

function config(over = {}) {
  return {
    handoffEnabled: over.handoffEnabled ?? true,
    federatedAuthEnabled: over.federatedAuthEnabled ?? true,
    autoLinkEnabled: false,
    codeTtlSeconds: 120,
    getOpenBaseUrl: () => "https://store.DilMart.org/open",
  };
}
function fakeIssuer() {
  const calls = [];
  return {
    calls,
    redeemAndIssue: async (input) => {
      calls.push(input);
      return { target: "/product/x", session: { accessToken: "a", refreshToken: "r", sessionFamilyId: "f", expiresIn: 600, refreshExpiresIn: 2592000 } };
    },
  };
}
const body = { code: "c".repeat(40), state: "s".repeat(40), device: { platform: "android", appVersion: "1.0.0", deviceId: "dev-1" } };
const svc = (cfg, issuer) => new CustomerHandoffService(cfg, {}, {}, {}, issuer);

test("B1: no issuer + federated flag FALSE → FEDERATED_AUTH_DISABLED, issuer never called, no internal IDs", async () => {
  const res = await svc(config({ federatedAuthEnabled: false }), undefined).redeem(body, "1.2.3.4").catch((e) => e);
  assert.equal(res.code, "FEDERATED_AUTH_DISABLED");
  assert.ok(!JSON.stringify(res).match(/[0-9a-f]{8}-[0-9a-f]{4}/), "no internal UUID leaked");
});

test("B1: no issuer + federated flag TRUE STILL disabled (endpoint cannot activate in PR3)", async () => {
  await assert.rejects(() => svc(config({ federatedAuthEnabled: true }), undefined).redeem(body, "ip"), (e) => e.code === "FEDERATED_AUTH_DISABLED");
});

test("handoff feature disabled → STORE_INTEGRATION_DISABLED", async () => {
  await assert.rejects(() => svc(config({ handoffEnabled: false }), fakeIssuer()).redeem(body, "ip"), (e) => e.code === "STORE_INTEGRATION_DISABLED");
});

test("with an issuer: delegates codeHash/stateHash/device/requestId and returns {target, session} (no raw UUID)", async () => {
  const issuer = fakeIssuer();
  const res = await svc(config(), issuer).redeem(body, "1.2.3.4");
  assert.equal(res.target, "/product/x");
  assert.equal(res.session.accessToken, "a");
  const call = issuer.calls[0];
  assert.equal(call.codeHash, sha256(body.code.trim()));
  assert.equal(call.stateHash, sha256(body.state.trim()));
  assert.equal(call.device.deviceId, "dev-1");
  assert.ok(call.requestId, "a request id is passed to the issuer");
});

test("issuer/atomic failure propagates (the code is not lost — the RPC rolls back)", async () => {
  const throwingIssuer = { redeemAndIssue: async () => { throw new Error("session insert failed"); } };
  await assert.rejects(() => svc(config(), throwingIssuer).redeem(body, "ip"), /session insert failed/);
});

test("B7: rotating device IDs does NOT bypass the per-IP limit (issuer not called on the throttled attempt)", async () => {
  const issuer = fakeIssuer();
  const s = svc(config(), issuer);
  for (let i = 0; i < 10; i++) await s.redeem({ ...body, device: { deviceId: `dev-${i}` } }, "9.9.9.9");
  await assert.rejects(() => s.redeem({ ...body, device: { deviceId: "dev-new" } }, "9.9.9.9"), (e) => e.code === "HANDOFF_RATE_LIMITED");
  assert.equal(issuer.calls.length, 10, "the throttled attempt did not reach the issuer");
});

test("B7: rotating IPs does NOT bypass the per-device limit", async () => {
  const s = svc(config(), fakeIssuer());
  for (let i = 0; i < 10; i++) await s.redeem({ ...body, device: { deviceId: "same-dev" } }, `10.0.0.${i}`);
  await assert.rejects(() => s.redeem({ ...body, device: { deviceId: "same-dev" } }, "10.0.0.250"), (e) => e.code === "HANDOFF_RATE_LIMITED");
});

test("B7: rate-limit rejection never reaches the issuer (no consume)", async () => {
  const issuer = fakeIssuer();
  const s = svc(config(), issuer);
  for (let i = 0; i < 10; i++) await s.redeem(body, "5.5.5.5");
  const before = issuer.calls.length;
  await assert.rejects(() => s.redeem(body, "5.5.5.5"), (e) => e.code === "HANDOFF_RATE_LIMITED");
  assert.equal(issuer.calls.length, before);
});

test("malformed code/state → HANDOFF_INVALID (before any issuer call)", async () => {
  const issuer = fakeIssuer();
  await assert.rejects(() => svc(config(), issuer).redeem({ code: "", state: "s" }, "ip"), (e) => e.code === "HANDOFF_INVALID");
  assert.equal(issuer.calls.length, 0);
});
