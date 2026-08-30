# Batch 2B.1 — Limiter Correctness and Staging Bootstrap Pack — Closure Report

**Scope:** Local code and documentation only.
**Branch:** `feat/native-auth-session-lifecycle`
**Result:** Local work complete. Blocked on staging environment creation, which is an
operator action, not a code action.

---

## 1. What was implemented

Batch 2B's local hardening passed with notes. Those notes are what this batch closes.

### §2 — Recipient identity is the phone, and only the phone

The limiter used to key on `userId + phone`. That was wrong in the direction that matters:
Supabase issues an OTP before a user row necessarily exists, and the same handset reached
through a different user id got a fresh allowance. The bucket is now the normalized E.164
number alone.

`userId` is still parsed for payload completeness. It never selects a bucket, is never
stored and is never logged.

Normalization happens before bucketing, so `07501234567`, `+9647501234567`,
`009647501234567` and `9647501234567` are one recipient, not four.

### §3 — The tracker has a real, enforced cap

`RECIPIENT_TRACKER_MAX = 10_000`. A new recipient that would exceed the cap is refused with
**503 `SUPABASE_AUTH_HOOK_RECIPIENT_CAPACITY_EXCEEDED`** — retryable, and it never reaches
Meta. An **existing** recipient always fits, because its bucket is already allocated; a full
tracker must not become a way to escape a rate limit you have already tripped.

Expired entries are pruned before capacity is judged, so a full-but-stale tracker recovers
on its own rather than refusing traffic for an hour.

The cap is an instance field, so tests drive the real refusal path with a small limit
instead of looping ten thousand times.

### §4 — Nothing mutates before every check has passed

The ordering in `handleSendSms` is now explicit and commented:

1. verify the signature
2. parse the payload
3. normalize the destination
4. idempotency lookup
5. quota decision — **read only**
6. reserve recipient-tracker capacity
7. reserve delivery-cache capacity
8. record the attempt
9. insert `IN_FLIGHT`
10. dispatch

Every non-mutating check runs first, then every reservation, and only then is anything
recorded. The consequences are tested: a rate-limited request evicts no completed delivery,
a delivery-capacity refusal consumes no recipient quota, and a recipient-capacity refusal
evicts no delivery entry.

### §5 — Key separation, decided

**Option A: derive, do not add a variable.** The limiter key comes from
`SUPABASE_AUTH_HOOK_SECRET` through a labelled HMAC:

```
derived = HMAC(hook_secret, "auth-hook-recipient-limit:v1")
bucket  = HMAC(derived, "recipient:" + normalized_e164)
```

The label domain-separates the limiter from signature verification, so a bucket key can
never be mistaken for or used as a signing secret. Bumping the `:v1` suffix rotates every
bucket deliberately.

Rejected option B (a new `OTP_RECIPIENT_LIMIT_SECRET`) because it adds a fifth secret for an
operator to generate, distribute and rotate — and a missing or accidentally shared one fails
silently, degrading the limiter without any visible symptom. The cost of option A is that
rotating the hook secret also resets every bucket. The buckets are in-memory and already
reset on deploy, so that cost is zero.

Documented in `backend/.env.example` and surfaced by `audit-otp-config.mjs`.

### §6 — Staging bootstrap checklist

`governance/phases/DilMart_STORE_OTP_STAGING_BOOTSTRAP_CHECKLIST.md` — ten operator sections
and a resource matrix. Every row is `NOT CREATED`. No real URL, no project ref, no secret,
no phone number appears in it. It is written for an operator to execute without the
execution agent, because the agent has no access to any of these systems and must not be
given production credentials to obtain it.

### §7 — Staging readiness gate

`backend/scripts/check-otp-staging-readiness.mjs` — read only, contacts nothing.

Refuses: `OTP_ENVIRONMENT` that is not `staging`, the production Supabase project ref, the
production storefront host, the production backend host, a non-WhatsApp provider, a
malformed Supabase URL, missing WhatsApp variables, a missing hook secret, a hook timeout
outside Supabase's ~5s abandon window, reused secrets, and phone registration being enabled.

Prints no values — not secrets, not tokens, not URLs. On pass it says explicitly that it is
**not** evidence that Supabase, Render or Meta work, and **not** authorization to send.

---

## 2. Files changed

| File                                                                   | Change                                                                                               |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `backend/src/modules/auth/supabase-auth-hook.service.ts`               | phone-only bucket, derived limiter key, four-part limiter, non-destructive ordering, injectable caps |
| `backend/scripts/check-otp-staging-readiness.mjs`                      | new — staging readiness gate                                                                         |
| `backend/tests/supabase-auth-hook-limiter.test.mjs`                    | new — 16 tests for §2/§3/§4                                                                          |
| `backend/tests/otp-staging-readiness.test.mjs`                         | new — 17 tests for §7                                                                                |
| `backend/tests/supabase-auth-hook-capacity.test.mjs`                   | two `recipientKey` call sites updated to the phone-only signature                                    |
| `backend/scripts/audit-otp-config.mjs`                                 | reports the derived limiter key                                                                      |
| `backend/.env.example`                                                 | `OTP_ENVIRONMENT`; key-separation rationale                                                          |
| `backend/package.json`                                                 | `otp:staging-readiness`, `test:otp-staging-readiness`; limiter suite added to `test:auth-hook`       |
| `governance/phases/DilMart_STORE_OTP_STAGING_BOOTSTRAP_CHECKLIST.md`   | new                                                                                                  |
| `governance/phases/DilMart_STORE_UNIFIED_OTP_AUTH_BATCH2B1_CLOSURE.md` | this report                                                                                          |

