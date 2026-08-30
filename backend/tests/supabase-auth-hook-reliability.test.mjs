/**
 * Batch 2A.1 — hook reliability: HTTP contract, idempotency state machine, timeout, and
 * the scope of raw-body capture.
 *
 * Nothing here touches the network. The provider is stubbed, so no message is ever sent.
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
const { WhatsAppOtpProvider } = await import("../dist/modules/auth/whatsapp-otp.provider.js");

const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=";
const PHONE = "+9647501234567";
const OTP = "483920";
const VALID_PAYLOAD = { user: { phone: PHONE }, sms: { otp: OTP } };

function configWith(overrides = {}) {
  const values = { SUPABASE_AUTH_HOOK_SECRET: SECRET, ...overrides };
  return { get: (key) => values[key] };
}

function signRequest(payload = VALID_PAYLOAD, { id = crypto.randomUUID() } = {}) {
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

/** Records calls and lets a test control each outcome. */
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

// ── HTTP success contract ────────────────────────────────────────────────────

test("the controller declares 200 with an empty body", () => {
  const source = fs.readFileSync(
    path.join(backendRoot, "src", "modules", "auth", "supabase-auth-hook.controller.ts"),
    "utf8",
  );
  assert.match(source, /@HttpCode\(HttpStatus\.OK\)/);
  assert.ok(!/HttpStatus\.NO_CONTENT/.test(source), "204 is not the Supabase hook contract");
  // Promise<void> is what guarantees an empty body — nothing can be serialised back.
  assert.match(source, /async sendSms\([\s\S]*?\): Promise<void>/);
});

test("a successful delivery resolves with no value, so no body can carry the code out", async () => {
  const provider = providerStub();
  const result = await service(provider).handleSendSms(signRequest());
  assert.equal(result, undefined);
});

// ── Idempotency state machine ────────────────────────────────────────────────

test("a first signed request sends exactly once", async () => {
  const provider = providerStub();
  await service(provider).handleSendSms(signRequest());
  assert.equal(provider.calls.length, 1);
});

test("a duplicate after success resolves and sends nothing extra", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const request = signRequest();

  await svc.handleSendSms(request);
  await svc.handleSendSms(request);
  await svc.handleSendSms(request);

  assert.equal(provider.calls.length, 1);
});

test("a concurrent duplicate awaits the original instead of sending again", async () => {
  let release;
  const provider = providerStub(
    () => new Promise((resolve) => (release = () => resolve({ success: true, providerAcceptedMessageId: "wamid.X" }))),
  );
  const svc = service(provider);
  const request = signRequest();

  const first = svc.handleSendSms(request);
  // Let the first call reach the provider before the duplicate arrives.
  await new Promise((resolve) => setImmediate(resolve));
  const second = svc.handleSendSms(request);

  release();
  await Promise.all([first, second]);

  assert.equal(provider.calls.length, 1, "the duplicate must not trigger a second dispatch");
});

test("a concurrent duplicate shares the original failure, and both are then retryable", async () => {
  let reject;
  const provider = providerStub([
    () => new Promise((_resolve, rej) => (reject = () => rej(new Error("meta exploded")))),
    { success: true, providerAcceptedMessageId: "wamid.RETRY" },
  ]);
  const svc = service(provider);
  const request = signRequest();

  const first = svc.handleSendSms(request);
  await new Promise((resolve) => setImmediate(resolve));
  const second = svc.handleSendSms(request);

  reject();
  await assert.rejects(() => first);
  await assert.rejects(() => second);

  // The failed id was forgotten, so the same webhook-id may be retried.
  await svc.handleSendSms(request);
  assert.equal(provider.calls.length, 2);
});

test("a provider failure removes the entry and a retry sends again", async () => {
  const provider = providerStub([
    { success: false, errorCode: "META_132001", failureClass: "TEMPLATE_ERROR" },
    { success: true, providerAcceptedMessageId: "wamid.SECOND" },
  ]);
  const svc = service(provider);
  const request = signRequest();

  await assert.rejects(
    () => svc.handleSendSms(request),
    (err) => err.getResponse().code === "META_132001",
  );

  // Same webhook-id, accepted second time — a failure must never lock out a retry.
  await svc.handleSendSms(request);
  assert.equal(provider.calls.length, 2);
});

