/**
 * Batch 2B.1 — recipient limiter correctness: identity, hard cap, and non-destructive
 * ordering.
 *
 * The service's caps are instance fields, so these tests drive the real capacity paths
 * with a small injected limit instead of looping ten thousand times.
 *
 * Nothing here touches the network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "standardwebhooks";

const { SupabaseAuthHookService } = await import("../dist/modules/auth/supabase-auth-hook.service.js");
import { inMemoryDurableStub } from "./helpers/auth-hook-durable-fake.mjs";

const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=";
const OTP = "483920";

const configWith = (overrides = {}) => {
  const values = { SUPABASE_AUTH_HOOK_SECRET: SECRET, ...overrides };
  return { get: (key) => values[key] };
};

function signRequest(payload, { id = crypto.randomUUID() } = {}) {
  const rawBody = JSON.stringify(payload);
  const timestamp = new Date();
  return {
    rawBody,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": new Webhook(SECRET).sign(id, timestamp, rawBody),
    },
    payload,
  };
}

function providerStub(outcomes) {
  const calls = [];
  const queue = Array.isArray(outcomes) ? [...outcomes] : null;
  const fallback = Array.isArray(outcomes)
    ? { success: true, providerAcceptedMessageId: "wamid.TEST" }
    : (outcomes ?? { success: true, providerAcceptedMessageId: "wamid.TEST" });
  return {
    calls,
    sendOtp: async (destination, code, options) => {
      calls.push({ destination, code, options });
      const outcome = queue?.length ? queue.shift() : fallback;
      return typeof outcome === "function" ? outcome() : outcome;
    },
  };
}

const service = (provider, overrides) =>
  new SupabaseAuthHookService(configWith(overrides), provider, inMemoryDurableStub());
const bodyFor = (phone, { userId = null, otp = OTP } = {}) => ({
  user: { ...(userId ? { id: userId } : {}), phone },
  sms: { otp },
});

// ── Recipient identity ───────────────────────────────────────────────────────

test("the same phone shares one bucket across different user ids", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const phone = "+9647501234567";

  // Three sends, each claiming a different auth user, all to the same handset.
  for (const userId of ["user-a", "user-b", "user-c"]) {
    await svc.handleSendSms(signRequest(bodyFor(phone, { userId })));
  }

  await assert.rejects(
    () => svc.handleSendSms(signRequest(bodyFor(phone, { userId: "user-d" }))),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED",
  );

  assert.equal(provider.calls.length, 3, "a new user id must not grant a fresh allowance");
  assert.equal(svc.recipientSends.size, 1, "one handset is one bucket");
});

test("two different phones do not affect each other", async () => {
  const provider = providerStub();
  const svc = service(provider);

  for (let i = 0; i < 3; i += 1) await svc.handleSendSms(signRequest(bodyFor("+9647501111111")));
  await assert.rejects(() => svc.handleSendSms(signRequest(bodyFor("+9647501111111"))));

  await svc.handleSendSms(signRequest(bodyFor("+9647502222222")));
  assert.equal(provider.calls.length, 4);
});

test("different written forms of one number resolve to the same bucket", async () => {
  const provider = providerStub();
  const svc = service(provider);

  // Same handset, three notations the backend accepts.
  await svc.handleSendSms(signRequest(bodyFor("07501234567")));
  await svc.handleSendSms(signRequest(bodyFor("+9647501234567")));
  await svc.handleSendSms(signRequest(bodyFor("009647501234567")));

  assert.equal(svc.recipientSends.size, 1, "normalization must happen before bucketing");
  await assert.rejects(
    () => svc.handleSendSms(signRequest(bodyFor("9647501234567"))),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED",
  );
  assert.equal(provider.calls.length, 3);
});

test("the recipient key is derived, not the raw hook secret, and is domain separated", () => {
  const svc = service(providerStub());
  const key = svc.recipientKey("+9647501234567");

  assert.match(key, /^[a-f0-9]{64}$/);
  assert.notEqual(key, SECRET);

  // A different hook secret produces a different bucket, so rotation resets the limiter.
  const other = service(providerStub(), { SUPABASE_AUTH_HOOK_SECRET: "whsec_b3RoZXJzZWNyZXRvdGhlcnNlY3JldG90aGVyc2U=" });
  assert.notEqual(other.recipientKey("+9647501234567"), key);
});

test("neither the phone nor the recipient key ever reaches the logs", async () => {
  const captured = [];
  const provider = providerStub();
  const svc = service(provider);
  for (const level of ["log", "warn", "error"]) svc.logger[level] = (m) => captured.push(String(m));

  const phone = "+9647506666666";
  for (let i = 0; i < 4; i += 1) await svc.handleSendSms(signRequest(bodyFor(phone))).catch(() => {});

  const output = captured.join("\n");
  assert.ok(output.length > 0);
  assert.ok(!output.includes(phone), "the full phone must never be logged");
  assert.ok(!output.includes(svc.recipientKey(phone)), "the bucket key must never be logged");
  assert.ok(!output.includes(OTP), "the OTP must never be logged");
});

// ── Recipient tracker hard cap ───────────────────────────────────────────────

/** Seeds N active recipients without running N dispatches. */
function seedRecipients(svc, count, { at = Date.now() } = {}) {
  for (let i = 0; i < count; i += 1) svc.recipientSends.set(`seeded-${i}`, [at]);
}

