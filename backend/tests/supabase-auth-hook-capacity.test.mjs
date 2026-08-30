/**
 * Batch 2B — idempotency cache capacity safety, payload digest binding, and the
 * per-recipient send limiter that replaced the IP throttle.
 *
 * Real cap-sized runs, not a token 60 entries. Nothing here touches the network.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Webhook } from "standardwebhooks";

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { SupabaseAuthHookService } = await import("../dist/modules/auth/supabase-auth-hook.service.js");
import { inMemoryDurableStub } from "./helpers/auth-hook-durable-fake.mjs";

const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=";
const MAX_ENTRIES = 2000;

function configWith(overrides = {}) {
  const values = { SUPABASE_AUTH_HOOK_SECRET: SECRET, ...overrides };
  return { get: (key) => values[key] };
}

/** Distinct recipients by default, so the per-recipient limiter never interferes. */
function payloadFor(index, otp = "483920") {
  const suffix = String(1000000 + (index % 9000000)).slice(0, 7);
  return { user: { id: `user-${index}`, phone: `+964750${suffix}` }, sms: { otp } };
}

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

function providerStub(behaviour) {
  const calls = [];
  return {
    calls,
    sendOtp: async (destination, code, options) => {
      calls.push({ destination, code, options });
      if (typeof behaviour === "function") return behaviour();
      return behaviour ?? { success: true, providerAcceptedMessageId: "wamid.TEST" };
    },
  };
}

const service = (provider, overrides) =>
  new SupabaseAuthHookService(configWith(overrides), provider, inMemoryDurableStub());

/** Fills the cache with completed deliveries without running 2000 real dispatches. */
function seedSucceeded(svc, count, { completedAt = Date.now() } = {}) {
  for (let i = 0; i < count; i += 1) {
    svc.deliveries.set(`succeeded-${i}`, { state: "SUCCEEDED", completedAt, digest: `digest-${i}` });
  }
}

function seedInFlight(svc, count) {
  const releases = [];
  for (let i = 0; i < count; i += 1) {
    let release;
    const promise = new Promise((resolve) => (release = resolve));
    // Nothing ever awaits these in the tests that only need the slot occupied.
    promise.catch(() => {});
    releases.push(release);
    svc.deliveries.set(`inflight-${i}`, {
      state: "IN_FLIGHT",
      startedAt: Date.now(),
      digest: `digest-${i}`,
      promise,
    });
  }
  return releases;
}

// ── Capacity ─────────────────────────────────────────────────────────────────

test("a full cache of completed deliveries evicts the oldest and accepts new work", async () => {
  const provider = providerStub();
  const svc = service(provider);
  seedSucceeded(svc, MAX_ENTRIES);
  assert.equal(svc.deliveries.size, MAX_ENTRIES);

  await svc.handleSendSms(signRequest(payloadFor(1)));

  assert.equal(provider.calls.length, 1, "new work must still be accepted");
  assert.ok(svc.deliveries.size <= MAX_ENTRIES, `size must never exceed the cap, got ${svc.deliveries.size}`);
  assert.equal(svc.deliveries.has("succeeded-0"), false, "the oldest completed entry should have been evicted");
});

test("a cache full of in-flight work refuses new webhooks with a retryable 503", async () => {
  const provider = providerStub();
  const svc = service(provider);
  seedInFlight(svc, MAX_ENTRIES);

  await assert.rejects(
    () => svc.handleSendSms(signRequest(payloadFor(2))),
    (err) => {
      assert.equal(err.getStatus(), 503, "must be retryable, not a client error");
      assert.equal(err.getResponse().code, "SUPABASE_AUTH_HOOK_CAPACITY_EXCEEDED");
      return true;
    },
  );

  assert.equal(provider.calls.length, 0, "nothing may be dispatched when capacity is exhausted");
  assert.equal(svc.deliveries.size, MAX_ENTRIES, "size must not grow past the cap");
});

test("in-flight entries are never evicted to make room", async () => {
  const provider = providerStub();
  const svc = service(provider);
  seedInFlight(svc, MAX_ENTRIES);
  const before = [...svc.deliveries.keys()];

  await svc.handleSendSms(signRequest(payloadFor(3))).catch(() => {});

  assert.deepEqual([...svc.deliveries.keys()], before, "no in-flight entry may be dropped");
});

