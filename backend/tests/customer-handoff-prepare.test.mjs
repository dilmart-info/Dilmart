/**
 * STORE-PR3 — Prepare endpoint logic (spec §8.5, §16.2, Phase C/G + hardening B4/B6). No DB.
 * Fakes for assertion/identity/repo/config assert: state-hash binding, 256-bit code, hash-only
 * finalize, URL contains ONLY code+state, jti replay → HANDOFF_INVALID, IDENTITY_BLOCKED mapping,
 * flag disabled, rate limit, target rejection, DB-time expiry (no app-clock expiry in source).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const { CustomerHandoffService } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff.service.js"
);

const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");
const STATE = "s".repeat(43);

function makeConfig(over = {}) {
  return {
    handoffEnabled: over.handoffEnabled ?? true,
    federatedAuthEnabled: over.federatedAuthEnabled ?? false,
    autoLinkEnabled: false,
    codeTtlSeconds: 120,
    getOpenBaseUrl: () => "https://store.DilMart.org/open",
  };
}
function makeAssertion(over = {}) {
  return {
    sub: over.sub ?? randomUUID(),
    jti: over.jti ?? `jti-${randomUUID()}`,
    role: "CUSTOMER",
    sourceApp: "customer_app",
    sourceSurface: "customer_home_gateway",
    target: over.target ?? "/product/example-slug",
    campaign: over.campaign,
    clientStateHash: over.clientStateHash ?? sha256(STATE),
    phone: "+9647700000000",
    phoneVerified: false,
    phoneVerifiedAt: null,
    email: "buyer@example.com",
    emailVerified: false,
    emailVerifiedAt: null,
    displayName: "Test Buyer",
    kid: "main-customer-current",
  };
}
const fakeAssertionSvc = (a) => ({ verify: async () => a });
const fakeIdentity = (r) => ({ resolve: async () => r ?? { outcome: "LINKED", storeCustomerId: "cust-1", linkMethod: "NEW_FEDERATED", linkStatus: "LINKED", identityAssurance: "DilMart_SESSION", reuseExisting: false, existingLinkedProfileId: null } });
function fakeRepo(over = {}) {
  const finalizes = [];
  return {
    finalizes,
    finalizeHandoff: async (input) => {
      finalizes.push(input);
      return over.result ?? { status: "OK", errorCode: null, handoffId: "handoff-1", expiresAt: new Date(Date.now() + 120000).toISOString(), linkedProfileId: "lp-1" };
    },
    writeAudit: async () => {},
  };
}
const bearer = "Bearer signed.jwt.here";

test("valid prepare: 256-bit code, hash-only finalize, URL only code+state", async () => {
  const assertion = makeAssertion();
  const repo = fakeRepo();
  const svc = new CustomerHandoffService(makeConfig(), fakeAssertionSvc(assertion), fakeIdentity(), repo);
  const res = await svc.prepare(bearer, STATE);
  assert.equal(res.target, "/product/example-slug");
  assert.equal(res.expiresIn, 120);

  const fin = repo.finalizes[0];
  assert.match(fin.codeHash, /^[0-9a-f]{64}$/);
  assert.equal(fin.stateHash, sha256(STATE));
  assert.ok(!("code" in fin) && !("state" in fin), "no raw code/state passed to finalize");

  const url = new URL(res.handoffUrl);
  assert.equal(url.origin + url.pathname, "https://store.DilMart.org/open");
  assert.deepEqual([...url.searchParams.keys()].sort(), ["code", "state"]);
  const codeParam = url.searchParams.get("code");
  assert.equal(Buffer.from(codeParam, "base64url").length, 32);
  assert.equal(sha256(codeParam), fin.codeHash);
  for (const leak of [assertion.sub, assertion.phone, assertion.email, "example-slug", assertion.jti]) {
    assert.ok(!res.handoffUrl.includes(leak), `URL must not contain ${leak}`);
  }
});

test("correct identity metadata is passed to finalize (not always NEW_FEDERATED)", async () => {
  const repo = fakeRepo();
  const svc = new CustomerHandoffService(makeConfig(), fakeAssertionSvc(makeAssertion()), fakeIdentity({ outcome: "LINKED", storeCustomerId: "c", linkMethod: "VERIFIED_PHONE", linkStatus: "LINKED", identityAssurance: "OTP_PHONE", reuseExisting: false, existingLinkedProfileId: null }), repo);
  await svc.prepare(bearer, STATE);
  assert.equal(repo.finalizes[0].linkMethod, "VERIFIED_PHONE");
  assert.equal(repo.finalizes[0].identityAssurance, "OTP_PHONE");
});

test("state mismatch is rejected before finalize", async () => {
  const repo = fakeRepo();
  const svc = new CustomerHandoffService(makeConfig(), fakeAssertionSvc(makeAssertion({ clientStateHash: sha256("different") })), fakeIdentity(), repo);
  await assert.rejects(() => svc.prepare(bearer, STATE), (e) => e.code === "HANDOFF_STATE_MISMATCH");
  assert.equal(repo.finalizes.length, 0);
});

test("duplicate jti (finalize HANDOFF_INVALID) → HANDOFF_INVALID", async () => {
  const svc = new CustomerHandoffService(makeConfig(), fakeAssertionSvc(makeAssertion()), fakeIdentity(), fakeRepo({ result: { status: "ERROR", errorCode: "HANDOFF_INVALID" } }));
  await assert.rejects(() => svc.prepare(bearer, STATE), (e) => e.code === "HANDOFF_INVALID");
});

test("store_customer_id race (finalize IDENTITY_BLOCKED) → IDENTITY_BLOCKED", async () => {
  const svc = new CustomerHandoffService(makeConfig(), fakeAssertionSvc(makeAssertion()), fakeIdentity(), fakeRepo({ result: { status: "ERROR", errorCode: "IDENTITY_BLOCKED" } }));
  await assert.rejects(() => svc.prepare(bearer, STATE), (e) => e.code === "IDENTITY_BLOCKED");
});

test("feature flag disabled → STORE_INTEGRATION_DISABLED", async () => {
  const svc = new CustomerHandoffService(makeConfig({ handoffEnabled: false }), fakeAssertionSvc(makeAssertion()), fakeIdentity(), fakeRepo());
  await assert.rejects(() => svc.prepare(bearer, STATE), (e) => e.code === "STORE_INTEGRATION_DISABLED");
});

test("rate limit: 21st prepare for the same user is throttled", async () => {
  const sub = randomUUID();
  const svc = new CustomerHandoffService(makeConfig(), { verify: async () => makeAssertion({ sub }) }, fakeIdentity(), fakeRepo());
  for (let i = 0; i < 20; i++) await svc.prepare(bearer, STATE);
  await assert.rejects(() => svc.prepare(bearer, STATE), (e) => e.code === "HANDOFF_RATE_LIMITED");
});

test("invalid target → INVALID_TARGET (strict)", async () => {
  const svc = new CustomerHandoffService(makeConfig(), fakeAssertionSvc(makeAssertion({ target: "/admin" })), fakeIdentity(), fakeRepo());
  await assert.rejects(() => svc.prepare(bearer, STATE), (e) => e.code === "INVALID_TARGET");
});

test("LINK_REQUIRED / BLOCKED outcomes still create a handoff with matching identityOutcome", async () => {
  for (const outcome of ["LINK_REQUIRED", "BLOCKED"]) {
    const repo = fakeRepo();
    const svc = new CustomerHandoffService(makeConfig(), fakeAssertionSvc(makeAssertion()), fakeIdentity({ outcome, storeCustomerId: null, linkMethod: null, linkStatus: null, identityAssurance: null, reuseExisting: false, existingLinkedProfileId: null, conflictReason: "x" }), repo);
    const res = await svc.prepare(bearer, STATE);
    assert.ok(res.handoffUrl.includes("code="));
    assert.equal(repo.finalizes[0].identityOutcome, outcome);
  }
});

test("B6: prepare no longer computes app-clock expiry (Date.now not used for expiry)", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const src = readFileSync(join(here, "../src/modules/store-integration/customer-handoff/customer-handoff.service.ts"), "utf8");
  assert.ok(!/new Date\(\s*Date\.now\(\)\s*\+/.test(src), "service must not derive expires_at from the app clock");
  assert.ok(!/expires_?at\s*[:=][^;]*Date\.now/i.test(src), "no expires_at derived from Date.now");
});
