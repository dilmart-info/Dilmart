/**
 * STORE-PR6A — Order Summary boot-time config validation (review fix #2).
 * When STORE_CUSTOMER_ORDER_SUMMARY_ENABLED=true, every security-critical value the Summary verifier consumes
 * (importable key ring, assertion max TTL, shared clock tolerance) must be validated at boot — independently of
 * any Handoff flag, and WITHOUT enforcing unrelated Handoff URL/secret/limiter requirements.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";

const { CustomerOrderSummaryConfig } = await import(
  "../dist/modules/store-integration/customer-order-summary/customer-order-summary.config.js"
);
const { CustomerHandoffConfig } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff.config.js"
);

// A real importable EdDSA public key so boot gets PAST key-ring validation and reaches TTL/clock-tolerance checks.
const { publicKey } = await jose.generateKeyPair("EdDSA", { extractable: true });
const PEM = await jose.exportSPKI(publicKey);
const VALID_RING = JSON.stringify([{ kid: "main-customer-current", alg: "EdDSA", publicKeyPem: PEM }]);

function makeConfig(env) {
  const cs = { get: (k) => env[k] };
  const handoff = new CustomerHandoffConfig(cs);
  return new CustomerOrderSummaryConfig(cs, handoff);
}

const BASE = { STORE_CUSTOMER_ORDER_SUMMARY_ENABLED: "true", DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON: VALID_RING };

test("enabled + fully valid crypto/time config → boot passes (decoupled from Handoff URL/secret/limiter)", async () => {
  // NOTE: no STORE_HANDOFF_OPEN_BASE_URL / STORE_FEDERATED_ID_SECRET / handoff flag are set — Summary boot must
  // NOT require them (it never calls CustomerHandoffConfig.assertOnBoot()).
  await makeConfig({ ...BASE }).assertOnBoot();
});

test("enabled + malformed shared clock tolerance → boot fails (even with Handoff DISABLED)", async () => {
  const env = { ...BASE, STORE_CUSTOMER_HANDOFF_ENABLED: undefined, STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS: "abc" };
  await assert.rejects(() => makeConfig(env).assertOnBoot(), /STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS/);
});

test("enabled + out-of-range clock tolerance → boot fails", async () => {
  const env = { ...BASE, STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS: "99" }; // allowed range is 0..10
  await assert.rejects(() => makeConfig(env).assertOnBoot(), /STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS/);
});

test("enabled + malformed assertion max TTL → boot fails", async () => {
  const env = { ...BASE, STORE_ORDER_SUMMARY_ASSERTION_MAX_TTL_SECONDS: "1e9" };
  await assert.rejects(() => makeConfig(env).assertOnBoot(), /STORE_ORDER_SUMMARY_ASSERTION_MAX_TTL_SECONDS/);
});

test("enabled + malformed key ring → boot fails", async () => {
  await assert.rejects(() => makeConfig({ ...BASE, DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON: "{not json" }).assertOnBoot(), /not valid JSON/);
});

test("DISABLED → boot is a no-op even with malformed config", async () => {
  const env = { STORE_CUSTOMER_ORDER_SUMMARY_ENABLED: "false", STORE_HANDOFF_CLOCK_TOLERANCE_SECONDS: "abc" };
  await makeConfig(env).assertOnBoot(); // resolves — no validation when the feature is off
});

test("flag independence: enabling Summary does not read any Handoff/Federated/AutoLink flag", () => {
  const cfg = makeConfig({ ...BASE, STORE_CUSTOMER_HANDOFF_ENABLED: "false", STORE_FEDERATED_AUTH_ENABLED: "false", STORE_IDENTITY_AUTO_LINK_ENABLED: "false" });
  assert.equal(cfg.enabled, true);
});
