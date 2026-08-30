import test from "node:test";
import assert from "node:assert/strict";
import { ServiceUnavailableException } from "@nestjs/common";

const { Test } = await import("@nestjs/testing");
const { ConfigService } = await import("@nestjs/config");
const { WhatsAppOtpProvider } = await import("../dist/modules/auth/whatsapp-otp.provider.js");
const { OtpDeliveryService } = await import("../dist/modules/auth/otp-delivery.service.js");
const { OtpChallengeService } = await import("../dist/modules/auth/otp-challenge.service.js");
const { PasswordRecoveryService } = await import("../dist/modules/auth/password-recovery.service.js");
const { AccountClaimService } = await import("../dist/modules/auth/account-claim.service.js");
const { toWhatsAppE164, maskPhoneForLogs } = await import("../dist/modules/auth/otp-phone.util.js");
const { normalizeIraqiPhone } = await import("../dist/common/validators/iraqi-phone.validator.js");

function makeConfig(overrides = {}) {
  return {
    get: (key, def) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) return overrides[key];
      return def ?? undefined;
    },
  };
}

function makeChallengeTable({ inserts, updates, deletes, expireError = null, deleteError = null }) {
  return {
    select() {
      return this;
    },
    eq() {
      return this;
    },
    gt() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return Promise.resolve({ data: [], error: null });
    },
    insert(row) {
      inserts.push(row);
      return Promise.resolve({ error: null });
    },
    update(patch) {
      return {
        eq(_col, id) {
          updates.push({ id, patch });
          return Promise.resolve({ error: expireError });
        },
      };
    },
    delete() {
      return {
        eq(_col, id) {
          deletes.push({ id });
          return Promise.resolve({ error: deleteError });
        },
      };
    },
  };
}

const WA_CFG = {
  OTP_PROVIDER: "whatsapp",
  OTP_WHATSAPP_MODE: "live",
  OTP_WHATSAPP_PHONE_NUMBER_ID: "1234567890",
  OTP_WHATSAPP_ACCESS_TOKEN: "secret-token-value-do-not-log",
  OTP_WHATSAPP_TEMPLATE_NAME: "otp_authentication",
  OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
  OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
  OTP_WHATSAPP_API_VERSION: "v19.0",
  OTP_WHATSAPP_TIMEOUT_MS: "5000",
};

test("OTP phone util: 07 → +9647 and masking", () => {
  assert.equal(toWhatsAppE164("07501234567"), "+9647501234567");
  assert.equal(toWhatsAppE164("+9647501234567"), "+9647501234567");
  assert.equal(normalizeIraqiPhone("+9647501234567"), "07501234567");
  const masked = maskPhoneForLogs("07501234567");
  assert.ok(!masked.includes("07501234567"));
  assert.ok(masked.endsWith("4567"));
});

