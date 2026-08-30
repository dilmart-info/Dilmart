# Main Dark Launch — Durable OTP Idempotency and Verified Phone Linking — Closure Report

**Branch:** `main`
**Original main:** `a95df07b0fcdaa3921e659f1732d156f43f18aa4`
**Fast-forwarded to:** `f18ec5779c8814d343498e19acadd2995eded55d`
**Result:** Code complete on main. Not pushed, not deployed, no migration applied, no message sent.

---

## 1. What changed and why

Staging was cancelled, so the two things staging was going to catch have to be correct by
construction instead.

### Durable hook idempotency

The Send SMS hook deduped deliveries in a per-process `Map`. That survives nothing — a
restart, a deploy, a crash, or a second instance all lose it — and a Supabase retry landing
anywhere else sends a second real WhatsApp message to a real person. On a single free-tier
instance this was a matter of time, not probability.

`public.auth_hook_deliveries` replaces it, with one atomic claim as the only entry point.
Every decision about whether to send comes out of that claim, so two instances racing one
`webhook-id` cannot both dispatch.

The table is deliberately hostile to PII: no OTP, no phone, no raw body. Only a SHA-256
digest of the signed bytes, which is compared and never emitted.

### Verified phone linking

The production audit is the whole argument: **22 auth users, zero with a usable phone, 7
profiles carrying a phone nothing ever verified, 1 duplicate cluster covering 2 profiles.**

Those 7 numbers are claims — somebody typed them into a checkout form. Treating them as
proof would let one person's typo become another person's login. So: no backfill,
`phone_confirmed_at` is never written by hand, and `profiles.phone` never counts as
verification. A number becomes linked only when the user proves it, through Supabase, and
the backend then mirrors the result Supabase already established.

---

## 2. Durable table and RPC design

| Column | Purpose |
|---|---|
| `webhook_id` | primary key — the atomicity mechanism |
| `payload_digest` | SHA-256 of the signed bytes; compared, never emitted |
| `state` | `RECEIVED` / `IN_FLIGHT` / `SUCCEEDED` / `FAILED` / `UNCERTAIN` |
| `owner_instance` | which process holds the lease |
| `provider_message_id` | Meta's wamid on success |
| `attempt_count` | bounds retries after explicit refusals |
| `lease_expires_at` | while in the future, no other instance may take over |
| `expires_at` | when cleanup may delete a finished row |

`RECEIVED` is reserved and unused — the hook inserts straight to `IN_FLIGHT`, because a row
that exists but was never dispatched is indistinguishable from a crash.

**RPCs** (all `SECURITY DEFINER`, `search_path` pinned, execute revoked from
`public`/`anon`/`authenticated`, granted to `service_role` only):

- `claim_auth_hook_delivery` — returns `CLAIMED` / `SUCCEEDED` / `IN_FLIGHT` / `UNCERTAIN` / `CONFLICT` / `EXHAUSTED`
- `complete_auth_hook_delivery` — terminal success, lease holder only
- `fail_auth_hook_delivery` — explicit provider refusal, retryable
- `mark_auth_hook_delivery_uncertain` — ambiguous outcome, terminal
- `cleanup_expired_auth_hook_deliveries` — housekeeping

**Lockdown:** RLS enabled *and* forced, with **zero policies**. `anon` and `authenticated`
cannot read or write a row even by accident; `service_role` bypasses RLS, which is the only
intended path. Table grants revoked from all three roles.

---

## 3. Cross-instance behaviour

| Situation | Outcome |
|---|---|
| Two instances claim simultaneously | One `CLAIMED`, one `IN_FLIGHT`. Exactly one Meta call. |
| Live lease held elsewhere | Poll for up to 1.5s. `SUCCEEDED` → 200. Otherwise retryable 503. |
| Retry after a restart | `SUCCEEDED` → 200, no second message. |
| Superseded instance reports late | Rejected. It no longer owns the lease. |
| Same id, different digest | `CONFLICT` → 409. Nothing sent. |

The 1.5s poll sits far below Supabase's ~5s hook budget, so waiting can never itself cause
the abandon. When the other instance has not finished, the answer is a retryable 503 rather
than a fabricated 200 — only the lease holder knows whether the message went out, and
claiming otherwise would tell a user to wait for a code that may never arrive.

---

## 4. Crash and timeout semantics

This is the part where the safe choice and the convenient choice differ.

- **Explicit Meta refusal** (`CONFIG_ERROR`, `TEMPLATE_ERROR`, `PROVIDER_REJECTED`,
  `DELIVERY_FAILED`) → `FAILED`. Meta answered, so nothing was delivered, and a bounded
  retry (max 3 attempts) under the same id is safe.
