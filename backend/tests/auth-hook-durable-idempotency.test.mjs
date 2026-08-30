/**
 * Durable Send SMS hook idempotency.
 *
 * Two things are under test:
 *   1. AuthHookIdempotencyService against a fake that mirrors the migration's state machine.
 *   2. The hook itself driving that ledger, including two instances racing one webhook-id.
 *
 * The SQL is not executed here — no database is available — so these tests verify the
 * decisions, not Postgres locking. That limitation is recorded in the closure report.
 *
 * Nothing in this file touches the network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "standardwebhooks";
import {
  createDeliveryTable,
  createFakeSupabaseClient,
  fakeSupabaseAdmin,
} from "./helpers/auth-hook-durable-fake.mjs";

const { AuthHookIdempotencyService } = await import(
  "../dist/modules/auth/auth-hook-idempotency.service.js"
);
const { SupabaseAuthHookService } = await import("../dist/modules/auth/supabase-auth-hook.service.js");

const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=";
const OTP = "483920";
const PHONE = "+9647501234567";

const configWith = (overrides = {}) => {
  const values = {
    SUPABASE_AUTH_HOOK_SECRET: SECRET,
    OTP_DURABLE_IDEMPOTENCY_REQUIRED: "true",
    ...overrides,
  };
  return { get: (key) => values[key] };
};

function signRequest(payload, { id } = {}) {
  const webhookId = id ?? crypto.randomUUID();
  const rawBody = JSON.stringify(payload);
  const timestamp = new Date();
  return {
    rawBody,
    headers: {
      "webhook-id": webhookId,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(SECRET).sign(webhookId, timestamp, rawBody),
    },
    payload,
  };
}

const bodyFor = (phone = PHONE, otp = OTP) => ({ user: { id: "user-1", phone }, sms: { otp } });

function providerStub(outcomes) {
  const calls = [];
  const queue = Array.isArray(outcomes) ? [...outcomes] : null;
  const fallback = Array.isArray(outcomes)
    ? { success: true, providerAcceptedMessageId: "wamid.TEST", latencyMs: 1 }
    : (outcomes ?? { success: true, providerAcceptedMessageId: "wamid.TEST", latencyMs: 1 });
  return {
    calls,
    sendOtp: async (destination, code, options) => {
      calls.push({ destination, code, options });
      const outcome = queue?.length ? queue.shift() : fallback;
      return typeof outcome === "function" ? await outcome() : outcome;
    },
  };
}

/** One backend instance: its own service objects, a shared delivery table. */
function makeInstance(table, provider, { configOverrides, clientOptions } = {}) {
  const config = configWith(configOverrides);
  const client = createFakeSupabaseClient(table, clientOptions);
  const durable = new AuthHookIdempotencyService(config, fakeSupabaseAdmin(client));
  const hook = new SupabaseAuthHookService(config, provider, durable);
  return { config, durable, hook };
}

const codeOf = (err) => err?.getResponse?.()?.code;

// ── Claim semantics ──────────────────────────────────────────────────────────

test("the first claim on a new webhook-id wins", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  const result = await durable.claim("wh-1", "digest-a");
  assert.equal(result.status, "CLAIMED");
  assert.equal(result.attemptCount, 1);
  assert.equal(table.rows.get("wh-1").state, "IN_FLIGHT");
});

test("only one of two racing instances is allowed to dispatch", async () => {
  const table = createDeliveryTable();
  const a = makeInstance(table, providerStub());
  const b = makeInstance(table, providerStub());

  const [first, second] = await Promise.all([
    a.durable.claim("wh-race", "digest-a"),
    b.durable.claim("wh-race", "digest-a"),
  ]);

  const statuses = [first.status, second.status].sort();
  assert.deepEqual(statuses, ["CLAIMED", "IN_FLIGHT"]);
  assert.notEqual(a.durable.instanceId, b.durable.instanceId);
});