test("an invalid payload does not poison the cache", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const id = crypto.randomUUID();

  await assert.rejects(
    () => svc.handleSendSms(signRequest({ user: { phone: PHONE }, sms: {} }, { id })),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_OTP_MISSING",
  );

  // The very same webhook-id, now with a usable payload, must still be delivered.
  await svc.handleSendSms(signRequest(VALID_PAYLOAD, { id }));
  assert.equal(provider.calls.length, 1);
});

test("an invalid signature never enters the cache", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const id = crypto.randomUUID();
  const good = signRequest(VALID_PAYLOAD, { id });

  await assert.rejects(
    () => svc.handleSendSms({ ...good, rawBody: JSON.stringify({ tampered: true }) }),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_SIGNATURE_INVALID",
  );

  await svc.handleSendSms(good);
  assert.equal(provider.calls.length, 1);
});

test("a missing raw body never enters the cache", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const id = crypto.randomUUID();
  const good = signRequest(VALID_PAYLOAD, { id });

  await assert.rejects(
    () => svc.handleSendSms({ ...good, rawBody: undefined }),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RAW_BODY_MISSING",
  );

  await svc.handleSendSms(good);
  assert.equal(provider.calls.length, 1);
});

test("an unusable phone does not poison the cache", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const id = crypto.randomUUID();

  await assert.rejects(
    () => svc.handleSendSms(signRequest({ user: { phone: "nope" }, sms: { otp: OTP } }, { id })),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_PHONE_INVALID",
  );

  await svc.handleSendSms(signRequest(VALID_PAYLOAD, { id }));
  assert.equal(provider.calls.length, 1);
});

test("completed entries are pruned once their TTL passes", async () => {
  const provider = providerStub();
  const svc = service(provider);
  const request = signRequest();

  await svc.handleSendSms(request);
  assert.equal(provider.calls.length, 1);

  // Age the entry past the 10 minute TTL, then replay the same id.
  const entry = svc.deliveries.get(request.headers["webhook-id"]);
  assert.equal(entry.state, "SUCCEEDED");
  entry.completedAt = Date.now() - 11 * 60 * 1000;

  await svc.handleSendSms(request);
  assert.equal(provider.calls.length, 2, "an expired entry must no longer suppress a send");
});

test("the cache is capped so it cannot grow without bound", async () => {
  const provider = providerStub();
  const svc = service(provider);

  // Distinct recipients on purpose: this asserts the cache bound, not the per-recipient
  // send limiter, which is covered in supabase-auth-hook-capacity.test.mjs.
  for (let i = 0; i < 60; i += 1) {
    const payload = { user: { id: `user-${i}`, phone: `+96475011${String(10000 + i).slice(-5)}` }, sms: { otp: OTP } };
    await svc.handleSendSms(signRequest(payload));
  }
  assert.equal(provider.calls.length, 60);
  assert.ok(svc.deliveries.size <= 2000, "cache must stay within its cap");
});

// ── Hook timeout ─────────────────────────────────────────────────────────────

test("the hook deadline defaults below Supabase's five second budget", () => {
  const svc = service(providerStub());
  const timeout = svc.resolveHookTimeoutMs();
  assert.equal(timeout, 4000);
  assert.ok(timeout < 5000);
});

test("a configured deadline inside the allowed range is honoured", () => {
  const svc = service(providerStub(), { SUPABASE_AUTH_HOOK_TIMEOUT_MS: "2500" });
  assert.equal(svc.resolveHookTimeoutMs(), 2500);
});

test("an out-of-range deadline falls back outside production", () => {
  for (const value of ["100", "9000", "not-a-number", "0", "-1"]) {
    const svc = service(providerStub(), { SUPABASE_AUTH_HOOK_TIMEOUT_MS: value });
    assert.equal(svc.resolveHookTimeoutMs(), 4000, `value ${value} should fall back`);
  }
});

