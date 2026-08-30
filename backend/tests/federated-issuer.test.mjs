/**
 * STORE-PR4 — Issuer orchestration (spec §8.7–§8.10). Pure orchestration; DB + crypto are faked so we can
 * assert the safety ordering: sign BEFORE the consuming RPC, never call the RPC when signing fails, never
 * return a token when the RPC fails, never create a session on LINK_REQUIRED/BLOCKED, and never leak the raw
 * refresh token into anything handed to the DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { FederatedSessionIssuerService } = await import("../dist/modules/auth/federated/federated-session-issuer.service.js");
const { HandoffError } = await import("../dist/modules/store-integration/customer-handoff/customer-handoff.errors.js");

const CFG = { enabled: true, refreshTtlSeconds: 2592000, absoluteTtlSeconds: 7776000 };
// Opaque hashes that do NOT embed the raw token — mirrors the real keyed HMAC (non-reversible).
const REFRESH = {
  generateRawToken: () => "RAW-REFRESH-SECRET",
  hashToken: () => "OPAQUE_REFRESH_HASH",
  hashDevice: (d) => (d ? "OPAQUE_DEVICE_HASH" : null),
};
const linkedInspect = { identityOutcome: "LINKED", handoffId: "ho-1", targetPath: "/store", storeCustomerId: "cust-1", linkedProfileId: "prof-1", DilMartUserId: "user-1" };
const okRow = { status: "OK", store_customer_id: "cust-1", linked_profile_id: "prof-1", DilMart_user_id: "user-1", display_name: "Layla", target_path: "/store", session_version: 1, refresh_expires_in_seconds: 2592000 };

function makeIssuer({ cfg = CFG, sign, repo }) {
  const access = { sign: sign ?? (async () => ({ accessToken: "ACCESS.JWT", jti: "jti-1", expiresIn: 600 })) };
  return new FederatedSessionIssuerService(cfg, access, REFRESH, repo);
}
const input = { codeHash: "ch", stateHash: "sh", device: { deviceId: "dev-9" }, requestId: "req-1" };

test("LINKED success returns the §8.8 shape; raw refresh is returned but only its HASH reaches the DB", async () => {
  const calls = [];
  const repo = {
    inspectHandoffOutcome: async () => linkedInspect,
    redeemAndCreate: async (a) => { calls.push(a); return okRow; },
    consumeNonSession: async () => { throw new Error("must not be called"); },
  };
  const res = await makeIssuer({ repo }).redeemAndIssue(input);
  assert.equal(res.status, "authenticated");
  assert.equal(res.session.accessToken, "ACCESS.JWT");
  assert.equal(res.session.expiresIn, 600);
  assert.equal(res.session.refreshToken, "RAW-REFRESH-SECRET");
  assert.equal(res.session.refreshExpiresIn, 2592000);
  assert.deepEqual(res.customer, { id: "cust-1", displayName: "Layla", linkedProfileId: "prof-1", origin: "DilMart" });
  assert.equal(res.target, "/store");
  // The consuming RPC received the HASH, the pre-signed jti, the device HASH — never the raw token.
  assert.equal(calls.length, 1);
  assert.equal(calls[0].refreshTokenHash, "OPAQUE_REFRESH_HASH");
  assert.equal(calls[0].accessJti, "jti-1");
  assert.equal(calls[0].deviceHash, "OPAQUE_DEVICE_HASH");
  // B6: the exact pre-signed identity context is passed to the consuming RPC (checked under lock there).
  assert.equal(calls[0].expectedHandoffId, "ho-1");
  assert.equal(calls[0].expectedStoreCustomerId, "cust-1");
  assert.equal(calls[0].expectedLinkedProfileId, "prof-1");
  assert.equal(calls[0].expectedDilMartUserId, "user-1");
  assert.equal(calls[0].expectedTargetPath, "/store");
  assert.equal(JSON.stringify(calls[0]).includes("RAW-REFRESH-SECRET"), false, "raw token never handed to the DB layer");
});

test("B4: refreshExpiresIn reflects the committed DB lifetime (near-absolute-expiry family)", async () => {
  const repo = {
    inspectHandoffOutcome: async () => linkedInspect,
    redeemAndCreate: async () => ({ ...okRow, refresh_expires_in_seconds: 300 }), // family ~5 min from absolute expiry
  };
  const res = await makeIssuer({ repo }).redeemAndIssue(input);
  assert.equal(res.session.refreshExpiresIn, 300, "not the 2592000 app constant");
});

test("B3: an invalid committed refresh lifetime (null/0/2592001) → no token (no invented fallback)", async () => {
  for (const bad of [null, undefined, 0, -5, 2592001, 300.5]) {
    const repo = { inspectHandoffOutcome: async () => linkedInspect, redeemAndCreate: async () => ({ ...okRow, refresh_expires_in_seconds: bad }) };
    await assert.rejects(() => makeIssuer({ repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "STORE_UNAVAILABLE", `lifetime ${bad}`);
  }
});

test("B3: valid committed lifetimes (2592000 / 86400) pass through exactly", async () => {
  for (const secs of [2592000, 86400]) {
    const repo = { inspectHandoffOutcome: async () => linkedInspect, redeemAndCreate: async () => ({ ...okRow, refresh_expires_in_seconds: secs }) };
    assert.equal((await makeIssuer({ repo }).redeemAndIssue(input)).session.refreshExpiresIn, secs);
  }
});

test("B6: a committed linked_profile/DilMart_user/target mismatch → safe error, token discarded", async () => {
  for (const bad of [{ linked_profile_id: "other" }, { DilMart_user_id: "other" }, { target_path: "/evil" }, { session_version: 2 }]) {
    const repo = { inspectHandoffOutcome: async () => linkedInspect, redeemAndCreate: async () => ({ ...okRow, ...bad }) };
    await assert.rejects(() => makeIssuer({ repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "STORE_UNAVAILABLE", JSON.stringify(bad));
  }
});

test("signing failure → consuming RPC is NEVER called and no token is returned", async () => {
  let rpcCalled = false;
  const repo = {
    inspectHandoffOutcome: async () => linkedInspect,
    redeemAndCreate: async () => { rpcCalled = true; return okRow; },
  };
  const issuer = makeIssuer({ repo, sign: async () => { throw new Error("HSM down"); } });
  await assert.rejects(() => issuer.redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "STORE_UNAVAILABLE");
  assert.equal(rpcCalled, false, "handoff stays unconsumed when signing fails");
});

test("RPC throws → no token returned (mapped to a safe error)", async () => {
  const repo = { inspectHandoffOutcome: async () => linkedInspect, redeemAndCreate: async () => { throw new Error("deadlock"); } };
  await assert.rejects(() => makeIssuer({ repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "STORE_UNAVAILABLE");
});

test("RPC returns ALREADY_REDEEMED → mapped HandoffError, no session", async () => {
  const repo = { inspectHandoffOutcome: async () => linkedInspect, redeemAndCreate: async () => ({ status: "ERROR", error_code: "HANDOFF_ALREADY_REDEEMED" }) };
  await assert.rejects(() => makeIssuer({ repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "HANDOFF_ALREADY_REDEEMED");
});

test("LINK_REQUIRED → non-session consume path, no family creation, mapped error", async () => {
  let createCalled = false;
  const repo = {
    inspectHandoffOutcome: async () => ({ identityOutcome: "LINK_REQUIRED" }),
    consumeNonSession: async () => ({ outcome_status: "LINK_REQUIRED" }),
    redeemAndCreate: async () => { createCalled = true; return okRow; },
  };
  await assert.rejects(() => makeIssuer({ repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "IDENTITY_LINK_REQUIRED");
  assert.equal(createCalled, false, "no federated session for a LINK_REQUIRED identity");
});

test("BLOCKED → non-session consume path, mapped error, no session", async () => {
  const repo = {
    inspectHandoffOutcome: async () => ({ identityOutcome: "BLOCKED" }),
    consumeNonSession: async () => ({ outcome_status: "BLOCKED" }),
  };
  await assert.rejects(() => makeIssuer({ repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "IDENTITY_BLOCKED");
});

test("feature disabled → fails closed before touching the DB", async () => {
  let touched = false;
  const repo = { inspectHandoffOutcome: async () => { touched = true; return linkedInspect; } };
  await assert.rejects(() => makeIssuer({ cfg: { ...CFG, enabled: false }, repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "FEDERATED_AUTH_DISABLED");
  assert.equal(touched, false);
});

test("committed identity mismatch → safe error, token discarded", async () => {
  const repo = { inspectHandoffOutcome: async () => linkedInspect, redeemAndCreate: async () => ({ ...okRow, store_customer_id: "someone-else" }) };
  await assert.rejects(() => makeIssuer({ repo }).redeemAndIssue(input), (e) => e instanceof HandoffError && e.code === "STORE_UNAVAILABLE");
});