test("WhatsApp OTP delivery suite", async (t) => {
  const prevNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "test";

  t.after(() => {
    process.env.NODE_ENV = prevNodeEnv;
  });

  await t.test("missing OTP_PROVIDER does not fake-succeed", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpDeliveryService,
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig({}) },
      ],
    }).compile();
    const delivery = moduleRef.get(OtpDeliveryService);
    await assert.rejects(
      () =>
        delivery.sendOtp({
          phone: "07501234567",
          code: "111111",
          purpose: "claim_account",
          correlationId: "corr-missing",
        }),
      (err) =>
        err instanceof ServiceUnavailableException &&
        JSON.stringify(err.getResponse()).includes("OTP_PROVIDER_DISABLED"),
    );
    assert.equal(delivery.getSentOtpsForTest().length, 0);
  });

  await t.test("OTP_PROVIDER=fake forbidden in production", async () => {
    process.env.NODE_ENV = "production";
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpDeliveryService,
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig({ OTP_PROVIDER: "fake" }) },
      ],
    }).compile();
    const delivery = moduleRef.get(OtpDeliveryService);
    await assert.rejects(
      () =>
        delivery.sendOtp({
          phone: "07501234567",
          code: "111111",
          purpose: "claim_account",
          correlationId: "corr-prod-fake",
        }),
      (err) => err instanceof ServiceUnavailableException,
    );
    process.env.NODE_ENV = "test";
  });

  await t.test("OTP_PROVIDER=test forbidden in production", async () => {
    process.env.NODE_ENV = "production";
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpDeliveryService,
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig({ OTP_PROVIDER: "test" }) },
      ],
    }).compile();
    const delivery = moduleRef.get(OtpDeliveryService);
    await assert.rejects(
      () =>
        delivery.sendOtp({
          phone: "07501234567",
          code: "111111",
          purpose: "claim_account",
          correlationId: "corr-prod-test",
        }),
      (err) => err instanceof ServiceUnavailableException,
    );
    process.env.NODE_ENV = "test";
  });

  await t.test("fake mode never issues HTTP (test env)", async () => {
    let fetchCalls = 0;
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpDeliveryService,
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig({ OTP_PROVIDER: "fake" }) },
      ],
    }).compile();

    const delivery = moduleRef.get(OtpDeliveryService);
    const wa = moduleRef.get(WhatsAppOtpProvider);
    wa.fetchImpl = async () => {
      fetchCalls += 1;
      throw new Error("should not be called");
    };

    await delivery.sendOtp({
      phone: "07501234567",
      code: "654321",
      purpose: "claim_account",
      correlationId: "corr-fake",
    });

    assert.equal(fetchCalls, 0);
    assert.equal(delivery.getSentOtpsForTest().length, 1);
  });

  await t.test("whatsapp mode builds AUTH_COPY_CODE payload and converts 07→964", async () => {
    let captured = null;
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpDeliveryService,
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig(WA_CFG) },
      ],
    }).compile();

    const delivery = moduleRef.get(OtpDeliveryService);
    const wa = moduleRef.get(WhatsAppOtpProvider);
    wa.fetchImpl = async (url, init) => {
      captured = { url: String(url), init };
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: [{ id: "wamid.TEST123" }] }),
      };
    };

    await delivery.sendOtp({
      phone: "07501234567",
      code: "112233",
      purpose: "password_reset",
      correlationId: "corr-wa",
    });

    assert.ok(captured);
    assert.match(captured.url, /graph\.facebook\.com\/v19\.0\/1234567890\/messages/);
    assert.equal(captured.init.headers.Authorization, "Bearer secret-token-value-do-not-log");

    const body = JSON.parse(captured.init.body);
    assert.equal(body.to, "9647501234567");
    assert.equal(body.template.components[0].parameters[0].text, "112233");
    assert.equal(body.template.components[1].sub_type, "COPY_CODE");
  });

  await t.test("token stays in Authorization header only", async () => {
    let captured = null;
    const waModule = await Test.createTestingModule({
      providers: [
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig(WA_CFG) },
      ],
    }).compile();
    const wa = waModule.get(WhatsAppOtpProvider);
    wa.fetchImpl = async (_url, init) => {
      captured = init;
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "wamid.X" }] }) };
    };
    await wa.sendOtp("+9647501234567", "999888");
    assert.ok(!captured.body.includes("secret-token-value-do-not-log"));
    assert.equal(captured.headers.Authorization, "Bearer secret-token-value-do-not-log");
  });

  await t.test("unknown template type is CONFIG_ERROR (no silent fallback)", async () => {
    const waModule = await Test.createTestingModule({
      providers: [
        WhatsAppOtpProvider,
        {
          provide: ConfigService,
          useValue: makeConfig({ ...WA_CFG, OTP_WHATSAPP_TEMPLATE_TYPE: "NOT_A_REAL_TYPE" }),
        },
      ],
    }).compile();
    const wa = waModule.get(WhatsAppOtpProvider);
    let fetchCalls = 0;
    wa.fetchImpl = async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "x" }] }) };
    };
    const result = await wa.sendOtp("+9647501234567", "123123");
    assert.equal(result.success, false);
    assert.equal(result.failureClass, "CONFIG_ERROR");
    assert.equal(fetchCalls, 0);
  });

  await t.test("missing config fails clearly without fake success", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpDeliveryService,
        WhatsAppOtpProvider,
        {
          provide: ConfigService,
          useValue: makeConfig({
            OTP_PROVIDER: "whatsapp",
            OTP_WHATSAPP_MODE: "live",
            OTP_WHATSAPP_PHONE_NUMBER_ID: "",
            OTP_WHATSAPP_ACCESS_TOKEN: "",
            OTP_WHATSAPP_TEMPLATE_NAME: "otp_authentication",
            OTP_WHATSAPP_TEMPLATE_LANGUAGE: "ar",
            OTP_WHATSAPP_TEMPLATE_TYPE: "AUTH_COPY_CODE",
            OTP_WHATSAPP_API_VERSION: "v19.0",
            OTP_WHATSAPP_TIMEOUT_MS: "5000",
          }),
        },
      ],
    }).compile();

    const delivery = moduleRef.get(OtpDeliveryService);
    const wa = moduleRef.get(WhatsAppOtpProvider);
    let fetchCalls = 0;
    wa.fetchImpl = async () => {
      fetchCalls += 1;
      return { ok: true, status: 200, json: async () => ({ messages: [{ id: "x" }] }) };
    };

    await assert.rejects(
      () =>
        delivery.sendOtp({
          phone: "07501234567",
          code: "111111",
          purpose: "claim_account",
          correlationId: "corr-cfg",
        }),
      (err) => err instanceof ServiceUnavailableException,
    );
    assert.equal(fetchCalls, 0);
  });

  await t.test("Meta 200 + messages[0].id = accepted (not delivered)", async () => {
    const waModule = await Test.createTestingModule({
      providers: [
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig(WA_CFG) },
      ],
    }).compile();
    const wa = waModule.get(WhatsAppOtpProvider);
    wa.fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.OK" }] }),
    });
    const result = await wa.sendOtp("+9647501234567", "123123");
    assert.equal(result.success, true);
    assert.equal(result.providerAcceptedMessageId, "wamid.OK");
    assert.equal(result.providerMessageId, undefined);
  });

  await t.test("Meta auth error = failure", async () => {
    const waModule = await Test.createTestingModule({
      providers: [
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig(WA_CFG) },
      ],
    }).compile();
    const wa = waModule.get(WhatsAppOtpProvider);
    wa.fetchImpl = async () => ({
      ok: false,
      status: 401,
      json: async () => ({
        error: { code: 190, type: "OAuthException", message: "Invalid OAuth access token" },
      }),
    });
    const result = await wa.sendOtp("+9647501234567", "123123");
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "META_AUTH_ERROR");
  });

  await t.test("Meta template error = failure", async () => {
    const waModule = await Test.createTestingModule({
      providers: [
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig(WA_CFG) },
      ],
    }).compile();
    const wa = waModule.get(WhatsAppOtpProvider);
    wa.fetchImpl = async () => ({
      ok: false,
      status: 400,
      json: async () => ({
        error: { code: 132000, type: "OAuthException", message: "Template param mismatch" },
      }),
    });
    const result = await wa.sendOtp("+9647501234567", "123123");
    assert.equal(result.success, false);
    assert.equal(result.failureClass, "TEMPLATE_ERROR");
  });

  await t.test("timeout = failure", async () => {
    const waModule = await Test.createTestingModule({
      providers: [
        WhatsAppOtpProvider,
        {
          provide: ConfigService,
          useValue: makeConfig({ ...WA_CFG, OTP_WHATSAPP_TIMEOUT_MS: "1000" }),
        },
      ],
    }).compile();
    const wa = waModule.get(WhatsAppOtpProvider);
    wa.fetchImpl = async (_url, init) =>
      new Promise((_, reject) => {
        const onAbort = () => {
          const err = new Error("Aborted");
          err.name = "AbortError";
          reject(err);
        };
        if (init.signal.aborted) onAbort();
        else init.signal.addEventListener("abort", onAbort);
      });
    const result = await wa.sendOtp("+9647501234567", "123123");
    assert.equal(result.success, false);
    assert.equal(result.errorCode, "OTP_PROVIDER_TIMEOUT");
  });

  await t.test("raw OTP is not present in ServiceUnavailableException response body", async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        OtpDeliveryService,
        WhatsAppOtpProvider,
        { provide: ConfigService, useValue: makeConfig(WA_CFG) },
      ],
    }).compile();
    const delivery = moduleRef.get(OtpDeliveryService);
    const wa = moduleRef.get(WhatsAppOtpProvider);
    wa.fetchImpl = async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 132001, message: "bad template" } }),
    });

    const secretOtp = "778899";
    try {
      await delivery.sendOtp({
        phone: "07501234567",
        code: secretOtp,
        purpose: "claim_account",
        correlationId: "corr-no-leak",
      });
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof ServiceUnavailableException);
      const body = JSON.stringify(err.getResponse());
      assert.ok(!body.includes(secretOtp));
      assert.ok(!body.includes("secret-token-value-do-not-log"));
    }
  });

  await t.test("delivery failure expires challenge", async () => {
    const inserts = [];
    const updates = [];
    const deletes = [];
    const supabaseMock = {
      client: {
        from: () => makeChallengeTable({ inserts, updates, deletes }),
      },
    };
    const deliveryMock = {
      sendOtp: async () => {
        throw new ServiceUnavailableException({
          code: "OTP_DELIVERY_FAILED",
          message: "تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى لاحقاً",
        });
      },
    };

    const challengeService = new OtpChallengeService(supabaseMock, deliveryMock);
    await assert.rejects(
      () =>
        challengeService.createChallenge({
          phone: "07501234567",
          purpose: "claim_account",
        }),
      (err) => err instanceof ServiceUnavailableException,
    );
    assert.equal(inserts.length, 1);
    assert.ok(updates.some((u) => u.patch.status === "expired"));
  });

  await t.test("expire cleanup failure falls back to delete", async () => {
    const inserts = [];
    const updates = [];
    const deletes = [];
    const supabaseMock = {
      client: {
        from: () =>
          makeChallengeTable({
            inserts,
            updates,
            deletes,
            expireError: { message: "expire failed" },
            deleteError: null,
          }),
      },
    };
    const deliveryMock = {
      sendOtp: async () => {
        throw new ServiceUnavailableException({
          code: "OTP_DELIVERY_FAILED",
          message: "تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى لاحقاً",
        });
      },
    };
    const challengeService = new OtpChallengeService(supabaseMock, deliveryMock);
    await assert.rejects(() =>
      challengeService.createChallenge({
        phone: "07501234567",
        purpose: "claim_account",
      }),
    );
    assert.ok(deletes.length >= 1);
  });
});

