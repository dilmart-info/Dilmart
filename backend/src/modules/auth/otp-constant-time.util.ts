/**
 * TEMPORARY TIMING MITIGATION — NOT A SUBSTITUTE FOR AN ASYNC OUTBOX.
 *
 * The two anti-enumeration endpoints return the same status, the same body shape and a
 * same-length opaque handle whether or not the account exists — but they did not take the
 * same *time*. The "exists" branch pays for challenge creation plus a Meta round trip; the
 * "missing" branch returns after one failed lookup. Measured locally with a 120ms provider
 * stub, the medians were 108-124ms apart at 150-270 standard deviations of the faster
 * branch, so a single request revealed whether an account existed.
 *
 * The correct fix is to stop doing the work inside the request: write an outbox row,
 * answer immediately, and let a dispatcher do the lookup and the send. This repository has
 * @nestjs/schedule and an operations_job_runs table, but no outbox table and no sub-second
 * dispatcher — the tightest existing cron is every 10 seconds, which is far too slow for an
 * OTP a user is waiting on. Introducing that is a schema change plus a semantic change to
 * verify (a challenge may not exist yet when the code is submitted), which is more than
 * this micro-patch is scoped to carry.
 *
 * Until then: pad every response to a fixed floor plus bounded jitter, so both branches
 * land in the same distribution. The floor is above the slowest observed "exists" branch,
 * and the jitter makes the residual difference statistically impractical to exploit rather
 * than merely small.
 *
 * Limits of this approach, stated plainly:
 *  - it costs the user real latency on every request
 *  - it only holds while the real work stays under FLOOR_MS; a slow Meta response still
 *    pushes past the floor and re-opens the channel
 *  - it does not remove the side channel, it raises the number of samples needed
 */

/** Floor for the whole request, chosen above the slowest observed "account exists" path. */
const FLOOR_MS = 400;

/** Uniform jitter on top of the floor, so the floor itself is not a fingerprint. */
const JITTER_MS = 120;

export interface ConstantTimeBudget {
  /** Sleeps for whatever is left of the floor plus this request's jitter. */
  settle(): Promise<void>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Starts the clock. Call at the very top of the handler, before validation, so that even
 * an early rejection inside the anti-enumeration surface takes the same time.
 *
 * `randomFn` and `now` are injectable so tests can pin them; production uses Math.random
 * and Date.now.
 */
export function startConstantTimeBudget(options?: {
  floorMs?: number;
  jitterMs?: number;
  now?: () => number;
  randomFn?: () => number;
}): ConstantTimeBudget {
  const floorMs = options?.floorMs ?? FLOOR_MS;
  const jitterMs = options?.jitterMs ?? JITTER_MS;
  const now = options?.now ?? (() => Date.now());
  const random = options?.randomFn ?? Math.random;

  const startedAt = now();
  const target = floorMs + random() * jitterMs;

  return {
    async settle() {
      const elapsed = now() - startedAt;
      const remaining = target - elapsed;
      if (remaining > 0) await sleep(remaining);
    },
  };
}

export const CONSTANT_TIME_FLOOR_MS = FLOOR_MS;
export const CONSTANT_TIME_JITTER_MS = JITTER_MS;
