# Unified Email & WhatsApp OTP Authentication — Batch 1: OTP Contract Repair

Audit-driven repair of the three root causes that are provable from code and independent
of production configuration. The Supabase-owned OTP architecture (Email/Phone OTP login
and registration, Send SMS Hook, `/forgot-password`, delivery webhook) is **Batch 2** and
was deliberately not started.

Full audit: [`DilMart_STORE_UNIFIED_OTP_AUTH_AUDIT.md`](./DilMart_STORE_UNIFIED_OTP_AUTH_AUDIT.md)

---

## 1. Identity

| Field      | Value                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Phase      | Unified Email & WhatsApp OTP Authentication — Batch 1                                                                        |
| Branch     | `feat/unified-email-whatsapp-otp-auth`                                                                                       |
| Base SHA   | `3f69a7ad1641ced2876a8ea7b199c67fa62ce554`                                                                                   |
| Final SHA  | single commit on this branch                                                                                                 |
| Sequencing | Supervisor chose "contract repairs first, then OTP"; password reset to migrate wholesale to Supabase recovery OTP in Batch 2 |

No `checkout main`, `pull`, `reset`, `clean`, `stash` or `rebase`. The native icon, native
splash, mobile safe area, RTL hero carousel and web bundle fix are all ancestors and were
re-verified after the change.

---

## 2. Root causes addressed

| #   | Root cause                                                                                                      | Status                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | No OTP login/registration exists anywhere                                                                       | **Batch 2** — architecture agreed, not started                                                               |
| 2   | API contract lost `challenge_id`, so password reset and unauthenticated claim recovery could never be completed | **fixed**                                                                                                    |
| 3   | Provider and configuration failures swallowed, making a disabled channel look like success                      | **fixed**                                                                                                    |
| 4   | Provider likely not enabled in production                                                                       | **cannot verify** — no Render access; the fix in root cause 3 now makes this state visible instead of silent |
| 5   | Meta acceptance is not delivery                                                                                 | **Batch 2**                                                                                                  |
| 6   | SMS wording on a WhatsApp channel                                                                               | **fixed**                                                                                                    |

---

## 3. What changed and why

### 3.1 Opaque request handles — `backend/src/modules/auth/otp-request-handle.util.ts` (new)

`recoverClaimByOrder` and `requestPasswordReset` must answer identically whether or not an
account exists, yet `verify` needs an identifier. Returning `challenge_id` only on a match
is the exact enumeration oracle those endpoints were written to avoid, which is why they
previously returned nothing and left the flow impossible to finish.

Every request now gets a handle. A real one carries the challenge id; a decoy carries
random bytes of the same length. Signing alone would not do — a signed payload is still
readable, so a caller could tell the kinds apart. The payload is encrypted with
**AES-256-GCM**, so the value is opaque and authenticated. Handles are stateless: no
table, no migration, nothing to expire.

> **Superseded by Batch 1.1.** As shipped in Batch 1 the handle key was derived from
> `OTP_HMAC_SECRET`, which broke key separation. Batch 1.1 moved it to a dedicated
> `OTP_REQUEST_HANDLE_SECRET` and added a `v1.` version prefix. See
> `DilMart_STORE_UNIFIED_OTP_AUTH_BATCH11_CLOSURE.md`.

### 3.2 Readiness pre-flight — `OtpDeliveryService.assertProviderReady()`

Provider mode and channel configuration do not depend on the phone number, so failing on
them leaks nothing — the result is the same for every caller. Both anti-enumeration
endpoints now call `assertDeliveryReady()` **before** any account lookup, so
`OTP_PROVIDER_DISABLED`, `OTP_PROVIDER_FORBIDDEN_IN_PRODUCTION`,
`OTP_PROVIDER_UNSUPPORTED` and `OTP_WHATSAPP_CONFIG_ERROR` surface as real 503s.

Per-send failures (Meta `132xxx`, timeouts, unreachable recipient) remain silent in the
response, because those _are_ account-dependent. They keep going to the logs with a
correlation id, and the caller still receives a decoy handle.

The failure reason names the offending variable, so it goes to logs only — never into the
response body. A test asserts that.

### 3.3 Verify accepts either reference

`VerifyOtpDto` now takes `request_id` (preferred) or `challenge_id` (the authenticated
claim flow, which still receives a challenge id directly). Anything that does not
resolve — a decoy, a tampered handle, a missing field — collapses to a single
unresolvable uuid, so the response is indistinguishable from a wrong code.

### 3.4 Claim UI