test("PasswordRecoveryService anti-enumeration on provider failure", async () => {
  const generic = {
    message: "إذا كان رقم الهاتف مسجلاً، فقد تم إرسال رمز استعادة كلمة المرور",
  };

  const failingChallenge = {
    assertDeliveryReady: () => {},
    issueRequestHandle: (id) => `handle-${id}`,
    issueDecoyRequestHandle: () => "handle-decoy",
    createChallenge: async () => {
      throw new ServiceUnavailableException({
        code: "OTP_DELIVERY_FAILED",
        message: "تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى لاحقاً",
      });
    },
  };

  const registeredSupabase = {
    client: {
      from: (table) => {
        if (table === "customer_phone_identities") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { user_id: "user-1" }, error: null }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      },
    },
  };

  const unknownSupabase = {
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    },
  };

  const registeredSvc = new PasswordRecoveryService(registeredSupabase, failingChallenge);
  const unknownSvc = new PasswordRecoveryService(unknownSupabase, failingChallenge);

  const registeredRes = await registeredSvc.requestPasswordReset("07501234567");
  const unknownRes = await unknownSvc.requestPasswordReset("07509999999");

  assert.equal(registeredRes.message, generic.message);
  assert.equal(unknownRes.message, generic.message);
  assert.deepEqual(Object.keys(registeredRes).sort(), Object.keys(unknownRes).sort());
  assert.ok(registeredRes.request_id, "registered response must carry a request id");
  assert.ok(unknownRes.request_id, "unknown response must carry a request id too");
});

