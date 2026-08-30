# Unified Email & WhatsApp OTP Authentication — Audit & Root Cause

Phases 0–3 deliverable. This is the gate the task defines: no Auth UI was modified, no
contract was changed, no dependency was touched. Everything below is read from code,
migrations and the live deployment, not inferred.

---

## 1. Identity

| Field | Value |
|---|---|
| Phase | Unified Email & WhatsApp OTP Authentication — Audit, Repair and Production Validation |
| Stage reached | **Audit complete. Implementation not started — awaiting supervisor input.** |
| Branch | `feat/unified-email-whatsapp-otp-auth` |
| Base SHA | `3f69a7ad1641ced2876a8ea7b199c67fa62ce554` |
| Worktree at start | clean except `.claude/settings.local.json`, a local modification that predates all recent work and was not touched |

Branched from the local HEAD, so the native icon, native splash, mobile safe area, RTL
hero carousel and web production bundle fix all remain ancestors. No `checkout main`,
`pull`, `reset`, `clean`, `stash` or `rebase` was run.

---

## 2. Current-state matrix

Legend — **Impl**: implemented · **Test**: automated coverage · **Prod**: production-configured.

| # | Case | UI entry | Frontend fn | API endpoint | Backend service | Session issuer | Channel | Impl | Test | Prod | Defect |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Login email + password | `/auth` | `signInWithPassword` | — (direct Supabase) | — | Supabase | — | yes | partial | yes | none |
| 2 | Login phone + password | `/auth` | `signInWithPassword` | — (direct Supabase) | — | Supabase | — | yes | partial | unknown | needs `phone` confirmed in Supabase; UI hints "email or phone" but register blocks phone |
| 3 | Register email + password | `/auth` | `signUpWithPassword` | — (direct Supabase) | — | Supabase | email link | yes | partial | yes | confirmation is a **magic link**, not a token |
| 4 | Register phone + password | `/auth` | — | — | — | — | — | **no** | no | no | hard-blocked in UI: "التسجيل الحالي عبر البريد الإلكتروني فقط" |
| 5 | Login by email OTP | — | — | — | — | — | — | **no** | no | no | does not exist anywhere in the codebase |
| 6 | Login by phone OTP | — | — | — | — | — | — | **no** | no | no | explicit non-goal of the previous phase |
| 7 | Register by email OTP | — | — | — | — | — | — | **no** | no | no | does not exist |
| 8 | Register by phone OTP | — | — | — | — | — | — | **no** | no | no | does not exist |
| 9 | Password reset by email | — | — | — | — | — | — | **no** | no | no | no route, no UI, no endpoint |
| 10 | Password reset by phone | **none** | `customerApi.requestPasswordReset` (defined, never called) | `POST /auth/password-reset/{request,verify,complete}` | `PasswordRecoveryService` | custom action token → `admin.updateUserById` | WhatsApp | backend only | yes (`password-recovery-service.test.mjs`) | provider unknown | **unreachable from UI**, and the contract cannot be completed — see §3.1 |
| 11 | Account claim, logged-in provisional | `/claim-account` | `customerApi.requestAccountClaim` | `POST /auth/account-claim/{request,verify,complete}` | `AccountClaimService` | custom action token | WhatsApp | yes | yes (`account-claim-recovery.test.mjs`) | provider unknown | SMS wording; otherwise the only complete OTP flow |
| 12 | Account recovery by order + phone | `/claim-account` | `customerApi.recoverClaimByOrder` | `POST /auth/account-claim/recover` | `AccountClaimService` | custom action token | WhatsApp | partial | yes | provider unknown | **dead end for unauthenticated users** — see §3.2 |

Facts behind the matrix:

- `src/pages/Auth.tsx` — 224 lines, zero OTP. There is no `signInWithOtp` or `verifyOtp`
  call anywhere in `src/`.
- `src/app/CustomerRoutes.tsx` exposes `/auth` and `/claim-account`. There is no
  `/forgot-password` route and no password-reset page.
- Both "نسيت كلمة المرور؟ استعادة بواسطة الهاتف" and "لدي طلب سابق وأريد استلام حسابي" in
  `Auth.tsx` navigate to the same place: `/claim-account`.
- `customerApi.requestPasswordReset` / `verifyPasswordResetOtp` /
  `completePasswordReset` exist in `src/lib/api/customer.ts` and are called from **no
  component**.

---

## 3. Proven defects

### 3.1 The anti-enumeration paths destroy the contract

`POST /auth/password-reset/verify` and `POST /auth/account-claim/verify` both require
`challenge_id`. `OtpChallengeService.createChallenge()` returns it:

```ts
return { challenge_id: challengeId, expires_at: ..., resend_after: resendSeconds };
```

But both entry points **discard that return value**:

`backend/src/modules/auth/password-recovery.service.ts`
```ts
if (targetUserId) {
  try { await this.otpChallenge.createChallenge({ ... }); }   // return value dropped
  catch (err) { /* swallowed */ }
}
return { message: "إذا كان رقم الهاتف مسجلاً، فقد تم إرسال رمز استعادة كلمة المرور" };
```

