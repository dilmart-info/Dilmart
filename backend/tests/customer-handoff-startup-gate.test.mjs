/**
 * STORE-PR3 — B1 startup gate. The module must fail application startup if federated auth is claimed
 * enabled without a COMPLETE FederatedSessionIssuer (a bound provider with a callable redeemAndIssue).
 * No DB.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { CustomerHandoffModule } = await import(
  "../dist/modules/store-integration/customer-handoff/customer-handoff.module.js"
);

// Config stub whose assertOnBoot resolves (feature-disabled path) but exposes federatedAuthEnabled.
function stubConfig(federatedAuthEnabled) {
  return { assertOnBoot: async () => {}, federatedAuthEnabled };
}

test("federated flag TRUE + no issuer → startup fails (fail closed)", async () => {
  await assert.rejects(() => new CustomerHandoffModule(stubConfig(true), undefined).onModuleInit(), /no complete FederatedSessionIssuer|refusing to start/);
});

test("federated flag TRUE + empty object issuer → startup fails", async () => {
  await assert.rejects(() => new CustomerHandoffModule(stubConfig(true), {}).onModuleInit(), /no complete FederatedSessionIssuer|refusing to start/);
});

test("federated flag TRUE + wrong-shaped issuer { issue() } → startup fails", async () => {
  const wrong = { issue: async () => ({}) };
  await assert.rejects(() => new CustomerHandoffModule(stubConfig(true), wrong).onModuleInit(), /no complete FederatedSessionIssuer|refusing to start/);
});

test("federated flag TRUE + complete issuer { redeemAndIssue() } (PR4 shape) → startup OK", async () => {
  const issuer = { redeemAndIssue: async () => ({ target: "/", session: {} }) };
  await new CustomerHandoffModule(stubConfig(true), issuer).onModuleInit(); // resolves
});

test("federated flag FALSE + no issuer → startup OK (PR3 default)", async () => {
  await new CustomerHandoffModule(stubConfig(false), undefined).onModuleInit(); // resolves
});
