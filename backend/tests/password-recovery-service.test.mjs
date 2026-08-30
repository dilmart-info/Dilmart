/**
 * Service-Level Password Recovery Integration Test
 *
 * Boots the real compiled PasswordRecoveryService using a minimal NestJS
 * Testing Module (not full AppModule). Connects to the local Supabase stack.
 * Verifies password changes via real Supabase Auth signInWithPassword.
 * RLS behavioral test is mandatory — no warning-and-skip branches.
 */
import test from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ── Compiled NestJS dist imports ──────────────────────────────────────────────
const { Test } = await import("@nestjs/testing");
const { BadRequestException } = await import("@nestjs/common");
const { PasswordRecoveryService } = await import(
  "../dist/modules/auth/password-recovery.service.js"
);
const { OtpChallengeService } = await import(
  "../dist/modules/auth/otp-challenge.service.js"
);
const { SupabaseAdminService } = await import(
  "../dist/modules/supabase-admin/supabase-admin.service.js"
);
const { AuthService } = await import(
  "../dist/modules/auth/auth.service.js"
);


// ── Connection constants ──────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
}
if (!ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY is required for mandatory RLS test");
}

const serviceSupabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── HMAC helpers (must match PasswordRecoveryService internals) ───────────────
const FINGERPRINT_SECRET =
  process.env.PASSWORD_RESET_FINGERPRINT_SECRET ||
  "default_reset_secret_key_fingerprint_32_bytes";

const TOKEN_SECRET =
  process.env.OTP_TOKEN_SECRET || "default_local_dev_token_secret_key_32";

function computeFingerprint(tokenId, password) {
  return crypto
    .createHmac("sha256", FINGERPRINT_SECRET)
    .update(`${tokenId}:${password}`)
    .digest("hex");
}

function computeTokenDigest(rawToken) {
  return crypto.createHmac("sha256", TOKEN_SECRET).update(rawToken).digest("hex");
}

// ── Test fixture builder ──────────────────────────────────────────────────────
async function createTestUserAndToken({ expiresInMs = 3600 * 1000 } = {}) {
  const suffix = crypto.randomBytes(4).toString("hex");
  const email = `pwreset-${suffix}@example.com`;
  const phone = `+9647700${Math.floor(10000000 + Math.random() * 90000000)}`;
  const initialPassword = "InitialPassword123!";

  const { data: authData, error: authErr } =
    await serviceSupabase.auth.admin.createUser({
      email,
      phone,
      password: initialPassword,
      email_confirm: true,
      phone_confirm: true,
    });
  if (authErr) throw authErr;
  const userId = authData.user.id;

  const challengeId = crypto.randomUUID();
  const { error: chalErr } = await serviceSupabase
    .from("auth_otp_challenges")
    .insert({
      id: challengeId,
      phone_normalized: phone,
      purpose: "password_reset",
      otp_digest: crypto.createHash("sha256").update("123456").digest("hex"),
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      status: "active",
    });
  if (chalErr) throw chalErr;

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenDigest = computeTokenDigest(rawToken);
  const tokenId = crypto.randomUUID();

  const { error: tokenErr } = await serviceSupabase
    .from("auth_action_tokens")
    .insert({
      id: tokenId,
      user_id: userId,
      token_digest: tokenDigest,
      purpose: "password_reset",
      phone_normalized: phone,
      challenge_id: challengeId,
      expires_at: new Date(Date.now() + expiresInMs).toISOString(),
      status: "active",
    });
  if (tokenErr) throw tokenErr;

  return { userId, email, phone, initialPassword, rawToken, tokenId };
}