test("an out-of-range deadline fails readiness in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const svc = service(providerStub(), { SUPABASE_AUTH_HOOK_TIMEOUT_MS: "9000" });
    assert.throws(
      () => svc.resolveHookTimeoutMs(),
      (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_TIMEOUT_INVALID",
    );
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("the hook passes its own deadline to the provider", async () => {
  const provider = providerStub();
  await service(provider, { SUPABASE_AUTH_HOOK_TIMEOUT_MS: "3000" }).handleSendSms(signRequest());
  assert.deepEqual(provider.calls[0].options, { timeoutMs: 3000 });
});

test("the provider actually aborts the fetch when the hook deadline elapses", async () => {
  let abortedSignal = null;

  const provider = new WhatsAppOtpProvider({
    get: (key) =>
      ({
        OTP_WHATSAPP_MODE: "live",
        OTP_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
        OTP_WHATSAPP_ACCESS_TOKEN: "token",
        OTP_WHATSAPP_TEMPLATE_NAME: "tmpl",
        OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
        OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
        OTP_WHATSAPP_API_VERSION: "v21.0",
        // The channel default is deliberately far larger than the hook override.
        OTP_WHATSAPP_TIMEOUT_MS: "30000",
      })[key],
  });

  // A fetch that never settles on its own — only the abort signal can end it.
  provider.fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      abortedSignal = init.signal;
      init.signal.addEventListener("abort", () => {
        const err = new Error("The operation was aborted");
        err.name = "AbortError";
        reject(err);
      });
    });

  const started = Date.now();
  const result = await provider.sendOtp(PHONE, OTP, { timeoutMs: 1000 });
  const elapsed = Date.now() - started;

  assert.equal(result.success, false, "a timed-out dispatch is a failure, never a success");
  assert.ok(abortedSignal?.aborted, "the abort signal must have fired");
  assert.ok(elapsed < 4000, `expected the abort near 1000ms, took ${elapsed}ms`);
});

test("a timed-out dispatch clears in-flight state and the retry dispatches again", async () => {
  const provider = providerStub([
    { success: false, errorCode: "OTP_PROVIDER_TIMEOUT", failureClass: "TIMEOUT" },
    { success: true, providerAcceptedMessageId: "wamid.AFTER_TIMEOUT" },
  ]);
  const svc = service(provider);
  const request = signRequest();

  await assert.rejects(
    () => svc.handleSendSms(request),
    (err) => err.getResponse().code === "OTP_PROVIDER_TIMEOUT",
  );
  assert.equal(svc.deliveries.has(request.headers["webhook-id"]), false, "no state may survive a timeout");

  await svc.handleSendSms(request);
  assert.equal(provider.calls.length, 2);
});

test("a late success after a timeout is not treated as delivered", async () => {
  // The provider reports the timeout; whatever Meta does afterwards is unobservable and
  // must never turn into a SUCCEEDED entry.
  const provider = providerStub({ success: false, errorCode: "OTP_PROVIDER_TIMEOUT" });
  const svc = service(provider);
  const request = signRequest();

  await assert.rejects(() => svc.handleSendSms(request));
  assert.equal(svc.deliveries.get(request.headers["webhook-id"]), undefined);
});

// ── Raw body scope ───────────────────────────────────────────────────────────

test("raw body capture is scoped to the hook route only", () => {
  const source = fs.readFileSync(path.join(backendRoot, "src", "main.ts"), "utf8");

  assert.match(source, /SUPABASE_AUTH_HOOK_PATH\s*=\s*"\/api\/auth\/hooks\/supabase\/send-sms"/);
  // The verify callback must bail out for any other path before assigning rawBody.
  assert.match(source, /if \(path !== SUPABASE_AUTH_HOOK_PATH\) return;/);
  const verifyBlock = source.slice(source.indexOf("verify: ("), source.indexOf("bodyParser.urlencoded"));
  assert.ok(
    verifyBlock.indexOf("if (path !== SUPABASE_AUTH_HOOK_PATH) return;") <
      verifyBlock.indexOf("req.rawBody ="),
    "the path guard must run before rawBody is assigned",
  );
});

test("the declared hook path matches the controller route", () => {
  const main = fs.readFileSync(path.join(backendRoot, "src", "main.ts"), "utf8");
  const controller = fs.readFileSync(
    path.join(backendRoot, "src", "modules", "auth", "supabase-auth-hook.controller.ts"),
    "utf8",
  );

  const declared = main.match(/SUPABASE_AUTH_HOOK_PATH\s*=\s*"([^"]+)"/)?.[1];
  const controllerPrefix = controller.match(/@Controller\("([^"]+)"\)/)?.[1];
  const routeSuffix = controller.match(/@Post\("([^"]+)"\)/)?.[1];

  assert.equal(declared, `/api/${controllerPrefix}/${routeSuffix}`);
});

test("the parsed body still reaches the controller", () => {
  // The verify callback only observes; it must not replace or consume the parser, so
  // bodyParser.json remains the parser for every route.
  const source = fs.readFileSync(path.join(backendRoot, "src", "main.ts"), "utf8");
  assert.match(source, /app\.use\(\s*bodyParser\.json\(/);
  assert.ok(!/express\.raw\(/.test(source), "a raw parser would turn @Body() into a Buffer");
});