- `recoverClaimByOrder` now stores the returned `request_id`, so an **unauthenticated**
  recover-by-order user can actually reach and pass the verify step. Previously only
  logged-in users got a challenge and everyone else landed on the OTP screen with an empty
  id and no way to proceed.
- The deep-link entry (`?orderNumber=…&phone=…`) no longer opens the OTP step directly. It
  starts on the phone step so a handle is always obtained first.
- "أدخل رمز التوثيق المرسل في **رسالة نصية قصيرة**" → "أدخل رمز التوثيق الذي أرسلناه إلى
  **واتساب**", and both toasts now name WhatsApp.

---

## 4. Files changed

| File                                                    | Change                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `backend/src/modules/auth/otp-request-handle.util.ts`   | **new** — sealed opaque handles                                                                             |
| `backend/src/modules/auth/otp-delivery.service.ts`      | `assertProviderReady()`                                                                                     |
| `backend/src/modules/auth/otp-challenge.service.ts`     | `assertDeliveryReady()`, `issueRequestHandle()`, `issueDecoyRequestHandle()`, `resolveChallengeReference()` |
| `backend/src/modules/auth/password-recovery.service.ts` | readiness pre-flight; returns `request_id`                                                                  |
| `backend/src/modules/auth/account-claim.service.ts`     | readiness pre-flight; returns `request_id`                                                                  |
| `backend/src/modules/auth/account-claim.dto.ts`         | `VerifyOtpDto` accepts `request_id` or `challenge_id`                                                       |
| `backend/src/modules/auth/auth.controller.ts`           | shared reference resolver for both verify endpoints                                                         |
| `backend/tests/whatsapp-otp-delivery.test.mjs`          | stubs updated to the new contract; **+11 tests**                                                            |
| `src/lib/api/customer.ts`                               | `request_id` in recover/reset responses and verify payloads                                                 |
| `src/pages/account/ClaimAccount.tsx`                    | handle wiring, deep-link step, WhatsApp wording                                                             |
| `governance/…`                                          | audit, this report, `CURRENT_PHASE.md`, closure index                                                       |

Untouched, as required: `src/pages/Auth.tsx`, all Supabase migrations and RLS, checkout,
orders, merchant, admin, app icon, splash, safe area, hero carousel, Netlify config,
`dist`. No dependency added. No secret committed. No `node_modules` change.

---

## 5. API contract changes

| Endpoint                            | Before                                       | After                                      |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------ |
| `POST /auth/account-claim/recover`  | `{ message }`                                | `{ request_id, message }`                  |
| `POST /auth/password-reset/request` | `{ message }`                                | `{ request_id, message }`                  |
| `POST /auth/account-claim/verify`   | requires `challenge_id`                      | accepts `request_id` **or** `challenge_id` |
| `POST /auth/password-reset/verify`  | requires `challenge_id`                      | accepts `request_id` **or** `challenge_id` |
| `POST /auth/account-claim/request`  | `{ challenge_id, expires_at, resend_after }` | unchanged                                  |

Backwards compatible: existing callers sending `challenge_id` keep working.

New failure mode, by design: both request endpoints can now return **503** with
`OTP_PROVIDER_DISABLED` / `OTP_WHATSAPP_CONFIG_ERROR` when the channel is not configured.
That is the point — it replaces a false success.

---

## 6. Tests

`backend/tests/whatsapp-otp-delivery.test.mjs`: **22 → 33 pass, 0 fail** (+11).

New coverage:

- handle round-trips to its challenge id
- decoy resolves to a decoy and never yields a challenge id
- real and decoy handles are the same length, same alphabet, and the plaintext is not readable
- handles rejected under a different secret, when tampered, when empty, when malformed
- two handles for the same challenge differ, so a handle cannot be correlated
- readiness fails when the provider is disabled or unset (three variants)
- readiness fails on an unsupported provider
- readiness surfaces WhatsApp misconfiguration **without leaking the variable name**
- readiness passes when fully configured
- readiness forbids the fake provider in production
- readiness runs **before** any account lookup — the Supabase client is asserted never to be touched

Updated: the two anti-enumeration tests now assert equal key sets and a present
`request_id` on both branches, instead of an exact-equality check that the new field broke.

