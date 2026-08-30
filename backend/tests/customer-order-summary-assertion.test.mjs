/**
 * STORE-PR6A — DEDICATED Order Summary assertion verifier (spec §33.3, §19).
 * Real Ed25519 + RS256 keys via jose. Proves the dedicated audience + purpose contract, that the Handoff
 * assertion cannot be substituted, and that NO Handoff-specific claims are required. jose is the sole
 * signature/time authority; HS/none/mismatch/wrong-claims all fail closed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const { CustomerOrderSummaryAssertionService, OrderSummaryAssertionInvalidError } = await import(
  "../dist/modules/store-integration/customer-order-summary/customer-order-summary-assertion.service.js"
);

const ISS = "DilMart-main";
const AUD = "DilMart-store-customer-order-summary";
const HANDOFF_AUD = "DilMart-store-customer-handoff";

async function keyPair(alg) {
  const { publicKey, privateKey } = await jose.generateKeyPair(alg, { extractable: true });
  return { publicKey, privateKey, pem: await jose.exportSPKI(publicKey) };
}

const ed = await keyPair("EdDSA");
const edPrev = await keyPair("EdDSA");
const rs = await keyPair("RS256");

const RING = new Map([
  ["main-customer-current", { alg: "EdDSA", publicKeyPem: ed.pem }],
  ["main-customer-previous", { alg: "EdDSA", publicKeyPem: edPrev.pem }],
  ["main-customer-rs", { alg: "RS256", publicKeyPem: rs.pem }],
]);

function makeConfig(overrides = {}) {
  return {
    getKeyRing: () => overrides.ring ?? RING,
    issuer: overrides.issuer ?? ISS,
    audience: overrides.audience ?? AUD,
    clockToleranceSeconds: overrides.clockTolerance ?? 5,
    assertionMaxTtlSeconds: overrides.maxTtl ?? 60,
  };
}
const svc = (o) => new CustomerOrderSummaryAssertionService(makeConfig(o));

/** Minimal, contract-correct Order Summary claims (NO handoff claims). */
function baseClaims(over = {}) {
  return { role: "CUSTOMER", sourceApp: "customer_app", purpose: "order_summary", ...over };
}

async function sign(privateKey, { alg, kid }, claims = {}, time = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = kid === undefined ? { alg } : { alg, kid };
  return new jose.SignJWT(baseClaims(claims))
    .setProtectedHeader(header)
    .setIssuer(claims.iss ?? ISS)
    .setAudience(claims.aud ?? AUD)
    .setSubject(claims.sub ?? randomUUID())
    .setJti(claims.jti ?? `jti-${randomUUID()}`)
    .setIssuedAt(time.iat ?? now)
    .setNotBefore(time.nbf ?? now)
    .setExpirationTime(time.exp ?? now + 50)
    .sign(privateKey);
}

const CUR = { alg: "EdDSA", kid: "main-customer-current" };

test("valid EdDSA order-summary assertion verifies (no handoff claims required)", async () => {
  const tok = await sign(ed.privateKey, CUR);
  const a = await svc().verify(tok);
  assert.equal(a.kid, "main-customer-current");
  assert.match(a.sub, /^[0-9a-f-]{36}$/i);
  assert.equal(typeof a.jti, "string");
});

test("valid RS256 accepted", async () => {
  const tok = await sign(rs.privateKey, { alg: "RS256", kid: "main-customer-rs" });
  const a = await svc().verify(tok);
  assert.equal(a.kid, "main-customer-rs");
});

test("HS256 rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await new jose.SignJWT(baseClaims())
    .setProtectedHeader({ alg: "HS256", kid: "main-customer-current" })
    .setIssuer(ISS).setAudience(AUD).setSubject(randomUUID()).setJti(`jti-${randomUUID()}`)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50)
    .sign(new TextEncoder().encode("shared-secret-shared-secret-shared-secret"));
  await assert.rejects(() => svc().verify(tok), /algorithm not allowed/);
});

