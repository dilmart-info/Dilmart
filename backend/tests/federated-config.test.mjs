/**
 * STORE-PR4 — FederatedAuthConfig strictness (spec §9, §16.6). No DB.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomBytes } from "node:crypto";

const { FederatedAuthConfig } = await import("../dist/modules/auth/federated/federated-auth.config.js");

const ed = await jose.generateKeyPair("EdDSA", { extractable: true });
const edPriv = await jose.exportPKCS8(ed.privateKey);
const edPub = await jose.exportSPKI(ed.publicKey);
const rs = await jose.generateKeyPair("RS256", { extractable: true });
const rsPub = await jose.exportSPKI(rs.publicKey);
const SECRET = randomBytes(32).toString("base64url");

const cfg = (map) => new FederatedAuthConfig({ get: (k) => map[k] });
const complete = (over = {}) => ({
  STORE_FEDERATED_AUTH_ENABLED: "true",
  STORE_FEDERATED_ACCESS_SIGNING_KID: "acc-2026-08",
  STORE_FEDERATED_ACCESS_SIGNING_ALG: "EdDSA",
  STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM: edPriv,
  STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: "acc-2026-08", alg: "EdDSA", publicKeyPem: edPub }]),
  STORE_FEDERATED_REFRESH_HASH_SECRET: SECRET,
  ...over,
});

test("feature disabled → assertOnBoot resolves without any keys", async () => {
  await cfg({}).assertOnBoot();
});

test("feature enabled + complete config → assertOnBoot resolves (private/public compatibility verified)", async () => {
  await cfg(complete()).assertOnBoot();
});

test("exact TTLs enforced (601 access / 2592001 refresh / etc. rejected)", () => {
  assert.equal(cfg({}).accessTtlSeconds, 600);
  assert.throws(() => cfg({ STORE_FEDERATED_ACCESS_TTL_SECONDS: "601" }).accessTtlSeconds, /\[600, 600\]/);
  assert.throws(() => cfg({ STORE_FEDERATED_REFRESH_TTL_SECONDS: "2592001" }).refreshTtlSeconds, /2592000/);
  assert.throws(() => cfg({ STORE_FEDERATED_ABSOLUTE_TTL_SECONDS: "7776001" }).absoluteTtlSeconds, /7776000/);
  assert.throws(() => cfg({ STORE_FEDERATED_ACCESS_CLOCK_TOLERANCE_SECONDS: "11" }).clockToleranceSeconds, /\[0, 10\]/);
  assert.throws(() => cfg({ STORE_FEDERATED_ACCESS_TTL_SECONDS: "  " }).accessTtlSeconds, /whitespace/);
});

test("refresh hash secret must be base64url decoding to >= 32 bytes", () => {
  assert.throws(() => cfg({}).getRefreshHashSecret(), /not set/);
  assert.throws(() => cfg({ STORE_FEDERATED_REFRESH_HASH_SECRET: "short-pw-16chars" }).getRefreshHashSecret(), /32 bytes|base64url/);
  assert.equal(cfg({ STORE_FEDERATED_REFRESH_HASH_SECRET: SECRET }).getRefreshHashSecret(), SECRET);
});

test("public ring: array only, duplicate kid + unsupported alg rejected", () => {
  assert.throws(() => cfg({ STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify({ k: 1 }) }).getPublicKeyRing(), /must be a JSON array/);
  assert.throws(() => cfg({ STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: "acc-1", alg: "EdDSA", publicKeyPem: edPub }, { kid: "acc-1", alg: "EdDSA", publicKeyPem: edPub }]) }).getPublicKeyRing(), /DUPLICATE/i);
  assert.throws(() => cfg({ STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: "acc-1", alg: "HS256", publicKeyPem: edPub }]) }).getPublicKeyRing(), /unsupported alg/);
});

test("missing / malformed private key fails", async () => {
  await assert.rejects(() => cfg({ STORE_FEDERATED_ACCESS_SIGNING_ALG: "EdDSA" }).getPrivateKey(), /not set/);
  await assert.rejects(() => cfg({ STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM: "-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----", STORE_FEDERATED_ACCESS_SIGNING_ALG: "EdDSA" }).getPrivateKey(), /importPKCS8|malformed/);
});

test("signing kid absent from the public ring fails boot", async () => {
  await assert.rejects(() => cfg(complete({ STORE_FEDERATED_ACCESS_SIGNING_KID: "ghost" })).assertOnBoot(), /not present in/);
});

test("private/public mismatch fails boot", async () => {
  // Public ring has a DIFFERENT Ed25519 key than the private one.
  const other = await jose.exportSPKI((await jose.generateKeyPair("EdDSA", { extractable: true })).publicKey);
  await assert.rejects(() => cfg(complete({ STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: "acc-2026-08", alg: "EdDSA", publicKeyPem: other }]) })).assertOnBoot());
});

test("alg/key-type mismatch (RSA public declared EdDSA) fails boot", async () => {
  await assert.rejects(() => cfg(complete({ STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: "acc-2026-08", alg: "EdDSA", publicKeyPem: rsPub }]) })).assertOnBoot());
});
