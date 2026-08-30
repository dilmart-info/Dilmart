/**
 * STORE-PR3 — Strict fail-closed configuration (task B3 + B6/B7). No DB.
 * Present-but-malformed/whitespace security values throw; missing optional values use approved defaults.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomBytes } from "node:crypto";

const { CustomerHandoffConfig } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff.config.js"
);

const cfg = (map) => new CustomerHandoffConfig({ get: (k) => map[k] });
const SECRET = randomBytes(32).toString("base64url"); // valid 32-byte base64url HMAC key
const ringOf = (pem, alg = "EdDSA", kid = "main-current") => JSON.stringify([{ kid, alg, publicKeyPem: pem }]);

test("strict numeric parsing rejects NaN/Infinity/negative/decimal/whitespace/huge", () => {
  for (const bad of ["abc", "Infinity", "-1", "1.5", "  ", "1e9", "99999999999999999999"]) {
    assert.throws(() => cfg({ STORE_HANDOFF_ASSERTION_MAX_TTL_SECONDS: bad }).assertionMaxTtlSeconds, /ASSERTION_MAX_TTL/, `reject ${JSON.stringify(bad)}`);
  }
  assert.equal(cfg({}).assertionMaxTtlSeconds, 60);
  assert.equal(cfg({ STORE_HANDOFF_ASSERTION_MAX_TTL_SECONDS: "45" }).assertionMaxTtlSeconds, 45);
  assert.throws(() => cfg({ STORE_HANDOFF_ASSERTION_MAX_TTL_SECONDS: "120" }).assertionMaxTtlSeconds, /\[1, 60\]/);
});

test("clock tolerance is a narrow bounded integer (0..10)", () => {
  assert.equal(cfg({}).clockToleranceSeconds, 5);
  assert.equal(cfg({ STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS: "10" }).clockToleranceSeconds, 10);
  assert.throws(() => cfg({ STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS: "11" }).clockToleranceSeconds, /\[0, 10\]/);
  assert.throws(() => cfg({ STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS: "3600" }).clockToleranceSeconds, /\[0, 10\]/);
});

test("code TTL must be exactly 120s; whitespace/other fail (missing → default)", () => {
  assert.equal(cfg({}).codeTtlSeconds, 120);
  assert.equal(cfg({ STORE_HANDOFF_CODE_TTL_SECONDS: "120" }).codeTtlSeconds, 120);
  for (const bad of ["121", "60", "  ", "abc"]) {
    assert.throws(() => cfg({ STORE_HANDOFF_CODE_TTL_SECONDS: bad }).codeTtlSeconds, /CODE_TTL/, `reject ${JSON.stringify(bad)}`);
  }
});

test("present-but-whitespace issuer/audience/approved-hosts fail closed (missing → default)", () => {
  assert.equal(cfg({}).issuer, "DilMart-main");
  assert.throws(() => cfg({ DilMart_CUSTOMER_HANDOFF_ISSUER: "   " }).issuer, /whitespace/);
  assert.throws(() => cfg({ DilMart_CUSTOMER_HANDOFF_AUDIENCE: "\t" }).audience, /whitespace/);
  assert.throws(() => cfg({ STORE_HANDOFF_OPEN_BASE_URL: "https://x/open", STORE_HANDOFF_APPROVED_HOSTS: "   ", STORE_ENV: "production" }).getOpenBaseUrl(), /whitespace|approved Store host/);
  assert.throws(() => cfg({ STORE_HANDOFF_OPEN_BASE_URL: "https://x/open", STORE_HANDOFF_APPROVED_HOSTS: "not a host!", STORE_ENV: "production" }).getOpenBaseUrl(), /invalid hostname|approved Store host/);
});

test("federated id secret must be a real base64url random key (>=32 bytes), not a short password", () => {
  assert.throws(() => cfg({}).getFederatedIdSecret(), /not set/);
  assert.throws(() => cfg({ STORE_FEDERATED_ID_SECRET: "  " }).getFederatedIdSecret(), /not set/);
  assert.throws(() => cfg({ STORE_FEDERATED_ID_SECRET: "a-human-readable-pw" }).getFederatedIdSecret(), /32 bytes|base64url/);
  assert.throws(() => cfg({ STORE_FEDERATED_ID_SECRET: "has spaces and !" }).getFederatedIdSecret(), /base64url/);
  assert.equal(cfg({ STORE_FEDERATED_ID_SECRET: SECRET }).getFederatedIdSecret(), SECRET);
});

test("boot key-ring import rejects a malformed PEM that CONTAINS the BEGIN marker", async () => {
  const ring = ringOf("-----BEGIN PUBLIC KEY-----\nnot-real-base64\n-----END PUBLIC KEY-----");
  await assert.rejects(() => cfg({ DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON: ring }).validateKeyRingImportable(), /failed jose.importSPKI|malformed key/);
});

test("boot key-ring import rejects an alg/key-type mismatch (RSA key declared EdDSA)", async () => {
  const { publicKey } = await jose.generateKeyPair("RS256", { extractable: true });
  const ring = ringOf(await jose.exportSPKI(publicKey), "EdDSA");
  await assert.rejects(() => cfg({ DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON: ring }).validateKeyRingImportable(), /incompatible|failed jose.importSPKI/);
});

test("a well-formed array ring imports cleanly; duplicate/short kids are rejected", async () => {
  const { publicKey } = await jose.generateKeyPair("EdDSA", { extractable: true });
  const pem = await jose.exportSPKI(publicKey);
  await cfg({ DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON: ringOf(pem) }).validateKeyRingImportable();
  assert.throws(() => cfg({ DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON: ringOf(pem, "EdDSA", "ab") }).getKeyRing(), /invalid kid/);
  assert.throws(() => cfg({ DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON: JSON.stringify([
    { kid: "same", alg: "EdDSA", publicKeyPem: pem }, { kid: "same", alg: "EdDSA", publicKeyPem: pem },
  ]) }).getKeyRing(), /DUPLICATE kid/);
});

test("B6/C5: prod limiter gate — only an explicit single-instance ACK passes; a shared-limiter URL does NOT", () => {
  assert.throws(() => cfg({ STORE_ENV: "production" }).assertLimiterDeploymentSafe(), /per-instance/);
  // A shared-limiter URL is IGNORED (no distributed limiter exists in PR3) → still fails closed.
  assert.throws(() => cfg({ STORE_ENV: "production", STORE_HANDOFF_SHARED_LIMITER_URL: "redis://x" }).assertLimiterDeploymentSafe(), /per-instance/);
  // Only the reviewed single-instance ack satisfies the gate.
  cfg({ STORE_ENV: "production", STORE_HANDOFF_SINGLE_INSTANCE_ACK: "true" }).assertLimiterDeploymentSafe();
  // Non-prod is unaffected.
  cfg({ STORE_ENV: "development" }).assertLimiterDeploymentSafe();
});

test("trusted proxy hops is a bounded integer (default 0)", () => {
  assert.equal(cfg({}).trustedProxyHops, 0);
  assert.equal(cfg({ STORE_TRUSTED_PROXY_HOPS: "1" }).trustedProxyHops, 1);
  assert.throws(() => cfg({ STORE_TRUSTED_PROXY_HOPS: "-1" }).trustedProxyHops, /\[0, 8\]/);
  assert.throws(() => cfg({ STORE_TRUSTED_PROXY_HOPS: "abc" }).trustedProxyHops, /integer/);
});

test("B2#7: the opaque federated identifier does NOT expose the raw DilMart UUID", async () => {
  const { CustomerShadowProvisionerService } = await import(
    "../dist/modules/store-integration/customer-handoff/customer-shadow-provisioner.service.js"
  );
  const prov = new CustomerShadowProvisionerService({}, cfg({ STORE_FEDERATED_ID_SECRET: SECRET }));
  const uuid = "11111111-2222-3333-4444-555555555555";
  const id = prov.federatedIdentifier(uuid);
  const email = prov.internalEmailFor(uuid);
  assert.ok(!id.includes(uuid), "opaque id must not contain the raw UUID");
  assert.ok(!email.includes(uuid), "reserved email must not contain the raw UUID");
  assert.ok(email.endsWith("@federated.DilMart.internal"));
  assert.equal(prov.federatedIdentifier(uuid), id, "deterministic");
});

test("B2: the server-side reserved-domain guard rejects reserved emails (defence in depth)", async () => {
  const { isReservedFederatedEmail } = await import(
    "../dist/modules/store-integration/customer-handoff/customer-shadow-provisioner.service.js"
  );
  assert.equal(isReservedFederatedEmail("attacker+x@federated.DilMart.internal"), true);
  assert.equal(isReservedFederatedEmail("  Buyer@FEDERATED.DilMart.INTERNAL "), true);
  assert.equal(isReservedFederatedEmail("real.customer@gmail.com"), false);
  assert.equal(isReservedFederatedEmail(null), false);
});
