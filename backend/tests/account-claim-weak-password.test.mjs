/**
 * Account claim: weak-password error contract and post-merge retry safety.
 *
 * DilMart-STORE-WEAK-PASSWORD-UX-001 / 7B-3B2C
 *
 * Two properties are under test, and they pull in opposite directions.
 *
 *   1. A password Supabase rejected as weak maps to a structured `WEAK_PASSWORD` code so the Arabic
 *      UI never shows English policy prose.
 *   2. That rejection is DETERMINISTIC — Supabase validates before writing — so it proves the auth
 *      mutation did not happen. In the merge flow, where the merge itself is irreversible and already
 *      recorded at `account_merged`, the claim is therefore resumable and the reservation may be
 *      released so the user can retry immediately instead of waiting out a five-minute lease.
 *
 * The danger is property 2 leaking to failures that prove nothing. So the release is gated on the
 * stable `weak_password` code recorded at the failure site itself, never on the thrown exception's
 * payload, and the negative tests below hold that line: name-only, message-only and 5xx failures all
 * keep the conservative retain.
 *
 * The two-attempt test is the load-bearing one. Asserting that a release was called proves nothing
 * about resumability, so it drives a real saga row through both attempts and asserts the merge RPC
 * runs exactly once across them.
 *
 * The subtler case is a saga RESUMED at `account_merged`. This attempt can prove its own password was
 * not written; it cannot prove the previous attempt's was not. If that one died on a timeout after
 * Supabase accepted the password, the outcome is unknown and the claim may already be complete, so
 * the release is withheld — and stays withheld, because the "outcome proven unchanged" marker is only
 * written when the release was permitted.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { Test } = await import("@nestjs/testing");
const { BadRequestException } = await import("@nestjs/common");
const { AccountClaimService } = await import("../dist/modules/auth/account-claim.service.js");
const { OtpChallengeService } = await import("../dist/modules/auth/otp-challenge.service.js");
const { SupabaseAdminService } = await import("../dist/modules/supabase-admin/supabase-admin.service.js");

const TOKEN_ID = "11111111-1111-1111-1111-111111111111";
const RESERVATION_ID = "22222222-2222-2222-2222-222222222222";
const SOURCE_USER_ID = "33333333-3333-3333-3333-333333333333";
const TARGET_USER_ID = "44444444-4444-4444-4444-444444444444";
const PHONE = "07701234567"; // already in the normalized form normalizeIraqiPhone produces
const RAW_TOKEN = "a".repeat(64);
const NEW_PASSWORD = "Password_that_is_pwned_123!";

/**
 * The service-owned encoding of the saga's auth outcome, mirrored here on purpose.
 *
 * `last_error` carries raw SDK text as well, so these tests hold the line that a trusted marker and
 * arbitrary upstream strings never share a namespace: everything this service records is written
 * under one of these two prefixes, so upstream text can only ever appear after one.
 */
const PROVEN_UNCHANGED_PREFIX = "CLAIM_AUTH_OUTCOME:PROVEN_UNCHANGED_WEAK_PASSWORD|";
const UNPROVEN_FAILURE_PREFIX = "CLAIM_AUTH_OUTCOME:UNPROVEN_FAILURE|";

/** The shape @supabase/auth-js returns when it rejects the password before changing it. */
function weakPasswordError() {
  const err = new Error("Password is known to be weak and easy to guess, please choose a different one.");
  err.name = "AuthWeakPasswordError";
  err.code = "weak_password";
  err.status = 422;
  err.reasons = ["pwned"];
  return err;
}

/** Carries the SDK class name and a suggestive message, but NO code — must not be classified. */
function nameOnlyError() {
  const err = new Error("weak_password: password is known to be weak");
  err.name = "AuthWeakPasswordError";
  err.status = 422;
  return err;
}

/**
 * Supabase client stub covering only what completeClaim touches:
 *   profiles / customer_phone_identities reads, auth_action_operations read + upsert,
 *   the merge RPC, and auth.admin.updateUserById.
 */
/**
 * @param store shared across attempts on purpose: `saga` is the durable `auth_action_operations`
 *   row and `calls` accumulates, so "the merge ran exactly once" is answerable across two requests.
 */
