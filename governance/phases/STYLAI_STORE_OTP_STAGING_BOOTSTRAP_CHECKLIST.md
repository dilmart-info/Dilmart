# DilMart Store — OTP Staging Bootstrap Checklist

**Status:** NOT STARTED — no staging resource exists yet.
**Owner:** Operator / Supervisor (not the execution agent).
**Prepared under:** Batch 2B.1, local code and documentation only.

---

## 0. Why this document exists

Every OTP change from Batch 2A onward has been verified locally and is blocked at the same
gate: there is no isolated staging environment. Batch 2B stated the rule plainly — if no
isolated staging environment exists, stop; production is not a substitute.

This checklist is what an operator follows to create that environment. It is written so the
work can be done without the execution agent, because the agent has no access to Supabase,
Render, Netlify or Meta and must not be given production credentials to obtain it.

**Nothing in this document may be performed against production.** Every resource below is a
new, separate resource.

---

## 1. Resource matrix

No entry may be filled in with a production value. Record identifiers only — never a secret,
never a token, never a full URL containing credentials.

| #   | Resource                       | Purpose                                    | Status      | Identifier (fill in) |
| --- | ------------------------------ | ------------------------------------------ | ----------- | -------------------- |
| 1   | Supabase project (staging)     | Auth, database, Send SMS hook              | NOT CREATED |                      |
| 2   | Supabase Auth → Phone provider | Enables the SMS/WhatsApp OTP path          | NOT CREATED |                      |
| 3   | Supabase Send SMS hook (HTTP)  | Routes OTP delivery to our backend         | NOT CREATED |                      |
| 4   | Supabase Auth hook secret      | Standard Webhooks signing secret           | NOT CREATED |                      |
| 5   | Backend service (staging)      | Hosts the hook endpoint                    | NOT CREATED |                      |
| 6   | Backend environment variables  | OTP + hook configuration                   | NOT CREATED |                      |
| 7   | Frontend deploy (staging)      | Auth UI under staging flags                | NOT CREATED |                      |
| 8   | Meta WhatsApp test number      | Outbound OTP channel                       | NOT CREATED |                      |
| 9   | Meta authentication template   | Approved OTP template                      | NOT CREATED |                      |
| 10  | Test recipient handset         | Consented destination for LEVEL 4 evidence | NOT CREATED |                      |

Statuses: `NOT CREATED` → `CREATED` → `CONFIGURED` → `VERIFIED`.

---

## 2. Supabase staging project

1. Create a **new** Supabase project. Do not branch, fork or copy the production project;
   a copy carries production user rows and production RLS assumptions.
2. Choose a region and record the project ref in the matrix above. The ref is an identifier,
   not a secret, so it may be written down.
3. Confirm the ref is **not** the production ref. `check-otp-staging-readiness.mjs` refuses
   the production ref by name, so a mistake here is caught, but catch it earlier.
4. Apply the repository migrations to the staging project only.
5. `supabase/migrations/20260731120000_handle_new_user_phone_only_signup.sql` has never been
   applied anywhere. Staging is where it gets its first exposure. Verify afterwards that a
   phone-only signup creates exactly one profile row and that an email signup is unaffected.

**Exit criteria:** the project exists, migrations are applied, and the ref is recorded.

---

## 3. Supabase Auth configuration

1. Enable the **Phone** provider.
2. Set the OTP expiry and length to match the backend's expectations
   (`OTP_TTL_SECONDS`, six digits).
3. Leave **Confirm phone change** and any auto-confirm switches at their defaults unless the
   supervisor decides otherwise in writing; changing them changes the security model.
4. Do **not** enable phone-based signup in the frontend. `VITE_AUTH_PHONE_REGISTRATION_ENABLED`
   stays `false` until the phone identity audit has been reviewed. The readiness gate fails if
   it is on.

**Exit criteria:** the phone provider is on; the registration flag is still off.

---

## 4. Send SMS hook

