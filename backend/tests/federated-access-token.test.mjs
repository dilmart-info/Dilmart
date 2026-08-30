/**
 * STORE-PR4 — Access-token signing + verification (spec §9.2). No DB (fake family validator).
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomBytes, randomUUID } from "node:crypto";

const { FederatedAuthConfig } = await import("../dist/modules/auth/federated/federated-auth.config.js");
const { FederatedAccessTokenService } = await import("../dist/modules/auth/federated/federated-access-token.service.js");
const { FederatedSessionVerifierService, FederatedSessionInvalidError } = await import("../dist/modules/auth/federated/federated-session-verifier.service.js");

const ISS = "DilMart-store", AUD = "DilMart-store-api", KID = "acc-2026-08";
const ed = await jose.generateKeyPair("EdDSA", { extractable: true });
const edPriv = await jose.exportPKCS8(ed.privateKey);
const edPub = await jose.exportSPKI(ed.publicKey);
const SECRET = randomBytes(32).toString("base64url");

const config = new FederatedAuthConfig({ get: (k) => ({
  STORE_FEDERATED_AUTH_ENABLED: "true", STORE_FEDERATED_ACCESS_SIGNING_KID: KID, STORE_FEDERATED_ACCESS_SIGNING_ALG: "EdDSA",
  STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM: edPriv, STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: KID, alg: "EdDSA", publicKeyPem: edPub }]),
  STORE_FEDERATED_REFRESH_HASH_SECRET: SECRET,
}[k]) });
const access = new FederatedAccessTokenService(config);

const ctx = { storeCustomerId: randomUUID(), sessionFamilyId: randomUUID(), linkedProfileId: randomUUID(), DilMartUserId: randomUUID(), sessionVersion: 1 };
function validRepo() {
  return { validateSessionFamily: async () => ({ valid: true, store_customer_id: ctx.storeCustomerId, linked_profile_id: ctx.linkedProfileId, DilMart_user_id: ctx.DilMartUserId, session_version: 1, email: "buyer@example.com", phone: null }) };
}
const verifier = (repo = validRepo()) => new FederatedSessionVerifierService(config, repo);

async function signRaw(claims, { alg = "EdDSA", kid = KID, iss = ISS, aud = AUD, key = ed.privateKey, nbfOff = 0, expOff = 600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = kid === null ? { alg } : { alg, kid };
  return new jose.SignJWT({ sessionType: "DilMart_federated_customer", sessionFamilyId: ctx.sessionFamilyId, linkedProfileId: ctx.linkedProfileId, DilMartUserId: ctx.DilMartUserId, role: "customer", origin: "customer_app", sessionVersion: 1, ...claims })
    .setProtectedHeader(header).setIssuer(iss).setAudience(aud).setSubject(claims.sub ?? ctx.storeCustomerId).setJti(randomUUID())
    .setIssuedAt(now).setNotBefore(now + nbfOff).setExpirationTime(now + nbfOff + expOff).sign(key);
}

test("valid Ed25519 token round-trips to a VerifiedFederatedActor", async () => {
  const { accessToken, expiresIn } = await access.sign(ctx);
  assert.equal(expiresIn, 600);
  const actor = await verifier().verify(accessToken);
  assert.equal(actor.actorRole, "customer");
  assert.equal(actor.actorId, ctx.storeCustomerId);
  assert.equal(actor.authSource, "DilMart_federated");
  assert.equal(actor.sessionFamilyId, ctx.sessionFamilyId);
  assert.equal(actor.sessionVersion, 1);
});

test("missing kid / unknown kid / HS256 / none rejected", async () => {
  await assert.rejects(async () => verifier().verify(await signRaw({}, { kid: null })), /missing kid/);
  await assert.rejects(async () => verifier().verify(await signRaw({}, { kid: "ghost" })), FederatedSessionInvalidError);
  const hs = await new jose.SignJWT({ role: "customer" }).setProtectedHeader({ alg: "HS256", kid: KID }).setIssuer(ISS).setAudience(AUD).setSubject(ctx.storeCustomerId).setExpirationTime("600s").sign(new TextEncoder().encode("x".repeat(40)));
  await assert.rejects(() => verifier().verify(hs), /algorithm not allowed/);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const none = `${b64({ alg: "none", kid: KID })}.${b64({ iss: ISS, aud: AUD, sub: ctx.storeCustomerId })}.`;
  await assert.rejects(() => verifier().verify(none), /algorithm not allowed/);
});

test("wrong issuer / audience rejected", async () => {
  await assert.rejects(async () => verifier().verify(await signRaw({}, { iss: "evil" })), FederatedSessionInvalidError);
  await assert.rejects(async () => verifier().verify(await signRaw({}, { aud: "evil" })), FederatedSessionInvalidError);
});

test("wrong sessionType / role / origin rejected", async () => {
  await assert.rejects(async () => verifier().verify(await signRaw({ sessionType: "other" })), /sessionType/);
  await assert.rejects(async () => verifier().verify(await signRaw({ role: "admin" })), /role/);
  await assert.rejects(async () => verifier().verify(await signRaw({ origin: "barber_app" })), /origin/);
});

test("malformed UUID claims + session-version <1 rejected", async () => {
  await assert.rejects(async () => verifier().verify(await signRaw({ sub: "not-a-uuid" })), /invalid sub/);
  await assert.rejects(async () => verifier().verify(await signRaw({ sessionFamilyId: "x" })), /sessionFamilyId/);
  await assert.rejects(async () => verifier().verify(await signRaw({ sessionVersion: 0 })), /sessionVersion/);
});

test("expired token / future nbf / TTL>600 rejected", async () => {
  await assert.rejects(async () => verifier().verify(await signRaw({}, { nbfOff: -1200, expOff: 600 })), FederatedSessionInvalidError); // expired
  await assert.rejects(async () => verifier().verify(await signRaw({}, { nbfOff: 120, expOff: 600 })), FederatedSessionInvalidError); // future nbf beyond tolerance
  await assert.rejects(async () => verifier().verify(await signRaw({}, { nbfOff: 0, expOff: 700 })), /lifetime exceeds/); // TTL > 600
});

test("DB family invalid (revoked/version-mismatch) → token rejected even if crypto-valid", async () => {
  const repo = { validateSessionFamily: async () => ({ valid: false, store_customer_id: null, linked_profile_id: null, DilMart_user_id: null, session_version: null, email: null, phone: null }) };
  const { accessToken } = await access.sign(ctx);
  await assert.rejects(() => verifier(repo).verify(accessToken), /session family invalid/);
});

test("RS256 signing config also produces a verifiable token", async () => {
  const rs = await jose.generateKeyPair("RS256", { extractable: true });
  const rsPriv = await jose.exportPKCS8(rs.privateKey), rsPub = await jose.exportSPKI(rs.publicKey);
  const rsMap = {
    STORE_FEDERATED_AUTH_ENABLED: "true", STORE_FEDERATED_ACCESS_SIGNING_KID: KID, STORE_FEDERATED_ACCESS_SIGNING_ALG: "RS256",
    STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM: rsPriv,
    STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: KID, alg: "RS256", publicKeyPem: rsPub }]),
    STORE_FEDERATED_REFRESH_HASH_SECRET: SECRET,
  };
  const rsConfig = new FederatedAuthConfig({ get: (k) => rsMap[k] });
  const { accessToken } = await new FederatedAccessTokenService(rsConfig).sign(ctx);
  const actor = await new FederatedSessionVerifierService(rsConfig, validRepo()).verify(accessToken);
  assert.equal(actor.actorId, ctx.storeCustomerId);
});
