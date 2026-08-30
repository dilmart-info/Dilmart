/**
 * Batch 1.1 — key separation, handle versioning and timing-enumeration resistance.
 *
 * Kept in its own file so the Batch 1 suite stays focused. Everything here is
 * deterministic or asserts a loose property: no distribution comparison runs in CI, so it
 * cannot go flaky on a loaded runner. The distribution evidence lives in
 * tests/otp-timing-benchmark.mjs, which is a measurement harness, not a test.
 */
import test from "node:test";
import assert from "node:assert/strict";

const { OtpChallengeService } = await import("../dist/modules/auth/otp-challenge.service.js");
const { PasswordRecoveryService } = await import("../dist/modules/auth/password-recovery.service.js");
const { AccountClaimService } = await import("../dist/modules/auth/account-claim.service.js");
const { issueChallengeHandle, issueDecoyHandle, resolveOtpRequestHandle } = await import(
  "../dist/modules/auth/otp-request-handle.util.js"
);
const { startConstantTimeBudget, CONSTANT_TIME_FLOOR_MS, CONSTANT_TIME_JITTER_MS } = await import(
  "../dist/modules/auth/otp-constant-time.util.js"
);

const HANDLE_SECRET = "batch11-handle-secret-value-32-bytes";
const CHALLENGE_ID = "11111111-2222-4333-8444-555555555555";

function withEnv(vars, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(vars)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

/** Neither collaborator is reached by the secret checks under test. */
function challengeService() {
  return new OtpChallengeService({ client: {} }, { assertProviderReady: () => {} });
}

const DISTINCT = {
  OTP_HMAC_SECRET: "hmac-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  OTP_TOKEN_SECRET: "token-key-bbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  OTP_REQUEST_HANDLE_SECRET: "handle-key-cccccccccccccccccccccccccc",
};

// ── Key separation ───────────────────────────────────────────────────────────

test("production requires OTP_REQUEST_HANDLE_SECRET", () => {
  withEnv({ NODE_ENV: "production", ...DISTINCT, OTP_REQUEST_HANDLE_SECRET: undefined }, () => {
    assert.throws(
      () => challengeService().assertDeliveryReady(),
      (err) => err.getResponse().code === "OTP_REQUEST_HANDLE_SECRET_MISSING",
    );
  });
});

test("production rejects a handle secret equal to the OTP digest secret", () => {
  withEnv(
    { NODE_ENV: "production", ...DISTINCT, OTP_REQUEST_HANDLE_SECRET: DISTINCT.OTP_HMAC_SECRET },
    () => {
      assert.throws(
        () => challengeService().assertDeliveryReady(),
        (err) => err.getResponse().code === "OTP_SECRETS_MUST_DIFFER",
      );
    },
  );
});

test("production rejects a handle secret equal to the action token secret", () => {
  withEnv(
    { NODE_ENV: "production", ...DISTINCT, OTP_REQUEST_HANDLE_SECRET: DISTINCT.OTP_TOKEN_SECRET },
    () => {
      assert.throws(
        () => challengeService().assertDeliveryReady(),
        (err) => err.getResponse().code === "OTP_SECRETS_MUST_DIFFER",
      );
    },
  );
});

test("production still rejects an HMAC secret equal to the action token secret", () => {
  withEnv(
    { NODE_ENV: "production", ...DISTINCT, OTP_TOKEN_SECRET: DISTINCT.OTP_HMAC_SECRET },
    () => {
      assert.throws(
        () => challengeService().assertDeliveryReady(),
        (err) => err.getResponse().code === "OTP_SECRETS_MUST_DIFFER",
      );
    },
  );
});

test("production accepts three pairwise-distinct secrets", () => {
  withEnv({ NODE_ENV: "production", ...DISTINCT }, () => {
    assert.doesNotThrow(() => challengeService().assertDeliveryReady());
  });
});

test("the local fallback handle secret works outside production only", () => {
  withEnv({ NODE_ENV: "development", OTP_REQUEST_HANDLE_SECRET: undefined }, () => {
    const service = challengeService();
    const handle = service.issueRequestHandle(CHALLENGE_ID);
    assert.equal(service.resolveChallengeReference(handle), CHALLENGE_ID);
  });

  withEnv({ NODE_ENV: "production", OTP_REQUEST_HANDLE_SECRET: undefined }, () => {
    assert.throws(
      () => challengeService().issueRequestHandle(CHALLENGE_ID),
      (err) => err.getResponse().code === "OTP_REQUEST_HANDLE_SECRET_MISSING",
    );
  });
});

test("no secret value ever reaches an error body", () => {
  withEnv({ NODE_ENV: "production", ...DISTINCT, OTP_REQUEST_HANDLE_SECRET: undefined }, () => {
    try {
      challengeService().assertDeliveryReady();
      assert.fail("expected the readiness check to fail");
    } catch (err) {
      const body = JSON.stringify(err.getResponse());
      assert.ok(!body.includes("hmac-key-"));
      assert.ok(!body.includes("token-key-"));
      assert.ok(!body.includes("handle-key-"));
    }
  });
});

// ── Handle version and rotation ──────────────────────────────────────────────

test("handles carry a constant version prefix that does not leak the kind", () => {
  const real = issueChallengeHandle(HANDLE_SECRET, CHALLENGE_ID);
  const decoy = issueDecoyHandle(HANDLE_SECRET);
  assert.ok(real.startsWith("v1."));
  assert.ok(decoy.startsWith("v1."));
  assert.equal(real.length, decoy.length);
});

test("an unknown or missing version is rejected", () => {
  const real = issueChallengeHandle(HANDLE_SECRET, CHALLENGE_ID);
  assert.equal(resolveOtpRequestHandle(HANDLE_SECRET, `v2.${real.slice(3)}`), null);
  assert.equal(resolveOtpRequestHandle(HANDLE_SECRET, real.slice(3)), null);
  assert.equal(resolveOtpRequestHandle(HANDLE_SECRET, `v1${real.slice(3)}`), null);
});

test("rotating the handle secret invalidates old handles and issues working new ones", () => {
  const oldSecret = "old-handle-secret-value-1111111111111";
  const newSecret = "new-handle-secret-value-2222222222222";

  const issuedBefore = issueChallengeHandle(oldSecret, CHALLENGE_ID);
  assert.equal(resolveOtpRequestHandle(newSecret, issuedBefore), null);

  const issuedAfter = issueChallengeHandle(newSecret, CHALLENGE_ID);
  assert.deepEqual(resolveOtpRequestHandle(newSecret, issuedAfter), {
    kind: "challenge",
    challengeId: CHALLENGE_ID,
  });
});

test("a handle keyed with the OTP digest secret does not resolve under the handle secret", () => {
  // Guards the separation itself: if the two keys were ever wired together again, this
  // handle would resolve and the test would fail.
  const crossKeyed = issueChallengeHandle(DISTINCT.OTP_HMAC_SECRET, CHALLENGE_ID);
  assert.equal(resolveOtpRequestHandle(DISTINCT.OTP_REQUEST_HANDLE_SECRET, crossKeyed), null);
});

// ── Constant-time budget, deterministic via injected clock ───────────────────

test("the budget pads out the remaining floor", async () => {
  let clock = 1000;
  const budget = startConstantTimeBudget({ floorMs: 300, jitterMs: 0, now: () => clock, randomFn: () => 0 });
  clock += 100;
  const started = Date.now();
  await budget.settle();
  const waited = Date.now() - started;
  assert.ok(waited >= 170, `expected roughly 200ms of padding, waited ${waited}ms`);
});

test("the budget does not pad a request that already exceeded the floor", async () => {
  let clock = 1000;
  const budget = startConstantTimeBudget({ floorMs: 300, jitterMs: 0, now: () => clock, randomFn: () => 0 });
  clock += 900;
  const started = Date.now();
  await budget.settle();
  assert.ok(Date.now() - started < 60, "an overrunning request must not be padded further");
});

test("jitter is bounded and additive on top of the floor", async () => {
  for (const [random, expectedFloor] of [
    [0, 300],
    [0.5, 360],
    [0.999, 419],
  ]) {
    let clock = 0;
    const budget = startConstantTimeBudget({ floorMs: 300, jitterMs: 120, now: () => clock, randomFn: () => random });
    // Advance the fake clock just past the expected target: no padding should remain.
    clock = expectedFloor + 5;
    const started = Date.now();
    await budget.settle();
    assert.ok(Date.now() - started < 60, `random=${random} padded past its own target`);
  }
  assert.equal(CONSTANT_TIME_FLOOR_MS, 400);
  assert.equal(CONSTANT_TIME_JITTER_MS, 120);
});

// ── Endpoint timing floor ────────────────────────────────────────────────────

function supabaseStub(match) {
  return {
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: match ? { user_id: "user-1", id: "user-1", customer_phone: "07501234567" } : null,
              error: null,
            }),
          }),
        }),
      }),
    },
  };
}