---

## 3. Tests

| Suite                                 | Result                                                               |
| ------------------------------------- | -------------------------------------------------------------------- |
| `backend: test:auth-hook` (5 files)   | 79 / 79                                                              |
| `backend: test:whatsapp-otp`          | 49 / 49                                                              |
| `backend: test:otp-config-audit`      | 8 / 8                                                                |
| `backend: test:otp-staging-readiness` | 17 / 17                                                              |
| `backend: test:launch-critical`       | 26 / 26                                                              |
| `frontend: test`                      | 22 files passed                                                      |
| `build`                               | PASS                                                                 |
| `build:mobile`                        | PASS                                                                 |
| `auth:guard`                          | PASS                                                                 |
| `arch:guard`                          | PASS — 0 violations                                                  |
| `mobile:boundary`                     | PASS — no hits                                                       |
| `native:assets:check`                 | PASS                                                                 |
| `web:production-smoke`                | PASS (`--port 4199`; 4173 is held by an unrelated project's preview) |
| `git diff --check`                    | clean                                                                |

One real failure was found and fixed on the way: the Batch 2B capacity suite still called
`recipientKey(userId, phone)`. Under the new one-argument signature it seeded a bucket that
no request could ever hit, so the hourly-ceiling assertion failed. That is the identity
change doing its job — the old call site was asserting against a key that no longer exists.

No network request was made to Meta, Supabase or Render. The only outbound traffic was npm
package resolution.

---

## 4. Edge cases handled

- Same handset, different user ids → one quota.
- Two handsets → fully independent.
- Four written forms of one number → one bucket.
- Tracker full + existing recipient → proceeds.
- Tracker full + new recipient → 503, no Meta call, size never grows past the cap.
- Tracker full of expired entries → pruned, request proceeds.
- Sustained new recipients → size stays at or under the cap on every iteration.
- Active recipient is never evicted to make room for a new one.
- Rate-limited request → delivery cache untouched.
- Delivery-capacity refusal → no quota consumed.
- Recipient-capacity refusal → no delivery entry evicted.
- Idempotent duplicate → no additional quota.
- Forged signature → tracker never touched, so an attacker cannot exhaust a victim's quota
  with unsigned requests.
- Provider failure → **counts** as an attempt (see §5 below).
- Phone, bucket key and OTP absent from all log output.

---

## 5. Decision: a provider failure counts as an attempt

A failed dispatch still consumed a real outbound call. Not counting it would let a caller
hammer one recipient for free whenever Meta happens to be failing — exactly when the system
is least able to absorb it. The alternative, refunding on failure, optimizes for a user who
retries after a genuine outage; that user waits at most a minute. Documented in
`recordRecipientAttempt` and pinned by test.

---

## 6. Known limitations

1. **Idempotency and limiter state are in-memory.** A restart or a second instance loses
   both. This is a **P0 before production**; the durable design is in the Batch 2B closure
   and is not built. Staging must run single-instance to keep the behaviour observable.
2. **The readiness gate checks shape, not reality.** It cannot tell whether Supabase, Render
   or Meta are actually configured. Only the staging sequence can.
3. **Its production-marker list is a denylist.** It catches the three known production
   identifiers. A fourth production resource would need adding.
4. **No staging environment exists.** Everything from §6 and §7 is unexercised against a
   real deployment.
5. `20260731120000_handle_new_user_phone_only_signup.sql` remains applied nowhere.
6. Meta template category, approval, language and type remain unverified.
7. Phone identity alignment remains unmeasured; phone registration stays off.
8. No delivery webhook, so evidence levels 3–4 stay structurally unreachable. LEVEL 4 is
   reachable only by a human reading the destination handset.
9. The Batch 1.1 timing mitigation is still temporary; the async outbox remains the end state.

---

## 7. Risks

- **Low:** the limiter is stricter than before. A user who legitimately triggers four OTPs to
  one handset inside a minute now waits. That is the intended behaviour.
- **Low:** the derived limiter key means rotating `SUPABASE_AUTH_HOOK_SECRET` clears every
  bucket. In-memory state already clears on deploy.
- **Medium (pre-existing):** without durable idempotency, a Supabase retry that lands after a
  restart sends a second message.
- **None introduced operationally:** no deploy, no configuration change, no migration.

---

## 8. Rollback

`git revert` of this single commit restores the Batch 2B limiter and removes the readiness
gate and checklist. Backend-only and additive; no data written, no migration applied, no
external system touched. A revert needs no coordinated frontend change.

---

## 9. Production untouched — confirmation

No deploy. No Render, Supabase, Netlify or Meta setting was read or written. No migration
applied anywhere. No production feature flag changed. Phone registration remains disabled.
Legacy password-reset endpoints remain in place. Account Claim architecture unchanged. No
real OTP was sent — the gate in the staging checklist §9 was never satisfied and was never
attempted. No force push, no merge, no PR.

---

## 10. What the supervisor must do next

The code side of OTP is done and blocked. Every remaining item needs credentials the
execution agent does not have and should not be given.

Follow `DilMart_STORE_OTP_STAGING_BOOTSTRAP_CHECKLIST.md` in order. §2–§8 create the
environment; §9 is the consent and authorization gate for a real send; §10 is the
verification sequence that produces LEVEL 4 evidence.

Until a message is observed on a consented handset, delivery has not been demonstrated —
regardless of how many tests pass here.