test("an existing recipient still works when the tracker is full", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.recipientTrackerMax = 5;

  const phone = "+9647503333333";
  await svc.handleSendSms(signRequest(bodyFor(phone)));
  seedRecipients(svc, 4);
  assert.equal(svc.recipientSends.size, 5);

  // The bucket already exists, so no new slot is needed.
  await svc.handleSendSms(signRequest(bodyFor(phone)));
  assert.equal(provider.calls.length, 2);
  assert.equal(svc.recipientSends.size, 5);
});

test("a new recipient is refused with a retryable 503 when the tracker is full", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.recipientTrackerMax = 5;
  seedRecipients(svc, 5);

  await assert.rejects(
    () => svc.handleSendSms(signRequest(bodyFor("+9647504444444"))),
    (err) => {
      assert.equal(err.getStatus(), 503);
      assert.equal(err.getResponse().code, "SUPABASE_AUTH_HOOK_RECIPIENT_CAPACITY_EXCEEDED");
      return true;
    },
  );

  assert.equal(provider.calls.length, 0, "a refused reservation must never reach Meta");
  assert.equal(svc.recipientSends.size, 5, "size must not grow past the cap");
});

test("expired recipients are pruned before capacity is refused", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.recipientTrackerMax = 5;
  seedRecipients(svc, 5, { at: Date.now() - 2 * 60 * 60 * 1000 });

  await svc.handleSendSms(signRequest(bodyFor("+9647505555555")));

  assert.equal(provider.calls.length, 1);
  assert.ok(svc.recipientSends.size <= 5);
});

test("an active recipient is never evicted to make room for a new one", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.recipientTrackerMax = 3;
  seedRecipients(svc, 3);
  const before = [...svc.recipientSends.keys()];

  await svc.handleSendSms(signRequest(bodyFor("+9647507777777"))).catch(() => {});

  assert.deepEqual([...svc.recipientSends.keys()], before);
});

test("the tracker never exceeds its cap under sustained new recipients", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.recipientTrackerMax = 4;

  let refused = 0;
  for (let i = 0; i < 20; i += 1) {
    const phone = `+96475088${String(10000 + i).slice(-5)}`;
    await svc.handleSendSms(signRequest(bodyFor(phone))).catch(() => (refused += 1));
    assert.ok(svc.recipientSends.size <= 4, `size exceeded the cap at iteration ${i}`);
  }
  assert.ok(refused > 0, "expected some new recipients to be refused once full");
});

// ── Non-destructive ordering ─────────────────────────────────────────────────