// ── Minimal OtpChallengeService backed by real local Supabase ─────────────────
function buildRealOtpChallengeValue(consumeOverride) {
  const base = {
    beginPasswordResetFinalization: async (tokenId, reservationId, fingerprint) => {
      const { data, error } = await serviceSupabase.rpc(
        "begin_password_reset_finalization",
        {
          p_token_id: tokenId,
          p_reservation_id: reservationId,
          p_request_fingerprint: fingerprint,
        }
      );
      if (error || !data) {
        throw new BadRequestException(
          `begin_password_reset_finalization failed: ${error ? error.message : "no data"}`
        );
      }
    },
    reserveActionToken: async (rawToken, expectedPurpose) => {
      const digest = computeTokenDigest(rawToken);
      const { data: rows, error } = await serviceSupabase.rpc(
        "reserve_auth_action_token",
        {
          p_token_digest: digest,
          p_expected_purpose: expectedPurpose,
        }
      );
      if (error || !rows || rows.length === 0) {
        throw new BadRequestException(
          `reserveActionToken failed: ${error ? error.message : "no rows"}`
        );
      }
      const row = rows[0];
      return {
        tokenId: row.id,
        reservationId: row.reservation_id,
        userId: row.user_id,
        verifiedPhone: row.phone_normalized,
        challengeId: row.challenge_id,
        purpose: row.purpose,
      };
    },
    releaseActionTokenReservation: async (tokenId, reservationId) => {
      const { error } = await serviceSupabase.rpc(
        "release_auth_action_token_reservation",
        { p_token_id: tokenId, p_reservation_id: reservationId }
      );
      if (error) {
        throw new BadRequestException(
          `releaseActionTokenReservation failed: ${error.message}`
        );
      }
    },
    consumeActionToken: async (tokenId, reservationId) => {
      const { error } = await serviceSupabase.rpc("consume_auth_action_token", {
        p_token_id: tokenId,
        p_reservation_id: reservationId,
      });
      if (error) {
        throw new BadRequestException(
          `consumeActionToken failed: ${error.message}`
        );
      }
    },
  };

  if (consumeOverride) {
    base.consumeActionToken = consumeOverride;
  }

  return base;
}

// ── Module builder using actual class tokens ──────────────────────────────────
async function buildModule(consumeOverride) {
  const supabaseAdminValue = { client: serviceSupabase };
  const otpChallengeValue = buildRealOtpChallengeValue(consumeOverride);

  const moduleRef = await Test.createTestingModule({
    providers: [
      PasswordRecoveryService,
      {
        provide: SupabaseAdminService,
        useValue: supabaseAdminValue,
      },
      {
        provide: OtpChallengeService,
        useValue: otpChallengeValue,
      },
    ],
  }).compile();

  return moduleRef.get(PasswordRecoveryService);
}