test("the same id and digest after success returns SUCCEEDED with its wamid", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  await durable.claim("wh-2", "digest-a");
  await durable.complete("wh-2", "wamid.ABC");

  const replay = await durable.claim("wh-2", "digest-a");
  assert.equal(replay.status, "SUCCEEDED");
  assert.equal(replay.providerMessageId, "wamid.ABC");
});

test("the same id with a different digest is a conflict", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  await durable.claim("wh-3", "digest-a");
  await durable.complete("wh-3", "wamid.ABC");

  assert.equal((await durable.claim("wh-3", "digest-b")).status, "CONFLICT");
});

test("a live lease blocks a second claim", async () => {
  const table = createDeliveryTable();
  const a = makeInstance(table, providerStub());
  const b = makeInstance(table, providerStub());

  await a.durable.claim("wh-4", "digest-a");
  assert.equal((await b.durable.claim("wh-4", "digest-a")).status, "IN_FLIGHT");
});

test("an expired lease becomes UNCERTAIN rather than being taken over", async () => {
  const table = createDeliveryTable();
  const a = makeInstance(table, providerStub());
  const b = makeInstance(table, providerStub());

  await a.durable.claim("wh-5", "digest-a");
  table.clock.now += 60_000; // the owner crashed; the lease died with it

  const takeover = await b.durable.claim("wh-5", "digest-a");
  assert.equal(takeover.status, "UNCERTAIN");
  assert.equal(table.rows.get("wh-5").state, "UNCERTAIN");
  assert.equal(table.rows.get("wh-5").last_error_code, "LEASE_EXPIRED");
});

test("UNCERTAIN is terminal — it never becomes claimable again", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  await durable.claim("wh-6", "digest-a");
  await durable.markUncertain("wh-6", "OTP_PROVIDER_TIMEOUT");

  for (let i = 0; i < 5; i += 1) {
    assert.equal((await durable.claim("wh-6", "digest-a")).status, "UNCERTAIN");
  }
});

test("an explicit failure permits a bounded retry and then exhausts", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  assert.equal((await durable.claim("wh-7", "digest-a")).status, "CLAIMED");
  await durable.fail("wh-7", "META_132001");
  assert.equal((await durable.claim("wh-7", "digest-a")).status, "CLAIMED");
  await durable.fail("wh-7", "META_132001");
  assert.equal((await durable.claim("wh-7", "digest-a")).status, "CLAIMED");
  await durable.fail("wh-7", "META_132001");

  assert.equal((await durable.claim("wh-7", "digest-a")).status, "EXHAUSTED");
});

test("a superseded instance cannot complete a delivery it no longer owns", async () => {
  const table = createDeliveryTable();
  const a = makeInstance(table, providerStub());
  const b = makeInstance(table, providerStub());

  await a.durable.claim("wh-8", "digest-a");
  table.clock.now += 60_000;
  await b.durable.claim("wh-8", "digest-a"); // retires it to UNCERTAIN

  // The original instance finally comes back and tries to report success.
  assert.equal(await a.durable.complete("wh-8", "wamid.LATE"), false);
  assert.equal(table.rows.get("wh-8").state, "UNCERTAIN");
});

// ── Fail closed ──────────────────────────────────────────────────────────────

test("a missing durable store refuses the dispatch instead of falling back", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const { hook } = makeInstance(table, provider, { clientOptions: { failRpc: true } });

  await assert.rejects(
    () => hook.handleSendSms(signRequest(bodyFor())),
    (err) => {
      assert.equal(err.getStatus(), 503);
      assert.equal(codeOf(err), "SUPABASE_AUTH_HOOK_DURABLE_STORE_UNAVAILABLE");
      return true;
    },
  );
  assert.equal(provider.calls.length, 0, "nothing may be sent without a working ledger");
});

