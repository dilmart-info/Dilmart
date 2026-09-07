import { strict as assert } from "node:assert";
import test from "node:test";
import { WhatsAppOtpProvider } from "../dist/modules/auth/whatsapp-otp.provider.js";

function makeConfig(overrides = {}) {
  const env = {
    OTP_WHATSAPP_MODE: "live",
    OTP_WHATSAPP_PHONE_NUMBER_ID: "1234567890",
    OTP_WHATSAPP_ACCESS_TOKEN: "mock_secret_token",
    OTP_WHATSAPP_TEMPLATE_NAME: "auth_otp_code",
    OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
    OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
    OTP_WHATSAPP_API_VERSION: "v20.0",
    OTP_WHATSAPP_TIMEOUT_MS: "4000",
    OTP_WHATSAPP_EXPIRY_MINUTES: "10",
    ...overrides,
  };
  return {
    get: (k) => env[k],
  };
}

test("WhatsAppOtpProvider — fail-closed when disabled", async () => {
  const provider = new WhatsAppOtpProvider(makeConfig({ OTP_WHATSAPP_MODE: "disabled" }));
  const result = await provider.sendOtp("+9647701234567", "123456");

  assert.equal(result.success, false);
  assert.equal(result.failureClass, "CONFIG_ERROR");
  assert.equal(result.errorCode, "OTP_WHATSAPP_CONFIG_ERROR");
});

test("WhatsAppOtpProvider — validates missing or invalid configuration", () => {
  const missingToken = new WhatsAppOtpProvider(makeConfig({ OTP_WHATSAPP_ACCESS_TOKEN: "" }));
  assert.equal(missingToken.validateConfig().ok, false);

  const invalidPhoneId = new WhatsAppOtpProvider(makeConfig({ OTP_WHATSAPP_PHONE_NUMBER_ID: "abc" }));
  assert.equal(invalidPhoneId.validateConfig().ok, false);

  const invalidApiVersion = new WhatsAppOtpProvider(makeConfig({ OTP_WHATSAPP_API_VERSION: "invalid" }));
  assert.equal(invalidApiVersion.validateConfig().ok, false);
});

test("WhatsAppOtpProvider — builds template payload matching Meta API specifications without hardcoding", () => {
  const provider = new WhatsAppOtpProvider(
    makeConfig({
      OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
      OTP_WHATSAPP_TEMPLATE_NAME: "custom_template",
      OTP_WHATSAPP_TEMPLATE_LANGUAGE: "en",
    })
  );

  const payload = provider.buildPayload("+9647701234567", "654321");

  assert.equal(payload.messaging_product, "whatsapp");
  assert.equal(payload.to, "9647701234567");
  assert.equal(payload.template.name, "custom_template");
  assert.equal(payload.template.language.code, "en");
  assert.equal(payload.template.components[0].type, "body");
  assert.equal(payload.template.components[0].parameters[0].text, "654321");
  assert.equal(payload.template.components[1].type, "button");
  assert.equal(payload.template.components[1].sub_type, "COPY_CODE");
});

test("WhatsAppOtpProvider — classifies Meta OAuth and Permission errors as PROVIDER_REJECTED", async () => {
  const provider = new WhatsAppOtpProvider(makeConfig());
  provider.fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: {
          code: 190,
          type: "OAuthException",
          message: "Invalid OAuth access token.",
        },
      }),
      { status: 401 }
    );

  const result = await provider.sendOtp("+9647701234567", "112233");

  assert.equal(result.success, false);
  assert.equal(result.failureClass, "PROVIDER_REJECTED");
  assert.equal(result.errorCode, "META_AUTH_ERROR");
});

test("WhatsAppOtpProvider — handles network timeouts cleanly", async () => {
  const provider = new WhatsAppOtpProvider(makeConfig());
  provider.fetchImpl = async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  };

  const result = await provider.sendOtp("+9647701234567", "112233");

  assert.equal(result.success, false);
  assert.equal(result.failureClass, "PROVIDER_TIMEOUT");
  assert.equal(result.errorCode, "OTP_PROVIDER_TIMEOUT");
});
