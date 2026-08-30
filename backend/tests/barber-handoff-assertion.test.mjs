/**
 * Barber Handoff — Asymmetric assertion verifier. Real Ed25519 + RS256 keys generated with jose.
 * Mirrors customer-handoff-assertion.test.mjs's structure/rigor, adapted for Barber's claim shape
 * (role OWNER/BARBER, barbershopId, salonVerified — no phone/email verification-metadata rules,
 * since the Barber assertion's phone/city are informational sync data, not linking evidence).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomUUID } from "node:crypto";

const { BarberHandoffAssertionService, BarberAssertionInvalidError } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-handoff-assertion.service.js"
);
const { BarberHandoffConfig } = await import(
  "../dist/modules/store-integration/barber-handoff/barber-handoff.config.js"
);

const ISS = "DilMart-main";
const AUD = "DilMart-store-barber-handoff";

async function keyPair(alg) {
  const { publicKey, privateKey } = await jose.generateKeyPair(alg, { extractable: true });
  return { publicKey, privateKey, pem: await jose.exportSPKI(publicKey) };
}

const ed = await keyPair("EdDSA");
const edPrev = await keyPair("EdDSA");
const rs = await keyPair("RS256");

const RING = new Map([
  ["main-barber-current", { alg: "EdDSA", publicKeyPem: ed.pem }],
  ["main-barber-previous", { alg: "EdDSA", publicKeyPem: edPrev.pem }],
  ["main-barber-rs", { alg: "RS256", publicKeyPem: rs.pem }],
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
const svc = (overrides) => new BarberHandoffAssertionService(makeConfig(overrides));

function baseClaims(over = {}) {
  return {
    role: "OWNER",
    sourceApp: "barber_app",
    barbershopId: randomUUID(),
    salonVerified: true,
    sourceSurface: "barber_store_home",
    target: "/",
    clientStateHash: "a".repeat(64),
    ...over,
  };
}

async function sign(privateKey, { alg, kid }, claims = {}, time = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = kid === undefined ? { alg } : { alg, kid };
  const s = new jose.SignJWT(baseClaims(claims))
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

const CUR = { alg: "EdDSA", kid: "main-barber-current" };

test("1. valid current Ed25519 key verifies (OWNER)", async () => {
  const tok = await sign(ed.privateKey, CUR);
  const a = await svc().verify(tok);
  assert.equal(a.role, "OWNER");
  assert.equal(a.kid, "main-barber-current");
});

test("2. BARBER role accepted", async () => {
  const tok = await sign(ed.privateKey, CUR, { role: "BARBER" });
  const a = await svc().verify(tok);
  assert.equal(a.role, "BARBER");
});

test("3. valid previous rotation key verifies", async () => {
  const tok = await sign(edPrev.privateKey, { alg: "EdDSA", kid: "main-barber-previous" });
  const a = await svc().verify(tok);
  assert.equal(a.kid, "main-barber-previous");
});

test("4. unknown kid rejected", async () => {
  const tok = await sign(ed.privateKey, { alg: "EdDSA", kid: "ghost" });
  await assert.rejects(() => svc().verify(tok), BarberAssertionInvalidError);
});

test("5. missing kid rejected", async () => {
  const tok = await sign(ed.privateKey, { alg: "EdDSA", kid: undefined });
  await assert.rejects(() => svc().verify(tok), /missing kid/);
});

test("6. invalid signature rejected (key/kid mismatch)", async () => {
  const tok = await sign(edPrev.privateKey, CUR);
  await assert.rejects(() => svc().verify(tok), BarberAssertionInvalidError);
});

test("7. wrong issuer rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { iss: "evil" });
  await assert.rejects(() => svc().verify(tok), BarberAssertionInvalidError);
});

test("8. wrong audience rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { aud: "someone-else" });
  await assert.rejects(() => svc().verify(tok), BarberAssertionInvalidError);
});

test("9. wrong role rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { role: "CUSTOMER" });
  await assert.rejects(() => svc().verify(tok), /role must be OWNER or BARBER/);
});

test("10. wrong sourceApp rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { sourceApp: "customer_app" });
  await assert.rejects(() => svc().verify(tok), /sourceApp/);
});

test("11. expired assertion rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await sign(ed.privateKey, CUR, {}, { iat: now - 120, nbf: now - 120, exp: now - 60 });
  await assert.rejects(() => svc().verify(tok), BarberAssertionInvalidError);
});

test("12. lifetime over 60s rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await sign(ed.privateKey, CUR, {}, { iat: now, nbf: now, exp: now + 120 });
  await assert.rejects(() => svc().verify(tok), /lifetime exceeds the configured maximum/);
});

test("12b. a TIGHTER configured maximum is honored for the declared exp-nbf lifetime (not just maxTokenAge)", async () => {
  const now = Math.floor(Date.now() / 1000);
  // Freshly issued 50s-lifetime token: passes jose's maxTokenAge (age ~0) but must fail the
  // configured 30s declared-lifetime bound.
  const tok = await sign(ed.privateKey, CUR, {}, { iat: now, nbf: now, exp: now + 50 });
  await assert.rejects(() => svc({ maxTtl: 30 }).verify(tok), /lifetime exceeds the configured maximum/);
  // The same token verifies fine under the default 60s bound.
  const a = await svc().verify(tok);
  assert.equal(a.role, "OWNER");
});

test("12c. kid/alg mismatch is reported even when the key is already cached (cache-order regression)", async () => {
  const s = svc();
  // Warm the cache with a valid verification for this kid.
  await s.verify(await sign(ed.privateKey, CUR));
  // Same kid, different (allowed) alg → must still be the deterministic mismatch reason.
  const tok = await sign(rs.privateKey, { alg: "RS256", kid: "main-barber-current" });
  await assert.rejects(() => s.verify(tok), /kid\/alg mismatch/);
});

test("13. HS256 rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await new jose.SignJWT(baseClaims())
    .setProtectedHeader({ alg: "HS256", kid: "main-barber-current" })
    .setIssuer(ISS).setAudience(AUD).setSubject(randomUUID()).setJti(`jti-${randomUUID()}`)
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50)
    .sign(new TextEncoder().encode("shared-secret-shared-secret-shared-secret"));
  await assert.rejects(() => svc().verify(tok), /algorithm not allowed/);
});

test("14. alg=none rejected", async () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const header = b64({ alg: "none", kid: "main-barber-current" });
  const payload = b64({ ...baseClaims(), iss: ISS, aud: AUD, sub: randomUUID(), jti: "x".repeat(12), iat: now, nbf: now, exp: now + 50 });
  const tok = `${header}.${payload}.`;
  await assert.rejects(() => svc().verify(tok), /algorithm not allowed/);
});

test("15. algorithm/key mismatch rejected", async () => {
  const tok = await sign(rs.privateKey, { alg: "RS256", kid: "main-barber-current" });
  await assert.rejects(() => svc().verify(tok), /kid\/alg mismatch/);
});

test("16. missing jti rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const tok = await new jose.SignJWT(baseClaims())
    .setProtectedHeader(CUR).setIssuer(ISS).setAudience(AUD).setSubject(randomUUID())
    .setIssuedAt(now).setNotBefore(now).setExpirationTime(now + 50)
    .sign(ed.privateKey);
  await assert.rejects(() => svc().verify(tok), /invalid jti/);
});

test("17. invalid subject UUID rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { sub: "not-a-uuid" });
  await assert.rejects(() => svc().verify(tok), /invalid sub/);
});

test("18. missing/invalid barbershopId rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { barbershopId: "not-a-uuid" });
  await assert.rejects(() => svc().verify(tok), /invalid barbershopId/);
});

test("19. missing salonVerified rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { salonVerified: undefined });
  await assert.rejects(() => svc().verify(tok), /missing salonVerified/);
});

test("20. salonVerified=false is carried through (not rejected — a real, informative claim)", async () => {
  const tok = await sign(ed.privateKey, CUR, { salonVerified: false });
  const a = await svc().verify(tok);
  assert.equal(a.salonVerified, false);
});

test("21. invalid (non-string) target rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, { target: 12345 });
  await assert.rejects(() => svc().verify(tok), /invalid target/);
});

test("22. optional fields (shopName/businessType/displayName/phone/city) pass through when present, bounded", async () => {
  const tok = await sign(ed.privateKey, CUR, {
    shopName: "Salon A", businessType: "men_barbershop", displayName: "Ali", phone: "+9647700000000", city: "Baghdad",
  });
  const a = await svc().verify(tok);
  assert.equal(a.shopName, "Salon A");
  assert.equal(a.businessType, "men_barbershop");
  assert.equal(a.displayName, "Ali");
  assert.equal(a.phone, "+9647700000000");
  assert.equal(a.city, "Baghdad");
});

test("23. optional fields absent are undefined, not rejected", async () => {
  const tok = await sign(ed.privateKey, CUR, {});
  const a = await svc().verify(tok);
  assert.equal(a.shopName, undefined);
  assert.equal(a.phone, undefined);
});

test("24. malformed key-ring configuration fails closed (array format)", () => {
  const K = "DilMart_BARBER_HANDOFF_PUBLIC_KEYS_JSON";
  const mk = (v) => new BarberHandoffConfig({ get: (k) => (k === K ? v : undefined) });
  assert.throws(() => mk("{not json").getKeyRing(), /not valid JSON/);
  assert.throws(() => mk(JSON.stringify({ "kid-1": { alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" } })).getKeyRing(), /must be a JSON array/);
  assert.throws(() => mk(JSON.stringify([{ kid: "kid-1", alg: "HS256", publicKeyPem: "x" }])).getKeyRing(), /unsupported alg/);
  assert.throws(() => mk(JSON.stringify([{ kid: "a", alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" }])).getKeyRing(), /invalid kid/);
  assert.throws(() => mk(JSON.stringify([
    { kid: "dup-kid", alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" },
    { kid: "dup-kid", alg: "EdDSA", publicKeyPem: "BEGIN PUBLIC KEY" },
  ])).getKeyRing(), /DUPLICATE kid/);
});
