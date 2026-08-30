/**
 * Barber Handoff — service orchestration (prepare/redeem). Pure unit test against a fake
 * repository (no DB): proves state/target validation ordering, rate limiting, and the
 * error-code mapping for expired/replayed/mismatched handoffs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomUUID, createHash } from "node:crypto";

const { BarberHandoffService } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-handoff.service.js"
);
const { BarberHandoffError } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-handoff.errors.js"
);
const { BarberHandoffAssertionService } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-handoff-assertion.service.js"
);

const ISS = "DilMart-main";
const AUD = "DilMart-store-barber-handoff";
const { publicKey, privateKey } = await jose.generateKeyPair("EdDSA", { extractable: true });
const pem = await jose.exportSPKI(publicKey);

function sha256Hex(s) {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

function fakeConfig(overrides = {}) {
  return {
    handoffEnabled: overrides.handoffEnabled ?? true,
    codeTtlSeconds: 120,
    sessionTtlSeconds: 43200,
    getOpenBaseUrl: () => "https://store.DilMart.org/open-barber",
    getKeyRing: () => new Map([["k1", { alg: "EdDSA", publicKeyPem: pem }]]),
    issuer: ISS,
    audience: AUD,
    clockToleranceSeconds: 5,
    assertionMaxTtlSeconds: 60,
    trustedProxyHops: 0,
  };
}

async function signAssertion(claims = {}, time = {}) {
  const now = Math.floor(Date.now() / 1000);
  const state = claims.__rawState ?? "s".repeat(40);
  const clientStateHash = sha256Hex(state);
  const payload = {
    role: "OWNER",
    sourceApp: "barber_app",
    barbershopId: randomUUID(),
    salonVerified: true,
    sourceSurface: "barber_store_home",
    target: "/",
    clientStateHash,
    ...claims,
  };
  delete payload.__rawState;
  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: "EdDSA", kid: "k1" })
    .setIssuer(claims.iss ?? ISS)
    .setAudience(claims.aud ?? AUD)
    .setSubject(claims.sub ?? randomUUID())
    .setJti(claims.jti ?? `jti-${randomUUID()}`)
    .setIssuedAt(time.iat ?? now)
    .setNotBefore(time.nbf ?? now)
    .setExpirationTime(time.exp ?? now + 50)
    .sign(privateKey);
  return { token, state };
}

const GOOD_REDEEM_ROW = {
  outcome_status: "REDEEMED", error_code: null, handoff_id: "h1", linked_profile_id: "lp1",
  DilMart_user_id: "u1", DilMart_barbershop_id: "b1", role: "OWNER", display_name: "Ali", target_path: "/",
};

function makeService({ finalizeResult, redeemRow, productVisibility } = {}) {
  const cfg = fakeConfig();
  const assertions = new BarberHandoffAssertionService(cfg);
  const calls = { redeems: [] };
  const repo = {
    finalizeHandoff: async () => finalizeResult ?? { status: "OK", handoffId: "h1", expiresAt: new Date().toISOString(), linkedProfileId: "lp1" },
    redeemAndCreateSession: async (codeHash, stateHash, sessionTokenHash, ttl) => {
      calls.redeems.push({ codeHash, stateHash, sessionTokenHash, ttl });
      return redeemRow ?? GOOD_REDEEM_ROW;
    },
    revokeSessionsForUser: async () => 0,
    writeAudit: async () => {},
  };
  const pv = productVisibility ?? { computeSegmentFromToken: () => "DilMart_APP_BARBER_OWNER" };
  const service = new BarberHandoffService(cfg, assertions, repo, pv);
  return Object.assign(service, { __calls: calls });
}

test("prepare: rejects when feature disabled", async () => {
  const cfg = fakeConfig({ handoffEnabled: false });
  const svc = new BarberHandoffService(
    cfg, new BarberHandoffAssertionService(cfg),
    { finalizeHandoff: async () => ({}) },
    { computeSegmentFromToken: () => "x" },
  );
  await assert.rejects(() => svc.prepare("Bearer x", "s".repeat(40)), (e) => e instanceof BarberHandoffError && e.code === "STORE_INTEGRATION_DISABLED");
});

test("prepare: rejects malformed bearer header", async () => {
  const svc = makeService();
  await assert.rejects(() => svc.prepare("not-a-bearer", "s".repeat(40)), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_INVALID");
});

test("prepare: rejects when raw state does not match assertion's clientStateHash", async () => {
  const { token } = await signAssertion();
  const svc = makeService();
  await assert.rejects(() => svc.prepare(`Bearer ${token}`, "wrong-state-value-that-does-not-hash-match!"), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_STATE_MISMATCH");
});

test("prepare: rejects a target outside the canonical allowlist", async () => {
  const { token, state } = await signAssertion({ target: "/admin" });
  const svc = makeService();
  await assert.rejects(() => svc.prepare(`Bearer ${token}`, state), (e) => e instanceof BarberHandoffError && e.code === "INVALID_TARGET");
});

test("prepare: rejects customer-only targets the /open-barber landing would refuse (one allowlist end to end)", async () => {
  for (const target of ["/cart", "/products", "/offers", "/checkout", "/my-account/orders"]) {
    const { token, state } = await signAssertion({ target, jti: `jti-${randomUUID()}` });
    const svc = makeService();
    await assert.rejects(() => svc.prepare(`Bearer ${token}`, state), (e) => e instanceof BarberHandoffError && e.code === "INVALID_TARGET", `target ${target} must be rejected at prepare`);
  }
});

test("prepare: accepts /store/:slug (merchant tile target)", async () => {
  const { token, state } = await signAssertion({ target: "/store/acme-supplies" });
  const svc = makeService();
  const result = await svc.prepare(`Bearer ${token}`, state);
  assert.equal(result.target, "/store/acme-supplies");
  assert.equal(result.expiresIn, 120);
  assert.match(result.handoffUrl, /^https:\/\/store\.DilMart\.org\/open-barber\?code=.+&state=.+$/);
});

test("prepare: handoffUrl carries ONLY code and state, never barbershopId/phone/role", async () => {
  const { token, state } = await signAssertion({ phone: "+9647700000000", displayName: "Ali Hassan" });
  const svc = makeService();
  const result = await svc.prepare(`Bearer ${token}`, state);
  const url = new URL(result.handoffUrl);
  assert.deepEqual([...url.searchParams.keys()].sort(), ["code", "state"]);
  assert.ok(!result.handoffUrl.includes("Ali"), "display name must never appear in the handoff URL");
  assert.ok(!result.handoffUrl.includes("9647700000000"), "phone must never appear in the handoff URL");
});

test("prepare: rate limits after 20 requests for the same user in a minute", async () => {
  const sub = randomUUID();
  const svc = makeService();
  for (let i = 0; i < 20; i++) {
    const { token, state } = await signAssertion({ sub, jti: `jti-${randomUUID()}` });
    await svc.prepare(`Bearer ${token}`, state);
  }
  const { token, state } = await signAssertion({ sub, jti: `jti-${randomUUID()}` });
  await assert.rejects(() => svc.prepare(`Bearer ${token}`, state), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_RATE_LIMITED");
});

const ERROR_ROW = (code) => ({
  outcome_status: "ERROR", error_code: code, handoff_id: null, linked_profile_id: null,
  DilMart_user_id: null, DilMart_barbershop_id: null, role: null, display_name: null, target_path: null,
});

test("redeem: maps HANDOFF_EXPIRED", async () => {
  const svc = makeService({ redeemRow: ERROR_ROW("HANDOFF_EXPIRED") });
  await assert.rejects(() => svc.redeem({ code: "c", state: "s".repeat(40) }, "1.2.3.4"), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_EXPIRED" && e.retryable === true);
});

test("redeem: maps HANDOFF_ALREADY_REDEEMED to the generic HANDOFF_INVALID (no distinct signal to an attacker)", async () => {
  const svc = makeService({ redeemRow: ERROR_ROW("HANDOFF_ALREADY_REDEEMED") });
  await assert.rejects(() => svc.redeem({ code: "c", state: "s".repeat(40) }, "1.2.3.4"), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_INVALID");
});

test("redeem: maps HANDOFF_STATE_MISMATCH", async () => {
  const svc = makeService({ redeemRow: ERROR_ROW("HANDOFF_STATE_MISMATCH") });
  await assert.rejects(() => svc.redeem({ code: "c", state: "s".repeat(40) }, "1.2.3.4"), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_STATE_MISMATCH");
});

test("redeem: successful redeem returns a safe barber summary and a session token distinct from the raw code", async () => {
  const svc = makeService();
  const { result, sessionToken } = await svc.redeem({ code: "c", state: "s".repeat(40) }, "1.2.3.4");
  assert.equal(result.status, "authenticated");
  assert.equal(result.barber.role, "OWNER");
  assert.equal(result.target, "/");
  assert.equal(typeof sessionToken, "string");
  assert.ok(sessionToken.length >= 32, "session token must be a real random value, not derived from the code");
  assert.notEqual(sessionToken, "c");
});

test("redeem: is ONE atomic repo call — only the sha256 HASH of the session token reaches the DB layer", async () => {
  const svc = makeService();
  const { sessionToken } = await svc.redeem({ code: "c", state: "s".repeat(40) }, "1.2.3.4");
  assert.equal(svc.__calls.redeems.length, 1);
  const call = svc.__calls.redeems[0];
  assert.match(call.sessionTokenHash, /^[0-9a-f]{64}$/, "session token must be passed as a sha256 hex hash");
  assert.notEqual(call.sessionTokenHash, sessionToken, "the raw session token must never reach the repo");
  assert.equal(call.ttl, 43200);
});

test("redeem: a defensive-in-depth reject when the RPC returns a non-Barber role row", async () => {
  const svc = makeService({ redeemRow: { ...GOOD_REDEEM_ROW, role: "CUSTOMER" } });
  await assert.rejects(() => svc.redeem({ code: "c", state: "s".repeat(40) }, "1.2.3.4"), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_INVALID");
});

test("redeem: rate limits after 10 requests from the same IP in a minute", async () => {
  const svc = makeService();
  const ip = "9.9.9.9";
  for (let i = 0; i < 10; i++) {
    await svc.redeem({ code: `c${i}`, state: "s".repeat(40) }, ip);
  }
  await assert.rejects(() => svc.redeem({ code: "c-last", state: "s".repeat(40) }, ip), (e) => e instanceof BarberHandoffError && e.code === "HANDOFF_RATE_LIMITED");
});
