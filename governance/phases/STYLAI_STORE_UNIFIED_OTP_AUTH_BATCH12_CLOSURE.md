# Unified OTP Auth — Batch 1.2: Production Configuration Audit and Controlled Provider Smoke

Audit batch. No Authentication UI was touched, no OTP login or registration was built, no
Supabase hook, no delivery webhook, no migration, no deploy, and **no real WhatsApp
message was sent**.

Previous: [`DilMart_STORE_UNIFIED_OTP_AUTH_BATCH11_CLOSURE.md`](./DilMart_STORE_UNIFIED_OTP_AUTH_BATCH11_CLOSURE.md)

---

## 1. Identity

| Field                  | Value                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Branch                 | `feat/unified-email-whatsapp-otp-auth`                                                    |
| Base SHA               | `2df6a10b830ddffcb0cf4097eed335662caf1bb7`                                                |
| Final SHA              | single commit on this branch                                                              |
| Real send              | **BLOCKED** — see §6                                                                      |
| Evidence level reached | **LEVEL 0 — FAILED** in every environment reachable from here; production **NOT CHECKED** |

---

## 2. Branch pointers

All three target commits were already ancestors of the pushed feature branch, so these
pushes created refs only — zero new objects, no history rewrite, no force.

| Branch                               | SHA       | Before                            | Action          |
| ------------------------------------ | --------- | --------------------------------- | --------------- |
| `chore/native-brand-assets`          | `2880299` | existed locally, absent on remote | pushed          |
| `fix/mobile-safe-area-hero-carousel` | `8e60a1a` | existed locally, absent on remote | pushed          |
| `fix/web-production-bundle`          | `3f69a7a` | did not exist                     | created, pushed |

Note: a local branch `fix/web-production-vendor-chunk` already pointed at the same
`3f69a7a`. It was left alone; `fix/web-production-bundle` is the requested name and is now
the remote pointer.

---

## 3. `.tmp-*` ignore audit

| Question                                              | Answer                                                                      |
| ----------------------------------------------------- | --------------------------------------------------------------------------- |
| Top-level entries matched                             | **85**                                                                      |
| Files inside them                                     | **2142**                                                                    |
| Ignore rule                                           | `.gitignore:57` → `.tmp-*`, proven per-file with `git check-ignore -v`      |
| Currently tracked                                     | **0**                                                                       |
| Ever tracked in history (`git log --all -- '.tmp-*'`) | **none — zero commits**                                                     |
| Source files (`.ts` / `.tsx`) hidden there            | **none**                                                                    |
| Governance or evidence files hidden there             | **none** — 233 tracked evidence files all live under `governance/evidence/` |

File types: 893 png, 765 xml, 144 version, 51 mjs, 44 js, 36 webp, 36 dex, 31 json, 28
kotlin_builtins, 28 jpg, 16 html, 13 txt, 11 apk, 4 zip.

Credential-bearing files found and confirmed ignored: `.tmp-p3-creds.env`,
`.tmp-web-role-creds.env`, `.tmp-password-grant.mjs`. Contents were not opened or printed.

**No secret ever entered git history.** Both `.env` files report `tracked=NO history=0`.
No incident to record, no rotation demanded by this audit, and no reason to withhold the
pushes that were performed.

---

## 4. Render production configuration audit

**Access: NONE.** `render` CLI is not installed, `RENDER_API_KEY` is not set, and no
dashboard credential exists in this environment. Nothing below is a guess.

| Variable                         | Render Production | Render Staging | Local shell | `backend/.env` |
| -------------------------------- | ----------------- | -------------- | ----------- | -------------- |
| `NODE_ENV`                       | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_PROVIDER`                   | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_MODE`              | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_PHONE_NUMBER_ID`   | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_ACCESS_TOKEN`      | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_TEMPLATE_NAME`     | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_TEMPLATE_LANGUAGE` | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_TEMPLATE_TYPE`     | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_API_VERSION`       | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_WHATSAPP_TIMEOUT_MS`        | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_HMAC_SECRET`                | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_TOKEN_SECRET`               | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_REQUEST_HANDLE_SECRET`      | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_TTL_SECONDS`                | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_RESEND_SECONDS`             | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |
| `OTP_MAX_ATTEMPTS`               | NOT CHECKED       | NOT CHECKED    | MISSING     | MISSING        |