// ── signInWithPassword verification ──────────────────────────────────────────
async function verifyPassword(email, password) {
  const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await anonClient.auth.signInWithPassword({ email, password });
  assert.equal(error, null, `Password verification failed: ${error ? error.message : ""}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Test Suite
// ══════════════════════════════════════════════════════════════════════════════
test(
  "PasswordRecoveryService — Service-Level Reconciliation Tests",
  async (t) => {

    // ── Case 1: finalizing + password_update_pending + expired token + same password → success
    await t.test(
      "finalizing + password_update_pending + expired token + same password → reconciliation succeeds",
      async () => {
        const { userId, email, rawToken, tokenId } =
          await createTestUserAndToken({ expiresInMs: 3600 * 1000 });

        const newPassword = "Reconcile_NewPw_123!";
        const fingerprint = computeFingerprint(tokenId, newPassword);
        const reservationId = crypto.randomUUID();

        // Manually set token to expired + finalizing state (simulate crash mid-saga)
        await serviceSupabase
          .from("auth_action_tokens")
          .update({
            status: "finalizing",
            reservation_id: reservationId,
            reserved_at: new Date().toISOString(),
            expires_at: new Date(Date.now() - 3600 * 1000).toISOString(),
          })
          .eq("id", tokenId);

        await serviceSupabase.from("auth_action_operations").insert({
          token_id: tokenId,
          reservation_id: reservationId,
          operation_type: "password_reset",
          source_user_id: userId,
          stage: "password_update_pending",
          request_fingerprint: fingerprint,
          updated_at: new Date().toISOString(),
        });

        const service = await buildModule();
        const result = await service.completePasswordReset({
          actionToken: rawToken,
          newPassword,
        });

        assert.ok(result.success, "Reconciliation must succeed");

        const { data: token } = await serviceSupabase
          .from("auth_action_tokens")
          .select("status")
          .eq("id", tokenId)
          .single();
        assert.equal(token.status, "consumed");

        await verifyPassword(email, newPassword);
        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 2: finalizing + different password → rejected
    await t.test(
      "finalizing + different password → rejected",
      async () => {
        const { userId, rawToken, tokenId } = await createTestUserAndToken();

        const originalPassword = "OriginalPw_111!";
        const fingerprint = computeFingerprint(tokenId, originalPassword);
        const reservationId = crypto.randomUUID();

        await serviceSupabase
          .from("auth_action_tokens")
          .update({
            status: "finalizing",
            reservation_id: reservationId,
            reserved_at: new Date().toISOString(),
          })
          .eq("id", tokenId);

        await serviceSupabase.from("auth_action_operations").insert({
          token_id: tokenId,
          reservation_id: reservationId,
          operation_type: "password_reset",
          source_user_id: userId,
          stage: "password_update_pending",
          request_fingerprint: fingerprint,
          updated_at: new Date().toISOString(),
        });

        const service = await buildModule();
        await assert.rejects(
          () =>
            service.completePasswordReset({
              actionToken: rawToken,
              newPassword: "DifferentPw_222!",
            }),
          (err) => {
            assert.ok(err instanceof BadRequestException);
            return true;
          }
        );

        const { data: token } = await serviceSupabase
          .from("auth_action_tokens")
          .select("status")
          .eq("id", tokenId)
          .single();
        assert.equal(token.status, "finalizing", "Token must remain finalizing");

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 3: consumed + completed + same password → idempotent success
    await t.test(
      "consumed + completed + same password → idempotent success",
      async () => {
        const { userId, rawToken, tokenId } = await createTestUserAndToken();

        const password = "ConsumedPw_789!";
        const fingerprint = computeFingerprint(tokenId, password);
        const reservationId = crypto.randomUUID();

        await serviceSupabase
          .from("auth_action_tokens")
          .update({
            status: "consumed",
            reservation_id: reservationId,
            consumed_at: new Date().toISOString(),
          })
          .eq("id", tokenId);

        await serviceSupabase.from("auth_action_operations").insert({
          token_id: tokenId,
          reservation_id: reservationId,
          operation_type: "password_reset",
          source_user_id: userId,
          stage: "completed",
          request_fingerprint: fingerprint,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });

        const service = await buildModule();
        const result = await service.completePasswordReset({
          actionToken: rawToken,
          newPassword: password,
        });
        assert.ok(result.success);

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 4: consumed + completed + different password → rejected
    await t.test(
      "consumed + completed + different password → rejected",
      async () => {
        const { userId, rawToken, tokenId } = await createTestUserAndToken();

        const original = "OrigPw_111!";
        const fingerprint = computeFingerprint(tokenId, original);
        const reservationId = crypto.randomUUID();

        await serviceSupabase
          .from("auth_action_tokens")
          .update({
            status: "consumed",
            reservation_id: reservationId,
            consumed_at: new Date().toISOString(),
          })
          .eq("id", tokenId);

        await serviceSupabase.from("auth_action_operations").insert({
          token_id: tokenId,
          reservation_id: reservationId,
          operation_type: "password_reset",
          source_user_id: userId,
          stage: "completed",
          request_fingerprint: fingerprint,
          updated_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
        });

        const service = await buildModule();
        await assert.rejects(
          () =>
            service.completePasswordReset({
              actionToken: rawToken,
              newPassword: "OtherPw_222!",
            }),
          (err) => {
            assert.ok(err instanceof BadRequestException);
            return true;
          }
        );

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 5: consumed + missing operation record → rejected
    await t.test(
      "consumed + missing operation record → rejected",
      async () => {
        const { userId, rawToken, tokenId } = await createTestUserAndToken();

        await serviceSupabase
          .from("auth_action_tokens")
          .update({
            status: "consumed",
            consumed_at: new Date().toISOString(),
          })
          .eq("id", tokenId);

        const service = await buildModule();
        await assert.rejects(
          () =>
            service.completePasswordReset({
              actionToken: rawToken,
              newPassword: "AnyPw_123!",
            }),
          (err) => {
            assert.ok(err instanceof BadRequestException);
            return true;
          }
        );

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 6: Auth update succeeds + Consume fails once → retry succeeds
    await t.test(
      "Auth update succeeds + Consume fails once → retry consumes without re-applying password",
      async () => {
        const { userId, email, rawToken, tokenId } =
          await createTestUserAndToken();
        const newPassword = "FaultInject_Pw_123!";

        // Fault injection: fail consumeActionToken exactly once
        let failOnce = true;
        const faultingConsume = async (tid, rid) => {
          if (failOnce) {
            failOnce = false;
            throw new BadRequestException("SIMULATED_CONSUME_FAILURE");
          }
          const { error } = await serviceSupabase.rpc(
            "consume_auth_action_token",
            { p_token_id: tid, p_reservation_id: rid }
          );
          if (error) {
            throw new BadRequestException(
              `consumeActionToken failed: ${error.message}`
            );
          }
        };

        const service1 = await buildModule(faultingConsume);

        // First call: auth update succeeds, consume throws
        let firstError = null;
        try {
          await service1.completePasswordReset({
            actionToken: rawToken,
            newPassword,
          });
        } catch (err) {
          firstError = err;
        }
        assert.ok(firstError !== null, "First call must fail due to injected consume failure");

        // Token remains finalizing
        const { data: midToken } = await serviceSupabase
          .from("auth_action_tokens")
          .select("status")
          .eq("id", tokenId)
          .single();
        assert.equal(midToken.status, "finalizing");

        // Stage is auth_updated (password update succeeded before consume failed)
        const { data: op } = await serviceSupabase
          .from("auth_action_operations")
          .select("stage, operation_type, reservation_id")
          .eq("token_id", tokenId)
          .single();
        assert.equal(op.stage, "auth_updated");
        assert.equal(op.operation_type, "password_reset");

        // Second call: reconciliation consumes without reapplying password
        const service2 = await buildModule(); // no fault injection
        const result = await service2.completePasswordReset({
          actionToken: rawToken,
          newPassword,
        });
        assert.ok(result.success);

        const { data: finalToken } = await serviceSupabase
          .from("auth_action_tokens")
          .select("status")
          .eq("id", tokenId)
          .single();
        assert.equal(finalToken.status, "consumed");

        // Verify password was actually changed
        await verifyPassword(email, newPassword);

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 7: Ambiguous post-commit failure ───────────────────────────────
    // Consume RPC executes and commits, but the network/process dies before
    // the caller receives the response. The next retry must succeed via the
    // consumed idempotency path.
    await t.test(
      "Auth update succeeds + Consume commits + response lost → retry finds consumed+token_consumed and succeeds",
      async () => {
        const { userId, email, rawToken, tokenId } =
          await createTestUserAndToken();
        const newPassword = "AmbiguousCommit_Pw_123!";

        // Ambiguous consume: RPC commits then throws to simulate lost response
        let throwAfterCommitOnce = true;
        const ambiguousConsume = async (tid, rid) => {
          const { error } = await serviceSupabase.rpc(
            "consume_auth_action_token",
            { p_token_id: tid, p_reservation_id: rid }
          );
          if (error) {
            throw new BadRequestException(
              `consumeActionToken failed: ${error.message}`
            );
          }
          if (throwAfterCommitOnce) {
            throwAfterCommitOnce = false;
            throw new BadRequestException(
              "SIMULATED_RESPONSE_LOST_AFTER_COMMIT"
            );
          }
        };

        const service1 = await buildModule(ambiguousConsume);

        // First call: password updated, token consumed, caller receives simulated failure
        let firstError = null;
        try {
          await service1.completePasswordReset({
            actionToken: rawToken,
            newPassword,
          });
        } catch (err) {
          firstError = err;
        }
        assert.ok(firstError !== null, "First call must throw SIMULATED_RESPONSE_LOST_AFTER_COMMIT");

        // Token must be consumed (RPC committed before the throw)
        const { data: tok } = await serviceSupabase
          .from("auth_action_tokens")
          .select("status")
          .eq("id", tokenId)
          .single();
        assert.equal(tok.status, "consumed", "Token must be consumed after ambiguous commit");

        // Operation must be at token_consumed (atomic consume sets this)
        const { data: op } = await serviceSupabase
          .from("auth_action_operations")
          .select("stage")
          .eq("token_id", tokenId)
          .single();
        assert.equal(op.stage, "token_consumed", "Operation must be at token_consumed after ambiguous commit");

        // Second call with same password: consumed idempotency path returns success
        const service2 = await buildModule();
        const result = await service2.completePasswordReset({
          actionToken: rawToken,
          newPassword,
        });
        assert.ok(result.success, "Retry must succeed via consumed idempotency path");

        // Second call with different password: rejected
        const service3 = await buildModule();
        await assert.rejects(
          () =>
            service3.completePasswordReset({
              actionToken: rawToken,
              newPassword: "DifferentPassword_After_Commit!",
            }),
          (err) => {
            assert.ok(err instanceof BadRequestException);
            return true;
          },
          "Different password after commit must be rejected"
        );

        // Verify actual password
        await verifyPassword(email, newPassword);

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 8: consumed + token_consumed + same password → idempotent success
    await t.test(
      "consumed + token_consumed + same password → idempotent success",
      async () => {
        const { userId, rawToken, tokenId } = await createTestUserAndToken();

        const password = "TokenConsumed_SamePw_123!";
        const fingerprint = computeFingerprint(tokenId, password);
        const reservationId = crypto.randomUUID();

        // Simulate state left by atomic consume (completed write was lost)
        await serviceSupabase
          .from("auth_action_tokens")
          .update({
            status: "consumed",
            reservation_id: reservationId,
            consumed_at: new Date().toISOString(),
          })
          .eq("id", tokenId);

        await serviceSupabase.from("auth_action_operations").insert({
          token_id: tokenId,
          reservation_id: reservationId,
          operation_type: "password_reset",
          source_user_id: userId,
          stage: "token_consumed",
          request_fingerprint: fingerprint,
          updated_at: new Date().toISOString(),
        });

        const service = await buildModule();
        const result = await service.completePasswordReset({
          actionToken: rawToken,
          newPassword: password,
        });
        assert.ok(result.success, "consumed+token_consumed with same password must succeed");

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );

    // ── Case 9: consumed + token_consumed + different password → rejected
    await t.test(
      "consumed + token_consumed + different password → rejected",
      async () => {
        const { userId, rawToken, tokenId } = await createTestUserAndToken();

        const originalPassword = "TokenConsumed_OrigPw_111!";
        const fingerprint = computeFingerprint(tokenId, originalPassword);
        const reservationId = crypto.randomUUID();

        await serviceSupabase
          .from("auth_action_tokens")
          .update({
            status: "consumed",
            reservation_id: reservationId,
            consumed_at: new Date().toISOString(),
          })
          .eq("id", tokenId);

        await serviceSupabase.from("auth_action_operations").insert({
          token_id: tokenId,
          reservation_id: reservationId,
          operation_type: "password_reset",
          source_user_id: userId,
          stage: "token_consumed",
          request_fingerprint: fingerprint,
          updated_at: new Date().toISOString(),
        });

        const service = await buildModule();
        await assert.rejects(
          () =>
            service.completePasswordReset({
              actionToken: rawToken,
              newPassword: "DifferentPw_222!",
            }),
          (err) => {
            assert.ok(err instanceof BadRequestException);
            return true;
          },
          "consumed+token_consumed with different password must be rejected"
        );

        await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
      }
    );
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// Mandatory RLS Behavioral Test: authenticated INSERT on user_notifications
// ══════════════════════════════════════════════════════════════════════════════
test(
  "Notification RLS: authenticated user INSERT into user_notifications is rejected",
  async (t) => {
    const email = `rls-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const password = "RlsTestPassword123!";

    const { data: authData, error: createErr } =
      await serviceSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    assert.equal(createErr, null, `User creation failed: ${createErr ? createErr.message : ""}`);
    const userId = authData.user.id;

    await t.test(
      "authenticated client INSERT is rejected by RLS",
      async () => {
        // Sign in with the anon client — mandatory, no skip
        const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: signInData, error: signInErr } =
          await anonClient.auth.signInWithPassword({ email, password });

        assert.equal(signInErr, null, signInErr ? signInErr.message : "");
        assert.ok(
          signInData.session && signInData.session.access_token,
          "Authenticated access token is required"
        );

        const accessToken = signInData.session.access_token;
        const authedClient = createClient(SUPABASE_URL, ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        });

        const fakeEventKey = `refund-complete:preclaimed-${crypto.randomUUID()}`;
        const { error: insertErr } = await authedClient
          .from("user_notifications")
          .insert({
            user_id: userId,
            title: "Fake notification",
            message: "Fake",
            source_event_key: fakeEventKey,
          });

        assert.ok(
          insertErr !== null,
          "INSERT must be rejected by RLS — no authenticated INSERT policy must exist on user_notifications"
        );

        // Confirm row is absent via service role
        const { data: row } = await serviceSupabase
          .from("user_notifications")
          .select("id")
          .eq("source_event_key", fakeEventKey)
          .maybeSingle();

        assert.equal(row, null, "Notification row must not exist after rejected INSERT");
      }
    );

    await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
  }
);