test("AccountClaimService recover anti-enumeration on provider failure", async () => {
  const generic = {
    message: "إذا كانت البيانات صحيحة، فقد تم إرسال رمز التوثيق إلى رقم الهاتف المرتبط بالطلب",
  };

  const failingChallenge = {
    assertDeliveryReady: () => {},
    issueRequestHandle: (id) => `handle-${id}`,
    issueDecoyRequestHandle: () => "handle-decoy",
    createChallenge: async () => {
      throw new ServiceUnavailableException({
        code: "OTP_DELIVERY_FAILED",
        message: "تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى لاحقاً",
      });
    },
  };

  const validOrderSupabase = {
    client: {
      from: (table) => {
        if (table === "orders") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "ord-1",
                    user_id: "user-1",
                    customer_phone: "07501234567",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
      },
    },
  };

  const invalidOrderSupabase = {
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    },
  };

  const validSvc = new AccountClaimService(validOrderSupabase, failingChallenge);
  const invalidSvc = new AccountClaimService(invalidOrderSupabase, failingChallenge);

  const validRes = await validSvc.recoverClaimByOrder("ORD-1", "07501234567");
  const invalidRes = await invalidSvc.recoverClaimByOrder("ORD-NOPE", "07501234567");

  assert.equal(validRes.message, generic.message);
  assert.equal(invalidRes.message, generic.message);
  assert.deepEqual(Object.keys(validRes).sort(), Object.keys(invalidRes).sort());
  assert.ok(validRes.request_id, "matching order must carry a request id");
  assert.ok(invalidRes.request_id, "non-matching order must carry a request id too");
});