test("a mixed cache evicts only completed entries", async () => {
  const provider = providerStub();
  const svc = service(provider);
  seedInFlight(svc, MAX_ENTRIES - 5);
  seedSucceeded(svc, 5);
  assert.equal(svc.deliveries.size, MAX_ENTRIES);

  await svc.handleSendSms(signRequest(payloadFor(4)));

  const survivors = [...svc.deliveries.values()];
  assert.equal(survivors.filter((e) => e.state === "IN_FLIGHT").length, MAX_ENTRIES - 5);
  assert.ok(svc.deliveries.size <= MAX_ENTRIES);
});

test("a duplicate of an in-flight entry still resolves when the cache is full", async () => {
  const provider = providerStub();
  const svc = service(provider);

  let release;
  const request = signRequest(payloadFor(5));
  const digest = (await import("node:crypto")).createHash("sha256").update(request.rawBody).digest("hex");
  const promise = new Promise((resolve) => (release = resolve));
  svc.deliveries.set(request.headers["webhook-id"], {
    state: "IN_FLIGHT",
    startedAt: Date.now(),
    digest,
    promise,
  });
  // Fill every remaining slot so the cache is exactly at capacity.
  seedInFlight(svc, MAX_ENTRIES - 1);
  assert.equal(svc.deliveries.size, MAX_ENTRIES);

  const waiting = svc.handleSendSms(request);
  release();
  await waiting;

  assert.equal(provider.calls.length, 0, "a duplicate must never dispatch, full cache or not");
});

test("expired completed entries are reclaimed before capacity is refused", async () => {
  const provider = providerStub();
  const svc = service(provider);
  seedSucceeded(svc, MAX_ENTRIES, { completedAt: Date.now() - 11 * 60 * 1000 });

  await svc.handleSendSms(signRequest(payloadFor(6)));

  assert.equal(provider.calls.length, 1);
  assert.ok(svc.deliveries.size < MAX_ENTRIES, "the expired entries should have been pruned");
});

// ── Payload digest ───────────────────────────────────────────────────────────

test("the same webhook-id with the same body behaves idempotently", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const id = crypto.randomUUID();
  const request = signRequest(payloadFor(7), { id });

  await svc.handleSendSms(request);
  await svc.handleSendSms(request);

  assert.equal(provider.calls.length, 1);
});

test("the same webhook-id with a different body is refused and sends nothing", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const id = crypto.randomUUID();

  await svc.handleSendSms(signRequest(payloadFor(8, "111111"), { id }));

  await assert.rejects(
    () => svc.handleSendSms(signRequest(payloadFor(8, "999999"), { id })),
    (err) => {
      assert.equal(err.getResponse().code, "SUPABASE_AUTH_HOOK_ID_REUSED_WITH_DIFFERENT_PAYLOAD");
      return true;
    },
  );

  assert.equal(provider.calls.length, 1, "the reused id must not trigger a second send");
});

test("the cache stores a digest, never the raw body, the OTP or the phone", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const payload = payloadFor(9, "424242");
  const request = signRequest(payload);

  await svc.handleSendSms(request);

  const serialised = JSON.stringify([...svc.deliveries.entries()]);
  assert.ok(!serialised.includes("424242"), "the OTP must not be in the cache");
  assert.ok(!serialised.includes(payload.user.phone), "the phone must not be in the cache");
  assert.ok(!serialised.includes(request.rawBody), "the raw body must not be in the cache");
  assert.match([...svc.deliveries.values()][0].digest, /^[a-f0-9]{64}$/);
});

// ── Per-recipient rate limiting ──────────────────────────────────────────────

test("many distinct recipients are not blocked by sharing one caller", async () => {
  const provider = providerStub();
  const svc = service(provider);

  // 31 users would have tripped the old 30/min IP throttle.
  for (let i = 0; i < 31; i += 1) {
    await svc.handleSendSms(signRequest(payloadFor(100 + i)));
  }

  assert.equal(provider.calls.length, 31);
});

