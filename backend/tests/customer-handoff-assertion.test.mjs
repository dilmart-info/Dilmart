/**
 * STORE-PR3 — Asymmetric Customer Assertion verifier (spec §8.3/§8.4/§16.6).
 * Real Ed25519 + RS256 keys generated with jose. Covers the 20 verifier cases and the
 * 6 verification-metadata rules. jose is the sole signature/time authority.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const { CustomerHandoffAssertionService, AssertionInvalidError } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff-assertion.service.js"
);
const { CustomerHandoffConfig } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff.config.js"
);

const ISS = "DilMart-main";
const AUD = "DilMart-store-customer-handoff";

async function keyPair(alg) {
  const { publicKey, privateKey } = await jose.generateKeyPair(alg, { extractable: true });
  return { publicKey, privateKey, pem: await jose.exportSPKI(publicKey) };
}

// One EdDSA "current" + one EdDSA "previous" + one RS256 key.
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
    getKeyRing: () => (overrides.ring ?? RING),
    issuer: overrides.issuer ?? ISS,
    audience: overrides.audience ?? AUD,
    clockToleranceSeconds: overrides.clockTolerance ?? 5,
    assertionMaxTtlSeconds: overrides.maxTtl ?? 60,
  };
}
const svc = (overrides) => new CustomerHandoffAssertionService(makeConfig(overrides));

function baseClaims(over = {}) {
  return {
    role: "CUSTOMER",
    sourceApp: "customer_app",
    sourceSurface: "customer_home_gateway",
    target: "/product/example-slug",
    clientStateHash: "a".repeat(64),
    phoneVerified: false,
    emailVerified: false,
    ...over,
  };
}

async function sign(privateKey, { alg, kid }, claims = {}, time = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = kid === undefined ? { alg } : { alg, kid };
  let s = new jose.SignJWT(baseClaims(claims))
    .setProtectedHeader(header)
    .setIssuer(claims.iss ?? ISS)
    .setAudience(claims.aud ?? AUD)
    .setSubject(claims.sub ?? randomUUID())
    .setJti(claims.jti ?? `jti-${randomUUID()}`)
    .setIssuedAt(time.iat ?? now)
    .setNotBefore(time.nbf ?? now)
    .setExpirationTime(time.exp ?? now + 50);
  return s.sign(privateKey);
}

const CUR = { alg: "EdDSA", kid: "main-customer-current" };

test("1. valid current Ed25519 key verifies", async () => {
  const tok = await sign(ed.privateKey, CUR);
  const a = await svc().verify(tok);
  assert.equal(a.role, "CUSTOMER");
  assert.equal(a.kid, "main-customer-current");
});

test("2. valid previous rotation key verifies", async () => {
  const tok = await sign(edPrev.privateKey, { alg: "EdDSA", kid: "main-customer-previous" });
  const a = await svc().verify(tok);
  assert.equal(a.kid, "main-customer-previous");
});

test("3. unknown kid rejected", async () => {
  const tok = await sign(ed.privateKey, { alg: "EdDSA", kid: "ghost" });
  await assert.rejects(() => svc().verify(tok), AssertionInvalidError);
});

test("4. missing kid rejected", async () => {
  const tok = await sign(ed.privateKey, { alg: "EdDSA", kid: undefined });
  await assert.rejects(() => svc().verify(tok), /missing kid/);
});

test("5. invalid signature rejected", async () => {
  // header points at current kid but signed with a different key.
  const tok = await sign(edPrev.privateKey, CUR);
  await assert.rejects(() => svc().verify(tok), AssertionInvalidError);
});

test("6. wrong issuer rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { iss: "evil" });
  await assert.rejects(() => svc().verify(tok), AssertionInvalidError);
});

test("7. wrong audience rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { aud: "someone-else" });
  await assert.rejects(() => svc().verify(tok), AssertionInvalidError);
});

test("8. wrong role rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { role: "OWNER" });
  await assert.rejects(() => svc().verify(tok), /role must be CUSTOMER/);
});

test("9. wrong sourceApp rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { sourceApp: "barber_app" });
  await assert.rejects(() => svc().verify(tok), /sourceApp/);
});

test("10. expired assertion rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await sign(ed.privateKey, CUR, {}, { iat: now - 120, nbf: now - 120, exp: now - 60 });
  await assert.rejects(() => svc().verify(tok), AssertionInvalidError);
});

test("11. future nbf rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await sign(ed.privateKey, CUR, {}, { iat: now, nbf: now + 120, exp: now + 160 });
  await assert.rejects(() => svc().verify(tok), AssertionInvalidError);
});

test("12. lifetime over 60s rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await sign(ed.privateKey, CUR, {}, { iat: now, nbf: now, exp: now + 120 });
  await assert.rejects(() => svc().verify(tok), /lifetime exceeds 60s/);
});

test("13. bounded clock skew allowed", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await sign(ed.privateKey, CUR, {}, { iat: now + 3, nbf: now + 3, exp: now + 50 });
  const a = await svc().verify(tok);
  assert.equal(a.role, "CUSTOMER");
});

test("14. HS256 rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await new jose.SignJWT(baseClaims())
    .setProtectedHeader({ alg: "HS256", kid: "main-customer-current" })
    .setIssuer(ISS).setAudience(AUD).setSubject(randomUUID()).setJti(`jti-${randomUUID()}`)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50)
    .sign(new TextEncoder().encode("shared-secret-shared-secret-shared-secret"));
  await assert.rejects(() => svc().verify(tok), /algorithm not allowed/);
});

test("15. alg=none rejected", async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "none", kid: "main-customer-current" });
  const payload = b64({ ...baseClaims(), iss: ISS, aud: AUD, sub: randomUUID(), jti: "x".repeat(12), iat: now, nbf: now, exp: now + 50 });
  const tok = `${header}.${payload}.`;
  await assert.rejects(() => svc().verify(tok), /algorithm not allowed/);
});

test("16. algorithm/key mismatch rejected", async () => {
  // Sign RS256 but claim kid of an EdDSA-configured entry.
  const tok = await sign(rs.privateKey, { alg: "RS256", kid: "main-customer-current" });
  await assert.rejects(() => svc().verify(tok), /kid\/alg mismatch/);
});

test("17. missing jti rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await new jose.SignJWT(baseClaims())
    .setProtectedHeader(CUR).setIssuer(ISS).setAudience(AUD).setSubject(randomUUID())
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50)
    .sign(ed.privateKey);
  await assert.rejects(() => svc().verify(tok), /invalid jti/);
});

test("18. invalid subject UUID rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { sub: "not-a-uuid" });
  await assert.rejects(() => svc().verify(tok), /invalid sub/);
});

test("19. invalid (non-string) target rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { target: 12345 });
  await assert.rejects(() => svc().verify(tok), /invalid target/);
});

test("20. malformed key-ring configuration fails closed (array format)", () => {
  const K = "DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON";
  const mk = (v) => new CustomerHandoffConfig({ get: (k) => (k === K ? v : undefined) });
  assert.throws(() => mk("{not json").getKeyRing(), /not valid JSON/);
  assert.throws(() => mk(JSON.stringify({ "kid-1": { alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" } })).getKeyRing(), /must be a JSON array/);
  assert.throws(() => mk(JSON.stringify([{ kid: "kid-1", alg: "HS256", publicKeyPem: "x" }])).getKeyRing(), /unsupported alg/);
  assert.throws(() => mk(JSON.stringify([{ kid: "a", alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" }])).getKeyRing(), /invalid kid/);
  assert.throws(() => mk(JSON.stringify([
    { kid: "dup-kid", alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" },
    { kid: "dup-kid", alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" },
  ])).getKeyRing(), /DUPLICATE kid/);
});

// ── Verification-metadata rules (21–26) ──────────────────────────────────────
test("21. verified phone requires phone + verified timestamp", async () => {
  const t1 = await sign(ed.privateKey, CUR, { phoneVerified: true }); // no phone
  await assert.rejects(() => svc().verify(t1), /canonical E\.164 phone/);
  const t2 = await sign(ed.privateKey, CUR, { phoneVerified: true, phone: "+9647700000000" }); // no ts
  await assert.rejects(() => svc().verify(t2), /valid phoneVerifiedAt/);
});

test("22. unverified phone cannot drive linking (dropped)", async () => {
  const tok = await sign(ed.privateKey, CUR, { phoneVerified: false, phone: "+9647700000000" });
  const a = await svc().verify(tok);
  assert.equal(a.phone, undefined, "unverified phone is not carried for linking");
});

test("23. verified email requires email + verified timestamp", async () => {
  const t1 = await sign(ed.privateKey, CUR, { emailVerified: true }); // no email
  await assert.rejects(() => svc().verify(t1), /requires an email/);
  const t2 = await sign(ed.privateKey, CUR, { emailVerified: true, email: "a@b.com" }); // no ts
  await assert.rejects(() => svc().verify(t2), /valid emailVerifiedAt/);
});

test("24. unverified email cannot drive linking (dropped)", async () => {
  const tok = await sign(ed.privateKey, CUR, { emailVerified: false, email: "a@b.com" });
  const a = await svc().verify(tok);
  assert.equal(a.email, undefined, "unverified email is not carried for linking");
});

test("25. email normalization is deterministic lower(trim())", async () => {
  const tok = await sign(ed.privateKey, CUR, {
    emailVerified: true, email: "  Foo@Bar.COM  ", emailVerifiedAt: new Date().toISOString(),
  });
  const a = await svc().verify(tok);
  assert.equal(a.email, "foo@bar.com");
});

test("26. phone canonical validation is deterministic (E.164 only)", async () => {
  const bad = await sign(ed.privateKey, CUR, {
    phoneVerified: true, phone: "07700000000", phoneVerifiedAt: new Date().toISOString(),
  });
  await assert.rejects(() => svc().verify(bad), /canonical E\.164 phone/);
  const good = await sign(ed.privateKey, CUR, {
    phoneVerified: true, phone: "+9647700000000", phoneVerifiedAt: new Date().toISOString(),
  });
  const a = await svc().verify(good);
  assert.equal(a.phone, "+9647700000000");
});