test("alg=none rejected", async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "none", kid: "main-customer-current" });
  const payload = b64({ ...baseClaims(), iss: ISS, aud: AUD, sub: randomUUID(), jti: "x".repeat(12), iat: now, nbf: now, exp: now + 50 });
  await assert.rejects(() => svc().verify(`${header}.${payload}.`), /algorithm not allowed/);
});

test("missing kid rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, { alg: "EdDSA", kid: undefined })), /missing kid/);
});

test("unknown kid rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, { alg: "EdDSA", kid: "ghost" })), OrderSummaryAssertionInvalidError);
});

test("kid/alg mismatch rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(rs.privateKey, { alg: "RS256", kid: "main-customer-current" })), /kid\/alg mismatch/);
});

test("wrong signature rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(edPrev.privateKey, CUR)), OrderSummaryAssertionInvalidError);
});

test("wrong issuer rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, { iss: "evil" })), OrderSummaryAssertionInvalidError);
});

test("wrong audience rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, { aud: "someone-else" })), OrderSummaryAssertionInvalidError);
});

test("wrong/absent purpose rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, { purpose: "handoff" })), /purpose must be order_summary/);
  const now = Math.floor(Date.now() / 1000);
  const noPurpose = await new jose.SignJWT({ role: "CUSTOMER", sourceApp: "customer_app" })
    .setProtectedHeader(CUR).setIssuer(ISS).setAudience(AUD).setSubject(randomUUID()).setJti(`jti-${randomUUID()}`)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50).sign(ed.privateKey);
  await assert.rejects(() => svc().verify(noPurpose), /purpose must be order_summary/);
});

test("wrong role rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, { role: "OWNER" })), /role must be CUSTOMER/);
});

test("wrong sourceApp rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, { sourceApp: "barber_app" })), /sourceApp/);
});

test("invalid sub rejected", async () => {
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, { sub: "not-a-uuid" })), /invalid sub/);
});

test("invalid jti rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const noJti = await new jose.SignJWT(baseClaims())
    .setProtectedHeader(CUR).setIssuer(ISS).setAudience(AUD).setSubject(randomUUID())
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50).sign(ed.privateKey);
  await assert.rejects(() => svc().verify(noJti), /invalid jti/);
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, { jti: "short" })), /invalid jti/);
});

test("missing iat/nbf/exp rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  // exp present but nbf omitted → jose still verifies; our validator requires nbf.
  const noNbf = await new jose.SignJWT(baseClaims())
    .setProtectedHeader(CUR).setIssuer(ISS).setAudience(AUD).setSubject(randomUUID()).setJti(`jti-${randomUUID()}`)
    .setIssuedAt(now).setExpirationTime(now + 50).sign(ed.privateKey);
  await assert.rejects(() => svc().verify(noNbf), /missing nbf/);
});

test("expired rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, {}, { iat: now - 120, nbf: now - 120, exp: now - 60 })), OrderSummaryAssertionInvalidError);
});

test("future nbf rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, {}, { iat: now, nbf: now + 120, exp: now + 160 })), OrderSummaryAssertionInvalidError);
});

test("TTL > 60s rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  await assert.rejects(async () => svc().verify(await sign(ed.privateKey, CUR, {}, { iat: now, nbf: now, exp: now + 120 })), /lifetime exceeds 60s/);
});

test("a Handoff assertion cannot be substituted (handoff audience rejected)", async () => {
  // A handoff-shaped token (handoff audience + handoff claims, no purpose) must be rejected by audience.
  const now = Math.floor(Date.now() / 1000);
  const handoffLike = await new jose.SignJWT({
    role: "CUSTOMER", sourceApp: "customer_app",
    target: "/product/x", sourceSurface: "customer_home_gateway", clientStateHash: "a".repeat(64),
  })
    .setProtectedHeader(CUR).setIssuer(ISS).setAudience(HANDOFF_AUD).setSubject(randomUUID()).setJti(`jti-${randomUUID()}`)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50).sign(ed.privateKey);
  await assert.rejects(() => svc().verify(handoffLike), OrderSummaryAssertionInvalidError);
});
