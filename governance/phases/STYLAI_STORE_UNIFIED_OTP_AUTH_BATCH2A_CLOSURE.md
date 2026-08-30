# Unified Email & WhatsApp OTP Auth — Batch 2A Local Implementation

Code plus local verification only. **No deploy, no dashboard change, no real message.**
Highest evidence reachable in this batch is **LOCAL CODE VERIFIED** — no LEVEL is granted.

Previous: [`DilMart_STORE_UNIFIED_OTP_AUTH_BATCH12_CLOSURE.md`](./DilMart_STORE_UNIFIED_OTP_AUTH_BATCH12_CLOSURE.md)

---

## 1. Identity

| Field            | Value                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Branch           | `feat/unified-email-whatsapp-otp-auth`                                      |
| Base SHA         | `a1611755efb6fa62fece5ca90e97f4253bbd5a32` (frozen Batch 1.2)               |
| Final SHA        | `5a0fe27` (Batch 2A) · plus the 2A.1 reliability micro-patch on this branch |
| Evidence ceiling | **LOCAL CODE VERIFIED**                                                     |

> **Amended by Batch 2A.1 — Send SMS Hook Reliability Hardening.** Approved as
> "APPROVED WITH REQUIRED HOOK RELIABILITY MICRO-PATCH". See section 15.

---

## 2. Architecture

Supabase owns identity. The custom challenge system stays where it belongs.

| Concern                         | Owner                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------- |
| OTP generation                  | **Supabase Auth**                                                               |
| OTP delivery, email             | **Supabase**                                                                    |
| OTP delivery, phone             | **Supabase → Send SMS Hook → existing `WhatsAppOtpProvider` → Meta**            |
| OTP verification                | **Supabase Auth**                                                               |
| User creation                   | **Supabase**, gated by `shouldCreateUser`                                       |
| Session issuance and refresh    | **Supabase**, stored through the existing `authStorage`                         |
| Account Claim                   | **unchanged** — custom `auth_otp_challenges`, opaque handles, entirely separate |
| Legacy password-reset endpoints | **unchanged and retained**, deprecated in docs, no longer called by any UI      |

Nothing mints a session by hand. `verifyOtp` returns a real Supabase session, which flows
through the same `authStorage` the app already uses — secure native storage on Capacitor,
browser storage on web — so **no session-persistence code changed on either platform**.

---

## 3. Standard Webhooks implementation

Dependency added: **`standardwebhooks@1.0.0`**, pinned exact. No hand-rolled HMAC.

`SupabaseAuthHookService.verifySignature` calls `new Webhook(secret).verify(rawBody, {...})`
with `webhook-id`, `webhook-timestamp` and `webhook-signature`. A failure throws
`SUPABASE_AUTH_HOOK_SIGNATURE_INVALID`; the library's message can echo signature material,
so it is never logged.

The library validates the timestamp window but does not remember ids, and Supabase retries
legitimately, so a bounded cache keyed by `webhook-id` prevents a retry from producing a
second WhatsApp message.

> **Superseded by Batch 2A.1.** As shipped in 2A that cache rejected duplicates with
> `SUPABASE_AUTH_HOOK_REPLAYED` and was populated _inside_ signature verification, which
> also blocked legitimate retries after a provider failure. It is now an idempotency state
> machine that acknowledges a duplicate with 200 and forgets failures. See section 15.2.

### Raw-body strategy

`main.ts` created the app with `bodyParser: false` and then mounted a global
`bodyParser.json()` **without a `verify` callback**, so the original bytes were discarded.
A `verify` callback now stashes `req.rawBody` before parsing.

> **Narrowed by Batch 2A.1.** 2A captured the raw body for every JSON request; it is now
> captured only for the hook route. See section 15.4.

The hook verifies against that string only. If it is missing the request is **rejected**
with `SUPABASE_AUTH_HOOK_RAW_BODY_MISSING` — there is deliberately no
`JSON.stringify(req.body)` fallback, because re-serialising produces different bytes and
would silently accept forgeries. A test proves a re-serialised body with identical data
fails verification.

---

## 4. Auth action contracts

New exports in `src/lib/auth/auth-actions.ts`, surfaced through `AuthContext`/`AuthProvider`:

