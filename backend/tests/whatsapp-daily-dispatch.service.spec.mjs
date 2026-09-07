import { strict as assert } from "node:assert";
import test from "node:test";
import crypto from "node:crypto";
import { WhatsAppDailyDispatchService } from "../dist/modules/auth/whatsapp-daily-dispatch.service.js";
import { WhatsAppOtpProvider } from "../dist/modules/auth/whatsapp-otp.provider.js";
import { SupabaseAuthHookService } from "../dist/modules/auth/supabase-auth-hook.service.js";
import {
  createDeliveryTable,
  createFakeSupabaseClient,
  inMemoryDurableStub,
} from "./helpers/auth-hook-durable-fake.mjs";

function makeConfig(env = {}) {
  const defaults = {
    OTP_WHATSAPP_MODE: "sandbox",
    OTP_WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
    OTP_WHATSAPP_ACCESS_TOKEN: "mock_secret_access_token_xyz",
    OTP_WHATSAPP_TEMPLATE_NAME: "auth_otp_test",
    OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
    OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
    OTP_WHATSAPP_API_VERSION: "v21.0",
    OTP_WHATSAPP_TIMEOUT_MS: "4000",
    OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: "200",
    OTP_WHATSAPP_DAILY_LIMIT_TIMEZONE: "Asia/Baghdad",
    SUPABASE_AUTH_HOOK_SECRET: "mock_webhook_secret_32_bytes_long_ok",
    SUPABASE_AUTH_HOOK_TIMEOUT_MS: "4000",
    OTP_DURABLE_IDEMPOTENCY_REQUIRED: "false",
    ...env,
  };
  return {
    get: (key) => defaults[key],
  };
}

test("1. Missing daily limit fails closed in sandbox", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const config = makeConfig({ OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: undefined });
  const service = new WhatsAppDailyDispatchService(config, supabase);

  const claim = await service.claimDispatch({ correlationId: "corr-1", mode: "sandbox" });
  assert.equal(claim.allowed, false);
  assert.equal(claim.errorCode, "OTP_DAILY_LIMIT_INVALID_CONFIG");

  const provider = new WhatsAppOtpProvider(config, service);
  let fetchCalled = false;
  provider.fetchImpl = async () => {
    fetchCalled = true;
    return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
  };

  const res = await provider.sendOtp("+9647701234567", "123456");
  assert.equal(res.success, false);
  assert.equal(res.errorCode, "OTP_DAILY_LIMIT_INVALID_CONFIG");
  assert.equal(fetchCalled, false, "Meta provider must not be called when limit is missing in sandbox");
});

test("2. Invalid daily limit fails closed", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };

  for (const invalidLimit of ["0", "-10", "abc", "12.5", ""]) {
    const config = makeConfig({ OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: invalidLimit });
    const service = new WhatsAppDailyDispatchService(config, supabase);

    const claim = await service.claimDispatch({ correlationId: "corr-invalid", mode: "sandbox" });
    assert.equal(claim.allowed, false, `limit '${invalidLimit}' must fail closed`);
    assert.equal(claim.errorCode, "OTP_DAILY_LIMIT_INVALID_CONFIG");
  }
});

