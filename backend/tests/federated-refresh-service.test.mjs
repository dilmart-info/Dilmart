/**
 * STORE-PR4 Final Closure B2/B3 — FederatedAuthService.refresh must compare the FULL committed context
 * (family + customer + linked-profile + DilMart-user + session_version) against what it pre-signed, and must
 * return the DB refresh lifetime with NO invented 30-day fallback (missing/null/0/negative/>2592000 fails
 * closed and yields no token). Pure orchestration; DB + crypto are faked. No DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { FederatedAuthService } = await import("../dist/modules/auth/federated/federated-auth.service.js");
const { FederatedError } = await import("../dist/modules/auth/federated/federated-auth.errors.js");

const CTX = { familyId: "fam-1", storeCustomerId: "cust-1", linkedProfileId: "prof-1", DilMartUserId: "user-1", sessionVersion: 3 };
const okRow = (over = {}) => ({
  status: "OK", error_code: null, family_id: "fam-1", store_customer_id: "cust-1", linked_profile_id: "prof-1",
  DilMart_user_id: "user-1", session_version: 3, refresh_expires_in_seconds: 2592000, ...over,
});
const config = { enabled: true };
const access = { sign: async () => ({ accessToken: "ACCESS.JWT", jti: "jti-1", expiresIn: 600 }) };
const refreshTokens = { hashToken: (r) => "H(" + r + ")", hashDevice: () => null, generateRawToken: () => "RAW-NEW" };
function service(rotateRow) {
  const repo = { resolveFamilyForToken: async () => ({ ...CTX }), rotate: async () => rotateRow };
  return new FederatedAuthService(config, access, refreshTokens, repo);
}
const call = (svc) => svc.refresh({ refreshToken: "current-token" }, "1.2.3.4", "req-1");

test("full valid context + valid lifetime → returns the new raw token and the DB lifetime", async () => {
  const res = await call(service(okRow()));
  assert.equal(res.session.refreshToken, "RAW-NEW");
  assert.equal(res.session.accessToken, "ACCESS.JWT");
  assert.equal(res.session.refreshExpiresIn, 2592000);
});

test("each single committed-context mismatch fails closed with no token (not session_version alone)", async () => {
  const fields = [
    { family_id: "other" },
    { store_customer_id: "other" },
    { linked_profile_id: "other" },
    { DilMart_user_id: "other" },
    { session_version: 4 },
  ];
  for (const bad of fields) {
    await assert.rejects(() => call(service(okRow(bad))), (e) => e instanceof FederatedError && e.code === "FEDERATED_SESSION_EXPIRED", JSON.stringify(bad));
  }
});

test("refresh lifetime is taken from the DB and validated (2592000 / 86400 / 300 pass through exactly)", async () => {
  for (const secs of [2592000, 86400, 300, 1]) {
    const res = await call(service(okRow({ refresh_expires_in_seconds: secs })));
    assert.equal(res.session.refreshExpiresIn, secs);
  }
});

test("an invalid DB lifetime (null / 0 / negative / >2592000 / non-integer) yields NO token (fail closed)", async () => {
  for (const bad of [null, undefined, 0, -1, 2592001, 300.5, "300"]) {
    await assert.rejects(() => call(service(okRow({ refresh_expires_in_seconds: bad }))), (e) => e instanceof FederatedError, `lifetime ${bad}`);
  }
});

test("a non-OK rotation returns the mapped safe error and no token", async () => {
  await assert.rejects(
    () => call(service({ status: "ERROR", error_code: "FEDERATED_REFRESH_REUSE_DETECTED" })),
    (e) => e instanceof FederatedError && e.code === "FEDERATED_REFRESH_REUSE_DETECTED",
  );
});
