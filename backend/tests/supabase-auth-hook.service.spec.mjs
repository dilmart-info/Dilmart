import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Webhook } from "standardwebhooks";
import { inMemoryDurableStub } from "./helpers/auth-hook-durable-fake.mjs";

const { SupabaseAuthHookService } = await import("../dist/modules/auth/supabase-auth-hook.service.js");

const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=";
const PHONE = "+9647501234567";
const OTP = "483920";

function configWith(secret = SECRET) {
  return { get: (key) => (key === "SUPABASE_AUTH_HOOK_SECRET" ? secret : undefined) };
}

function signRequest(payload, { secret = SECRET, id = crypto.randomUUID(), timestamp = new Date() } = {}) {
  const rawBody = JSON.stringify(payload);
  const signature = new Webhook(secret).sign(id, timestamp, rawBody);
  return {
    rawBody,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
      "webhook-signature": signature,
    },
    payload,
  };
}

function providerStub() {
  const calls = [];
  return {
    calls,
    sendOtp: async (destination, code) => {
      calls.push({ destination, code });
      return { success: true, providerAcceptedMessageId: "wamid.TEST_SPEC", latencyMs: 25 };
    },
  };
}

test("SupabaseAuthHookService — accepts genuinely signed valid payload", async () => {
  const provider = providerStub();
  const service = new SupabaseAuthHookService(configWith(), provider, inMemoryDurableStub());

  const req = signRequest({ user: { phone: PHONE }, sms: { otp: OTP } });
  await service.handleSendSms(req);

  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].destination, PHONE);
  assert.equal(provider.calls[0].code, OTP);
});

test("SupabaseAuthHookService — rejects missing or invalid signature", async () => {
  const provider = providerStub();
  const service = new SupabaseAuthHookService(configWith(), provider, inMemoryDurableStub());

  const req = signRequest({ user: { phone: PHONE }, sms: { otp: OTP } });
  req.headers["webhook-signature"] = "v1,invalid_sig";

  await assert.rejects(async () => service.handleSendSms(req), {
    name: "UnauthorizedException",
  });
  assert.equal(provider.calls.length, 0);
});

test("SupabaseAuthHookService — rejects missing rawBody", async () => {
  const provider = providerStub();
  const service = new SupabaseAuthHookService(configWith(), provider, inMemoryDurableStub());

  const req = signRequest({ user: { phone: PHONE }, sms: { otp: OTP } });
  req.rawBody = undefined;

  await assert.rejects(async () => service.handleSendSms(req), {
    name: "UnauthorizedException",
  });
  assert.equal(provider.calls.length, 0);
});

test("SupabaseAuthHookService — rejects invalid phone or missing OTP", async () => {
  const provider = providerStub();
  const service = new SupabaseAuthHookService(configWith(), provider, inMemoryDurableStub());

  // Missing OTP
  const reqNoOtp = signRequest({ user: { phone: PHONE }, sms: {} });
  await assert.rejects(async () => service.handleSendSms(reqNoOtp), {
    name: "BadRequestException",
  });

  // Invalid phone number
  const reqBadPhone = signRequest({ user: { phone: "+12025550123" }, sms: { otp: "123456" } });
  await assert.rejects(async () => service.handleSendSms(reqBadPhone), {
    name: "BadRequestException",
  });

  assert.equal(provider.calls.length, 0);
});