- **Timeout or network fault** (`PROVIDER_TIMEOUT`) → `UNCERTAIN`. The request may well have
  arrived. **Terminal:** this id is never dispatched again.
- **Expired lease after a crash** → `UNCERTAIN`, not taken over.
- **Provider threw** → `UNCERTAIN`.

`UNCERTAIN` is terminal because a duplicate here costs a second real message to a real
handset. The user is told to request a new code, which arrives under a fresh `webhook-id`.
That is a worse user experience than a silent retry and a strictly better outcome than
double-sending.

---

## 5. Fail closed in production

`OTP_DURABLE_IDEMPOTENCY_REQUIRED=true` makes the ledger mandatory. In production it is
mandatory **regardless of the flag** — an explicit `false` is logged and ignored — because a
production deploy that forgets the variable must not silently run without a ledger. If the
migration is not applied or an RPC fails, the hook returns 503 and calls nobody. There is no
fallback to in-memory, which is the point: a degraded hook looks exactly like a working one
right up until it double-sends.

In-memory dedupe remains available outside production for local runs and the test suite.

**Rate limiting stays in memory deliberately.** It is a courtesy limit in front of Supabase's
own issuance limits; paying a database round trip per OTP to make it survive a restart buys
very little. Idempotency is the part where losing state costs a real message, so idempotency
is the part that became durable.

---

## 6. Phone linking flow

Route: `/profile/security/phone`, behind `RequireAuthenticatedUser` and the new
`VITE_AUTH_PHONE_LINKING_ENABLED` flag (**default off**).

1. **Enter the number** — normalized to E.164, then `POST /auth/phone-identity/check` asks
   whether it is free. Asked *before* sending, so a user does not burn a code on a number
   they can never have. The answer says nothing about who holds it — that would make it a
   lookup service for "does this person have an account".
2. **Supabase sends and verifies** — `updateUser({ phone })` then
   `verifyOtp({ type: "phone_change" })`. Type is `phone_change`, not `sms`: an `sms`
   verification would be a login attempt against a number the user has not yet proven.
3. **Mirror** — the UI re-reads the phone from the auth record via `getUser()` and only then
   calls `POST /auth/phone-identity/sync`.

The sync endpoint **takes no phone**. It reads the number from the caller's own access token
via `resolveUserFromAccessToken`, so the worst a forged request achieves is re-syncing the
number the caller already proved. It cannot make a phone verified; only Supabase can.

Writes are idempotent (`customer_phone_identities` is unique on `user_id`) and audited with a
masked number under `PHONE_IDENTITY_LINKED`. A `profiles.phone` update failure is logged but
does not fail the request — the verified identity row is the record of truth; the profile
column is a denormalized convenience.

Unverified rows never block anybody. Letting one of the seven unproven claims lock a real
owner out of their own number would be the worst possible reading of that data.

---

## 7. Duplicate cluster handling

Not resolved, and not resolvable here. Deciding which of two people owns a number needs
evidence that does not exist in this database.

`scripts/audit-phone-change-state.mjs` reports clusters. Counts are the default output; ids
plus a **masked** number (`0750****567`) require `ALLOW_PHONE_CLUSTER_DETAIL=true` on top of
`ALLOW_PHONE_IDENTITY_AUDIT=true`. The report states **MANUAL RESOLUTION REQUIRED** and that
phone cannot become a unique login identifier until it is settled.

---

## 8. phone_change audit and cleanup

The same script counts unfinished `auth.users.phone_change` values, how many are stale
(default > 24h), and whether two identities are mid-change on the same number. Counts only;
no values printed.

`scripts/cleanup-stale-phone-change.mjs` is gated behind `ALLOW_PHONE_CHANGE_CLEANUP=true`
and **was not run**.

**It performs no mutation, and that is deliberate.** Supabase exposes no admin API for
clearing a pending `phone_change`. The nearest candidate, `updateUserById({ phone: "" })`,
does something quite different — it erases the user's *confirmed* phone. Running that
against real accounts to tidy up an invisible field would destroy identity data. So the
script lists the affected ids and prints the exact reviewed SQL for an operator to run with
their eyes open. Automating a destructive operation to satisfy a checklist item would have
been the wrong call.

---

## 9. Migrations

| File | Status |
|---|---|
| `supabase/migrations/20260731150000_auth_hook_durable_idempotency.sql` | **NEW — NOT APPLIED ANYWHERE** |
| `supabase/migrations/preflight/20260731120000_..._PREFLIGHT.sql` | **NEW** — read-only preflight |
| `supabase/migrations/rollback/20260731120000_..._ROLLBACK.sql` | **NEW** — documented rollback |
| `supabase/migrations/20260731120000_handle_new_user_phone_only_signup.sql` | unchanged, **still not applied** |