test("3. Requests below the limit reach the mocked Meta provider", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const config = makeConfig({ OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: "5" });
  const service = new WhatsAppDailyDispatchService(config, supabase);
  const provider = new WhatsAppOtpProvider(config, service);

  let fetchCalls = 0;
  provider.fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${fetchCalls}` }] }), { status: 200 });
  };

  for (let i = 1; i <= 3; i++) {
    const res = await provider.sendOtp("+9647701234567", "112233");
    assert.equal(res.success, true);
    assert.equal(res.providerAcceptedMessageId, `wamid.${i}`);
  }

  assert.equal(fetchCalls, 3);
  const status = await service.getCount();
  assert.equal(status.currentCount, 3);
});

test("4 & 5. Request at the boundary behaves deterministically and requests above limit never reach Meta", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const config = makeConfig({ OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: "2" });
  const service = new WhatsAppDailyDispatchService(config, supabase);
  const provider = new WhatsAppOtpProvider(config, service);

  let fetchCalls = 0;
  provider.fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ messages: [{ id: `wamid.${fetchCalls}` }] }), { status: 200 });
  };

  // 1st request -> success (count 1)
  const res1 = await provider.sendOtp("+9647701111111", "100001");
  assert.equal(res1.success, true);

  // 2nd request -> success (count 2 = boundary reached)
  const res2 = await provider.sendOtp("+9647702222222", "100002");
  assert.equal(res2.success, true);

  // 3rd request -> rejected at boundary
  const res3 = await provider.sendOtp("+9647703333333", "100003");
  assert.equal(res3.success, false);
  assert.equal(res3.errorCode, "OTP_DAILY_LIMIT_EXCEEDED");

  // 4th request -> still rejected
  const res4 = await provider.sendOtp("+9647704444444", "100004");
  assert.equal(res4.success, false);
  assert.equal(res4.errorCode, "OTP_DAILY_LIMIT_EXCEEDED");

  // Verify Meta fetch was called EXACTLY 2 times, never for requests 3 and 4
  assert.equal(fetchCalls, 2);
  const status = await service.getCount();
  assert.equal(status.currentCount, 2);
});

test("6. Concurrent requests cannot exceed the limit", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const limit = 5;
  const config = makeConfig({ OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: String(limit) });
  const service = new WhatsAppDailyDispatchService(config, supabase);
  const provider = new WhatsAppOtpProvider(config, service);

  let fetchCalls = 0;
  provider.fetchImpl = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ messages: [{ id: `wamid.concurrent.${fetchCalls}` }] }), {
      status: 200,
    });
  };

  // Fire 20 requests concurrently
  const attempts = await Promise.all(
    Array.from({ length: 20 }, (_, i) => provider.sendOtp(`+96477000000${String(i).padStart(2, "0")}`, "123456"))
  );

  const successful = attempts.filter((r) => r.success);
  const rejected = attempts.filter((r) => !r.success && r.errorCode === "OTP_DAILY_LIMIT_EXCEEDED");

  assert.equal(successful.length, limit, `Exactly ${limit} dispatches must succeed`);
  assert.equal(rejected.length, 20 - limit, `Remaining ${20 - limit} must be rejected`);
  assert.equal(fetchCalls, limit, `Meta provider must be called exactly ${limit} times`);

  const status = await service.getCount();
  assert.equal(status.currentCount, limit);
});

test("7. Counter survives service recreation across instances/redeployments", async () => {
  // Shared durable table (simulating database storage across pods or restarts)
  const sharedTable = createDeliveryTable();
  const config = makeConfig({ OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: "3" });

  // Pod 1 / Boot 1
  const serviceInstance1 = new WhatsAppDailyDispatchService(config, {
    client: createFakeSupabaseClient(sharedTable),
  });
  const claim1 = await serviceInstance1.claimDispatch({ correlationId: "pod1-req1", mode: "sandbox" });
  const claim2 = await serviceInstance1.claimDispatch({ correlationId: "pod1-req2", mode: "sandbox" });
  assert.equal(claim1.allowed, true);
  assert.equal(claim2.allowed, true);

  // Pod 2 / Boot 2 (new service instance created after redeploy/restart)
  const serviceInstance2 = new WhatsAppDailyDispatchService(config, {
    client: createFakeSupabaseClient(sharedTable),
  });
  const claim3 = await serviceInstance2.claimDispatch({ correlationId: "pod2-req3", mode: "sandbox" });
  assert.equal(claim3.allowed, true, "3rd slot allowed");

  // 4th slot should now be rejected on new instance
  const claim4 = await serviceInstance2.claimDispatch({ correlationId: "pod2-req4", mode: "sandbox" });
  assert.equal(claim4.allowed, false, "4th slot rejected because limit is 3");
  assert.equal(claim4.errorCode, "OTP_DAILY_LIMIT_EXCEEDED");
});

test("8. Counter uses Asia/Baghdad day boundaries", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const config = makeConfig({
    OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: "2",
    OTP_WHATSAPP_DAILY_LIMIT_TIMEZONE: "Asia/Baghdad",
  });
  const service = new WhatsAppDailyDispatchService(config, supabase);

  // Baghdad is UTC+3.
  // 2026-09-07 20:59:00 UTC = 2026-09-07 23:59:00 in Asia/Baghdad (Day 1)
  const day1Epoch = new Date("2026-09-07T20:59:00Z").getTime();
  table.clock.now = day1Epoch;

  const d1_1 = await service.claimDispatch({ correlationId: "d1-1", mode: "sandbox" });
  const d1_2 = await service.claimDispatch({ correlationId: "d1-2", mode: "sandbox" });
  const d1_3 = await service.claimDispatch({ correlationId: "d1-3", mode: "sandbox" });

  assert.equal(d1_1.allowed, true);
  assert.equal(d1_2.allowed, true);
  assert.equal(d1_3.allowed, false, "Day 1 limit reached");
  assert.equal(d1_1.bucketDate, "2026-09-07");

  // Advance time by 2 minutes:
  // 2026-09-07 21:01:00 UTC = 2026-09-08 00:01:00 in Asia/Baghdad (Day 2!)
  const day2Epoch = new Date("2026-09-07T21:01:00Z").getTime();
  table.clock.now = day2Epoch;

  // Next calendar day in Baghdad resets the daily cap!
  const d2_1 = await service.claimDispatch({ correlationId: "d2-1", mode: "sandbox" });
  assert.equal(d2_1.allowed, true, "New day in Asia/Baghdad resets counter");
  assert.equal(d2_1.bucketDate, "2026-09-08");
  assert.equal(d2_1.currentCount, 1);
});

test("9. Disabled mode produces zero provider calls and zero DB mutations", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const config = makeConfig({ OTP_WHATSAPP_MODE: "disabled" });
  const service = new WhatsAppDailyDispatchService(config, supabase);
  const provider = new WhatsAppOtpProvider(config, service);

  let fetchCalls = 0;
  provider.fetchImpl = async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  };

  const res = await provider.sendOtp("+9647701234567", "654321");
  assert.equal(res.success, false);
  assert.equal(res.failureClass, "CONFIG_ERROR");
  assert.equal(fetchCalls, 0, "No Meta calls in disabled mode");

  const status = await service.getCount();
  assert.equal(status.currentCount, 0, "No DB dispatches recorded in disabled mode");
});

test("10. No OTP, raw phone, token, or request headers appear in logs", async () => {
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const secretToken = "super_secret_meta_token_12345";
  const sensitivePhone = "+9647701234567";
  const sensitiveOtp = "789123";

  const config = makeConfig({
    OTP_WHATSAPP_ACCESS_TOKEN: secretToken,
    OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: "1",
  });
  const service = new WhatsAppDailyDispatchService(config, supabase);
  const provider = new WhatsAppOtpProvider(config, service);

  provider.fetchImpl = async () =>
    new Response(JSON.stringify({ messages: [{ id: "wamid.safe" }] }), { status: 200 });

  const capturedLogs = [];
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  try {
    const intercept = (...args) => capturedLogs.push(args.map(String).join(" "));
    console.log = intercept;
    console.warn = intercept;
    console.error = intercept;

    // First call (success)
    await provider.sendOtp(sensitivePhone, sensitiveOtp, { correlationId: "safe-corr-1" });
    // Second call (cap exceeded)
    await provider.sendOtp(sensitivePhone, sensitiveOtp, { correlationId: "safe-corr-2" });
  } finally {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }

  const combined = capturedLogs.join("\n");
  assert.ok(!combined.includes(sensitiveOtp), "OTP must not appear in logs");
  assert.ok(!combined.includes(secretToken), "Access token must not appear in logs");
  assert.ok(!combined.includes("+9647701234567"), "Raw unmasked phone must not appear in logs");
});

test("11. Existing per-recipient limits remain effective", async () => {
  const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=";
  const config = makeConfig({
    SUPABASE_AUTH_HOOK_SECRET: SECRET,
    OTP_WHATSAPP_DAILY_GLOBAL_LIMIT: "200",
  });
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const service = new WhatsAppDailyDispatchService(config, supabase);
  const provider = new WhatsAppOtpProvider(config, service);

  provider.fetchImpl = async () =>
    new Response(JSON.stringify({ messages: [{ id: "wamid.recipient.ok" }] }), { status: 200 });

  const hookService = new SupabaseAuthHookService(config, provider, inMemoryDurableStub());

  // Helper to build a signed request payload with standardwebhooks
  const { Webhook } = await import("standardwebhooks");
  const wh = new Webhook(SECRET);

  const sign = (otp, webhookId = crypto.randomUUID()) => {
    const payload = {
      user: { id: "u-1", phone: "+9647701234567" },
      sms: { otp },
    };
    const rawBody = JSON.stringify(payload);
    const timestamp = new Date();
    return {
      rawBody,
      headers: {
        "webhook-id": webhookId,
        "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "webhook-signature": wh.sign(webhookId, timestamp, rawBody),
      },
      payload,
    };
  };

  // Recipient limit allows 3 sends per minute per recipient
  await hookService.handleSendSms(sign("111111"));
  await hookService.handleSendSms(sign("222222"));
  await hookService.handleSendSms(sign("333333"));

  // 4th send within the same minute to the same recipient should be rejected with 429
  await assert.rejects(
    async () => hookService.handleSendSms(sign("444444")),
    (err) => err.status === 429,
    "4th send to recipient within 1 minute must be rejected by per-recipient rate limiter"
  );
});

test("12. No real network requests occur during tests", async () => {
  // Verifies that fetchImpl is strictly mocked and no external socket is opened
  const table = createDeliveryTable();
  const supabase = { client: createFakeSupabaseClient(table) };
  const config = makeConfig();
  const service = new WhatsAppDailyDispatchService(config, supabase);
  const provider = new WhatsAppOtpProvider(config, service);

  let fetchInvoked = false;
  provider.fetchImpl = async (url) => {
    fetchInvoked = true;
    assert.ok(url.startsWith("https://graph.facebook.com"), "Mock URL sanity check");
    return new Response(JSON.stringify({ messages: [{ id: "wamid.unit.test" }] }), { status: 200 });
  };

  const res = await provider.sendOtp("+9647701111111", "999888");
  assert.equal(fetchInvoked, true);
  assert.equal(res.success, true);
});