test("production treats the durable store as required even if the flag says otherwise", () => {
  const table = createDeliveryTable();
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const { durable } = makeInstance(table, providerStub(), {
      configOverrides: { OTP_DURABLE_IDEMPOTENCY_REQUIRED: "false" },
    });
    assert.equal(durable.isRequired(), true);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("production requires the store even with the flag unset", () => {
  const table = createDeliveryTable();
  const original = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const { durable } = makeInstance(table, providerStub(), {
      configOverrides: { OTP_DURABLE_IDEMPOTENCY_REQUIRED: undefined },
    });
    assert.equal(durable.isRequired(), true);
  } finally {
    process.env.NODE_ENV = original;
  }
});

test("outside production an explicit false keeps the in-memory path", () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub(), {
    configOverrides: { OTP_DURABLE_IDEMPOTENCY_REQUIRED: "false" },
  });
  assert.equal(durable.isRequired(), false);
});

// ── Hook driving the ledger ──────────────────────────────────────────────────

test("a successful send is recorded as SUCCEEDED with the provider message id", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const { hook } = makeInstance(table, provider);

  const request = signRequest(bodyFor());
  await hook.handleSendSms(request);

  const row = table.rows.get(request.headers["webhook-id"]);
  assert.equal(row.state, "SUCCEEDED");
  assert.equal(row.provider_message_id, "wamid.TEST");
  assert.equal(provider.calls.length, 1);
});

test("a retry after a restart does not send a second message", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const request = signRequest(bodyFor());

  // First pod delivers, then dies.
  await makeInstance(table, provider).hook.handleSendSms(request);
  // A brand new pod receives Supabase's retry. Its in-memory cache is empty.
  await makeInstance(table, provider).hook.handleSendSms(request);

  assert.equal(provider.calls.length, 1, "the durable ledger must survive the restart");
});

test("a timeout is recorded as UNCERTAIN and is never resent", async () => {
  const table = createDeliveryTable();
  const provider = providerStub([
    { success: false, errorCode: "OTP_PROVIDER_TIMEOUT", failureClass: "PROVIDER_TIMEOUT", latencyMs: 4000 },
  ]);
  const { hook } = makeInstance(table, provider);
  const request = signRequest(bodyFor());

  await assert.rejects(() => hook.handleSendSms(request));
  assert.equal(table.rows.get(request.headers["webhook-id"]).state, "UNCERTAIN");

  // Supabase retries the same id. It must not produce a second WhatsApp message.
  await assert.rejects(
    () => hook.handleSendSms(request),
    (err) => codeOf(err) === "SUPABASE_AUTH_HOOK_DELIVERY_UNCERTAIN",
  );
  assert.equal(provider.calls.length, 1);
});

test("an explicit Meta refusal is recorded as FAILED and may be retried", async () => {
  const table = createDeliveryTable();
  const provider = providerStub([
    { success: false, errorCode: "META_132001", failureClass: "TEMPLATE_ERROR", latencyMs: 10 },
    { success: true, providerAcceptedMessageId: "wamid.SECOND", latencyMs: 10 },
  ]);
  const { hook } = makeInstance(table, provider);
  const request = signRequest(bodyFor());

  await assert.rejects(() => hook.handleSendSms(request));
  assert.equal(table.rows.get(request.headers["webhook-id"]).state, "FAILED");

  await hook.handleSendSms(request);
  const row = table.rows.get(request.headers["webhook-id"]);
  assert.equal(row.state, "SUCCEEDED");
  assert.equal(row.attempt_count, 2);
  assert.equal(provider.calls.length, 2);
});

test("a webhook-id reused with different content is refused with 409", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const { hook } = makeInstance(table, provider);

  const first = signRequest(bodyFor());
  await hook.handleSendSms(first);

  const forged = signRequest(bodyFor("+9647509999999"), { id: first.headers["webhook-id"] });
  await assert.rejects(
    () => hook.handleSendSms(forged),
    (err) => {
      assert.equal(err.getStatus(), 409);
      assert.equal(codeOf(err), "SUPABASE_AUTH_HOOK_ID_REUSED_WITH_DIFFERENT_PAYLOAD");
      return true;
    },
  );
  assert.equal(provider.calls.length, 1);
});