test("Authenticated claim request surfaces provider failure", async () => {
  const failingChallenge = {
    assertDeliveryReady: () => {},
    issueRequestHandle: (id) => `handle-${id}`,
    issueDecoyRequestHandle: () => "handle-decoy",
    createChallenge: async () => {
      throw new ServiceUnavailableException({
        code: "OTP_DELIVERY_FAILED",
        message: "تعذر إرسال رمز التحقق عبر واتساب. حاول مرة أخرى لاحقاً",
      });
    },
  };

  const supabase = {
    client: {
      from: (table) => {
        if (table === "profiles") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "user-prov",
                    account_type: "provisional_customer",
                    phone: "07501234567",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        };
      },
    },
  };

  const svc = new AccountClaimService(supabase, failingChallenge);
  await assert.rejects(
    () => svc.requestClaimFromProvisional({ actorId: "user-prov", actorRole: "customer" }, "07501234567"),
    (err) => err instanceof ServiceUnavailableException,
  );
});

test("Production missing OTP_TOKEN_SECRET fails closed in completePasswordReset", async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevSecret = process.env.OTP_TOKEN_SECRET;
  process.env.NODE_ENV = "production";
  delete process.env.OTP_TOKEN_SECRET;

  const svc = new PasswordRecoveryService(
    { client: { from: () => ({}) } },
    { createChallenge: async () => ({}) },
  );

  try {
    await assert.rejects(
      () =>
        svc.completePasswordReset({
          actionToken: "any-token-value",
          newPassword: "secret1",
        }),
      (err) =>
        err instanceof ServiceUnavailableException &&
        JSON.stringify(err.getResponse()).includes("OTP_TOKEN_SECRET_MISSING"),
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevSecret === undefined) delete process.env.OTP_TOKEN_SECRET;
    else process.env.OTP_TOKEN_SECRET = prevSecret;
  }
});