1. In Auth → Hooks, enable **Send SMS hook**, type **HTTPS**.
2. Point it at the staging backend: `https://<staging-backend-host>/api/auth/hooks/supabase/send-sms`.
3. Copy the generated `whsec_…` secret straight into the staging backend's
   `SUPABASE_AUTH_HOOK_SECRET`. Do not paste it into a ticket, a chat message, or this file.
4. This secret is used for two things and only two things: verifying Standard Webhooks
   signatures, and deriving the per-recipient rate-limit key. See §7.
5. Confirm the hook URL is reachable over HTTPS from the public internet. Supabase abandons an
   HTTP auth hook at roughly five seconds; the backend's own dispatch deadline is capped below
   that (`SUPABASE_AUTH_HOOK_TIMEOUT_MS`, default 4000ms, range 1000–4500).

**Exit criteria:** the hook is enabled, its URL resolves to staging, and the secret is set on
the staging backend only.

---

## 5. Staging backend service

1. Create a **new** service. Do not reuse, rename or re-point the production service.
2. Deploy the branch under test. Do not deploy to production from this checklist.
3. Set the environment variables listed in §7.
4. Confirm the service does not share a database, a Redis instance, or any secret with
   production.

**Known limitation to accept before starting:** hook idempotency is in-memory. A restart or a
second instance loses the delivery cache, so a Supabase retry after a restart can produce a
second WhatsApp message. This is tolerable in staging and is a **P0 before production** — the
durable store is designed in the Batch 2B closure report and is not built yet. Keep the staging
backend at a single instance to keep the behaviour observable.

**Exit criteria:** the service is running, isolated, and single-instance.

---

## 6. Meta WhatsApp configuration

1. Use a **test** phone number, or a business number that is not the production sender.
2. Create and submit an **authentication** template. Its type must match
   `OTP_WHATSAPP_TEMPLATE_TYPE` (`AUTH_COPY_CODE`, `AUTH_ONE_TAP`, `AUTH_GENERIC`, or
   `AUTH_COPY_CODE_EXPIRY`).
3. Wait for approval. A pending template fails at send time, and that failure looks like a
   code defect when it is not.
4. Add the test recipient to the allowed list if the number is in sandbox mode.
5. Record the template name and language. Do not record the access token anywhere but the
   backend's environment.

**Exit criteria:** an approved authentication template, and a sender that is not production's.

---

## 7. Staging environment variables

Set on the staging backend only. Values are never written into this repository.

| Variable                               | Value                | Note                                          |
| -------------------------------------- | -------------------- | --------------------------------------------- |
| `OTP_ENVIRONMENT`                      | `staging`            | The readiness gate refuses anything else      |
| `OTP_PROVIDER`                         | `whatsapp`           | `fake`/`test` produce no evidence of delivery |
| `OTP_WHATSAPP_MODE`                    | `sandbox` or `live`  |                                               |
| `OTP_WHATSAPP_PHONE_NUMBER_ID`         | staging sender       |                                               |
| `OTP_WHATSAPP_ACCESS_TOKEN`            | staging token        | Never logged, never echoed                    |
| `OTP_WHATSAPP_TEMPLATE_NAME`           | approved template    |                                               |
| `OTP_WHATSAPP_TEMPLATE_LANGUAGE`       | e.g. `ar`            |                                               |
| `OTP_WHATSAPP_TEMPLATE_TYPE`           | matches the template |                                               |
| `OTP_WHATSAPP_API_VERSION`             | e.g. `v21.0`         |                                               |
| `SUPABASE_AUTH_HOOK_SECRET`            | from §4              |                                               |
| `SUPABASE_AUTH_HOOK_TIMEOUT_MS`        | `4000`               | Must stay under Supabase's ~5s abandon        |
| `OTP_HMAC_SECRET`                      | fresh random         |                                               |
| `OTP_TOKEN_SECRET`                     | fresh random         |                                               |
| `OTP_REQUEST_HANDLE_SECRET`            | fresh random         |                                               |
| `VITE_AUTH_PHONE_REGISTRATION_ENABLED` | `false`              |                                               |