`backend/src/modules/auth/account-claim.service.ts` — `recoverClaimByOrder()` is
identical in shape.

So the caller never receives a handle, and `verify` can never be satisfied. **Password
reset by phone and unauthenticated account recovery are structurally impossible to
complete**, independent of whether any message is delivered.

Only `requestClaimFromProvisional` (the authenticated path) returns the challenge, which
is why that is the one flow that works end to end.

### 3.2 The claim UI opens an OTP step with an empty challenge

`src/pages/account/ClaimAccount.tsx`
```ts
const [step, setStep] = useState(initialOrderNumber && initialPhone ? "otp" : "phone");
const [challengeId, setChallengeId] = useState("");
```
and in `handleRequestOtp`:
```ts
if (orderNumber.trim()) {
  const res = await customerApi.recoverClaimByOrder(orderNumber.trim(), phone.trim());
  if (user?.id) {                       // only authenticated users get a challenge
    const claimRes = await customerApi.requestAccountClaim(phone.trim());
    setChallengeId(claimRes.challenge_id);
  }
}
setStep("otp");                          // runs regardless
```

An unauthenticated recover-by-order user is shown the six-digit input with
`challengeId === ""`. Every verify attempt fails. The deep-link entry
(`?orderNumber=…&phone=…`) starts on the OTP step with the same empty challenge and no
way to obtain one.

### 3.3 Provider and configuration failures are swallowed

Both anti-enumeration paths catch **everything** from `createChallenge`, including
`OTP_PROVIDER_DISABLED`, `OTP_PROVIDER_FORBIDDEN_IN_PRODUCTION`,
`OTP_WHATSAPP_CONFIG_ERROR`, Meta auth errors and timeouts, log one line, and still
return the success-shaped message.

`OtpDeliveryService` itself is correct and fails closed — it refuses to fake success,
forbids `fake`/`test` in production, and throws with a specific code. That signal is then
discarded one layer up. **This is why the symptom is "the message never arrives and
nothing says why."**

### 3.4 Wrong channel wording

`ClaimAccount.tsx:138` — "أدخل رمز التوثيق المرسل في **رسالة نصية قصيرة**" while the only
implemented channel is Meta WhatsApp.

### 3.5 Meta acceptance is not delivery

`WhatsAppOtpProvider` returns `providerAcceptedMessageId` (the `wamid`) and
`OtpDeliveryService` logs `WhatsApp accepted`. That is Meta accepting the **request**.
There is no delivery webhook, no `sent` / `delivered` / `read` / `failed` tracking and no
table for it. A message can be accepted and then silently fail — for example when the
recipient has never messaged the business and the template is not an approved
authentication template.

---

## 4. Production diagnosis — what I could and could not verify

### Verified

| Check | Result |
|---|---|
| Backend reachable | `GET /api/health` → **HTTP 200** (12.3 s cold start on Render free tier) |
| Backend data path | `GET /api/marketplace/home` → **HTTP 200**, real payload |
| Earlier "500s" seen during the web bundle phase | **Render cold start**, not an outage — the same endpoints answer 200 once warm |
| Repo default | `backend/.env.example` ships `OTP_PROVIDER=disabled` |
| Prior phase instruction | `WHATSAPP_OTP_DELIVERY_CLOSURE.md` states: *"Keep Production on `OTP_PROVIDER=fake` until Staging smoke passes"* and *"No Render / Production apply in this PR"* |
| `render.yaml` | declares `NODE_ENV=production` and `sync: false` secrets only — **no OTP variable is declared at all**, so none is provisioned by IaC |

### Not verifiable from here

There is **no Render CLI, no Supabase CLI and no dashboard credential** in this
environment:

```
render    -> command not found
supabase  -> command not found
```

So the following are **UNKNOWN**, not SET/MISSING: `OTP_PROVIDER`,
`OTP_WHATSAPP_MODE`, `OTP_WHATSAPP_PHONE_NUMBER_ID`, `OTP_WHATSAPP_ACCESS_TOKEN`,
`OTP_WHATSAPP_TEMPLATE_NAME`, `OTP_WHATSAPP_TEMPLATE_LANGUAGE`,
`OTP_WHATSAPP_TEMPLATE_TYPE`, `OTP_WHATSAPP_API_VERSION`, `OTP_WHATSAPP_TIMEOUT_MS`,
`OTP_HMAC_SECRET`, `OTP_TOKEN_SECRET`, `OTP_TTL_SECONDS`, `OTP_RESEND_SECONDS`,
`OTP_MAX_ATTEMPTS`. Render logs and the `auth_otp_challenges` rows are equally out of
reach.

I did not probe the live OTP endpoints. `POST /auth/password-reset/request` with a real
Iraqi number would attempt an actual WhatsApp send to a real person, which the task
gates behind `ALLOW_REAL_WHATSAPP_OTP_TEST` and an approved test number. No such number
was provided.