| Function                                               | Supabase call                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------- |
| `requestEmailOtp(email, { createUser, metadata })`     | `signInWithOtp({ email, options: { shouldCreateUser, data } })` |
| `verifyEmailOtp(email, token)`                         | `verifyOtp({ email, token, type: "email" })`                    |
| `requestPhoneOtp(phoneE164, { createUser, metadata })` | `signInWithOtp({ phone, options: { shouldCreateUser, data } })` |
| `verifyPhoneOtp(phoneE164, token)`                     | `verifyOtp({ phone, token, type: "sms" })`                      |
| `requestEmailPasswordRecovery(email)`                  | `resetPasswordForEmail(email)`                                  |
| `verifyEmailRecoveryOtp(email, token)`                 | `verifyOtp({ email, token, type: "recovery" })`                 |
| `updatePasswordInSession(password)`                    | `updateUser({ password })`, refuses without a session           |

**`channel` is never passed.** `channel: "whatsapp"` is Supabase's Twilio integration; this
project routes phone codes through the Send SMS Hook instead. A test asserts the phone
request payload contains no `channel` key and the string `whatsapp` appears nowhere in it.

Registration metadata (`full_name`) is attached **only** when registering, and only when
non-blank.

### `shouldCreateUser` matrix

| Surface                | Value                         | Enforced where              |
| ---------------------- | ----------------------------- | --------------------------- |
| Login, email           | `false`                       | inside the Supabase request |
| Login, phone           | `false`                       | inside the Supabase request |
| Register, email        | `true`                        | inside the Supabase request |
| Register, phone        | `true`                        | inside the Supabase request |
| Forgot password, email | n/a — `resetPasswordForEmail` | —                           |
| Forgot password, phone | **`false`**                   | inside the Supabase request |

Feature flags are UI gates only. Turning one on cannot create an account from a login
screen, because the value travels in the request itself.

---

## 5. Feature flags

| Flag                                   | Default   | Controls                               |
| -------------------------------------- | --------- | -------------------------------------- |
| `VITE_AUTH_EMAIL_OTP_ENABLED`          | **false** | email OTP login and registration       |
| `VITE_AUTH_PHONE_OTP_ENABLED`          | **false** | phone OTP login                        |
| `VITE_AUTH_PHONE_REGISTRATION_ENABLED` | **false** | phone OTP **registration**, separately |
| password login                         | always on | never gated                            |

Only `1`, `true`, `yes` or `on` (case-insensitive, trimmed) enable a flag. Anything
else — including `TRUEISH`, empty, or a missing variable — leaves it off. With all flags
off the page renders the password form, exactly as before this batch.

Phone registration is deliberately independent of phone login: enabling login must not
quietly enable registration while the duplicate-account question is open.

---

## 6. Forgot-password semantics

Two different mechanisms behind one screen, named precisely:

- **Email** uses a real Supabase **recovery token**: `resetPasswordForEmail` sends it,
  `verifyOtp` with `type: "recovery"` exchanges it for a session.
- **Phone** has no recovery token. It is a **phone OTP authenticated password reset** — an
  ordinary sign-in OTP with `shouldCreateUser: false`, then `updateUser` inside the session
  that login produced. Calling it a "Supabase recovery token flow" would be wrong, and the
  code says so.

Either way the password only changes inside a verified session.

**Legacy endpoints retained.** `/auth/password-reset/{request,verify,complete}`,
`PasswordRecoveryService` and `password-recovery.dto.ts` are untouched and still work.
They are marked deprecated and no UI calls them. A test mocks the legacy client methods
and asserts the new page never touches them. Removal is deferred to **Batch 2C**, after
staging E2E.

The `/auth` "نسيت كلمة المرور؟" link now goes to `/forgot-password`, not `/claim-account`.
The claim entry remains as its own separate link.

---

## 7. Profile creation — defect found and fixed locally

The existing `handle_new_user` trigger **would have blocked phone-only registration
outright**:

1. `profiles.email` is `TEXT NOT NULL`, but a phone-only `auth.users` row has
   `email = NULL`. The insert raises a not-null violation, which aborts the `auth.users`
   insert itself — **Supabase cannot create the user at all**.
2. Neither `phone` nor `full_name` was copied, so a phone-registered customer would be
   invisible to the claim and reset lookups.