The preflight captures the current `profiles.email` nullability, the trigger binding, the
**md5 of the existing function definition** (the rollback target), row counts, and a
zero-data-loss fingerprint to compare before and after.

The rollback is honest about being asymmetric: restoring `NOT NULL` is only possible if no
phone-only profile was created while the migration was live. Step 1 is a check that returns
the blocking count, and the script says **STOP** rather than deleting rows or inventing
emails. What to do with such accounts is a product decision, not a migration one.

---

## 10. Production readiness gate

`backend/scripts/check-otp-production-readiness.mjs` — read-only, and the mirror image of the
staging gate: it refuses anything that is **not** production, because a production-readiness
pass obtained elsewhere is worse than no pass.

Blocking: non-production `OTP_ENVIRONMENT`; a Supabase project, backend host or storefront
that is not the production one; `fake`/`test` provider; missing WhatsApp config; an
unsupported template type; missing or reused secrets; an out-of-budget hook timeout;
`OTP_DURABLE_IDEMPOTENCY_REQUIRED` not true; phone registration enabled; missing
`RENDER_BACKEND_ALWAYS_ON=CONFIRMED` or `RENDER_AUTO_DEPLOY_PAUSED=CONFIRMED`.

Warned, not blocked: `OTP_PROVIDER=whatsapp` (the channel is **armed**), and any enabled OTP
surface flag (no longer a dark launch). Both are legitimate at the moment of a controlled
test and must never happen by accident.

`RENDER_BACKEND_ALWAYS_ON` matters more than it looks: a sleeping free-tier service answers
the auth hook with a cold start that blows the five-second budget. The OTP then silently
never arrives, and nothing in the logs explains why.

With `SUPABASE_SERVICE_ROLE_KEY` present it additionally probes for `auth_hook_deliveries`
and `claim_auth_hook_delivery`. That probe is read-only and the only network activity in the
file; without credentials those checks downgrade to WARN rather than inventing a pass.

No URL, project ref, secret, token or phone id is ever printed. A PASS explicitly states it
is **not** authorization to send.

---

## 11. Tests

| Suite | Result |
|---|---|
| `test:auth-hook` (6 files, incl. 30 new durable tests) | 109 / 109 |
| `test:whatsapp-otp` | 49 / 49 |
| `test:otp-config-audit` | 8 / 8 |
| `test:launch-critical` | 26 / 26 |
| `test:phone-identity` (new) | 25 / 25 |
| `test:otp-staging-readiness` | 17 / 17 |
| `test:otp-production-readiness` (new) | 18 / 18 |
| **backend total** | **252 / 252** |
| frontend `test` | 22 files, 169 / 169 |
| `build`, `build:mobile` | PASS |
| `auth:guard`, `arch:guard` (0 violations), `mobile:boundary`, `native:assets:check` | PASS |
| `web:production-smoke` | PASS (`--port 4199`; 4173 held by an unrelated project) |
| `git diff --check` | clean |
| `npx cap sync android` + `gradlew assembleDebug` | BUILD SUCCESSFUL in 33s |

**APK:** `android/app/build/outputs/apk/debug/app-debug.apk` (13,023,102 bytes)

Coverage includes: atomic first claim; two racing instances; same id/digest; different
digest; live lease; expired lease → UNCERTAIN; UNCERTAIN never resends; bounded retry then
EXHAUSTED; timeout → UNCERTAIN; wamid → SUCCEEDED; no OTP/phone/body in the ledger; cleanup
behaviour; production fails closed without a store; login requirement; token/actor mismatch;
missing auth phone; number taken by another identity; uniqueness violation; idempotent
repeat syncs; no `phone_confirmed_at` written; no PII in logs or audit entries; cluster
grouping; masking; stale `phone_change` detection.

No network request was made to Meta, Supabase or Render. The only outbound traffic was npm
package resolution.

---

## 12. Known limitations

1. **The SQL is unverified.** No database was available, so the migration has never been
   executed. The tests exercise a fake that mirrors the state machine — they prove the
   decisions are right, not that Postgres locks correctly. `FOR UPDATE` behaviour under real
   concurrency is unproven until the migration is applied.
2. **`RECEIVED` is defined but unused.**
3. **Rate limiting remains in-memory** and resets on deploy. Deliberate; see §5.
4. **The production gate's marker list is a denylist** of three known identifiers.
5. **Whether the phone-only signup migration is applied cannot be determined** from the gate
   without SQL access; it warns rather than guessing.
6. `cleanup-stale-phone-change.mjs` **cannot mutate** — see §8.
7. **No delivery webhook**, so evidence levels 3–4 remain structurally unreachable. LEVEL 4
   needs a human reading the destination handset.
