# Unified OTP Auth — Batch 1.1: Security Hardening and Remote Safety Backup

Required security micro-patch on top of the approved Batch 1. Not Batch 2: no OTP login,
no OTP registration, no Supabase Send SMS Hook, no `/auth` redesign, no deploy, no
environment change, no real OTP sent.

Batch 1: [`DilMart_STORE_UNIFIED_OTP_AUTH_BATCH1_CLOSURE.md`](./DilMart_STORE_UNIFIED_OTP_AUTH_BATCH1_CLOSURE.md)

---

## 1. Identity

| Field     | Value                                                 |
| --------- | ----------------------------------------------------- |
| Branch    | `feat/unified-email-whatsapp-otp-auth`                |
| Base SHA  | `61347174f2535eb1d2a7cbc9b1ddba3dd638a84a`            |
| Final SHA | single commit on this branch                          |
| Approval  | Batch 1 — APPROVED WITH REQUIRED SECURITY MICRO-PATCH |

---

## 2. Key separation

**Problem.** Batch 1 derived the AES-256-GCM handle key from `OTP_HMAC_SECRET`, which
already keys OTP digests. `OTP_TOKEN_SECRET` keys action tokens. One secret serving two
cryptographic purposes means a leak of the digest key also lets an attacker forge request
handles.

**Fix.** A dedicated `OTP_REQUEST_HANDLE_SECRET`:

| Property               | Behaviour                                                              |
| ---------------------- | ---------------------------------------------------------------------- |
| Required in production | yes — missing throws `OTP_REQUEST_HANDLE_SECRET_MISSING`               |
| Production default     | none                                                                   |
| Local/test default     | one explicit fallback, unreachable when `NODE_ENV=production`          |
| Key derivation         | `sha256("otp-request-handle:v1:" + secret)` → 32 bytes for AES-256-GCM |
| Logged                 | never                                                                  |
| Returned in an error   | never — asserted by test                                               |
| Reaches the frontend   | never — backend-only                                                   |

`assertDistinctOtpSecrets()` now enforces **pairwise** distinctness across all three
secrets in production:

| Condition                                         | Error code                          |
| ------------------------------------------------- | ----------------------------------- |
| `OTP_HMAC_SECRET` or `OTP_TOKEN_SECRET` missing   | `OTP_SECRETS_MISSING`               |
| `OTP_REQUEST_HANDLE_SECRET` missing               | `OTP_REQUEST_HANDLE_SECRET_MISSING` |
| handle == hmac, handle == token, or hmac == token | `OTP_SECRETS_MUST_DIFFER`           |

`backend/.env.example` gained a commented placeholder only, with a note that it must
differ from the other two. **No value was committed.**

---

## 3. Handle format and version

```
v1.<base64url(iv[12] || tag[16] || ciphertext[37])>
```

The version prefix is **constant**, so it cannot be used to tell a real handle from a
decoy — both kinds still serialise to the same length. It exists so a future key rotation
can ship `v2` and reject `v1` deliberately rather than silently.

`resolveOtpRequestHandle` rejects a missing prefix, an unknown version, a tampered body,
a wrong key, and anything malformed — all as `null`, which callers must treat exactly like
a decoy.

Changing the key source already invalidates every handle issued by Batch 1. Since Batch 1
was never deployed, no live handle exists to break.

---

## 4. Timing enumeration — audit

Measured with `backend/tests/otp-timing-benchmark.mjs`, a harness deliberately named
without `.test.mjs` so it never runs in CI. 200 iterations per branch, simulated 2 ms
database latency on both branches and 120 ms provider latency on the "exists" branch only.
No network, no Meta, no real database, no message sent.

### Before

| Endpoint                 | branch          | median    | p95       | mean      | sd      |
| ------------------------ | --------------- | --------- | --------- | --------- | ------- |
| `password-reset/request` | account exists  | 139.86 ms | 142.34 ms | 139.75 ms | 1.92 ms |
| `password-reset/request` | account missing | 31.00 ms  | 32.10 ms  | 31.03 ms  | 0.70 ms |
| `account-claim/recover`  | order matches   | 139.91 ms | 142.35 ms | 139.87 ms | 1.58 ms |
| `account-claim/recover`  | no match        | 15.70 ms  | 16.11 ms  | 15.57 ms  | 0.46 ms |

| Endpoint                 | median delta  | separation   | verdict             |
| ------------------------ | ------------- | ------------ | ------------------- |
| `password-reset/request` | **108.86 ms** | **156.5 sd** | **DISTINGUISHABLE** |
| `account-claim/recover`  | **124.21 ms** | **268.9 sd** | **DISTINGUISHABLE** |

Separation is the median gap divided by the standard deviation of the faster branch. At
150–270 sd a **single request** revealed whether the account or order existed. The status
code, body shape, key set and handle length were all identical — the clock was the leak.

---

## 5. Timing enumeration — fix

### Why not an outbox

The correct fix is to stop doing the work inside the request. The repository was checked
first, as instructed:

