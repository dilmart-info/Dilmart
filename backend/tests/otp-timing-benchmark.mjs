/**
 * Timing-enumeration benchmark for the two anti-enumeration OTP endpoints.
 *
 * Not a test file on purpose — it is a measurement harness, so it is named without the
 * `.test.mjs` suffix and never runs in CI. Statistical timing assertions belong in
 * otp-timing.test.mjs, which asserts a loose property instead of a distribution.
 *
 *   node tests/otp-timing-benchmark.mjs [iterations]
 *
 * Nothing here touches the network, Meta, or a real database. Provider latency is
 * simulated by a stub so the numbers are reproducible on any machine.
 */
const { PasswordRecoveryService } = await import("../dist/modules/auth/password-recovery.service.js");
const { AccountClaimService } = await import("../dist/modules/auth/account-claim.service.js");

const ITERATIONS = Number(process.argv[2] || 200);

/** Both branches pay this, so it is not what an attacker measures. */
const DB_LATENCY_MS = 2;
/** Only the "account exists" branch pays this — the signal being measured. */
const PROVIDER_LATENCY_MS = 120;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function supabaseStub({ match }) {
  const row = match
    ? { user_id: "user-1", id: "user-1", customer_phone: "07501234567" }
    : null;
  return {
    client: {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              await sleep(DB_LATENCY_MS);
              return { data: row, error: null };
            },
          }),
        }),
      }),
    },
  };
}

function challengeStub() {
  return {
    assertDeliveryReady: () => {},
    issueRequestHandle: (id) => `handle-${id}`.padEnd(96, "x"),
    issueDecoyRequestHandle: () => "handle-decoy".padEnd(96, "x"),
    createChallenge: async () => {
      // Stands in for createChallenge + WhatsApp dispatch to Meta.
      await sleep(PROVIDER_LATENCY_MS);
      return { challenge_id: "11111111-2222-4333-8444-555555555555" };
    },
  };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = samples.reduce((sum, v) => sum + v, 0) / samples.length;
  const variance = samples.reduce((sum, v) => sum + (v - mean) ** 2, 0) / samples.length;
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: samples.length,
    median: at(0.5),
    p95: at(0.95),
    mean,
    stddev: Math.sqrt(variance),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

async function measure(run) {
  const samples = [];
  // Warm-up so JIT and module init do not land in the sample.
  for (let i = 0; i < 10; i += 1) await run();
  for (let i = 0; i < ITERATIONS; i += 1) {
    const started = process.hrtime.bigint();
    await run();
    samples.push(Number(process.hrtime.bigint() - started) / 1e6);
  }
  return stats(samples);
}

function fmt(label, s) {
  return (
    `${label.padEnd(26)} n=${String(s.n).padStart(4)}  ` +
    `median=${s.median.toFixed(2).padStart(8)}ms  ` +
    `p95=${s.p95.toFixed(2).padStart(8)}ms  ` +
    `mean=${s.mean.toFixed(2).padStart(8)}ms  ` +
    `sd=${s.stddev.toFixed(2).padStart(7)}ms`
  );
}

/**
 * The attacker's discriminator: how far apart the two medians are relative to the noise
 * in the faster branch. Under ~1 the branches are indistinguishable from a single sample;
 * in the hundreds a single request tells the attacker whether the account exists.
 */
function separation(existing, missing) {
  const noise = Math.max(missing.stddev, 0.01);
  return Math.abs(existing.median - missing.median) / noise;
}

async function benchmarkEndpoint(name, build) {
  const existing = await measure(build(true));
  const missing = await measure(build(false));
  console.log(`\n## ${name}`);
  console.log(fmt("account exists", existing));
  console.log(fmt("account missing", missing));
  const delta = existing.median - missing.median;
  console.log(
    `  median delta = ${delta.toFixed(2)}ms   separation = ${separation(existing, missing).toFixed(1)} sd   ` +
      `verdict: ${Math.abs(delta) > 25 ? "DISTINGUISHABLE" : "not practically distinguishable"}`,
  );
  return { existing, missing, delta };
}

console.log(`OTP timing benchmark — ${ITERATIONS} iterations per branch`);
console.log(`simulated db latency ${DB_LATENCY_MS}ms, simulated provider latency ${PROVIDER_LATENCY_MS}ms`);

await benchmarkEndpoint("POST /auth/password-reset/request", (match) => {
  const svc = new PasswordRecoveryService(supabaseStub({ match }), challengeStub());
  return () => svc.requestPasswordReset("07501234567");
});

await benchmarkEndpoint("POST /auth/account-claim/recover", (match) => {
  const svc = new AccountClaimService(supabaseStub({ match }), challengeStub());
  return () => svc.recoverClaimByOrder("ORD-1", "07501234567");
});

console.log("");