// ══════════════════════════════════════════════════════════════════════════════
// AuthService & account_type Hotfix Integration Tests
// ══════════════════════════════════════════════════════════════════════════════
test("AuthService — profiles.account_type Hotfix Integration Tests", async (t) => {
  const supabaseAdminValue = { client: serviceSupabase };
  
  const moduleRef = await Test.createTestingModule({
    providers: [
      AuthService,
      {
        provide: SupabaseAdminService,
        useValue: supabaseAdminValue,
      },
    ],
  }).compile();

  const authService = moduleRef.get(AuthService);

  // 1. Existing admin profile with account_type NULL resolves activeRole=admin
  await t.test("Existing admin profile with account_type NULL resolves activeRole=admin", async () => {
    const email = `admin-${crypto.randomBytes(4).toString("hex")}@example.com`;
    const password = "AdminPassword123!";

    const { data: authData, error: authErr } = await serviceSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.equal(authErr, null, authErr ? authErr.message : "");
    const userId = authData.user.id;

    // Explicitly update the profile role to 'admin' and account_type to NULL
    const { error: profileErr } = await serviceSupabase
      .from("profiles")
      .update({ role: "admin", account_type: null })
      .eq("id", userId);
    assert.equal(profileErr, null, profileErr ? profileErr.message : "");

    // Call getContext
    const ctx = await authService.getContext({
      actorId: userId,
      actorEmail: email,
    });

    assert.equal(ctx.activeRole, "admin", "Role must resolve to admin");
    assert.equal(ctx.account_type, null, "account_type must be null");
    assert.equal(ctx.profile?.role, "admin", "profile role must be admin");

    // Clean up admin user
    await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
  });

  // 2. Provisional account creation persists profiles.account_type = provisional_customer
  // 3. Provisional context returns claim_required=true when phone is unverified
  await t.test("Provisional user creation and unverified context", async () => {
    const rawPhone = "+9647701" + Math.floor(1000000 + Math.random() * 9000000);

    const provUser = await authService.createProvisionalUser({
      customer_phone: rawPhone,
    });

    assert.ok(provUser.email, "Provisional email should be returned");
    assert.ok(provUser.password, "Provisional password should be returned");

    // Retrieve the profile from DB
    const { data: searchData, error: searchErr } = await serviceSupabase
      .from("profiles")
      .select("id, account_type, role")
      .eq("email", provUser.email)
      .maybeSingle();

    assert.equal(searchErr, null, searchErr ? searchErr.message : "");
    assert.ok(searchData, "Provisional profile should exist in DB");
    assert.equal(searchData.account_type, "provisional_customer", "Profiles.account_type must be provisional_customer");

    const userId = searchData.id;

    // Retrieve context for this provisional user
    const ctx = await authService.getContext({
      actorId: userId,
      actorEmail: provUser.email,
    });

    assert.equal(ctx.account_type, "provisional_customer", "account_type must be provisional_customer");
    assert.equal(ctx.claim_required, true, "claim_required must be true when phone is unverified");

    // Clean up provisional user
    await serviceSupabase.auth.admin.deleteUser(userId).catch(() => {});
  });
});