test("a rate-limited request evicts no completed delivery", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.deliveryMaxEntries = 4;

  const phone = "+9647509999999";
  for (let i = 0; i < 3; i += 1) await svc.handleSendSms(signRequest(bodyFor(phone)));
  const before = [...svc.deliveries.keys()];

  await assert.rejects(
    () => svc.handleSendSms(signRequest(bodyFor(phone))),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED",
  );

  assert.deepEqual([...svc.deliveries.keys()], before, "the quota check must not mutate the delivery cache");
});

test("a delivery-capacity refusal consumes no recipient quota", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.deliveryMaxEntries = 1;

  // Occupy the single delivery slot with an in-flight entry that can never be evicted.
  svc.deliveries.set("occupied", {
    state: "IN_FLIGHT",
    startedAt: Date.now(),
    digest: "x",
    promise: new Promise(() => {}),
  });

  const phone = "+96475012121212".slice(0, 14);
  await assert.rejects(
    () => svc.handleSendSms(signRequest(bodyFor(phone))),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_CAPACITY_EXCEEDED",
  );

  assert.equal(
    svc.recipientSends.has(svc.recipientKey("+9647501212121")),
    false,
    "no attempt may be recorded for a request that never dispatched",
  );
  assert.equal(provider.calls.length, 0);
});

test("a recipient-capacity refusal evicts no delivery entry", async () => {
  const provider = providerStub();
  const svc = service(provider);
  svc.recipientTrackerMax = 2;

  await svc.handleSendSms(signRequest(bodyFor("+9647501111111")));
  const before = [...svc.deliveries.keys()];
  seedRecipients(svc, 2);

  await assert.rejects(
    () => svc.handleSendSms(signRequest(bodyFor("+9647502222222"))),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RECIPIENT_CAPACITY_EXCEEDED",
  );

  assert.deepEqual([...svc.deliveries.keys()], before);
});

test("a provider failure counts as an attempted send", async () => {
  // Documented decision: a failed dispatch still consumed a real outbound call, so it
  // counts. Otherwise a caller could hammer one recipient for free whenever Meta is down.
  const provider = providerStub([
    { success: false, errorCode: "META_132001" },
    { success: true, providerAcceptedMessageId: "wamid.A" },
    { success: true, providerAcceptedMessageId: "wamid.B" },
  ]);
  const svc = service(provider);
  const phone = "+9647501313131".slice(0, 14);

  await assert.rejects(() => svc.handleSendSms(signRequest(bodyFor(phone))));
  await svc.handleSendSms(signRequest(bodyFor(phone)));
  await svc.handleSendSms(signRequest(bodyFor(phone)));

  // Three attempts consumed, so the fourth is refused even though only two succeeded.
  await assert.rejects(
    () => svc.handleSendSms(signRequest(bodyFor(phone))),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED",
  );
  assert.equal(provider.calls.length, 3);
});

test("an idempotent duplicate consumes no additional quota", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const phone = "+9647501414141".slice(0, 14);

  const first = signRequest(bodyFor(phone));
  await svc.handleSendSms(first);
  for (let i = 0; i < 5; i += 1) await svc.handleSendSms(first);

  await svc.handleSendSms(signRequest(bodyFor(phone)));
  await svc.handleSendSms(signRequest(bodyFor(phone)));
  assert.equal(provider.calls.length, 3);
});

test("an invalid signature never records an attempt", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const phone = "+9647501515151".slice(0, 14);

  for (let i = 0; i < 10; i += 1) {
    const forged = signRequest(bodyFor(phone));
    await svc.handleSendSms({ ...forged, rawBody: JSON.stringify({ tampered: i }) }).catch(() => {});
  }

  assert.equal(svc.recipientSends.size, 0, "a forged request must not touch the tracker");
  for (let i = 0; i < 3; i += 1) await svc.handleSendSms(signRequest(bodyFor(phone)));
  assert.equal(provider.calls.length, 3);
});