8. **The Batch 1.1 timing mitigation is still temporary**; the async outbox remains the end
   state.
9. **The duplicate cluster is unresolved** and blocks phone-as-login-identifier.
10. **Nothing here has been exercised against production.** Every check is structural.

---

## 13. Risks

- **Medium — the migration is unapplied and untested.** Everything in §3 and §4 depends on
  SQL that has never run. First application should be watched closely.
- **Low — `UNCERTAIN` is terminal.** A timeout costs the user a retry. Intended.
- **Low — the 1.5s cross-instance poll** adds latency inside the hook budget on a genuine
  race, which should be rare at one instance.
- **Low — phone linking sends real messages** when its flag is on. Default off.
- **None operationally:** no deploy, no configuration change, no migration, no message.

---

## 14. Rollback

Two independent commits, revertable separately.

- Reverting the phone-linking commit removes the route, the endpoints and the service. No
  data is written by it before a user completes a verification, and the flag is off.
- Reverting the durable-idempotency commit restores the in-memory cache. If the migration
  has been applied by then, the table simply goes unused; dropping it is optional and safe
  once nothing references it.

Neither revert needs a coordinated frontend change, and neither touches existing data.

---

## 15. Production untouched — confirmation

No deploy. No Render, Supabase, Netlify or Meta setting was read or written. No migration
applied anywhere. No production feature flag changed. Phone registration remains disabled.
Legacy password-reset endpoints remain in place. Account Claim architecture unchanged. No
real OTP was sent. No force push, no merge beyond the approved fast-forward, no PR.

---

## 16. Operator sequence for the production dark launch

Everything below needs credentials the execution agent does not have and should not be given.

**Phase 1 — Preflight, no changes**
1. Confirm `RENDER_BACKEND_ALWAYS_ON` (paid plan, no sleep) and pause auto-deploy.
2. Set on the backend service: `OTP_ENVIRONMENT=production`, `OTP_PROVIDER=disabled`, the
   four distinct secrets, and `OTP_DURABLE_IDEMPOTENCY_REQUIRED=true`.
3. Confirm every `VITE_AUTH_*_OTP_*` and `VITE_AUTH_PHONE_LINKING_ENABLED` flag is off.
4. Run `npm run otp:production-readiness`. It must PASS.

**Phase 2 — Migrations, in this order**
5. Run the preflight SQL. **Save the output**, especially the function md5.
6. Apply `20260731150000_auth_hook_durable_idempotency.sql`.
7. Re-run the readiness gate **with** `SUPABASE_SERVICE_ROLE_KEY` so the table and RPC probes
   actually run.
8. Apply `20260731120000_handle_new_user_phone_only_signup.sql`.
9. Re-run preflight query 5. The fingerprint must be **identical**.

**Phase 3 — Deploy dark**
10. Deploy main to the backend service. Provider is still `disabled`; nothing can send.
11. Verify password login, registration, Forgot Password and Account Claim still work. This
    is the regression gate — if anything here broke, stop and revert.
12. Confirm an unsigned POST to the hook path returns **401**. A 200 means signature
    verification is not running and everything after this is void.

**Phase 4 — Arm the channel**
13. Configure the Send SMS hook in Supabase; put its `whsec_…` secret on the backend.
14. Set `OTP_PROVIDER=whatsapp`. Re-run the readiness gate; expect the **ARMED** warning.
15. Confirm the Meta authentication template is **approved** — a pending template fails at
    send time and looks exactly like a code defect.

**Phase 5 — One controlled send**
16. All six conditions must hold at once: `ALLOW_REAL_WHATSAPP_OTP_TEST=true`; an
    `OTP_TEST_PHONE_E164` supplied **externally** (never from the database, an order or a
    profile); the handset owner's consent; explicit in-session supervisor authorization; a
    passing config audit; a passing readiness gate. A missing item is a stop, not a warning.
17. Enable `VITE_AUTH_PHONE_LINKING_ENABLED` for that test only.
18. Run the flow once. Read the code **from the handset**, never from a log. This is the only
    thing that reaches **LEVEL 4**.
19. Replay the same signed webhook. Exactly one message must arrive — this is what the
    durable ledger exists to prove.
20. Restart the backend, then replay again. Still exactly one message. This is the check the
    old in-memory cache could never pass.
21. Verify `auth_hook_deliveries` contains a digest and no phone, no OTP, no body.

**Phase 6 — Decide**
22. Turn the flags back off unless a broader rollout is authorized separately.
23. Record every step with its evidence level in the closure report.

A successful build proves nothing about delivery. An HTTP 200 from the hook proves nothing
about delivery. Delivery may not be claimed below **LEVEL 4**.