| Suite                                               | Result                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend: npm run build`                            | ok                                                                                                                                                  |
| `backend: npm run test:whatsapp-otp`                | **33 pass / 0 fail**                                                                                                                                |
| `backend: npm run test:launch-critical`             | **26 pass / 0 fail**                                                                                                                                |
| `backend: tests/password-recovery-service.test.mjs` | **environment-blocked** — requires `SUPABASE_SERVICE_ROLE_KEY`; it is an integration test CI runs after `supabase start`. Unmodified by this change |
| `npm test` (frontend)                               | **99 pass / 16 files**                                                                                                                              |
| `npm run lint`                                      | 464 problems — identical to base, 0 new                                                                                                             |
| `npm run arch:guard`                                | PASS                                                                                                                                                |
| `npm run build`                                     | ok                                                                                                                                                  |
| `npm run build:mobile`                              | ok                                                                                                                                                  |
| `npm run mobile:boundary`                           | PASS — forbidden modules: none                                                                                                                      |
| `npm run native:assets:check`                       | PASS                                                                                                                                                |
| `npm run web:production-smoke`                      | **PASS** — 3 routes, 0 exceptions                                                                                                                   |
| `git diff --check`                                  | clean                                                                                                                                               |

`npm run auth:guard` still reports the pre-existing Windows-only CRLF false positive
documented in the previous phase. Unrelated and untouched.

---

## 7. Not done in this batch

Everything that depends on the Supabase-owned architecture or on production access:

- Email OTP and Phone OTP login/registration, and the `/auth` rebuild
- Supabase Send SMS Hook endpoint and its signature verification
- `/forgot-password` and the migration of password reset to Supabase recovery OTP
- Meta delivery-status webhook and the `sent`/`delivered`/`failed` table
- Real WhatsApp and email smoke tests — need an approved `OTP_TEST_PHONE_E164`,
  `ALLOW_REAL_WHATSAPP_OTP_TEST=true` and explicit permission
- Any Render, Supabase dashboard or Meta configuration

---

## 8. Remaining blockers

1. **`OTP_PROVIDER` in Render production is unknown.** If it is `disabled`, `fake` or
   unset, no message is delivered. After this batch that state is no longer silent: the
   request endpoints return 503 with a specific code and the reason is in the logs.

   **Correction to the earlier wording in this report.** A single production call to
   `POST /auth/account-claim/recover` is _not_ proof that the WhatsApp channel works. Read
   it strictly:
   - **503** proves the readiness check failed. That is real evidence, and the returned
     code says which condition failed.
   - **200 proves only that the readiness check passed** — that is, the provider mode is
     `whatsapp` and the config _shape_ validates. It does **not** prove the Meta API was
     called, does not prove a `wamid` came back, and does not prove anything was sent or
     delivered. On the recover endpoint a 200 is also returned when no order matched, in
     which case no send was even attempted.

   ### Evidence levels

   | Level | Claim                                                         | How it is established                                          | Available today                     |
   | ----- | ------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------- |
   | 0     | Config shape valid                                            | request endpoint returns 200 instead of 503                    | **yes**                             |
   | 1     | Meta API called                                               | backend log line for the dispatch attempt, with correlation id | logs only, not accessible from here |
   | 2     | Meta accepted, `wamid` returned                               | `providerAcceptedMessageId` present in the log                 | logs only                           |
   | 3     | `sent` webhook received                                       | Meta delivery webhook                                          | **not implemented**                 |
   | 4     | `delivered` webhook received                                  | Meta delivery webhook                                          | **not implemented**                 |
   | 5     | User received it and the code verified into the intended flow | end-to-end smoke on an approved test number                    | **not performed**                   |

   **The word "delivered" must not be used below level 4.** Nothing in this repository can
   currently reach level 3 or above, so no delivery claim is defensible until the Batch 2
   webhook lands.

2. Meta template name, language, type and approval status are unverified.
3. `Meta accepted ≠ delivered` still holds; no delivery evidence exists until Batch 2.
4. `password-recovery-service.test.mjs` cannot run without a Supabase service key.

---

## 9. Rollback

Single commit, additive. `git revert` restores the previous behaviour exactly:
the two endpoints go back to `{ message }` only, verify goes back to requiring
`challenge_id`, and the readiness pre-flight disappears. No migration, no schema change,
no data written, so there is nothing to undo beyond the code.

Frontend and backend must be rolled back together — the UI reads `request_id`, and an old
backend would not send it.

---

## 10. Deployment order

1. **Backend first** (Render). The new response field is additive and the old UI ignores
   it, so an old frontend keeps working against the new backend.
2. Confirm `OTP_PROVIDER` and the WhatsApp variables **before** the deploy, or the newly
   honest 503 will start surfacing to users who previously saw a false success. That is
   correct behaviour, but it should be a deliberate choice, not a surprise.
3. **Frontend second** (Netlify) — it depends on `request_id` for the unauthenticated
   recover-by-order path.
4. No Supabase change is required by this batch.

Nothing was pushed, deployed or merged.
