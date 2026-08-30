/**
 * Weak-password recovery saga — service-level classification tests.
 *
 * DilMart-STORE-WEAK-PASSWORD-RECOVERY-SAGA-001
 *
 * These tests are fully mocked: no Supabase stack, no network. They pin the one decision that
 * makes enabling leaked-password protection safe — how PasswordRecoveryService classifies a
 * failed auth.admin.updateUserById():
 *
 *   deterministic rejection (error.code = 'weak_password') on the FIRST attempt
 *     -> abort the finalization exactly once, with the exact token/reservation/fingerprint,
 *        and never record failed_recoverable (the attempt is over, not retryable);
 *
 *   the same rejection on a finalizing RETRY
 *     -> never abort: an earlier attempt already issued an auth update whose outcome is unknown,
 *        so the password may have changed and the token must stay finalizing;
 *
 *   ambiguous failure (timeout, transport, 5xx, unknown, or a rejection missing the stable code)
 *     -> never abort, and preserve the existing failed_recoverable + finalizing behaviour,
 *        because the password may in fact have been changed.
 *
 * Classification is by `error.code` alone. The error name, message text and HTTP status are never
 * used, because aborting returns a reset credential to `active`.
 *
 * Getting this backwards in either direction is a correctness bug: aborting an ambiguous failure
 * could discard a password change that actually happened, while not aborting a rejection strands
 * the reset token forever.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";

const { Test } = await import("@nestjs/testing");
const { BadRequestException } = await import("@nestjs/common");
const { PasswordRecoveryService } = await import("../dist/modules/auth/password-recovery.service.js");
const { OtpChallengeService } = await import("../dist/modules/auth/otp-challenge.service.js");
const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");

const FINGERPRINT_SECRET =
  process.env.PASSWORD_RESET_FINGERPRINT_SECRET || "default_reset_secret_key_fingerprint_32_bytes";
const TOKEN_SECRET = process.env.OTP_TOKEN_SECRET || "default_local_dev_token_secret_key_32";

const RAW_TOKEN = "a".repeat(64);
const USER_ID = "11111111-1111-1111-1111-111111111111";
const TOKEN_ID = "22222222-2222-2222-2222-222222222222";
const RESERVATION_ID = "33333333-3333-3333-3333-333333333333";
const NEW_PASSWORD = "Password_that_is_pwned_123!";

const fingerprint = (tokenId, password) =>
  crypto.createHmac("sha256", FINGERPRINT_SECRET).update(`${tokenId}:${password}`).digest("hex");
const tokenDigest = (raw) => crypto.createHmac("sha256", TOKEN_SECRET).update(raw).digest("hex");

/** The shape @supabase/auth-js returns when the password is rejected before any mutation. */
function weakPasswordError() {
  const err = new Error("Password is known to be weak and easy to guess, please choose a different one.");
  err.name = "AuthWeakPasswordError";
  err.code = "weak_password";
  err.status = 422;
  err.reasons = ["pwned"];
  return err;
}

/** Carries the code but not the class name — a transport that dropped the prototype. */
function weakPasswordErrorCodeOnly() {
  return { message: "weak password", code: "weak_password", status: 422 };
}

/**
 * Carries the SDK class name but NO code. Aborting returns a reset credential to `active`, so the
 * proof threshold is strict: without the stable code this is ambiguous and must fail closed.
 */
function weakPasswordErrorNameOnly() {
  const err = new Error("Password is known to be weak and easy to guess, please choose a different one.");
  err.name = "AuthWeakPasswordError";
  err.status = 422;
  err.reasons = ["pwned"];
  return err;
}

/** Ambiguous: the update may or may not have committed. */
function timeoutError() {
  const err = new Error("fetch failed: ETIMEDOUT");
  err.name = "FetchError";
  return err;
}

/**
 * Minimal Supabase client stub.
 *
 * Only the access patterns completePasswordReset() actually uses are modelled:
 *   from('auth_action_tokens').select().eq().maybeSingle()
 *   from('auth_action_operations').select().eq().maybeSingle() / .update().eq()
 *   auth.admin.updateUserById()
 * Every stage write is recorded so a test can assert what was NOT written.
 */
