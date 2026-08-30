/**
 * Supabase Send SMS hook — signature, replay, payload and delivery behaviour.
 *
 * Nothing here touches the network. The WhatsApp provider is stubbed, so no message is
 * ever sent and no Meta credential is needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Webhook } from "standardwebhooks";

const { SupabaseAuthHookService } = await import("../dist/modules/auth/supabase-auth-hook.service.js");
import { inMemoryDurableStub } from "./helpers/auth-hook-durable-fake.mjs";

const SECRET = "whsec_dGVzdHNlY3JldHRlc3RzZWNyZXR0ZXN0c2VjcmV0MTI=";
const PHONE = "+9647501234567";
const OTP = "483920";

function configWith(secret = SECRET) {
  return { get: (key) => (key === "SUPABASE_AUTH_HOOK_SECRET" ? secret : undefined) };
}

/** Produces a genuinely signed request the way Supabase would. */
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

function providerStub(behaviour = { success: true, providerAcceptedMessageId: "wamid.TEST" }) {
  const calls = [];
  return {
    calls,
    sendOtp: async (destination, code) => {
      calls.push({ destination, code });
      if (typeof behaviour === "function") return behaviour();
      return behaviour;
    },
  };
}

const VALID_PAYLOAD = { user: { phone: PHONE }, sms: { otp: OTP } };

function serviceWith(provider, secret = SECRET) {
  return new SupabaseAuthHookService(configWith(secret), provider, inMemoryDurableStub());
}

// ── Signature ────────────────────────────────────────────────────────────────

test("a validly signed request is accepted and delivered to the provider", async () => {
  const provider = providerStub();
  const request = signRequest(VALID_PAYLOAD);

  await serviceWith(provider).handleSendSms(request);

  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].destination, PHONE);
  assert.equal(provider.calls[0].code, OTP);
});

test("a request with no signature headers is rejected before any send", async () => {
  const provider = providerStub();
  const request = signRequest(VALID_PAYLOAD);

  for (const missing of ["webhook-id", "webhook-timestamp", "webhook-signature"]) {
    const headers = { ...request.headers };
    delete headers[missing];
    await assert.rejects(
      () => serviceWith(provider).handleSendSms({ ...request, headers }),
      (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_SIGNATURE_MISSING",
    );
  }
  assert.equal(provider.calls.length, 0, "nothing may be sent for an unsigned request");
});

test("a tampered body is rejected", async () => {
  const provider = providerStub();
  const request = signRequest(VALID_PAYLOAD);
  const tampered = {
    ...request,
    rawBody: JSON.stringify({ user: { phone: "+9647509999999" }, sms: { otp: OTP } }),
  };

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(tampered),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_SIGNATURE_INVALID",
  );
  assert.equal(provider.calls.length, 0);
});

test("a signature made with a different secret is rejected", async () => {
  const provider = providerStub();
  const request = signRequest(VALID_PAYLOAD, {
    secret: "whsec_b3RoZXJzZWNyZXRvdGhlcnNlY3JldG90aGVyc2U=",
  });

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(request),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_SIGNATURE_INVALID",
  );
  assert.equal(provider.calls.length, 0);
});

test("an expired timestamp is rejected", async () => {
  const provider = providerStub();
  const old = new Date(Date.now() - 60 * 60 * 1000);
  const request = signRequest(VALID_PAYLOAD, { timestamp: old });

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(request),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_SIGNATURE_INVALID",
  );
  assert.equal(provider.calls.length, 0);
});

test("re-serialising the parsed body does not validate — the raw bytes are what is signed", async () => {
  const provider = providerStub();
  // Same data, different byte sequence: key order and spacing differ from what was signed.
  const request = signRequest(VALID_PAYLOAD);
  const reserialised = {
    ...request,
    rawBody: JSON.stringify({ sms: { otp: OTP }, user: { phone: PHONE } }, null, 2),
  };

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(reserialised),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_SIGNATURE_INVALID",
  );
  assert.equal(provider.calls.length, 0);
});