`backend/.env` exists locally (2762 bytes) and contains **zero** OTP variables. That is a
developer file and is not evidence about production. Neither is `.env.example`.

Supporting finding, unchanged from the original audit: **`render.yaml` declares no OTP
variable at all**, so every one of these must have been entered by hand in the Render
dashboard, or it does not exist.

### The audit tool, so this stops being a blind spot

`backend/scripts/audit-otp-config.mjs` — read only, sends nothing, writes nothing. Run it
**inside the environment being audited**:

```bash
cd backend && npm run otp:config-audit
```

It reports `SET` / `MISSING` / `EMPTY` / `INVALID FORMAT` per variable, checks the three
secrets are pairwise distinct, runs the provider's own `validateConfig()` and the exact
`assertDeliveryReady()` the endpoints call, then prints a LEVEL 0 verdict and exits 0 or 1.

**No secret, token, phone number or template value is ever printed**, so the output is
safe to paste into a review packet. Eight tests enforce that, including one that plants
marker values in every secret and asserts none of them appear in the output, and one that
asserts secrets are reported as bare `SET` with no shape hint.

Verified in this session:

| Environment                         | Verdict                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------- |
| This shell, unconfigured            | `LEVEL 0 — FAILED`, exit 1, reason `OTP_PROVIDER_DISABLED`                |
| Positive control, dummy full config | `LEVEL 0 — CONFIG SHAPE VALID`, exit 0, `all three pairwise distinct YES` |

---

## 5. Meta WhatsApp configuration audit

**Access: NONE.** No Meta credential, no Graph token, no Business Manager access. Every
row is a request to the supervisor, not a finding.

| Item                                 | Status      | What to report back                                                                                                                                         |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WABA ID                              | NOT CHECKED | matches the account that owns the sending number — yes/no                                                                                                   |
| Phone Number ID                      | NOT CHECKED | matches `OTP_WHATSAPP_PHONE_NUMBER_ID` — yes/no                                                                                                             |
| Sending number status                | NOT CHECKED | Connected / Pending / Restricted / Disconnected                                                                                                             |
| Business verification                | NOT CHECKED | Verified / Not verified                                                                                                                                     |
| Access token validity                | NOT CHECKED | valid, and permanent or expiring — with expiry date, **not the token**                                                                                      |
| Token permissions                    | NOT CHECKED | `whatsapp_business_messaging` present — yes/no                                                                                                              |
| Template name                        | NOT CHECKED | exact name                                                                                                                                                  |
| Template category                    | NOT CHECKED | must be **Authentication**                                                                                                                                  |
| Template approval                    | NOT CHECKED | Approved / Pending / Rejected — with the rejection reason if any                                                                                            |
| Template language code               | NOT CHECKED | exact code, e.g. `ar` vs `ar_AR` — a mismatch fails as Meta `132xxx`                                                                                        |
| Template structure                   | NOT CHECKED | body OTP parameter present — yes/no                                                                                                                         |
| Button type                          | NOT CHECKED | copy-code / one-tap URL / none                                                                                                                              |
| Expiry parameter                     | NOT CHECKED | present — yes/no                                                                                                                                            |
| Matches `OTP_WHATSAPP_TEMPLATE_TYPE` | NOT CHECKED | one of `AUTH_COPY_CODE`, `AUTH_ONE_TAP`, `AUTH_GENERIC`, `AUTH_COPY_CODE_NOBD`, `AUTH_CC_NOBD`, `AUTH_BODY_URL`, `AUTH_ZERO_PARAM`, `AUTH_COPY_CODE_EXPIRY` |
| Messaging limit                      | NOT CHECKED | current tier                                                                                                                                                |
| Quality rating                       | NOT CHECKED | Green / Yellow / Red                                                                                                                                        |
| Webhook subscription                 | NOT CHECKED | subscribed to `messages` status events — yes/no                                                                                                             |