3. The plain `INSERT` is not idempotent; a retried trigger raises a duplicate key error.

`supabase/migrations/20260731120000_handle_new_user_phone_only_signup.sql` drops the NOT
NULL, copies `phone` (normalised to the local `07…` form the rest of the system uses) and
`full_name` from metadata, and switches to `ON CONFLICT (id) DO UPDATE` with `COALESCE`
so existing values are never overwritten. Existing email users keep the exact row they
have today.

**NOT APPLIED TO PRODUCTION.** Local and staging verification only.

---

## 8. Phone identity audit tool

`backend/scripts/audit-phone-identities.mjs` — read only, counts only, never in CI.

Requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` **and** an explicit
`ALLOW_PHONE_IDENTITY_AUDIT=true`, all supplied externally. It prints no phone, email,
name or metadata — only: auth.users total, auth.users with phone, profiles with phone,
`customer_phone_identities` count, profiles-phone-without-matching-auth-phone, duplicate
normalised phones, identities linked to multiple users, provisional users affected, and a
derived duplicate-account risk verdict.

**Why it matters:** existing customers were created by email/password or as provisional
users. If `auth.users.phone` is empty for them, phone OTP login with
`shouldCreateUser: false` will **not find them**, and `true` would mint a **duplicate
account**. `VITE_AUTH_PHONE_REGISTRATION_ENABLED` stays off until this output is read.

---

## 9. Files changed

**Frontend**
| File | Change |
|---|---|
| `src/lib/auth/identifier.ts` | **new** — shared identifier normalisation |
| `src/lib/auth/auth-feature-flags.ts` | **new** — three flags, all default off |
| `src/lib/auth/auth-actions.ts` | 7 new Supabase OTP / recovery actions |
| `src/lib/auth/AuthContext.tsx` | contract extended |
| `src/lib/auth/AuthProvider.tsx` | actions surfaced |
| `src/components/auth/OtpCodeInput.tsx` | **new** — 6-box input, paste, arrows, a11y |
| `src/components/auth/useOtpFlow.ts` | **new** — steps, resend timer, single-flight, context refresh |
| `src/pages/Auth.tsx` | rebuilt: OTP primary, password secondary |
| `src/pages/ForgotPassword.tsx` | **new** |
| `src/app/CustomerRoutes.tsx` | `/forgot-password` route + path list |

**Backend**
| File | Change |
|---|---|
| `supabase-auth-hook.controller.ts` | **new** — `POST /api/auth/hooks/supabase/send-sms`, 204, own throttle |
| `supabase-auth-hook.service.ts` | **new** — signature, replay cache, payload validation, dispatch |
| `auth.module.ts` | controller and service registered |
| `main.ts` | raw-body capture |
| `.env.example` | `SUPABASE_AUTH_HOOK_SECRET` placeholder, no value |
| `scripts/audit-otp-config.mjs` | hook secret presence + distinctness |
| `scripts/audit-phone-identities.mjs` | **new** |
| `package.json` | `test:auth-hook` |

**Supabase** — one local migration (§7).

**Dependencies added:** `standardwebhooks@1.0.0` (backend, exact). Nothing else.

---

## 10. Tests

**Backend — 105 pass / 0 fail**

| Suite                   | Count                                    |
| ----------------------- | ---------------------------------------- |
| `test:whatsapp-otp`     | **49**                                   |
| `test:auth-hook`        | **22** (18 hook + 4 identifier contract) |
| `test:otp-config-audit` | **8**                                    |
| `test:launch-critical`  | **26**                                   |

**Frontend — 169 pass / 0 fail / 22 files** (was 103 / 17)

New: identifier (21), OTP auth actions (17), feature flags (5), `/auth` page (15),
forgot-password (8).

Notable coverage: `shouldCreateUser` false on login and true on registration; metadata only
when registering; **no `channel` on phone requests**; verification types `email` / `sms` /
`recovery`; wrong and expired codes; a failed request never claims a code was sent; paste,
resend countdown, change identifier, **duplicate submit suppressed**; auth-context refetch
before redirect; redirect to `from`; password login unchanged; forgot-password reaches
`/forgot-password` and **never calls the legacy API**; hook signature valid/missing/tampered
/wrong-secret/expired/replayed; **re-serialised body fails verification**; missing raw body
rejected; payload validation; provider success/failure/timeout; and logs containing no OTP,
no full phone, no secret, no raw body, no signature.

Timing-sensitive assertions use stubs and loose properties, so nothing added here can go
flaky in CI.

**Other checks**

| Check                                            | Result                                                                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `backend: npm run build`                         | ok                                                                                                                      |
| `npm run build`                                  | ok                                                                                                                      |
| `npm run build:mobile`                           | ok                                                                                                                      |
| `npm run auth:guard`                             | **PASS**                                                                                                                |
| `npm run arch:guard`                             | PASS                                                                                                                    |
| `npm run mobile:boundary`                        | PASS — forbidden modules: none                                                                                          |
| `npm run native:assets:check`                    | PASS                                                                                                                    |
| `npm run web:production-smoke`                   | PASS — 3 routes, **0 exceptions**                                                                                       |
| `npm run lint`                                   | **458 problems (446 errors)** — base was 464/452. **Zero new**; the `/auth` rewrite removed 6 pre-existing `any` errors |
| `npx cap sync android` + `gradlew assembleDebug` | **BUILD SUCCESSFUL**                                                                                                    |
| `git diff --check`                               | clean                                                                                                                   |

**APK:** `android/app/build/outputs/apk/debug/app-debug.apk` — 12,943,914 B (12.94 MB).

A successful build is not evidence that an OTP arrives anywhere.

---

## 11. What was not tested

- **Any real OTP.** No email and no WhatsApp message was requested or sent.
- **End-to-end anything.** Supabase phone auth is not enabled, the email template does not
  emit `{{ .Token }}`, and the hook is not registered — so no flow can complete against a
  real Supabase project yet. Every frontend test mocks the Supabase client.
- **The migration against a live database.** It has not been applied anywhere, including
  locally against a running Supabase stack.
- **The hook against real Supabase traffic.** Signatures in tests are produced by the same
  library that verifies them; a genuine Supabase-signed request has never been seen.
- **Android device smoke.** The APK builds; it was not installed or launched.
- **Phone identity reality.** The audit tool has never been run — no credentials.
- `tests/password-recovery-service.test.mjs` remains **environment-blocked** (needs
  `SUPABASE_SERVICE_ROLE_KEY`; CI runs it after `supabase start`).

---

## 12. Operator actions still required

**Supabase dashboard**

1. Enable the Phone auth provider.
2. Change the email OTP template to emit `{{ .Token }}` instead of a magic link.
3. Enable the Send SMS Hook (HTTP) → `https://<backend-host>/api/auth/hooks/supabase/send-sms`.
4. Generate the hook secret and hand it to Render.
5. Set OTP expiry and resend limits consistent with the 60s UI countdown.
6. Confirm SITE_URL and redirect URLs include `store.DilMart.org`.
7. Apply the profile trigger migration to staging first.