test("a missing raw body is a verification failure, never a fallback", async () => {
  const provider = providerStub();
  const request = signRequest(VALID_PAYLOAD);

  for (const rawBody of [undefined, ""]) {
    await assert.rejects(
      () => serviceWith(provider).handleSendSms({ ...request, rawBody }),
      (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_RAW_BODY_MISSING",
    );
  }
  assert.equal(provider.calls.length, 0);
});

test("a missing hook secret fails closed", async () => {
  const provider = providerStub();
  const request = signRequest(VALID_PAYLOAD);

  // A config that returns nothing for every key — not configWith(undefined), which would
  // fall back to the default parameter and quietly restore the secret.
  const emptyConfig = { get: () => undefined };

  await assert.rejects(
    () => new SupabaseAuthHookService(emptyConfig, provider, inMemoryDurableStub()).handleSendSms(request),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_SECRET_MISSING",
  );
  assert.equal(provider.calls.length, 0);
});

// ── Replay ───────────────────────────────────────────────────────────────────

test("a duplicate of a succeeded delivery is acknowledged, not rejected, and sends nothing", async () => {
  const provider = providerStub();
  const service = serviceWith(provider);
  const request = signRequest(VALID_PAYLOAD);

  await service.handleSendSms(request);
  // Supabase retrying something already delivered is legitimate, so this must resolve.
  await service.handleSendSms(request);
  await service.handleSendSms(request);

  assert.equal(provider.calls.length, 1, "a retry must not produce a second message");
});

test("distinct webhook ids are both delivered", async () => {
  const provider = providerStub();
  const service = serviceWith(provider);

  await service.handleSendSms(signRequest(VALID_PAYLOAD));
  await service.handleSendSms(signRequest(VALID_PAYLOAD));

  assert.equal(provider.calls.length, 2);
});

// ── Payload ──────────────────────────────────────────────────────────────────

test("a payload without user.phone is rejected", async () => {
  const provider = providerStub();
  const request = signRequest({ user: {}, sms: { otp: OTP } });

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(request),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_PHONE_MISSING",
  );
  assert.equal(provider.calls.length, 0);
});

test("a payload without sms.otp is rejected", async () => {
  const provider = providerStub();
  const request = signRequest({ user: { phone: PHONE }, sms: {} });

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(request),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_OTP_MISSING",
  );
  assert.equal(provider.calls.length, 0);
});

test("an unusable phone is rejected before dispatch", async () => {
  const provider = providerStub();
  const request = signRequest({ user: { phone: "not-a-phone" }, sms: { otp: OTP } });

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(request),
    (err) => err.getResponse().code === "SUPABASE_AUTH_HOOK_PHONE_INVALID",
  );
  assert.equal(provider.calls.length, 0);
});

test("a local 07 number is converted to E.164 before dispatch", async () => {
  const provider = providerStub();
  const request = signRequest({ user: { phone: "07501234567" }, sms: { otp: OTP } });

  await serviceWith(provider).handleSendSms(request);
  assert.equal(provider.calls[0].destination, "+9647501234567");
});

// ── Provider outcomes ────────────────────────────────────────────────────────

test("a provider failure propagates — Supabase must not see a fake success", async () => {
  const provider = providerStub({ success: false, errorCode: "META_132001", failureClass: "TEMPLATE_ERROR" });
  const request = signRequest(VALID_PAYLOAD);

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(request),
    (err) => err.getResponse().code === "META_132001",
  );
});

test("a provider timeout propagates", async () => {
  const provider = providerStub({ success: false, errorCode: "OTP_PROVIDER_TIMEOUT", failureClass: "TIMEOUT" });
  const request = signRequest(VALID_PAYLOAD);

  await assert.rejects(
    () => serviceWith(provider).handleSendSms(request),
    (err) => err.getResponse().code === "OTP_PROVIDER_TIMEOUT",
  );
});

test("success resolves with no value, so no body can carry the code back", async () => {
  const provider = providerStub();
  const result = await serviceWith(provider).handleSendSms(signRequest(VALID_PAYLOAD));
  assert.equal(result, undefined);
});

// ── Logging hygiene ──────────────────────────────────────────────────────────

test("logs never contain the OTP, the full phone, the secret or the raw body", async () => {
  const captured = [];
  const provider = providerStub();
  const service = serviceWith(provider);

  // The Nest logger writes through these instance methods.
  for (const level of ["log", "warn", "error", "debug", "verbose"]) {
    if (typeof service.logger?.[level] === "function") {
      service.logger[level] = (message) => captured.push(String(message));
    }
  }

  const request = signRequest(VALID_PAYLOAD);
  await service.handleSendSms(request);

  // Failure paths log too.
  const bad = signRequest({ user: { phone: PHONE }, sms: {} });
  await service.handleSendSms(bad).catch(() => {});
  await service.handleSendSms({ ...request, headers: {} }).catch(() => {});

  const output = captured.join("\n");
  assert.ok(output.length > 0, "expected the service to log something");
  assert.ok(!output.includes(OTP), "the OTP must never be logged");
  assert.ok(!output.includes(PHONE), "the full phone must never be logged");
  assert.ok(!output.includes(SECRET), "the hook secret must never be logged");
  assert.ok(!output.includes(request.rawBody), "the raw body must never be logged");
  assert.ok(!output.includes(request.headers["webhook-signature"]), "the signature must never be logged");
  // The masked form is what should appear.
  assert.ok(output.includes("4567"), "expected a masked phone in the logs");
});