test("a second instance does not double-send while the first is dispatching", async () => {
  const table = createDeliveryTable();
  let release;
  const gate = new Promise((resolve) => (release = resolve));

  const slowProvider = providerStub([
    async () => {
      await gate;
      return { success: true, providerAcceptedMessageId: "wamid.SLOW", latencyMs: 10 };
    },
  ]);
  const fastProvider = providerStub();

  const a = makeInstance(table, slowProvider);
  const b = makeInstance(table, fastProvider);
  const request = signRequest(bodyFor());

  const firstCall = a.hook.handleSendSms(request);
  await new Promise((resolve) => setImmediate(resolve));

  // The second pod sees a live lease. It waits, then gives up with a retryable 503 rather
  // than claiming a success it cannot vouch for.
  const secondCall = assert.rejects(
    () => b.hook.handleSendSms(request),
    (err) => codeOf(err) === "SUPABASE_AUTH_HOOK_DELIVERY_IN_PROGRESS",
  );

  await secondCall;
  release();
  await firstCall;

  assert.equal(slowProvider.calls.length, 1);
  assert.equal(fastProvider.calls.length, 0, "the second instance must not call Meta");
});

test("a concurrent duplicate resolves to 200 once the other instance succeeds", async () => {
  const table = createDeliveryTable();
  let release;
  const gate = new Promise((resolve) => (release = resolve));

  const slowProvider = providerStub([
    async () => {
      await gate;
      return { success: true, providerAcceptedMessageId: "wamid.SLOW", latencyMs: 10 };
    },
  ]);
  const fastProvider = providerStub();

  const a = makeInstance(table, slowProvider);
  const b = makeInstance(table, fastProvider);
  const request = signRequest(bodyFor());

  const firstCall = a.hook.handleSendSms(request);
  await new Promise((resolve) => setImmediate(resolve));
  const secondCall = b.hook.handleSendSms(request);

  setTimeout(release, 200);
  await firstCall;
  await secondCall; // resolves without throwing — the delivery really did happen

  assert.equal(slowProvider.calls.length, 1);
  assert.equal(fastProvider.calls.length, 0);
});

// ── Privacy ──────────────────────────────────────────────────────────────────

test("the ledger holds no OTP, no phone and no raw body", async () => {
  const table = createDeliveryTable();
  const { hook } = makeInstance(table, providerStub());
  const request = signRequest(bodyFor());
  await hook.handleSendSms(request);

  const serialized = JSON.stringify([...table.rows.values()]);
  assert.ok(!serialized.includes(OTP), "the OTP must never be stored");
  assert.ok(!serialized.includes(PHONE), "the phone must never be stored");
  assert.ok(!serialized.includes("9647501234567"), "no phone fragment either");
  assert.ok(!serialized.includes(request.rawBody), "the raw body must never be stored");

  const row = table.rows.get(request.headers["webhook-id"]);
  assert.match(row.payload_digest, /^[a-f0-9]{64}$/);
  assert.notEqual(row.payload_digest, request.rawBody);
});

test("durable failures are logged without a phone, an OTP or a digest", async () => {
  const captured = [];
  const table = createDeliveryTable();
  const provider = providerStub([
    { success: false, errorCode: "OTP_PROVIDER_TIMEOUT", failureClass: "PROVIDER_TIMEOUT", latencyMs: 4000 },
  ]);
  const { hook, durable } = makeInstance(table, provider);
  for (const level of ["log", "warn", "error"]) {
    hook.logger[level] = (m) => captured.push(String(m));
    durable.logger[level] = (m) => captured.push(String(m));
  }

  const request = signRequest(bodyFor());
  await hook.handleSendSms(request).catch(() => {});
  await hook.handleSendSms(request).catch(() => {});

  const output = captured.join("\n");
  assert.ok(output.length > 0);
  assert.ok(!output.includes(PHONE));
  assert.ok(!output.includes(OTP));
  assert.ok(!output.includes(table.rows.get(request.headers["webhook-id"]).payload_digest));
});

// ── Cleanup ──────────────────────────────────────────────────────────────────