| Looked for                     | Found                                                                                    |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Background jobs / cron         | **yes** — `@nestjs/schedule`, `ScheduleModule.forRoot()`, `modules/jobs/jobs.service.ts` |
| Job bookkeeping table          | **yes** — `operations_job_runs`                                                          |
| Outbox table                   | **no**                                                                                   |
| Sub-second dispatcher          | **no** — the tightest existing cron is every 10 seconds                                  |
| External queue (BullMQ, Redis) | **no**                                                                                   |
| Render worker service          | **no** — `render.yaml` declares no worker                                                |

A real outbox needs a new table with RLS, a dispatcher tight enough that a user is not
waiting 10 seconds for a code, and a semantic change to `verify`, because the challenge
may not exist yet when the code is submitted. That is a phase, not a micro-patch.

### What shipped instead

**TEMPORARY TIMING MITIGATION — NOT A SUBSTITUTE FOR ASYNC OUTBOX.**

`backend/src/modules/auth/otp-constant-time.util.ts` starts a budget at the very top of
each anti-enumeration handler and settles it just before returning:

- floor **400 ms**, above the slowest observed "exists" path
- uniform jitter **0–120 ms**, so the floor itself is not a fingerprint
- identical status, body shape, key set and handle length — unchanged from Batch 1
- a request that overruns the floor is **not** padded further, so a slow Meta response is
  never made slower
- `now` and `randomFn` are injectable, so the tests are deterministic

### After

| Endpoint                 | branch          | median    | p95       | mean      | sd       |
| ------------------------ | --------------- | --------- | --------- | --------- | -------- |
| `password-reset/request` | account exists  | 470.78 ms | 520.17 ms | 470.70 ms | 34.46 ms |
| `password-reset/request` | account missing | 467.59 ms | 524.97 ms | 467.37 ms | 35.11 ms |
| `account-claim/recover`  | order matches   | 466.83 ms | 517.29 ms | 464.30 ms | 33.41 ms |
| `account-claim/recover`  | no match        | 457.78 ms | 526.32 ms | 465.47 ms | 33.64 ms |

| Endpoint                 | median delta            | separation            | verdict                         |
| ------------------------ | ----------------------- | --------------------- | ------------------------------- |
| `password-reset/request` | 108.86 ms → **3.19 ms** | 156.5 sd → **0.1 sd** | not practically distinguishable |
| `account-claim/recover`  | 124.21 ms → **9.04 ms** | 268.9 sd → **0.3 sd** | not practically distinguishable |

### Stated limits

1. It costs every user ~400–520 ms of real latency on these two endpoints.
2. It holds only while the real work stays under the floor. A Meta response slower than
   400 ms pushes past it and re-opens the channel.
3. It does not remove the side channel — it raises the number of samples an attacker
   needs from one to a statistically impractical number **for this sample size**.
4. It does nothing for a network-level observer measuring Meta traffic directly.

**This must be replaced by the async outbox before the OTP surface is considered
launch-hardened.**

---

## 6. Production probe correction

The Batch 1 report claimed a `200` from `POST /auth/account-claim/recover` would confirm
the production WhatsApp channel. That was wrong and has been corrected in place, with an
evidence-level table added to both the Batch 1 closure and `CURRENT_PHASE.md`:

| Level | Claim                                  | Established by                           | Available today     |
| ----- | -------------------------------------- | ---------------------------------------- | ------------------- |
| 0     | Config shape valid                     | request returns 200 instead of 503       | **yes**             |
| 1     | Meta API called                        | backend dispatch log with correlation id | logs only           |
| 2     | Meta accepted, `wamid` returned        | `providerAcceptedMessageId` in the log   | logs only           |
| 3     | `sent` webhook received                | Meta delivery webhook                    | **not implemented** |
| 4     | `delivered` webhook received           | Meta delivery webhook                    | **not implemented** |
| 5     | User received it and the code verified | end-to-end smoke on an approved number   | **not performed**   |

A `503` is real evidence that readiness failed. A `200` proves **level 0 only** — on the
recover endpoint it is also returned when no order matched, in which case no send was even
attempted. **"Delivered" must not be used below level 4**, and nothing here can currently
reach level 3.

The Batch 1 report's statement that the handle key derives from `OTP_HMAC_SECRET` is now
annotated as superseded by this batch.

---

## 7. Files changed

**Backend**
| File | Change |
|---|---|
| `otp-request-handle.util.ts` | rekeyed to the dedicated secret; `v1.` version prefix; version-aware rejection |
| `otp-challenge.service.ts` | `getRequestHandleSecret()`; pairwise distinctness across three secrets |
| `otp-constant-time.util.ts` | **new** — temporary timing mitigation with injectable clock and jitter |
| `password-recovery.service.ts` | budget started before any work, settled before returning |
| `account-claim.service.ts` | same |
| `.env.example` | commented `OTP_REQUEST_HANDLE_SECRET` placeholder, no value |
| `package.json` | `test:whatsapp-otp` now runs both OTP test files |