The template **type** is the highest-risk mismatch. The provider builds different Graph
components per type: `AUTH_COPY_CODE` adds a `COPY_CODE` button parameter,
`AUTH_ONE_TAP` adds a URL button parameter, `AUTH_GENERIC` sends body only, and
`AUTH_*_NOBD` variants drop the body component entirely. If the configured type does not
match what Meta approved, Meta rejects with a `132xxx` error — which the current code
classifies as `TEMPLATE_ERROR` and, on the anti-enumeration endpoints, **swallows into a
decoy handle**. The user sees the generic message and nothing arrives.

---

## 6. Real-send gate

```
REAL_WHATSAPP_SEND=BLOCKED
```

| Condition                                         | Status                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------- |
| `ALLOW_REAL_WHATSAPP_OTP_TEST=true`               | **not set**                                                             |
| `OTP_TEST_PHONE_E164` supplied externally         | **not supplied**                                                        |
| Explicit supervisor authorization in this session | **not given**                                                           |
| Render / Meta config audit passed                 | **failed** — production not reachable; LEVEL 0 fails everywhere checked |
| Destination owner consented                       | **not obtained**                                                        |

**Five of five conditions unmet.** No message was sent. No number was taken from the
database, from orders or from profiles — the instruction forbids it and nothing of the
sort was attempted.

`backend/scripts/smoke-whatsapp-otp.mjs` was **deliberately not created**. The instruction
scopes it to "if approval is obtained", and building a real-send tool before authorization
is exactly the step worth not taking early. Its full specification is recorded in the task
brief and it can be written in one pass once the gate opens.

### Why `/auth/account-claim/recover` was not used as provider evidence

A `200` from that endpoint is not evidence of a WhatsApp send. Since Batch 1 it returns a
decoy handle with an identical body whenever the order/phone pair does not match, in which
case Meta is never called. A `200` proves the readiness check passed and nothing more.

---

## 7. Evidence levels reached

| Level | Claim                                               | Status                                                                                                                                                              |
| ----- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Config shape valid                                  | **FAILED** in every environment reachable from here. **NOT CHECKED** in production                                                                                  |
| **1** | Meta endpoint actually called                       | **NOT REACHED** — no send performed                                                                                                                                 |
| **2** | Meta returned `providerAcceptedMessageId` / `wamid` | **NOT REACHED**                                                                                                                                                     |
| **3** | Webhook reports `sent`                              | **BLOCKED BY MISSING DELIVERY WEBHOOK**                                                                                                                             |
| **4** | Webhook reports `delivered`                         | **BLOCKED BY MISSING DELIVERY WEBHOOK**                                                                                                                             |
| **5** | User physically received and confirmed              | **NOT REACHED**. Reachable manually via the test-number owner, but that is a **manual confirmation, not a provider delivery receipt**, and must be labelled as such |

**The word "delivered" is not used anywhere in this report as a claim.**

---

## 8. Timing mitigation versus real latency

Real provider latency remains **unmeasured** — no Meta call was made, so there is no
observation to compare against the 400 ms floor.

```
TIMING_FLOOR_VS_REAL_LATENCY = NOT MEASURED
```

Not `TIMING_FLOOR_INSUFFICIENT_FOR_REAL_LATENCY`, because that would assert a measurement
that does not exist. The Batch 1.1 numbers came from a **simulated** 120 ms provider.

When a real dispatch is finally authorized, record the Meta round-trip p95. If it exceeds
400 ms the floor is insufficient and must be re-tuned deliberately, with load and UX
considered — not raised arbitrarily. **The final answer stays the async outbox**, which
removes the provider call from the request path entirely and makes the floor unnecessary.

---

## 9. Files changed

| File                                      | Change                                                      |
| ----------------------------------------- | ----------------------------------------------------------- |
| `backend/scripts/audit-otp-config.mjs`    | **new** — read-only configuration audit and LEVEL 0 verdict |
| `backend/tests/otp-config-audit.test.mjs` | **new** — 8 tests                                           |
| `backend/package.json`                    | `otp:config-audit`, `test:otp-config-audit`                 |
| `governance/…`                            | this report, `CURRENT_PHASE.md`, closure index              |

No production code changed. `Auth.tsx`, auth storage, Supabase migrations, RLS, checkout,
orders, merchant, admin, icon, splash, safe area, hero, Netlify config and `dist` are all
untouched. No dependency added. No secret committed.

---

## 10. Tests