test("cleanup retires expired leases instead of deleting in-flight rows", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  await durable.claim("wh-live", "digest-a");
  await durable.claim("wh-dead", "digest-b");
  table.rows.get("wh-dead").lease_expires_at = table.clock.now - 1;

  const result = await durable.cleanup();
  assert.equal(result.leasesRetired, 1);
  assert.equal(table.rows.get("wh-live").state, "IN_FLIGHT", "a live lease must survive");
  assert.equal(table.rows.get("wh-dead").state, "UNCERTAIN");
  assert.ok(table.rows.has("wh-dead"), "a retired lease is kept as the duplicate-send guard");
});

test("cleanup deletes finished rows past their expiry", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  await durable.claim("wh-done", "digest-a");
  await durable.complete("wh-done", "wamid.OLD");
  await durable.claim("wh-failed", "digest-b");
  await durable.fail("wh-failed", "META_132001");

  table.clock.now += 25 * 60 * 60 * 1000;

  const result = await durable.cleanup();
  assert.equal(result.rowsDeleted, 2);
  assert.equal(table.rows.size, 0);
});

test("cleanup keeps UNCERTAIN rows inside the retention window", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub());

  await durable.claim("wh-unknown", "digest-a");
  await durable.markUncertain("wh-unknown", "OTP_PROVIDER_TIMEOUT");

  table.clock.now += 25 * 60 * 60 * 1000;
  assert.equal((await durable.cleanup()).uncertainKept, 1);

  table.clock.now += 31 * 24 * 60 * 60 * 1000;
  await durable.cleanup();
  assert.equal(table.rows.size, 0, "an unexplained delivery is kept for review, then dropped");
});

test("a cleanup failure is reported, not swallowed", async () => {
  const table = createDeliveryTable();
  const { durable } = makeInstance(table, providerStub(), {
    clientOptions: { failRpc: "cleanup_expired_auth_hook_deliveries" },
  });

  await assert.rejects(
    () => durable.cleanup(),
    (err) => codeOf(err) === "SUPABASE_AUTH_HOOK_CLEANUP_FAILED",
  );
});

// ── Rate limiting still applies on the durable path ──────────────────────────

test("recipient limits apply on the durable path and block the fourth send", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const { hook } = makeInstance(table, provider);

  for (let i = 0; i < 3; i += 1) await hook.handleSendSms(signRequest(bodyFor()));
  await assert.rejects(
    () => hook.handleSendSms(signRequest(bodyFor())),
    (err) => codeOf(err) === "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED",
  );
  assert.equal(provider.calls.length, 3);
});

test("a rate-limited request writes nothing to the ledger", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const { hook } = makeInstance(table, provider);

  for (let i = 0; i < 3; i += 1) await hook.handleSendSms(signRequest(bodyFor()));
  const blocked = signRequest(bodyFor());
  await assert.rejects(() => hook.handleSendSms(blocked));

  assert.equal(table.rows.size, 3);
  assert.ok(!table.rows.has(blocked.headers["webhook-id"]));
});

test("an idempotent replay consumes no additional quota", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const { hook } = makeInstance(table, provider);

  const request = signRequest(bodyFor());
  for (let i = 0; i < 6; i += 1) await hook.handleSendSms(request);

  // Two fresh sends still fit inside the per-minute allowance.
  await hook.handleSendSms(signRequest(bodyFor()));
  await hook.handleSendSms(signRequest(bodyFor()));
  assert.equal(provider.calls.length, 3);
});

test("an invalid signature never reaches the ledger", async () => {
  const table = createDeliveryTable();
  const provider = providerStub();
  const { hook } = makeInstance(table, provider);

  const forged = signRequest(bodyFor());
  await assert.rejects(
    () => hook.handleSendSms({ ...forged, rawBody: JSON.stringify({ tampered: true }) }),
    (err) => err.getStatus() === 401,
  );

  assert.equal(table.rows.size, 0);
  assert.equal(provider.calls.length, 0);
});