**Tests**
| File | Change |
|---|---|
| `tests/otp-batch11-hardening.test.mjs` | **new** — 16 tests |
| `tests/otp-timing-benchmark.mjs` | **new** — measurement harness, excluded from CI by name |
| `tests/whatsapp-otp-delivery.test.mjs` | 3 tests realigned: the distinctness test now supplies the newly required handle secret so it still isolates the HMAC/token collision; the alphabet and readability assertions account for the version prefix; the tamper test now preserves the prefix so it proves tampering is caught rather than proving the prefix check fires |

**Frontend / tooling**
| File | Change |
|---|---|
| `scripts/auth/check-auth-lifecycle-boundary.mjs` | `stripComments` exported; `/\/\/.*$/` → `/\/\/[^\n]*$/` |
| `src/lib/auth/auth-guard-strip-comments.test.ts` | **new** — 4 tests pinning LF and CRLF equivalence |
| `.gitignore` | `.tmp-*` |

**Governance** — this report, Batch 1 closure corrections, `CURRENT_PHASE.md`, closure index.

Untouched: `src/pages/Auth.tsx`, auth storage implementation, all Supabase migrations and
RLS, checkout, orders, merchant, admin, app icon, splash, safe area, hero carousel,
Netlify config, `dist`. No dependency added, no secret committed.

### `auth:guard` fix

The guard flagged a comment quoting the forbidden pattern. After `split("\n")` a CRLF
checkout leaves `\r` at the end of every line, and in JavaScript `.` excludes `\r`, so
`/\/\/.*$/` never reached the `$` anchor and the comment survived stripping. It failed on
Windows and passed on CI's LF checkout. `[^\n]*` consumes the `\r` and anchors correctly.
Small, self-contained, and pinned by a test that runs the same source through both line
endings. **The auth storage implementation was not touched.**

---

## 8. Tests

| Suite                                               | Result                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `backend: npm run build`                            | ok                                                                                              |
| `backend: npm run test:whatsapp-otp`                | **49 pass / 0 fail** (33 + 16 new)                                                              |
| `backend: npm run test:launch-critical`             | **26 pass / 0 fail**                                                                            |
| `backend: tests/password-recovery-service.test.mjs` | **1 BLOCKED** — needs `SUPABASE_SERVICE_ROLE_KEY`; CI runs it after `supabase start`. Untouched |
| `npm test` (frontend)                               | **103 pass / 17 files** (was 99 / 16)                                                           |
| `npm run lint`                                      | 464 problems — identical to base, 0 new, 0 in changed files                                     |
| `npm run arch:guard`                                | PASS                                                                                            |
| `npm run auth:guard`                                | **PASS** — was 1 false violation                                                                |
| `npm run mobile:boundary`                           | PASS                                                                                            |
| `npm run native:assets:check`                       | PASS                                                                                            |
| `npm run build` / `build:mobile`                    | ok                                                                                              |
| `npm run web:production-smoke`                      | PASS — 3 routes, 0 exceptions                                                                   |
| `git diff --check`                                  | clean                                                                                           |

New test coverage: handle secret missing in production; handle secret equal to the HMAC
secret; equal to the token secret; HMAC equal to token; three distinct accepted; local
fallback works outside production and refuses inside it; no secret value in any error
body; constant version prefix that does not leak the kind; unknown and missing version
rejected; rotation invalidates old handles and issues working new ones; a handle keyed
with the OTP digest secret does **not** resolve under the handle secret (guards the
separation itself); budget pads the remaining floor; budget does not pad an overrun;
jitter bounded and additive; both branches take at least the floor; responses stay
shape-identical.

Timing tests assert loose properties with an injected clock. **No distribution comparison
runs in CI**, so nothing here can go flaky on a loaded runner — the distribution evidence
lives in the benchmark harness, run manually.

---

## 9. Not tested

- Real WhatsApp or email OTP — none requested, none sent. No approved test number.
- Production, staging, Render environment, Supabase dashboard, Meta console — no access.
- Android build and device smoke — no native file, Capacitor config or mobile entry graph
  changed; `mobile:boundary` passed.
- The mitigation was measured against a **simulated** 120 ms provider. Real Meta latency
  in Iraq is unmeasured; if p95 exceeds 400 ms the floor must be re-tuned.
- Concurrency behaviour under load — the floor holds a request handler open for ~470 ms,
  which raises concurrent-connection pressure. Not load-tested.

---

## 10. Remaining blockers before Batch 2

1. `OTP_PROVIDER` and the WhatsApp variables in Render production remain **unknown**.
2. Meta template name, language, type and approval status remain unverified.
3. No approved `OTP_TEST_PHONE_E164` and no permission to send.
4. Evidence levels 3–5 are unreachable until the delivery webhook exists.
5. The timing mitigation is temporary and must be replaced by an async outbox.
6. `OTP_REQUEST_HANDLE_SECRET` must be provisioned in Render before deploy, or every
   request to these two endpoints will return `OTP_REQUEST_HANDLE_SECRET_MISSING`.

## 11. Deployment order

Unchanged from Batch 1, with one addition: **set `OTP_REQUEST_HANDLE_SECRET` in Render
first**, distinct from the other two secrets. Then backend, then frontend. Rolling back is
still a plain `git revert` of the two commits together — no migration, no schema change,
no data written.