**Render** — provision, then verify with `npm run otp:config-audit` in the Render shell:
`OTP_PROVIDER=whatsapp`, `OTP_WHATSAPP_MODE`, `OTP_WHATSAPP_PHONE_NUMBER_ID`,
`OTP_WHATSAPP_ACCESS_TOKEN`, `OTP_WHATSAPP_TEMPLATE_NAME`, `_LANGUAGE`, `_TYPE`,
`OTP_WHATSAPP_API_VERSION`, `OTP_HMAC_SECRET`, `OTP_TOKEN_SECRET`,
`OTP_REQUEST_HANDLE_SECRET`, **`SUPABASE_AUTH_HOOK_SECRET`**. The OTP secrets must be
pairwise distinct and the hook secret distinct from all three.

**Meta** — confirm template category is Authentication, approval status, exact language
code, structure/button type matching `OTP_WHATSAPP_TEMPLATE_TYPE`, sending number and WABA
status, token permissions, messaging limit and quality rating.

**Netlify** — set the three `VITE_AUTH_*` flags. Leaving them unset keeps the password-only
UI, which is the safe default.

---

## 13. Deployment blockers

1. Supabase phone auth, token email template and Send SMS Hook are all disabled.
2. `SUPABASE_AUTH_HOOK_SECRET` does not exist yet.
3. Production `OTP_PROVIDER` and the WhatsApp variables remain unverified.
4. Meta template category, approval, language and type unverified.
5. **Phone identity alignment unmeasured** — duplicate-account risk; phone registration
   must stay off until the audit is read.