test("Identical OTP_HMAC_SECRET and OTP_TOKEN_SECRET rejected on createChallenge", async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevHmac = process.env.OTP_HMAC_SECRET;
  const prevToken = process.env.OTP_TOKEN_SECRET;
  const prevHandle = process.env.OTP_REQUEST_HANDLE_SECRET;
  process.env.NODE_ENV = "production";
  process.env.OTP_HMAC_SECRET = "same-secret-value-for-both";
  process.env.OTP_TOKEN_SECRET = "same-secret-value-for-both";
  // Present and distinct, so the assertion below isolates the HMAC/token collision.
  process.env.OTP_REQUEST_HANDLE_SECRET = "distinct-request-handle-secret-value";

  const svc = new OtpChallengeService(
    { client: { from: () => ({}) } },
    { sendOtp: async () => {} },
  );

  try {
    await assert.rejects(
      () =>
        svc.createChallenge({
          phone: "07501234567",
          purpose: "password_reset",
        }),
      (err) =>
        err instanceof ServiceUnavailableException &&
        JSON.stringify(err.getResponse()).includes("OTP_SECRETS_MUST_DIFFER"),
    );
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevHmac === undefined) delete process.env.OTP_HMAC_SECRET;
    else process.env.OTP_HMAC_SECRET = prevHmac;
    if (prevToken === undefined) delete process.env.OTP_TOKEN_SECRET;
    else process.env.OTP_TOKEN_SECRET = prevToken;
    if (prevHandle === undefined) delete process.env.OTP_REQUEST_HANDLE_SECRET;
    else process.env.OTP_REQUEST_HANDLE_SECRET = prevHandle;
  }
});

// ── Opaque OTP request handles ────────────────────────────────────────────────
const {
  issueChallengeHandle,
  issueDecoyHandle,
  resolveOtpRequestHandle,
} = await import("../dist/modules/auth/otp-request-handle.util.js");

const HANDLE_SECRET = "unit-test-hmac-secret-value-32-bytes";

test("challenge handle round-trips to its challenge id", () => {
  const challengeId = "11111111-2222-4333-8444-555555555555";
  const handle = issueChallengeHandle(HANDLE_SECRET, challengeId);
  assert.deepEqual(resolveOtpRequestHandle(HANDLE_SECRET, handle), {
    kind: "challenge",
    challengeId,
  });
});

test("decoy handle resolves to a decoy and never yields a challenge id", () => {
  const handle = issueDecoyHandle(HANDLE_SECRET);
  const resolved = resolveOtpRequestHandle(HANDLE_SECRET, handle);
  assert.equal(resolved.kind, "decoy");
  assert.equal(resolved.challengeId, undefined);
});

test("real and decoy handles are indistinguishable to the caller", () => {
  const real = issueChallengeHandle(HANDLE_SECRET, "11111111-2222-4333-8444-555555555555");
  const decoy = issueDecoyHandle(HANDLE_SECRET);
  // Same length and same alphabet — nothing in the opaque value reveals the kind.
  assert.equal(real.length, decoy.length);
  assert.match(real, /^v1\.[A-Za-z0-9_-]+$/);
  assert.match(decoy, /^v1\.[A-Za-z0-9_-]+$/);
  // And the plaintext must not be readable.
  assert.ok(!Buffer.from(real.slice(3), "base64url").toString("utf8").includes("11111111"));
});

test("handles are rejected under a different secret, when tampered, and when malformed", () => {
  const handle = issueChallengeHandle(HANDLE_SECRET, "11111111-2222-4333-8444-555555555555");
  assert.equal(resolveOtpRequestHandle("another-secret-entirely-32-bytes!!", handle), null);

  const prefix = handle.slice(0, 3);
  const raw = Buffer.from(handle.slice(3), "base64url");
  raw[raw.length - 1] ^= 0xff;
  assert.equal(resolveOtpRequestHandle(HANDLE_SECRET, prefix + raw.toString("base64url")), null);

  assert.equal(resolveOtpRequestHandle(HANDLE_SECRET, ""), null);
  assert.equal(resolveOtpRequestHandle(HANDLE_SECRET, "not-a-handle"), null);
});

