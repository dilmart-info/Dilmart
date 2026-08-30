/**
 * STORE-PR4 — Boot-time fail-closed gate (spec §9, §16.6). The FederatedAuthModule.onModuleInit calls
 * config.assertOnBoot(): disabled boots without keys; enabled-but-incomplete/mismatched MUST refuse to boot,
 * so the feature can never come up half-configured (which would issue unverifiable tokens). This also pins
 * the DI contract the PR3 CustomerHandoffModule relies on: the issuer exposes redeemAndIssue().
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import { randomBytes } from "node:crypto";

const { FederatedAuthConfig } = await import("../dist/modules/auth/federated/federated-auth.config.js");
const { FederatedSessionIssuerService } = await import("../dist/modules/auth/federated/federated-session-issuer.service.js");
const { FEDERATED_SESSION_ISSUER } = await import("../dist/modules/store-integration/customer-handoff/federated-session-issuer.js");

const cfg = (map) => new FederatedAuthConfig({ get: (k) => map[k] });
const SECRET = randomBytes(32).toString("base64url");

test("disabled → boots (assertOnBoot resolves) with no signing material present", async () => {
  await cfg({ STORE_FEDERATED_AUTH_ENABLED: "false" }).assertOnBoot();
});

test("enabled but MISSING signing config → refuses to boot (fail closed)", async () => {
  await assert.rejects(() => cfg({ STORE_FEDERATED_AUTH_ENABLED: "true" }).assertOnBoot());
  await assert.rejects(() => cfg({ STORE_FEDERATED_AUTH_ENABLED: "true", STORE_FEDERATED_REFRESH_HASH_SECRET: SECRET }).assertOnBoot());
});

test("enabled + COMPLETE config → boots", async () => {
  const ed = await jose.generateKeyPair("EdDSA", { extractable: true });
  await cfg({
    STORE_FEDERATED_AUTH_ENABLED: "true", STORE_FEDERATED_ACCESS_SIGNING_KID: "acc-2026-08", STORE_FEDERATED_ACCESS_SIGNING_ALG: "EdDSA",
    STORE_FEDERATED_ACCESS_PRIVATE_KEY_PEM: await jose.exportPKCS8(ed.privateKey),
    STORE_FEDERATED_ACCESS_PUBLIC_KEYS_JSON: JSON.stringify([{ kid: "acc-2026-08", alg: "EdDSA", publicKeyPem: await jose.exportSPKI(ed.publicKey) }]),
    STORE_FEDERATED_REFRESH_HASH_SECRET: SECRET,
  }).assertOnBoot();
});

test("DI contract: the concrete issuer implements redeemAndIssue() (the token PR3 binds to)", () => {
  const issuer = new FederatedSessionIssuerService(cfg({}), { sign: async () => ({}) }, {}, {});
  assert.equal(typeof issuer.redeemAndIssue, "function");
  assert.equal(typeof FEDERATED_SESSION_ISSUER, "symbol", "PR3 exposes a stable DI token for the issuer");
});