test("one recipient exceeding the per-minute limit is refused with 429", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const recipient = { user: { id: "user-hot", phone: "+9647501111111" }, sms: { otp: "483920" } };

  for (let i = 0; i < 3; i += 1) {
    await svc.handleSendSms(signRequest(recipient));
  }

  await assert.rejects(
    () => svc.handleSendSms(signRequest(recipient)),
    (err) => {
      assert.equal(err.getStatus(), 429);
      assert.equal(err.getResponse().code, "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED");
      return true;
    },
  );

  assert.equal(provider.calls.length, 3);
});

test("a second recipient is unaffected by the first one's limit", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const hot = { user: { id: "user-hot", phone: "+9647501111111" }, sms: { otp: "483920" } };
  const calm = { user: { id: "user-calm", phone: "+9647502222222" }, sms: { otp: "483920" } };

  for (let i = 0; i < 3; i += 1) await svc.handleSendSms(signRequest(hot));
  await assert.rejects(() => svc.handleSendSms(signRequest(hot)));

  await svc.handleSendSms(signRequest(calm));
  assert.equal(provider.calls.length, 4);
});

test("a duplicate webhook-id consumes no additional quota", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const recipient = { user: { id: "user-dup", phone: "+9647503333333" }, sms: { otp: "483920" } };

  const first = signRequest(recipient);
  await svc.handleSendSms(first);
  // Five retries of the same webhook — Supabase does this legitimately.
  for (let i = 0; i < 5; i += 1) await svc.handleSendSms(first);

  // Quota should still allow two more genuinely new sends this minute.
  await svc.handleSendSms(signRequest(recipient));
  await svc.handleSendSms(signRequest(recipient));

  assert.equal(provider.calls.length, 3, "retries must not count against the recipient");
});

test("an invalid signature never enters the recipient limiter", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const recipient = { user: { id: "user-forged", phone: "+9647504444444" }, sms: { otp: "483920" } };

  for (let i = 0; i < 10; i += 1) {
    const forged = signRequest(recipient);
    await svc
      .handleSendSms({ ...forged, rawBody: JSON.stringify({ tampered: i }) })
      .catch(() => {});
  }

  // Quota untouched: three real sends still succeed.
  for (let i = 0; i < 3; i += 1) await svc.handleSendSms(signRequest(recipient));
  assert.equal(provider.calls.length, 3);
});

test("an hourly ceiling applies even when requests are spread out", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const recipient = { user: { id: "user-hourly", phone: "+9647505555555" }, sms: { otp: "483920" } };
  // Ten sends spaced beyond the per-minute window but inside the hour.
  const now = Date.now();
  svc.recipientSends.set(
    svc.recipientKey("+9647505555555"),
    Array.from({ length: 10 }, (_, i) => now - (i + 1) * 5 * 60 * 1000),
  );

  await assert.rejects(
    () => svc.handleSendSms(signRequest(recipient)),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED",
  );
  assert.equal(provider.calls.length, 0);
});

test("neither the phone nor the recipient key reaches the logs", async () => {
  const captured = [];
  const provider = providerStub();
  const svc = service(provider);
  for (const level of ["log", "warn", "error"]) {
    svc.logger[level] = (message) => captured.push(String(message));
  }

  const recipient = { user: { id: "user-log", phone: "+9647506666666" }, sms: { otp: "483920" } };
  for (let i = 0; i < 4; i += 1) await svc.handleSendSms(signRequest(recipient)).catch(() => {});

  const output = captured.join("\n");
  const key = svc.recipientKey("+9647506666666");
  assert.ok(!output.includes("+9647506666666"), "the full phone must never be logged");
  assert.ok(!output.includes(key), "the recipient key is a stable pseudonym and must not be logged");
  assert.ok(!output.includes("483920"), "the OTP must never be logged");
});

// ── Controller wiring ────────────────────────────────────────────────────────

test("the hook route skips the IP throttle and relies on the recipient limiter", () => {
  const source = fs.readFileSync(
    path.join(backendRoot, "src", "modules", "auth", "supabase-auth-hook.controller.ts"),
    "utf8",
  );
  assert.match(source, /@SkipThrottle\(\)/);
  assert.ok(
    !/@Throttle\(/.test(source),
    "an IP throttle would treat every Supabase-originated request as one caller",
  );
});