6. The profile trigger migration is unapplied; phone-only signup fails without it.
7. No delivery webhook, so evidence levels 3–4 remain unreachable.
8. The Batch 1.1 timing mitigation is still temporary; the async outbox is still the end
   state.

---

## 14. Rollback

`git revert` of this single commit. It is additive: no data written, no migration applied,
no external system touched. Reverting restores the previous `/auth`, removes the
`/forgot-password` route and the hook endpoint, and drops the `standardwebhooks`
dependency.

Because every flag defaults to **off**, deploying this commit without setting any
`VITE_AUTH_*` variable is itself a no-op for users: the auth page renders the password form
exactly as it does today. That is the intended safe landing.

Frontend and backend should still be reverted together, since the hook endpoint and the
`main.ts` raw-body change belong to the same change set.

---

## 15. Batch 2A.1 — hook reliability hardening

Supervisor-required micro-patch on top of `5a0fe27`. No deploy, no dashboard change, no
real message, no UI change, no flag change, no migration applied.

### 15.1 HTTP success contract

`POST /api/auth/hooks/supabase/send-sms` now answers **200 OK with an empty body**
(`@HttpCode(HttpStatus.OK)`), not 204. The handler returns `Promise<void>`, so no OTP, no
`providerAcceptedMessageId`, no phone and no JSON success payload can travel back out. A
test asserts the decorator, the absence of `NO_CONTENT`, and the `Promise<void>` return.

### 15.2 Idempotency state machine

The previous design added the `webhook-id` to a cache **inside signature verification** —
before payload validation, phone normalisation and dispatch. Any provider failure or
malformed payload therefore blocked a legitimate retry for ten minutes.

Two states now, keyed by `webhook-id`, and **no FAILED state**:

| Situation                           | Behaviour                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| First valid request                 | verify → validate → parse → normalise → create `IN_FLIGHT` holding one promise → dispatch → on success mark `SUCCEEDED` for the TTL → 200                         |
| Duplicate while `IN_FLIGHT`         | does not dispatch again; awaits the original promise and shares its outcome. If the original failed, both fail and the entry is gone, so a fresh retry is allowed |
| Duplicate after `SUCCEEDED`         | does not dispatch again; returns an empty 200. **Not a 401.** Logged as `idempotent replay acknowledged` with a correlation id, never the full webhook-id         |
| Provider failure, including timeout | entry **deleted**, error returned to Supabase, retry allowed immediately                                                                                          |
| Invalid signature                   | always rejected, **never enters the cache**                                                                                                                       |
| Invalid payload or unusable phone   | rejected, **nothing left in the cache**                                                                                                                           |

Renamed accordingly: this is a **delivery deduplication cache**, not a replay-attack
defence. A repeated signed request is normally Supabase retrying, which is legitimate;
signature verification is what rejects forgeries.

### 15.3 Hook timeout

Supabase abandons an HTTP auth hook at roughly five seconds, and a Meta call finishing
after that can only burn a template send on a code the user can no longer use.

New `SUPABASE_AUTH_HOOK_TIMEOUT_MS`, documented in `.env.example` as a placeholder:
default **4000**, allowed range **1000–4500**. Out of range fails readiness in production
with `SUPABASE_AUTH_HOOK_TIMEOUT_INVALID`; outside production it falls back to the default
and warns. The audit tool reports it and flags anything outside the range as
`INVALID FORMAT`.

`WhatsAppOtpProvider.sendOtp` gained an optional third argument
(`{ timeoutMs }`, typed as `WhatsAppSendOptions`). Only **narrowing** is honoured —
`Math.min` against the channel value — so a caller can never widen past
`OTP_WHATSAPP_TIMEOUT_MS`. Account Claim and the legacy reset paths pass nothing and keep
the channel default unchanged.

The abort is real: the existing `AbortController` now runs on the effective timeout, and a
test drives a never-settling fetch, asserts `signal.aborted` became true, asserts the call
returned a **failure** rather than a success, and asserts it ended near 1000 ms rather than
the 30000 ms channel default. `Promise.race` is not used anywhere.