test("two handles for the same challenge differ, so a handle cannot be correlated", () => {
  const challengeId = "11111111-2222-4333-8444-555555555555";
  const a = issueChallengeHandle(HANDLE_SECRET, challengeId);
  const b = issueChallengeHandle(HANDLE_SECRET, challengeId);
  assert.notEqual(a, b);
  assert.deepEqual(resolveOtpRequestHandle(HANDLE_SECRET, a), resolveOtpRequestHandle(HANDLE_SECRET, b));
});

// ── Provider readiness pre-flight ─────────────────────────────────────────────
function deliveryServiceWith(env, whatsAppStub) {
  const config = { get: (key) => env[key] };
  return new OtpDeliveryService(config, whatsAppStub ?? { validateConfig: () => ({ ok: true }) });
}

test("readiness fails when the provider is disabled or unset", () => {
  for (const env of [{}, { OTP_PROVIDER: "disabled" }, { OTP_PROVIDER: "   " }]) {
    assert.throws(
      () => deliveryServiceWith(env).assertProviderReady(),
      (err) => err.getResponse().code === "OTP_PROVIDER_DISABLED",
    );
  }
});

test("readiness fails on unsupported providers", () => {
  assert.throws(
    () => deliveryServiceWith({ OTP_PROVIDER: "twilio" }).assertProviderReady(),
    (err) => err.getResponse().code === "OTP_PROVIDER_UNSUPPORTED",
  );
});

test("readiness surfaces WhatsApp misconfiguration without leaking the reason", () => {
  const service = deliveryServiceWith({ OTP_PROVIDER: "whatsapp" }, {
    validateConfig: () => ({ ok: false, reason: "OTP_WHATSAPP_ACCESS_TOKEN not configured" }),
  });
  assert.throws(
    () => service.assertProviderReady(),
    (err) => {
      const body = err.getResponse();
      assert.equal(body.code, "OTP_WHATSAPP_CONFIG_ERROR");
      // The variable name stays in the logs, never in the response.
      assert.ok(!JSON.stringify(body).includes("ACCESS_TOKEN"));
      return true;
    },
  );
});

test("readiness passes when WhatsApp is fully configured", () => {
  assert.doesNotThrow(() =>
    deliveryServiceWith({ OTP_PROVIDER: "whatsapp" }, { validateConfig: () => ({ ok: true }) })
      .assertProviderReady(),
  );
});

test("readiness forbids the fake provider in production", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.throws(
      () => deliveryServiceWith({ OTP_PROVIDER: "fake" }).assertProviderReady(),
      (err) => err.getResponse().code === "OTP_PROVIDER_FORBIDDEN_IN_PRODUCTION",
    );
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});

test("readiness runs before any account lookup, so it cannot leak account existence", async () => {
  const throwingChallenge = {
    assertDeliveryReady: () => {
      throw new ServiceUnavailableException({ code: "OTP_PROVIDER_DISABLED", message: "off" });
    },
    issueRequestHandle: () => "unused",
    issueDecoyRequestHandle: () => "unused",
    createChallenge: async () => assert.fail("createChallenge must not run"),
  };
  const exploding = {
    client: {
      from: () => assert.fail("the account lookup must not run when the channel is not ready"),
    },
  };

  await assert.rejects(
    () => new PasswordRecoveryService(exploding, throwingChallenge).requestPasswordReset("07501234567"),
    (err) => err.getResponse().code === "OTP_PROVIDER_DISABLED",
  );
  await assert.rejects(
    () => new AccountClaimService(exploding, throwingChallenge).recoverClaimByOrder("ORD-1", "07501234567"),
    (err) => err.getResponse().code === "OTP_PROVIDER_DISABLED",
  );
});