All four secrets must be **pairwise distinct** and must be **newly generated**. A production
secret copied into staging turns a staging incident into a production incident.

The recipient rate limiter does **not** get its own variable. Its key is derived from
`SUPABASE_AUTH_HOOK_SECRET` via a labelled HMAC (`auth-hook-recipient-limit:v1`), which keeps
the limiter key unusable as a signing secret while leaving one fewer secret to rotate wrongly.
Rotating the hook secret resets every limiter bucket; the buckets are in-memory and already
reset on deploy, so this costs nothing.

Verify with:

```
cd backend && npm run otp:staging-readiness
```

It reads the environment, prints no values, contacts nothing, and exits non-zero on any
production marker. A pass means the shape is right — not that Supabase, Render or Meta are
actually working, and not that anything may be sent.

---

## 8. Frontend staging deploy

1. Deploy the branch under test to a **staging** site, not to `store.DilMart.org`.
2. Point `VITE_SUPABASE_URL` and the anon key at the staging project.
3. Enable the OTP feature flags on staging only. They default to off and must stay off in
   production until this checklist is complete and the results are reviewed.
4. Confirm password login still works. It is the only login path that is currently proven.

**Exit criteria:** a staging URL serving the branch against the staging Supabase project.

---

## 9. Consent and authorization for a real send

No real OTP is sent until **all** of the following are true at the same time:

- [ ] `ALLOW_REAL_WHATSAPP_OTP_TEST=true` is set for the run.
- [ ] `OTP_TEST_PHONE_E164` was supplied by the supervisor **externally**. It is never taken
      from the database, from an order, or from a profile.
- [ ] The owner of that handset has consented to receive a test message.
- [ ] The supervisor has authorized the send in-session, explicitly.
- [ ] `npm run otp:config-audit` passes on staging.
- [ ] `npm run otp:staging-readiness` passes on staging.

A missing item is a stop, not a warning.

---

## 10. Staging verification sequence

Run in order. Stop at the first failure.

1. **Readiness** — `npm run otp:staging-readiness` exits 0.
2. **Config audit** — `npm run otp:config-audit` shows every OTP key SET and the secrets
   pairwise distinct.
3. **Hook reachability** — an unsigned POST to the hook path returns 401, and the response body
   contains no detail about why. A 404 means the URL is wrong; a 200 means signature
   verification is not running and everything below is void.
4. **Signed hook, no send** — a correctly signed request with the provider disabled must return
   200 and must not contact Meta.
5. **First real send** — only after §9. One request, one recipient, observed end to end.
6. **Delivery confirmation** — the code arrives on the consented handset and is read from the
   handset, never from a log. This is the only evidence that reaches **LEVEL 4**.
7. **Verification** — the code is entered in the staging UI and the session is established.
8. **Retry behaviour** — replay the same signed webhook. Exactly one message must arrive.
9. **Rate limiting** — a fourth send to the same recipient inside a minute returns 429, and a
   different recipient is unaffected.
10. **Regression** — password login and the legacy password reset still work.

Record the outcome of each step in the closure report, with its evidence level. A successful
build proves nothing about delivery, and an HTTP 200 from the hook proves nothing about
delivery either.

---

## Evidence levels

| Level | Meaning                                                                             |
| ----- | ----------------------------------------------------------------------------------- |
| 0     | Configuration inspected locally; nothing executed                                   |
| 1     | Code path executed with a fake provider                                             |
| 2     | Real request accepted by Meta (HTTP 200 from the Graph API)                         |
| 3     | Delivery status callback received from Meta                                         |
| 4     | Message observed on the destination handset by a human                              |
| 5     | Verified end to end: code entered, session established, retries and limits observed |

Levels 3 and 4 are structurally unreachable today: no delivery webhook is configured, so
nothing reports back. Step 6 above closes LEVEL 4 by human observation instead. LEVEL 3
requires a delivery-status webhook that does not exist yet.

**Delivery may not be claimed below LEVEL 4.**