| Suite                                               | Result                                                                                          |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `backend: npm run build`                            | ok                                                                                              |
| `backend: npm run test:whatsapp-otp`                | **49 pass / 0 fail**                                                                            |
| `backend: npm run test:launch-critical`             | **26 pass / 0 fail**                                                                            |
| `backend: npm run test:otp-config-audit`            | **8 pass / 0 fail**                                                                             |
| `backend: tests/password-recovery-service.test.mjs` | **1 BLOCKED** — needs `SUPABASE_SERVICE_ROLE_KEY`; CI runs it after `supabase start`. Untouched |
| `npm test` (frontend)                               | **103 pass / 17 files**                                                                         |
| `npm run lint`                                      | 464 problems — identical to base, 0 new                                                         |
| `npm run auth:guard`                                | **PASS**                                                                                        |
| `npm run arch:guard`                                | PASS                                                                                            |
| `npm run mobile:boundary`                           | PASS                                                                                            |
| `npm run web:production-smoke`                      | PASS — 3 routes, 0 exceptions                                                                   |
| `git diff --check`                                  | clean                                                                                           |

Audit-tool coverage: unconfigured environment fails with exit 1; fully configured passes
with exit 0; **no secret value ever appears in the output**; secrets are reported as bare
`SET` with no shape hint; reusing one secret across purposes fails; a fake provider in
production fails; malformed phone-number id, API version, timeout and template type are
each flagged `INVALID FORMAT`; and the verdict never awards a level above 0 or claims
delivery.

---

## 11. Missing permissions and access

| Needed                                     | Status     |
| ------------------------------------------ | ---------- |
| Render dashboard or API key, read-only     | **absent** |
| Supabase dashboard or CLI                  | **absent** |
| Meta Business Manager / Graph read access  | **absent** |
| Approved `OTP_TEST_PHONE_E164` and consent | **absent** |
| Supervisor authorization for a real send   | **absent** |

---

## 12. Blockers before Batch 2

1. Production `OTP_PROVIDER` and the WhatsApp variables are still unknown. Run
   `npm run otp:config-audit` in the Render shell and paste the output — it prints no
   secrets.
2. Meta template name, language code, category, type and approval status unverified. The
   type mismatch is the highest-risk failure and is currently swallowed silently.
3. No approved test number, no consent, no authorization — level 1 and 2 unreachable.
4. Levels 3 and 4 are structurally unreachable until the delivery webhook exists.
5. The timing mitigation is temporary; real latency is unmeasured; the async outbox is
   still the required end state.
6. `OTP_REQUEST_HANDLE_SECRET` is not known to be provisioned anywhere.

---

## 13. Variables that must be provisioned before deploy

Names only, no values. Set these in Render, then re-run the audit tool there.

**Required, no default:** `OTP_PROVIDER` (must be `whatsapp`), `OTP_WHATSAPP_MODE`,
`OTP_WHATSAPP_PHONE_NUMBER_ID`, `OTP_WHATSAPP_ACCESS_TOKEN`, `OTP_WHATSAPP_TEMPLATE_NAME`,
`OTP_WHATSAPP_TEMPLATE_LANGUAGE`, `OTP_WHATSAPP_TEMPLATE_TYPE`, `OTP_WHATSAPP_API_VERSION`,
`OTP_HMAC_SECRET`, `OTP_TOKEN_SECRET`, **`OTP_REQUEST_HANDLE_SECRET`** — the last one is new
in Batch 1.1, and without it both anti-enumeration endpoints return
`OTP_REQUEST_HANDLE_SECRET_MISSING`.

**Constraint:** `OTP_HMAC_SECRET`, `OTP_TOKEN_SECRET` and `OTP_REQUEST_HANDLE_SECRET` must
be **pairwise distinct**, or production fails closed with `OTP_SECRETS_MUST_DIFFER`.

**Optional, defaulted:** `OTP_WHATSAPP_TIMEOUT_MS` (1000–60000), `OTP_TTL_SECONDS`,
`OTP_RESEND_SECONDS`, `OTP_MAX_ATTEMPTS`.

**Must not be set in production:** `OTP_PROVIDER=fake` or `test` — rejected with
`OTP_PROVIDER_FORBIDDEN_IN_PRODUCTION`.