---

## 5. Root causes

Ranked. The first three are proven from code and hold **regardless** of what the Render
environment contains.

1. **No OTP login or registration exists.** `/auth` is password-only. Nothing in the
   frontend ever calls Supabase OTP. Cases 5–8 in the matrix were never built, and phone
   OTP login was an explicit non-goal of the previous phase. *If the report is "WhatsApp
   OTP login does not work", the literal answer is that it was never implemented.*
2. **API contract lost `challenge_id`** on both anti-enumeration paths, so password reset
   and unauthenticated claim recovery cannot be completed even when a code is delivered.
3. **Provider errors are swallowed** by those same paths, so a disabled or misconfigured
   provider is indistinguishable from success at the UI. This is what makes the failure
   silent.
4. **Provider very likely not enabled in production.** The repo default is `disabled`,
   `render.yaml` provisions no OTP variable, and the previous closure explicitly told ops
   to keep production on `fake` until staging smoke passed — with no evidence in the repo
   that this was ever revisited. If `OTP_PROVIDER` is `disabled`, `fake` or unset, no
   message is ever sent and the swallow in root cause 3 hides it. **Needs supervisor
   confirmation — I cannot read it.**
5. **`Meta accepted ≠ delivered`.** No delivery webhook exists, so even a correctly
   configured provider offers no evidence the user received anything.
6. **Wrong wording** ("رسالة نصية قصيرة") makes users look for an SMS that will never come.

Ruled out by evidence: backend down (200 OK), phone normalization (`toWhatsAppE164` and
`normalizeIraqiPhone` are tested and correct), and the web bundle crash (fixed in
`3f69a7a`, unrelated).

---

## 6. Architecture decision the task prescribes, checked against installed versions

`@supabase/supabase-js@2.110.8`. Verified in the installed type definitions:

- `signInWithOtp` accepts `{ email, options: { shouldCreateUser } }` and
  `{ phone, options: { shouldCreateUser, channel } }` where `channel?: 'sms' | 'whatsapp'`.
- `verifyOtp` accepts `type: MobileOtpType` (`'sms' | 'phone_change'`) and
  `type: EmailOtpType` (`'signup' | 'magiclink' | 'recovery' | 'email' | …`).

So the prescribed design is supported by the installed client: Supabase owns OTP
lifecycle, verification, user creation and session issuance; a Supabase **Send SMS Hook**
forwards the phone code to the existing `WhatsAppOtpProvider`; the custom
`auth_otp_challenges` machinery stays for the Account Claim business flow only.

`supabase/config.toml` currently contains only `project_id` and one function override —
**no `[auth]` block**, so phone auth, OTP expiry, hook registration and template settings
are all dashboard-side and outside this repository.

---

## 7. What is blocked and why

| Phase | Status |
|---|---|
| 0–2 audit and matrix | **done** |
| 3 production diagnosis | **partially blocked** — no Render/Supabase access, no logs, no `auth_otp_challenges` visibility |
| 4 architecture choice | validated against installed types, ready |
| 5 Send SMS Hook endpoint | buildable now; activation is dashboard-side |
| 6 Auth page rebuild | buildable now; **non-functional until** Supabase email template uses `{{ .Token }}` and phone auth + hook are enabled |
| 7 password reset | buildable now |
| 8 account claim fixes | buildable now |
| 9 delivery webhook + migration | buildable now; Meta subscription is dashboard-side |
| 10 tests | buildable now |
| 11 real WhatsApp/email smoke | **blocked** — needs `OTP_TEST_PHONE_E164`, `ALLOW_REAL_WHATSAPP_OTP_TEST=true` and explicit approval |
| 12 production configuration | **supervisor-only by instruction** |
| 13 build and verification | runnable once 5–10 land |

---

## 8. What I need before implementing

1. **`OTP_PROVIDER` value in Render production**, plus whether the Meta template is
   Approved and its exact name/language/type. If the provider is `disabled` or `fake`, no
   amount of code will deliver a message, and the sequencing changes.
2. **Go-ahead on the Supabase-owned architecture.** It moves login/registration session
   issuance to Supabase OTP and adds a public hook endpoint. `CLAUDE.md` forbids me from
   making architectural decisions; the task authorises this one, but it should be
   confirmed knowingly because it changes the auth surface for every existing user.
3. **An approved test phone number and email**, plus permission to send, for phase 11.
4. **Confirmation on the password-reset decision**: migrate it entirely to Supabase
   recovery OTP, or keep the custom action-token flow and repair its contract with an
   opaque request handle. §7 of the task allows either; I recommend the first, because it
   deletes an entire custom session-adjacent code path.

---

## 9. Nothing was changed

No file under `src/`, `backend/src/`, `supabase/` or `android/`/`ios/` was modified. This
audit document is the only artifact, and it is intentionally left **uncommitted** — the
task authorises exactly one commit,
`feat(auth): unify email and whatsapp otp authentication`, at the end of a successful
implementation.