const challengeStub = {
  assertDeliveryReady: () => {},
  issueRequestHandle: (id) => `v1.${id}`,
  issueDecoyRequestHandle: () => "v1.decoy",
  createChallenge: async () => ({ challenge_id: CHALLENGE_ID }),
};

test("both anti-enumeration branches take at least the constant-time floor", async () => {
  const floor = CONSTANT_TIME_FLOOR_MS * 0.9; // margin for timer coarseness

  for (const match of [true, false]) {
    const started = Date.now();
    const res = await new PasswordRecoveryService(supabaseStub(match), challengeStub).requestPasswordReset(
      "07501234567",
    );
    assert.ok(Date.now() - started >= floor, `password reset match=${match} returned before the floor`);
    assert.ok(res.request_id);
  }

  for (const match of [true, false]) {
    const started = Date.now();
    const res = await new AccountClaimService(supabaseStub(match), challengeStub).recoverClaimByOrder(
      "ORD-1",
      "07501234567",
    );
    assert.ok(Date.now() - started >= floor, `claim recover match=${match} returned before the floor`);
    assert.ok(res.request_id);
  }
});

test("responses stay shape-identical across the two branches", async () => {
  const [hit, miss] = await Promise.all([
    new AccountClaimService(supabaseStub(true), challengeStub).recoverClaimByOrder("ORD-1", "07501234567"),
    new AccountClaimService(supabaseStub(false), challengeStub).recoverClaimByOrder("ORD-X", "07501234567"),
  ]);
  assert.deepEqual(Object.keys(hit).sort(), Object.keys(miss).sort());
  assert.equal(hit.message, miss.message);
  assert.ok(hit.request_id && miss.request_id);
});
