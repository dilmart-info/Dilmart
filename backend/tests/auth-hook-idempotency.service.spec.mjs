import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { AuthHookIdempotencyService } from "../dist/modules/auth/auth-hook-idempotency.service.js";
import { createDeliveryTable, createFakeSupabaseClient } from "./helpers/auth-hook-durable-fake.mjs";

function configWith(nodeEnv = "test") {
  return {
    get: (key) => (key === "NODE_ENV" ? nodeEnv : undefined),
  };
}

test("AuthHookIdempotencyService — claims lease for fresh webhook-id", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const service = new AuthHookIdempotencyService(configWith(), supabase);
  const webhookId = crypto.randomUUID();
  const digest = crypto.createHash("sha256").update("test_body").digest("hex");

  const result = await service.claim(webhookId, digest);
  assert.equal(result.status, "CLAIMED");
  assert.equal(result.attemptCount, 1);
});

test("AuthHookIdempotencyService — returns SUCCEEDED and prevents duplicate send on repeated webhook-id", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const service = new AuthHookIdempotencyService(configWith(), supabase);
  const webhookId = crypto.randomUUID();
  const digest = crypto.createHash("sha256").update("test_body").digest("hex");

  await service.claim(webhookId, digest);
  await service.complete(webhookId, "wamid.ACCEPTED_MSG");

  const repeated = await service.claim(webhookId, digest);
  assert.equal(repeated.status, "SUCCEEDED");
  assert.equal(repeated.providerMessageId, "wamid.ACCEPTED_MSG");
});

test("AuthHookIdempotencyService — returns CONFLICT if webhook-id reused with different payload digest", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const service = new AuthHookIdempotencyService(configWith(), supabase);
  const webhookId = crypto.randomUUID();
  const digestA = crypto.createHash("sha256").update("payload_A").digest("hex");
  const digestB = crypto.createHash("sha256").update("payload_B").digest("hex");

  await service.claim(webhookId, digestA);
  const conflict = await service.claim(webhookId, digestB);

  assert.equal(conflict.status, "CONFLICT");
});