function buildSupabaseStub({ tokenRow, operationRow, updateResult }) {
  const calls = { stageWrites: [], updateUserById: [] };

  const client = {
    from(table) {
      if (table === "auth_action_tokens") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tokenRow, error: null }) }) }),
        };
      }
      if (table === "auth_action_operations") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: operationRow, error: null }) }) }),
          update: (payload) => ({
            eq: async (_column, value) => {
              calls.stageWrites.push({ tokenId: value, stage: payload.stage });
              return { error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table in stub: ${table}`);
    },
    auth: {
      admin: {
        updateUserById: async (userId, attributes) => {
          calls.updateUserById.push({ userId, password: attributes.password });
          return updateResult();
        },
      },
    },
  };

  return { client, calls };
}

/** OtpChallengeService stub recording every saga transition the service triggers. */
function buildOtpStub(overrides = {}) {
  const calls = { reserve: [], begin: [], abort: [], release: [], consume: [] };

  const stub = {
    reserveActionToken: async (rawToken, expectedPurpose) => {
      calls.reserve.push({ rawToken, expectedPurpose });
      return {
        tokenId: TOKEN_ID,
        reservationId: RESERVATION_ID,
        userId: USER_ID,
        verifiedPhone: "+9647700000000",
        challengeId: "44444444-4444-4444-4444-444444444444",
        purpose: "password_reset",
      };
    },
    beginPasswordResetFinalization: async (tokenId, reservationId, requestFingerprint) => {
      calls.begin.push({ tokenId, reservationId, requestFingerprint });
    },
    abortPasswordResetFinalization: async (tokenId, reservationId, requestFingerprint) => {
      calls.abort.push({ tokenId, reservationId, requestFingerprint });
    },
    releaseActionTokenReservation: async (tokenId, reservationId) => {
      calls.release.push({ tokenId, reservationId });
    },
    consumeActionToken: async (tokenId, reservationId) => {
      calls.consume.push({ tokenId, reservationId });
    },
    ...overrides,
  };

  return { stub, calls };
}

async function buildService(supabaseStub, otpStub) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PasswordRecoveryService,
      { provide: SupabaseAdminService, useValue: { client: supabaseStub.client } },
      { provide: OtpChallengeService, useValue: otpStub.stub },
    ],
  }).compile();
  return moduleRef.get(PasswordRecoveryService);
}

const activeToken = () => ({
  id: TOKEN_ID,
  status: "active",
  reservation_id: null,
  user_id: USER_ID,
  purpose: "password_reset",
  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
  token_digest: tokenDigest(RAW_TOKEN),
});

const finalizingToken = () => ({
  id: TOKEN_ID,
  status: "finalizing",
  reservation_id: RESERVATION_ID,
  user_id: USER_ID,
  purpose: "password_reset",
  expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
});

const pendingOperation = (stage = "password_update_pending") => ({
  stage,
  operation_type: "password_reset",
  request_fingerprint: fingerprint(TOKEN_ID, NEW_PASSWORD),
  reservation_id: RESERVATION_ID,
});

async function expectBadRequest(promise) {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof BadRequestException, `expected BadRequestException, got ${err}`);
    return err.getResponse();
  }
  assert.fail("expected the call to reject");
  return undefined;
}

test("weak-password recovery saga", async (t) => {
  await t.test("first attempt + weak_password aborts the exact attempt and writes no stage", async () => {
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({ data: null, error: weakPasswordError() }),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    const response = await expectBadRequest(
      service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
    );

    assert.equal(response.code, "WEAK_PASSWORD");
    assert.ok(typeof response.message === "string" && response.message.length > 0);

    assert.equal(otp.calls.abort.length, 1, "abort must be called exactly once");
    assert.deepEqual(otp.calls.abort[0], {
      tokenId: TOKEN_ID,
      reservationId: RESERVATION_ID,
      requestFingerprint: fingerprint(TOKEN_ID, NEW_PASSWORD),
    });

    // The attempt is over. Recording failed_recoverable would invite a retry of a password that
    // can never succeed, and the abort RPC would then be operating on a mutated stage.
    assert.deepEqual(
      supabase.calls.stageWrites.map((w) => w.stage),
      [],
      "no operation stage may be written on a deterministic rejection"
    );
    assert.equal(otp.calls.consume.length, 0);
    assert.equal(otp.calls.release.length, 0);
  });

  await t.test("weak_password code without the SDK class still aborts", async () => {
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({ data: null, error: weakPasswordErrorCodeOnly() }),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    const response = await expectBadRequest(
      service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
    );

    assert.equal(response.code, "WEAK_PASSWORD");
    assert.equal(otp.calls.abort.length, 1);
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), []);
  });

  await t.test("AuthWeakPasswordError without a code never aborts", async () => {
    // Name-only classification is deliberately rejected: only error.code proves the rejection.
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({ data: null, error: weakPasswordErrorNameOnly() }),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    const response = await expectBadRequest(
      service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
    );

    assert.notEqual(response && response.code, "WEAK_PASSWORD");
    assert.equal(otp.calls.abort.length, 0, "a missing code must fail closed");
    assert.deepEqual(
      supabase.calls.stageWrites.map((w) => w.stage),
      ["failed_recoverable"],
      "it must follow the ambiguous path"
    );
  });

  await t.test("finalizing retry + weak_password never aborts, because the state is ambiguous", async () => {
    // Reaching the finalizing retry means an earlier attempt already issued an auth update whose
    // outcome is unknown, so the password may have changed. Unwinding here would let one reset
    // credential drive a second password change, so the token deliberately stays finalizing.
    for (const stage of ["failed_recoverable", "password_update_pending"]) {
      const supabase = buildSupabaseStub({
        tokenRow: finalizingToken(),
        operationRow: pendingOperation(stage),
        updateResult: () => ({ data: null, error: weakPasswordError() }),
      });
      const otp = buildOtpStub();
      const service = await buildService(supabase, otp);

      const response = await expectBadRequest(
        service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
      );

      assert.notEqual(response && response.code, "WEAK_PASSWORD", `stage ${stage}`);
      assert.equal(otp.calls.abort.length, 0, `stage ${stage}: the retry path must never abort`);
      assert.deepEqual(
        supabase.calls.stageWrites.map((w) => w.stage),
        ["failed_recoverable"],
        `stage ${stage}: the pre-existing recoverable-failure behaviour must be preserved`
      );
      // This path enters through the finalizing branch, so nothing is reserved or begun again.
      assert.equal(otp.calls.reserve.length, 0);
      assert.equal(otp.calls.begin.length, 0);
    }
  });

  await t.test("timeout never aborts and preserves failed_recoverable", async () => {
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({ data: null, error: timeoutError() }),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    await expectBadRequest(
      service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
    );

    assert.equal(otp.calls.abort.length, 0, "an ambiguous failure must never abort the finalization");
    assert.deepEqual(
      supabase.calls.stageWrites.map((w) => w.stage),
      ["failed_recoverable"],
      "the existing recoverable-failure behaviour must be preserved"
    );
  });

  await t.test("generic identity-provider error never aborts and records failed_recoverable", async () => {
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({ data: null, error: { message: "Internal Server Error", status: 500 } }),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    const response = await expectBadRequest(
      service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
    );

    assert.notEqual(response && response.code, "WEAK_PASSWORD");
    assert.equal(otp.calls.abort.length, 0);
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), ["failed_recoverable"]);
  });

  await t.test("a message that merely mentions weak passwords is not a rejection", async () => {
    // Classification is by stable code only. Message text is not a contract and is localisable, so
    // matching on it would abort finalizations after ambiguous failures.
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({
        data: null,
        error: { message: "upstream rejected weak_password validation service", status: 503 },
      }),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    await expectBadRequest(
      service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
    );

    assert.equal(otp.calls.abort.length, 0);
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), ["failed_recoverable"]);
  });

  await t.test("successful update never aborts and completes the saga", async () => {
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({ data: { user: { id: USER_ID } }, error: null }),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    const result = await service.completePasswordReset({
      actionToken: RAW_TOKEN,
      newPassword: NEW_PASSWORD,
    });

    assert.equal(result.success, true);
    assert.equal(otp.calls.abort.length, 0);
    assert.equal(otp.calls.consume.length, 1);
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), ["auth_updated", "completed"]);
  });

  await t.test("a failing abort still reports WEAK_PASSWORD", async () => {
    // If the abort RPC itself fails the token simply stays finalizing — the pre-task behaviour — so
    // the user still gets an actionable rejection rather than an opaque failure.
    const supabase = buildSupabaseStub({
      tokenRow: activeToken(),
      operationRow: pendingOperation(),
      updateResult: () => ({ data: null, error: weakPasswordError() }),
    });
    const otp = buildOtpStub({
      abortPasswordResetFinalization: async () => {
        throw new BadRequestException("abort failed");
      },
    });
    const service = await buildService(supabase, otp);

    const response = await expectBadRequest(
      service.completePasswordReset({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD })
    );

    assert.equal(response.code, "WEAK_PASSWORD");
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), []);
  });

  await t.test("lost-success reconciliation is unchanged by this task", async () => {
    // auth_updated means the password already changed: the retry must only consume the token, must
    // not call updateUserById again, and must never abort.
    const supabase = buildSupabaseStub({
      tokenRow: finalizingToken(),
      operationRow: pendingOperation("auth_updated"),
      updateResult: () => assert.fail("updateUserById must not run once the auth update is durable"),
    });
    const otp = buildOtpStub();
    const service = await buildService(supabase, otp);

    const result = await service.completePasswordReset({
      actionToken: RAW_TOKEN,
      newPassword: NEW_PASSWORD,
    });

    assert.equal(result.success, true);
    assert.equal(supabase.calls.updateUserById.length, 0);
    assert.equal(otp.calls.abort.length, 0);
    assert.deepEqual(otp.calls.consume, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_ID }]);
  });
});
