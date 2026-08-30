/**
 * STORE-PR4 Security Closure B5 — the verifier requires EVERY mandatory access-token claim and enforces the
 * exact 600s lifetime contract (nbf === iat, exp - iat === 600), even when the signature is otherwise valid.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomBytes, randomUUID } from "node:crypto";

const { FederatedAuthConfig } = await import("../dist/modules/auth/federated/federated-auth.config.js");
const { FederatedSessionVerifierService, FederatedSessionInvalidError } = await import("../dist/modules/auth/federated/federated-session-verifier.service.js");

const ISS = "DilMart-store", AUD = "DilMart-store-api", KID = "acc-2026-08";
const ed = await jose.generateKeyPair("EdDSA", { extractable: true });
const edPriv = await jose.exportPKCS8(ed.privateKey), edPub = await jose.exportSPKI(ed.publicKey);
const SECRET = randomBytes(32).toString("base64url");
const config = new FederatedAuthConfig({ get: (k) => ({
  STORE_FEDERATED_AUTH_ENABLED: "true", STORE_FEDERATED_ACCESS_SIGNING_KID: KID, STORE_FEDERATED_ACCESS_SIGNING_ALG: "EdDSA",
  STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM: edPriv, STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: KID, alg: "EdDSA", publicKeyPem: edPub }]),
  STORE_FEDERATED_REFRESH_HASH_SECRET: SECRET,
}[k]) });

const ctx = { sub: randomUUID(), sessionFamilyId: randomUUID(), linkedProfileId: randomUUID(), DilMartUserId: randomUUID() };
const validRepo = { validateSessionFamily: async () => ({ valid: true, store_customer_id: ctx.sub, linked_profile_id: ctx.linkedProfileId, DilMart_user_id: ctx.DilMartUserId, session_version: 1, email: null, phone: null }) };
const verifier = new FederatedSessionVerifierService(config, validRepo);

// Build a fully-valid claim set, then let each test omit or corrupt exactly one field.
function fullClaims(now) {
  return {
    iss: ISS, aud: AUD, sub: ctx.sub, jti: randomUUID(), iat: now, nbf: now, exp: now + 600,
    sessionType: "DilMart_federated_customer", sessionFamilyId: ctx.sessionFamilyId,
    linkedProfileId: ctx.linkedProfileId, DilMartUserId: ctx.DilMartUserId, role: "customer",
    origin: "customer_app", sessionVersion: 1,
  };
}
// Sign a raw JWT from an explicit claim object WITHOUT jose's auto timestamp helpers, so a claim can be truly absent.
async function signClaims(claims) {
  return new jose.SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: KID }).sign(ed.privateKey);
}

test("a fully-valid claim set verifies (control)", async () => {
  const now = Math.floor(Date.now() / 1000);
  const actor = await verifier.verify(await signClaims(fullClaims(now)));
  assert.equal(actor.actorId, ctx.sub);
});

test("each missing mandatory claim is rejected even with a valid signature", async () => {
  const now = Math.floor(Date.now() / 1000);
  const mandatory = ["iss","aud","sub","jti","iat","nbf","exp","sessionType","sessionFamilyId","linkedProfileId","DilMartUserId","role","origin","sessionVersion"];
  for (const claim of mandatory) {
    const c = fullClaims(now); delete c[claim];
    await assert.rejects(async () => verifier.verify(await signClaims(c)), FederatedSessionInvalidError, `missing ${claim} must reject`);
  }
});

test("malformed / mistyped registered claims are rejected", async () => {
  const now = Math.floor(Date.now() / 1000);
  const cases = [
    { jti: "not-a-uuid" },
    { iat: String(now) },            // string iat
    { nbf: String(now) },            // string nbf
    { exp: String(now + 600) },      // string exp
    { exp: now - 1 },                // exp <= iat
    { iat: now - 5, exp: now + 595 },// nbf(now) !== iat(now-5)
    { exp: now + 599 },              // 599s lifetime (exact contract is 600)
    { exp: now + 601 },              // 601s lifetime
    { sessionVersion: 0 },           // < 1
    { sessionVersion: 1.5 },         // non-integer
    { sub: "not-a-uuid" },
  ];
  for (const patch of cases) {
    const c = { ...fullClaims(now), ...patch };
    await assert.rejects(async () => verifier.verify(await signClaims(c)), FederatedSessionInvalidError, JSON.stringify(patch));
  }
});