### 15.4 Raw-body capture scope

Previously every JSON request kept a full second copy of its body. Product image uploads
run through the same parser at a 12 mb limit, so that doubled the memory cost of the
largest requests the service handles, for no benefit.

The `verify` callback now returns early unless the path equals
`SUPABASE_AUTH_HOOK_PATH` (`/api/auth/hooks/supabase/send-sms`, including the global `api`
prefix, because the parser runs before Nest strips it). `bodyParser.json` remains the
parser for every route, so `@Body()` is unaffected — no `express.raw`, nothing turns into a
Buffer. Tests assert the guard precedes the assignment, that the constant matches the
controller's `@Controller` + `@Post` route, and that a re-serialised body still fails
verification.

### 15.5 In-memory limitation — carried forward

**IN-MEMORY IDEMPOTENCY — NOT MULTI-INSTANCE SAFE.**

The cache is a `Map` in one process. It is lost on restart, on crash, on a new Render
instance, and it is not shared across replicas. Consequences: a Supabase retry that lands
on a different instance, or after a deploy, **will send a second WhatsApp message**.

Acceptable for local and staging. **Durable idempotency store or DB table is P0 before
production OTP enablement.** No migration was created for it here — the project has no
reusable store, and adding one is more than this micro-patch is scoped to carry.

### 15.6 Files changed

| File                                            | Change                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------- |
| `supabase-auth-hook.service.ts`                 | idempotency state machine, hook timeout resolution, cache prune/cap |
| `supabase-auth-hook.controller.ts`              | 204 → 200                                                           |
| `whatsapp-otp.provider.ts`                      | `WhatsAppSendOptions`, narrowing-only timeout override              |
| `main.ts`                                       | `SUPABASE_AUTH_HOOK_PATH`, raw-body capture scoped to it            |
| `.env.example`                                  | `SUPABASE_AUTH_HOOK_TIMEOUT_MS` placeholder                         |
| `scripts/audit-otp-config.mjs`                  | reports and range-checks the new variable                           |
| `tests/supabase-auth-hook-reliability.test.mjs` | **new** — 24 tests                                                  |
| `tests/supabase-auth-hook.test.mjs`             | replay test rewritten to idempotency semantics                      |
| `package.json`                                  | `test:auth-hook` includes the new file                              |

No dependency added. No UI, flag, Account Claim or migration change.

### 15.7 Tests

**Backend 129 pass / 0 fail** (was 105).

| Suite                   | Count                                                |
| ----------------------- | ---------------------------------------------------- |
| `test:auth-hook`        | **46** (18 + 24 reliability + 4 identifier contract) |
| `test:whatsapp-otp`     | 49                                                   |
| `test:otp-config-audit` | 8                                                    |
| `test:launch-critical`  | 26                                                   |

All seventeen mandated cases are covered: 200 empty; first request sends once; duplicate
after success sends zero extra; concurrent duplicate awaits the same promise; provider
failure removes the entry; retry after failure sends again; invalid payload does not poison
the cache; invalid signature never enters it; missing raw body never enters it; timeout
aborts the provider request; retry after timeout accepted; TTL prunes completed entries;
cap holds; no secret, OTP or full phone in logs; non-hook JSON retains no rawBody; hook raw
bytes stay exact; controller returns no body.

**Frontend regression 169 pass / 0 fail** — unchanged, as expected for a backend-only patch.

| Check                                                                   | Result                                           |
| ----------------------------------------------------------------------- | ------------------------------------------------ |
| `auth:guard` · `arch:guard` · `mobile:boundary` · `native:assets:check` | PASS                                             |
| `build` · `build:mobile` · backend build                                | ok                                               |
| `web:production-smoke`                                                  | PASS — 3 routes, 0 exceptions                    |
| `lint`                                                                  | 458 problems — unchanged from Batch 2A, zero new |
| `cap sync android` + `gradlew assembleDebug`                            | **BUILD SUCCESSFUL**                             |
| `git diff --check`                                                      | clean                                            |

**No real message was sent.** Every provider in every test is a stub or a never-settling
fake; no Meta credential is present in this environment.