function buildSupabaseStub({ hasPermanentAccount, updateResult, store }) {
  const state = store ?? { saga: null, calls: null };
  state.calls ??= { stageWrites: [], mergeRpc: [], updateUserById: [], profileUpdates: [], identityUpserts: [] };
  const calls = state.calls;

  const client = {
    from(table) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: SOURCE_USER_ID, phone: PHONE }, error: null }) }),
          }),
          update: (payload) => ({
            eq: async () => {
              calls.profileUpdates.push(payload);
              return { error: null };
            },
          }),
        };
      }
      if (table === "customer_phone_identities") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                neq: () => ({
                  maybeSingle: async () => ({
                    data: hasPermanentAccount ? { user_id: TARGET_USER_ID, is_verified: true } : null,
                    error: null,
                  }),
                }),
              }),
            }),
          }),
          upsert: async (payload) => {
            calls.identityUpserts.push({ user_id: payload.user_id, is_verified: payload.is_verified });
            return { error: null };
          },
        };
      }
      if (table === "auth_action_operations") {
        return {
          // Returns whatever the previous attempt persisted. Null on a first attempt, so the claim
          // starts at `reserved` exactly as it always did.
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.saga, error: null }) }) }),
          upsert: async (payload) => {
            calls.stageWrites.push({
              stage: payload.stage,
              lastError: payload.last_error,
              targetUserId: payload.target_user_id,
              reservationId: payload.reservation_id,
            });
            // onConflict: "token_id" — the row is replaced wholesale, which is exactly why a write
            // carrying a null target after the merge would destroy the resume point.
            state.saga = {
              token_id: payload.token_id,
              reservation_id: payload.reservation_id,
              operation_type: payload.operation_type,
              source_user_id: payload.source_user_id,
              target_user_id: payload.target_user_id,
              stage: payload.stage,
              last_error: payload.last_error,
            };
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table in stub: ${table}`);
    },
    rpc: async (name, args) => {
      calls.mergeRpc.push({ name, args });
      return { data: { merged: true }, error: null };
    },
    auth: {
      admin: {
        updateUserById: async (userId, attributes) => {
          calls.updateUserById.push({ userId, hasPassword: Boolean(attributes.password) });
          return updateResult();
        },
      },
    },
  };

  return { client, calls, state };
}

function buildOtpStub(reservationId = RESERVATION_ID) {
  const calls = { reserve: [], release: [], consume: [] };
  const stub = {
    reserveActionToken: async (rawToken, expectedPurpose) => {
      calls.reserve.push({ rawToken, expectedPurpose });
      return {
        tokenId: TOKEN_ID,
        reservationId,
        userId: SOURCE_USER_ID,
        verifiedPhone: PHONE,
        challengeId: "55555555-5555-5555-5555-555555555555",
        purpose: "claim_account",
      };
    },
    releaseActionTokenReservation: async (tokenId, reservationId) => {
      calls.release.push({ tokenId, reservationId });
    },
    consumeActionToken: async (tokenId, reservationId) => {
      calls.consume.push({ tokenId, reservationId });
    },
  };
  return { stub, calls };
}

async function buildService(supabaseStub, otpStub) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      AccountClaimService,
      { provide: SupabaseAdminService, useValue: { client: supabaseStub.client } },
      { provide: OtpChallengeService, useValue: otpStub.stub },
    ],
  }).compile();
  return moduleRef.get(AccountClaimService);
}

async function runClaim({ hasPermanentAccount, updateResult, store, reservationId }) {
  const supabase = buildSupabaseStub({ hasPermanentAccount, updateResult, store });
  const otp = buildOtpStub(reservationId);
  const service = await buildService(supabase, otp);

  let thrown = null;
  let result = null;
  try {
    result = await service.completeClaim({ actionToken: RAW_TOKEN, newPassword: NEW_PASSWORD });
  } catch (error) {
    thrown = error;
  }
  return { supabase, otp, thrown, result };
}

test("account claim weak-password contract", async (t) => {
  await t.test("merge flow: weak_password becomes a structured WEAK_PASSWORD error", async () => {
    const { thrown } = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
    });

    assert.ok(thrown instanceof BadRequestException, `expected BadRequestException, got ${thrown}`);
    const response = thrown.getResponse();
    assert.equal(response.code, "WEAK_PASSWORD");
    assert.ok(typeof response.message === "string" && response.message.length > 0);
    assert.ok(!/password/i.test(response.message), "the message must be Arabic, not English policy prose");
  });

  await t.test("merge flow: the merge is kept, the reservation is released, the target survives", async () => {
    const { supabase, otp, thrown } = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
    });

    assert.ok(thrown instanceof BadRequestException);
    assert.equal(supabase.calls.mergeRpc.length, 1);
    assert.equal(supabase.calls.mergeRpc[0].name, "merge_provisional_customer_account");
    assert.equal(otp.calls.consume.length, 0, "a failed claim must never consume the token");

    // The merge is NOT rolled back and the checkpoint stays at account_merged, so the next attempt
    // resumes rather than restarting.
    const stages = supabase.calls.stageWrites.map((w) => w.stage);
    assert.deepEqual(stages, ["reserved", "account_merged", "account_merged"]);
    assert.equal(supabase.state.saga.stage, "account_merged");

    // Released — the rejection proves the password was never written, so the claim is resumable.
    assert.deepEqual(otp.calls.release, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_ID }]);

    // The error recording must carry the merged target, not null. Losing it here would strand the
    // retry even though the reservation was released.
    assert.equal(supabase.calls.stageWrites.at(-1).targetUserId, TARGET_USER_ID);
    assert.equal(supabase.state.saga.target_user_id, TARGET_USER_ID);
    assert.ok(
      typeof supabase.calls.stageWrites.at(-1).lastError === "string",
      "last_error must remain a readable string, not a serialized object"
    );
  });

  await t.test("merge flow: the SAME token is immediately retryable and the merge never repeats", async () => {
    // One durable saga row, two separate requests, two different reservations — the shape of a user
    // correcting their password straight after the rejection.
    const store = { saga: null, calls: null };
    const RESERVATION_A = "22222222-2222-2222-2222-2222222222aa";
    const RESERVATION_B = "22222222-2222-2222-2222-2222222222bb";

    const first = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
      store,
      reservationId: RESERVATION_A,
    });

    assert.equal(first.thrown.getResponse().code, "WEAK_PASSWORD");
    assert.equal(store.calls.mergeRpc.length, 1, "attempt 1 performs the merge");
    assert.deepEqual(first.otp.calls.release, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_A }]);
    assert.equal(first.otp.calls.consume.length, 0);
    assert.equal(store.saga.stage, "account_merged");
    assert.equal(store.saga.target_user_id, TARGET_USER_ID);

    // Attempt 2: immediately, same raw token, corrected password, new reservation.
    const second = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: { user: { id: TARGET_USER_ID } }, error: null }),
      store,
      reservationId: RESERVATION_B,
    });

    assert.equal(second.thrown, null, `expected the retry to succeed, got ${second.thrown}`);
    assert.notEqual(RESERVATION_B, RESERVATION_A);
    assert.deepEqual(second.otp.calls.reserve, [{ rawToken: RAW_TOKEN, expectedPurpose: "claim_account" }]);

    // The single most important assertion in this file: the irreversible merge did not run again.
    assert.equal(store.calls.mergeRpc.length, 1, "the merge RPC must run exactly once across both attempts");

    // The retry resumed against the target the FIRST attempt selected, read from the saga rather
    // than rediscovered.
    const retryUpdate = store.calls.updateUserById.at(-1);
    assert.equal(retryUpdate.userId, TARGET_USER_ID);
    assert.equal(retryUpdate.hasPassword, true);

    // Consumed under the NEW reservation, and finished.
    assert.deepEqual(second.otp.calls.consume, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_B }]);
    assert.equal(second.otp.calls.release.length, 0);
    assert.equal(store.saga.stage, "completed");
    assert.equal(store.saga.target_user_id, TARGET_USER_ID);
    assert.equal(store.saga.reservation_id, RESERVATION_B);

    const result = second.result;
    assert.equal(result.success, true);
    assert.equal(result.merged, true);
    assert.equal(result.user_id, TARGET_USER_ID);
  });

  await t.test("upgrade flow: weak_password becomes a structured WEAK_PASSWORD error", async () => {
    const { thrown } = await runClaim({
      hasPermanentAccount: false,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
    });

    assert.ok(thrown instanceof BadRequestException, `expected BadRequestException, got ${thrown}`);
    assert.equal(thrown.getResponse().code, "WEAK_PASSWORD");
  });

  await t.test("upgrade flow: saga semantics are untouched", async () => {
    const { supabase, otp } = await runClaim({
      hasPermanentAccount: false,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
    });

    // Nothing irreversible ran, so the token is RELEASED — the pre-existing behaviour.
    assert.deepEqual(otp.calls.release, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_ID }]);
    assert.equal(otp.calls.consume.length, 0);
    assert.equal(supabase.calls.mergeRpc.length, 0, "the upgrade flow must not run the merge RPC");
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), ["reserved", "reserved"]);
  });

  await t.test("an error with the SDK name but no code is NOT classified", async () => {
    for (const hasPermanentAccount of [true, false]) {
      const { thrown } = await runClaim({
        hasPermanentAccount,
        updateResult: () => ({ data: null, error: nameOnlyError() }),
      });

      assert.ok(thrown instanceof BadRequestException);
      assert.equal(
        thrown.message,
        "فشل تحديث كلمة المرور للحساب",
        "an unproven rejection must keep the existing generic failure"
      );
      assert.equal(thrown.getResponse().code, undefined, "it must carry no structured weak-password code");
    }
  });

  /**
   * The security boundary. Each of these could plausibly be a weak password, and none of them PROVES
   * it — the request cannot tell whether Supabase wrote the password before failing. Releasing on a
   * guess would hand the same token back while the account might already carry the new password.
   */
  await t.test("post-merge, an unproven failure keeps the conservative retain", async () => {
    const ambiguous = [
      ["the SDK class name and a suggestive message, but no code", nameOnlyError],
      ["a message that is literally weak_password, with no code", () => Object.assign(new Error("weak_password"), { status: 422 })],
      ["a generic 5xx", () => ({ message: "Internal Server Error", status: 500 })],
      ["a transport failure", () => Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })],
      ["a timeout", () => Object.assign(new Error("timeout of 10000ms exceeded"), { code: "ETIMEDOUT" })],
    ];

    for (const [label, makeError] of ambiguous) {
      const { supabase, otp, thrown } = await runClaim({
        hasPermanentAccount: true,
        updateResult: () => ({ data: null, error: makeError() }),
      });

      assert.ok(thrown instanceof BadRequestException, label);
      assert.equal(thrown.getResponse().code, undefined, label + ": must not be classified as weak");
      assert.equal(otp.calls.release.length, 0, label + ": must NOT release a post-merge reservation");
      assert.equal(otp.calls.consume.length, 0, label + ": must not consume the token");
      // The merge stands — it is never rolled back — and the checkpoint stays recoverable.
      assert.equal(supabase.calls.mergeRpc.length, 1, label);
      assert.equal(supabase.state.saga.stage, "account_merged", label);
      assert.equal(supabase.state.saga.target_user_id, TARGET_USER_ID, label + ": target must survive");
    }
  });

  await t.test("a code carrying a different value never reaches the release path", async () => {
    // `code` is present but is not the weak-password code. Only the exact stable value counts.
    const { otp, thrown } = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({
        data: null,
        error: Object.assign(new Error("Password is known to be weak"), {
          name: "AuthWeakPasswordError",
          code: "weak_password_maybe",
          status: 422,
        }),
      }),
    });

    assert.ok(thrown instanceof BadRequestException);
    assert.equal(thrown.getResponse().code, undefined);
    assert.equal(otp.calls.release.length, 0);
  });

  await t.test("a generic identity-provider error keeps its existing behaviour", async () => {
    const { supabase, otp, thrown } = await runClaim({
      hasPermanentAccount: false,
      updateResult: () => ({ data: null, error: { message: "Internal Server Error", status: 500 } }),
    });

    assert.ok(thrown instanceof BadRequestException);
    assert.equal(thrown.message, "فشل تحديث كلمة المرور للحساب");
    assert.equal(thrown.getResponse().code, undefined);
    // Same release decision as the weak-password case for this flow — the mapping changed nothing.
    assert.deepEqual(otp.calls.release, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_ID }]);
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), ["reserved", "reserved"]);
  });

  await t.test("a successful upgrade claim is unaffected", async () => {
    const { supabase, otp, thrown, result } = await runClaim({
      hasPermanentAccount: false,
      updateResult: () => ({ data: { user: { id: SOURCE_USER_ID } }, error: null }),
    });

    assert.equal(thrown, null, `expected success, got ${thrown}`);
    assert.equal(otp.calls.release.length, 0);
    assert.deepEqual(otp.calls.consume, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_ID }]);
    assert.equal(supabase.calls.updateUserById.length, 1);
    assert.equal(supabase.calls.mergeRpc.length, 0);
    assert.equal(result.merged, false);
    assert.equal(result.user_id, SOURCE_USER_ID);
  });

  await t.test("a successful merge claim merges once, updates once, consumes once", async () => {
    const { supabase, otp, thrown, result } = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: { user: { id: TARGET_USER_ID } }, error: null }),
    });

    assert.equal(thrown, null, `expected success, got ${thrown}`);
    assert.equal(supabase.calls.mergeRpc.length, 1);
    assert.equal(supabase.calls.updateUserById.length, 1);
    assert.equal(supabase.calls.updateUserById[0].userId, TARGET_USER_ID);
    assert.deepEqual(otp.calls.consume, [{ tokenId: TOKEN_ID, reservationId: RESERVATION_ID }]);
    assert.equal(otp.calls.release.length, 0);
    assert.deepEqual(supabase.calls.stageWrites.map((w) => w.stage), [
      "reserved",
      "account_merged",
      "auth_updated",
      "completed",
    ]);
    // Every write after the merge carries the target — including the terminal one.
    for (const write of supabase.calls.stageWrites.slice(1)) {
      assert.equal(write.targetUserId, TARGET_USER_ID);
    }
    assert.equal(result.merged, true);
    assert.equal(result.user_id, TARGET_USER_ID);
  });

  await t.test("the upgrade flow still releases immediately and never merges", async () => {
    // Unchanged behaviour: nothing irreversible ran, so the same token is retryable as it always was.
    const store = { saga: null, calls: null };
    const first = await runClaim({
      hasPermanentAccount: false,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
      store,
      reservationId: "33333333-3333-3333-3333-3333333333aa",
    });
    assert.equal(first.thrown.getResponse().code, "WEAK_PASSWORD");
    assert.equal(first.otp.calls.release.length, 1);
    assert.equal(store.calls.mergeRpc.length, 0);
    assert.equal(store.saga.stage, "reserved");

    const second = await runClaim({
      hasPermanentAccount: false,
      updateResult: () => ({ data: { user: { id: SOURCE_USER_ID } }, error: null }),
      store,
      reservationId: "33333333-3333-3333-3333-3333333333bb",
    });
    assert.equal(second.thrown, null);
    assert.equal(store.calls.mergeRpc.length, 0, "the upgrade flow must never run the merge RPC");
    assert.equal(store.saga.stage, "completed");
  });

  /**
   * The reconciliation case. A previous attempt merged and then died without a verdict — a timeout
   * after Supabase may already have written the password. The saga is at `account_merged` with the
   * target intact, so a later attempt resumes correctly, but it inherits an UNKNOWN auth outcome.
   */
  await t.test("a resumed attempt with an unknown prior outcome does NOT release", async () => {
    const store = {
      saga: {
        token_id: TOKEN_ID,
        reservation_id: "22222222-2222-2222-2222-2222222222aa",
        operation_type: "claim_account",
        source_user_id: SOURCE_USER_ID,
        target_user_id: TARGET_USER_ID,
        stage: "account_merged",
        // The previous attempt timed out. It carries no proof that the password was left unchanged.
        last_error: "timeout of 10000ms exceeded",
      },
      calls: null,
    };

    // Sampled at the moment the password is attempted, which is AFTER the attempt has rewritten the
    // saga row with its own reservation id. The previous attempt's outcome must survive that write —
    // an upsert that dropped it would turn an unknown state into a clean-looking checkpoint.
    let lastErrorDuringAttempt;
    const { thrown, otp } = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => {
        lastErrorDuringAttempt = store.saga.last_error;
        return { data: null, error: weakPasswordError() };
      },
      store,
      reservationId: "22222222-2222-2222-2222-2222222222cc",
    });

    assert.equal(
      lastErrorDuringAttempt,
      "timeout of 10000ms exceeded",
      "refreshing the reservation must not erase what the previous attempt recorded"
    );
    assert.ok(
      !lastErrorDuringAttempt.startsWith(PROVEN_UNCHANGED_PREFIX),
      "a legacy unprefixed value must never read as proven"
    );

    // The user still gets the correct, localized rejection — only the release is withheld.
    assert.equal(thrown.getResponse().code, "WEAK_PASSWORD");
    assert.equal(
      otp.calls.release.length,
      0,
      "an unresolved earlier auth outcome must keep the conservative retain"
    );
    assert.equal(otp.calls.consume.length, 0);
    assert.equal(store.calls.mergeRpc.length, 0, "a resumed attempt must not merge again");
    assert.equal(store.saga.stage, "account_merged");
    assert.equal(store.saga.target_user_id, TARGET_USER_ID);
    // And the ambiguity is sticky: no proof marker was written, so the next attempt inherits it too.
    assert.ok(
      !store.saga.last_error.startsWith(PROVEN_UNCHANGED_PREFIX),
      "a withheld release must not record the outcome as proven"
    );
    assert.ok(
      store.saga.last_error.startsWith(UNPROVEN_FAILURE_PREFIX),
      "a withheld release must record the outcome in the unproven namespace"
    );
  });

  await t.test("the unknown prior outcome stays unknown across further attempts", async () => {
    const store = {
      saga: {
        token_id: TOKEN_ID,
        reservation_id: "22222222-2222-2222-2222-2222222222aa",
        operation_type: "claim_account",
        source_user_id: SOURCE_USER_ID,
        target_user_id: TARGET_USER_ID,
        stage: "account_merged",
        last_error: "socket hang up",
      },
      calls: null,
    };

    for (const reservationId of [
      "22222222-2222-2222-2222-2222222222c1",
      "22222222-2222-2222-2222-2222222222c2",
      "22222222-2222-2222-2222-2222222222c3",
    ]) {
      const { otp } = await runClaim({
        hasPermanentAccount: true,
        updateResult: () => ({ data: null, error: weakPasswordError() }),
        store,
        reservationId,
      });
      assert.equal(otp.calls.release.length, 0, "the ambiguity must not decay into a release");
    }
    assert.equal(store.calls.mergeRpc.length, 0);
  });

  /**
   * The namespace collision. Before both outcomes were prefixed, a single trusted marker shared
   * `last_error` with arbitrary upstream text, so an ambiguous error whose message merely STARTED
   * with that marker was read back as this service's own proof — a fail-open path into the release.
   */
  await t.test("upstream text cannot impersonate the proof marker", async () => {
    for (const hostileMessage of [
      "WEAK_PASSWORD_REJECTED: timeout after request",
      `${PROVEN_UNCHANGED_PREFIX}timeout after request`,
      `${PROVEN_UNCHANGED_PREFIX}Password is known to be weak`,
    ]) {
      // Attempt 1: an ambiguous failure — no `code` — whose message impersonates a proof.
      const store = { saga: null, calls: null };
      const first = await runClaim({
        hasPermanentAccount: true,
        updateResult: () => ({ data: null, error: { message: hostileMessage, status: 500 } }),
        store,
        reservationId: "22222222-2222-2222-2222-2222222222e1",
      });

      assert.equal(first.otp.calls.release.length, 0, hostileMessage);
      assert.ok(
        store.saga.last_error.startsWith(UNPROVEN_FAILURE_PREFIX),
        "an unproven failure must be recorded under the unproven prefix, whatever it says"
      );
      assert.ok(
        !store.saga.last_error.startsWith(PROVEN_UNCHANGED_PREFIX),
        "hostile upstream text must not be able to occupy the proof namespace"
      );

      // Attempt 2 resumes and IS a genuine weak-password rejection. Its own password was provably
      // not written — but attempt 1's outcome is still unknown, so the release stays withheld.
      const second = await runClaim({
        hasPermanentAccount: true,
        updateResult: () => ({ data: null, error: weakPasswordError() }),
        store,
        reservationId: "22222222-2222-2222-2222-2222222222e2",
      });

      assert.equal(second.thrown.getResponse().code, "WEAK_PASSWORD", hostileMessage);
      assert.equal(
        second.otp.calls.release.length,
        0,
        `a forged proof must not unlock the release: ${hostileMessage}`
      );
      assert.equal(second.otp.calls.consume.length, 0, hostileMessage);
      assert.equal(store.calls.mergeRpc.length, 1, "the merge must not repeat");
      assert.equal(store.saga.stage, "account_merged");
      assert.equal(store.saga.target_user_id, TARGET_USER_ID);
      assert.ok(!store.saga.last_error.startsWith(PROVEN_UNCHANGED_PREFIX), hostileMessage);
    }
  });

  await t.test("a legacy unprefixed last_error is treated as unknown, never as proven", async () => {
    // Rows written before this encoding existed carry neither prefix. Fail closed.
    const store = {
      saga: {
        token_id: TOKEN_ID,
        reservation_id: "22222222-2222-2222-2222-2222222222aa",
        operation_type: "claim_account",
        source_user_id: SOURCE_USER_ID,
        target_user_id: TARGET_USER_ID,
        stage: "account_merged",
        last_error: "Password is known to be weak and easy to guess, please choose a different one.",
      },
      calls: null,
    };

    const { thrown, otp } = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
      store,
      reservationId: "22222222-2222-2222-2222-2222222222f1",
    });

    assert.equal(thrown.getResponse().code, "WEAK_PASSWORD");
    assert.equal(otp.calls.release.length, 0, "an unrecognised legacy value must not read as proven");
    assert.equal(store.calls.mergeRpc.length, 0);
    assert.equal(store.saga.target_user_id, TARGET_USER_ID);
  });

  await t.test("a resumed attempt whose prior outcome IS proven releases again", async () => {
    // Two weak passwords in a row is the ordinary HIBP case, and it must not stall: the first
    // rejection was deterministic, so it recorded the outcome as proven unchanged.
    const store = { saga: null, calls: null };

    const first = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
      store,
      reservationId: "22222222-2222-2222-2222-2222222222d1",
    });
    assert.equal(first.otp.calls.release.length, 1);
    assert.ok(
      store.saga.last_error.startsWith(PROVEN_UNCHANGED_PREFIX),
      "a permitted release must record the outcome as proven unchanged"
    );

    const second = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: null, error: weakPasswordError() }),
      store,
      reservationId: "22222222-2222-2222-2222-2222222222d2",
    });
    assert.equal(second.thrown.getResponse().code, "WEAK_PASSWORD");
    assert.equal(
      second.otp.calls.release.length,
      1,
      "a second weak password on a resumed saga must still be immediately retryable"
    );
    assert.equal(store.calls.mergeRpc.length, 1, "still exactly one merge across all attempts");

    // And the third attempt, with a good password, completes.
    const third = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: { user: { id: TARGET_USER_ID } }, error: null }),
      store,
      reservationId: "22222222-2222-2222-2222-2222222222d3",
    });
    assert.equal(third.thrown, null);
    assert.equal(store.calls.mergeRpc.length, 1);
    assert.equal(store.saga.stage, "completed");
  });

  await t.test("error recording can never replace a known target_user_id with null", async () => {
    // The upsert replaces the row on token_id, so a null target in the error path is not a missing
    // field — it deletes the only record of which account the merge went into.
    const { supabase } = await runClaim({
      hasPermanentAccount: true,
      updateResult: () => ({ data: null, error: { message: "Internal Server Error", status: 500 } }),
    });

    const afterMerge = supabase.calls.stageWrites.slice(1);
    assert.ok(afterMerge.length >= 2, "expected the merge write and the error write");
    for (const write of afterMerge) {
      assert.equal(write.targetUserId, TARGET_USER_ID, "no post-merge write may carry a null target");
    }
    assert.equal(supabase.state.saga.target_user_id, TARGET_USER_ID);
  });
});
