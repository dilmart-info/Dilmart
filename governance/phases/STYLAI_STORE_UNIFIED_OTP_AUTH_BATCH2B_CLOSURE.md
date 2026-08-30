# Unified OTP Auth — Batch 2B: Staging Integration and Controlled Smoke

**Outcome: local hardening delivered; staging integration halted at the environment gate.**

No isolated staging environment exists and none could be created from here, so §5 of the
brief applies: stop, do not substitute production, emit a Staging Creation Checklist. Every
downstream section (§6 audit, §7 migration, §8 Render, §9 Supabase, §10 Netlify, §11–§12
smoke) is therefore **BLOCKED**.

**Production was not touched in any way.**

Previous: [`DilMart_STORE_UNIFIED_OTP_AUTH_BATCH2A_CLOSURE.md`](./DilMart_STORE_UNIFIED_OTP_AUTH_BATCH2A_CLOSURE.md)

---

## 1. Identity

| Field              | Value                                                 |
| ------------------ | ----------------------------------------------------- |
| Branch             | `feat/unified-email-whatsapp-otp-auth`                |
| Base SHA           | `1ed17e8d0dba38641fffb2631cd30186bfe34179`            |
| Final SHA          | single commit on this branch                          |
| Evidence ceiling   | **LOCAL CODE VERIFIED** — unchanged, no LEVEL granted |
| Real messages sent | **zero**                                              |

---

## 2. Cache capacity safety

The previous `pruneDeliveries()` evicted the oldest entry regardless of state. Evicting an
`IN_FLIGHT` entry loses the promise a concurrent duplicate is waiting on, which allows a
**second dispatch of the same webhook** — the exact failure the cache exists to prevent.

`reserveCapacity(now)` now runs before any insert:

1. Prune `SUCCEEDED` entries past their TTL. `IN_FLIGHT` is never touched.
2. If still at the cap, evict the **oldest `SUCCEEDED`** only. `Map` preserves insertion
   order, so the first one found is the oldest.
3. If every slot is genuinely in flight, refuse the **new** webhook with
   **`503 SUPABASE_AUTH_HOOK_CAPACITY_EXCEEDED`** — retryable by design. Refusing work
   Supabase can retry is strictly better than silently dropping work already in progress.

| Property                                           | Behaviour                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------ |
| `IN_FLIGHT` eviction                               | **impossible** — no code path deletes one to make room                   |
| Size ceiling                                       | capacity is reserved _before_ insert, so the map never reaches `MAX + 1` |
| Duplicate of an `IN_FLIGHT` entry at full capacity | still resolves — that path awaits the existing promise and never inserts |
| Refusal status                                     | 503, retryable, never a client error                                     |

## 3. Payload digest binding

Each entry carries `sha256(rawBody)`. The raw body itself is **not** stored, so the cache
holds no OTP and no phone number — asserted by a test that serialises the whole map and
searches for both.

| Case                                    | Behaviour                                                                         |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| Same `webhook-id`, same digest          | normal idempotency — awaits or acknowledges, sends nothing extra                  |
| Same `webhook-id`, **different** digest | **`409 SUPABASE_AUTH_HOOK_ID_REUSED_WITH_DIFFERENT_PAYLOAD`**, nothing dispatched |

Neither the digest nor the full webhook-id appears in any log line.

## 4. Hook throttling

`@Throttle({ limit: 30, ttl: 60000 })` was removed. It keyed on IP, and Supabase calls this
endpoint from a small set of shared egress addresses — so it treated **every customer in
the country as one caller** and would have started refusing genuine OTPs as traffic grew.
Supabase's IP is not the user's identity.

Replaced with `@SkipThrottle()` plus a limiter applied **after** signature verification, on
the real subject:

- Key: `HMAC-SHA256(hookSecret, "recipient:" + userId || normalizedPhone)`. HMAC rather
  than a bare hash, so a leaked cache cannot be brute-forced against the small Iraqi mobile
  space. The key is never logged; it would be a stable pseudonym for one person.
- Limits: **3 per minute**, **10 per hour**, per recipient — aligned with a sane resend
  policy rather than trying to be the primary defence.
- Exceeded → `429 SUPABASE_AUTH_HOOK_RECIPIENT_RATE_LIMITED`.
- A **duplicate `webhook-id` consumes no quota** — the idempotent path returns before the
  limiter.
- An **invalid signature never reaches the limiter**, so a forger cannot exhaust somebody
  else's allowance.

What still protects the endpoint: the Standard Webhooks signature over the raw body, the
signed timestamp window, the deduplication cache, the per-recipient limit, the capacity
guard, and Supabase's own upstream OTP issuance limits.

---

## 5. Durable idempotency — design note (not implemented)

**Current status: `STAGING ONLY — IN-MEMORY IDEMPOTENCY`.** The cache is a `Map` in one
process: lost on restart, on crash, on a new Render instance, and not shared across
replicas. A retry landing on another instance **will send a second WhatsApp message**.

Proposed table, for review before production OTP enablement:

```sql
create table public.auth_hook_deliveries (
  webhook_id           text primary key,
  payload_digest       text        not null,
  state                text        not null check (state in ('in_flight','succeeded')),
  provider_message_id  text,
  owner_instance       text        not null,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz,
  expires_at           timestamptz not null
);
```

| Concern                                        | Design                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atomic claim                                   | `insert … on conflict (webhook_id) do nothing returning *`. A row returned means this instance owns the dispatch; no row means someone else already has it. No read-then-write race.                                                                                                                                                                                                                                                                                                            |
| Conflict, same digest                          | `succeeded` → acknowledge 200. `in_flight` → the other instance owns it; return a retryable 503 rather than waiting on a promise that lives in a different process.                                                                                                                                                                                                                                                                                                                             |
| Conflict, different digest                     | 409, exactly as the in-memory version.                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Row ownership                                  | `owner_instance` records the claimer so a stuck `in_flight` row can be attributed and reclaimed.                                                                                                                                                                                                                                                                                                                                                                                                |
| Stuck rows                                     | An `in_flight` row older than the hook timeout plus a margin is reclaimable — that instance can no longer be mid-dispatch, because Supabase abandoned the request long ago.                                                                                                                                                                                                                                                                                                                     |
| RLS                                            | Enable RLS with **no policy** for `anon` or `authenticated`; service role only. The table records delivery metadata for a security flow and must never be readable by a client.                                                                                                                                                                                                                                                                                                                 |
| Cleanup                                        | Reuse the existing `@nestjs/schedule` job surface and `operations_job_runs` bookkeeping. Delete rows past `expires_at`; TTL equal to the current 10 minutes.                                                                                                                                                                                                                                                                                                                                    |
| Multi-instance semantics                       | The primary key is the mutex. Exactly one instance dispatches per `webhook_id`, regardless of replica count.                                                                                                                                                                                                                                                                                                                                                                                    |
| **Crash between Meta acceptance and DB write** | The genuinely hard case. The row stays `in_flight`, and a retry would send a second message. Mitigations, in order of preference: (a) write `provider_message_id` as soon as Meta returns and treat any row holding one as succeeded even if `completed_at` is null; (b) accept one duplicate OTP in this rare window — the user simply receives two codes, both valid against Supabase; (c) reconcile from the delivery-status webhook once it exists. **(a) plus (c) is the recommendation.** |
| Reconciliation                                 | Once the Meta delivery webhook lands, `provider_message_id` becomes the join key, allowing an after-the-fact audit of what was actually sent versus what the table believes.                                                                                                                                                                                                                                                                                                                    |

Not built here: the brief forbids inventing a durable store before the design is reviewed,
and the project has no reusable outbox to extend.

---

## 6. Staging environment gate — HALTED

| Requirement                           | Status                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render Staging service, separate      | **ABSENT** — `render.yaml` declares only `DilMart-store-backend` and `DilMart-store-frontend`; no staging service, no `render` CLI, no `RENDER_API_KEY` |
| Supabase Staging project, separate    | **ABSENT** — `supabase/config.toml` pins one `project_id`; no `supabase` CLI, no service-role key                                                       |
| Netlify Staging or Preview, separate  | **ABSENT** — no `netlify` CLI, no `NETLIFY_AUTH_TOKEN`, no staging context in `netlify.toml`                                                            |
| Meta test/sandbox configuration       | **ABSENT** — no Meta credential in this environment                                                                                                     |
| Staging URLs distinct from production | **ABSENT**                                                                                                                                              |

Per §5: **stopped. Production was not used as a substitute.**

### Staging Creation Checklist

**Render**

1. New web service `DilMart-store-backend-staging` from the same repo and branch.
2. `NODE_ENV=production` — the code's production guards must be exercised, not bypassed.
3. Its own Supabase staging URL and service-role key.
4. Its own four OTP secrets, all pairwise distinct **and different from production**.
5. Record the staging backend URL; the Supabase hook will point at it.

**Supabase** 6. New project, entirely separate from `ztplxqlthuqkuktbznbo`. 7. Apply the full migration chain, then `20260731120000_handle_new_user_phone_only_signup.sql`. 8. Enable Email auth and Phone auth. 9. Email OTP template → `{{ .Token }}`. Recovery template → `{{ .Token }}`. 10. Send SMS HTTP hook → `https://<staging-backend>/api/auth/hooks/supabase/send-sms`, using
the same `SUPABASE_AUTH_HOOK_SECRET` set in Render staging. 11. OTP expiry and resend interval consistent with the 60s UI countdown. 12. `SITE_URL` and redirect URLs pointing at the staging frontend.

**Netlify** 13. Staging site or deploy context with its own domain. 14. `VITE_AUTH_EMAIL_OTP_ENABLED=true`, `VITE_AUTH_PHONE_OTP_ENABLED=true`,
**`VITE_AUTH_PHONE_REGISTRATION_ENABLED=false`**. 15. Staging Supabase URL and anon key. Never production values.

**Meta** 16. A test number or sandbox configuration, and an authentication template approved for it. 17. Record template name, exact language code and type for `OTP_WHATSAPP_TEMPLATE_TYPE`.

**Verification before any smoke** 18. `npm run otp:config-audit` in the Render **staging** shell → `LEVEL 0 — CONFIG SHAPE VALID`. 19. Confirm every staging URL differs from production.

---

## 7. Blocked sections

| Section                    | Status                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| §6 Phone identity audit    | **BLOCKED** — no `ALLOW_PHONE_IDENTITY_AUDIT`, no Supabase credentials. Tool is ready. Counts: **not obtained** |
| §7 Staging migration       | **BLOCKED** — no staging database. Not applied anywhere, production included                                    |
| §8 Render staging config   | **BLOCKED** — no staging service. Level 0 audit: **not run against any deployed environment**                   |
| §9 Supabase staging config | **BLOCKED** — no staging project                                                                                |
| §10 Netlify staging flags  | **BLOCKED** — no staging site                                                                                   |
| §11 Real-send gate         | **`REAL_OTP_SMOKE=BLOCKED`** — see below                                                                        |
| §12 Staging smoke matrix   | **BLOCKED** — nothing to run it against                                                                         |

### Real-send gate

```
REAL_OTP_SMOKE=BLOCKED
```

| Condition                                         | Status                                               |
| ------------------------------------------------- | ---------------------------------------------------- |
| `ALLOW_REAL_WHATSAPP_OTP_TEST=true`               | not set                                              |
| `OTP_TEST_PHONE_E164` supplied externally         | not supplied                                         |
| `TEST_EMAIL` supplied externally                  | not supplied                                         |
| Explicit supervisor authorization in this session | **not given** — the required sentence was not stated |
| Destination owners consented                      | not obtained                                         |
| Render audit passed                               | not run                                              |
| Meta template approved                            | unverified                                           |
| Staging migration passed                          | not applied                                          |
| Staging hook configured                           | not configured                                       |

**Nine of nine unmet. No email and no WhatsApp message was sent.** No number was taken from
the database, from orders or from profiles.

### Evidence levels

| Level                                     | Status                                                    |
| ----------------------------------------- | --------------------------------------------------------- |
| 0 — config shape valid                    | **not established** in any deployed environment           |
| 1 — Meta API called                       | NOT REACHED                                               |
| 2 — `wamid` returned                      | NOT REACHED                                               |
| 3 — webhook `sent`                        | **structurally unreachable — no delivery webhook exists** |
| 4 — webhook `delivered`                   | **structurally unreachable**                              |
| 5 — user received and session established | NOT REACHED                                               |

**Phone registration stays `false` regardless.** Per §6 of the brief, even a clean audit
does not enable it without a fresh supervisor decision.

---

## 8. Files changed

| File                                            | Change                                                                                                                             |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `supabase-auth-hook.service.ts`                 | `reserveCapacity` with IN_FLIGHT protection; payload digest on every entry; per-recipient limiter; `user.id` read from the payload |
| `supabase-auth-hook.controller.ts`              | `@Throttle` → `@SkipThrottle()`, with the reasoning recorded                                                                       |
| `tests/supabase-auth-hook-capacity.test.mjs`    | **new** — 17 tests                                                                                                                 |
| `tests/supabase-auth-hook-reliability.test.mjs` | cap test now uses distinct recipients, so it tests the cache bound rather than tripping the new limiter                            |
| `package.json`                                  | `test:auth-hook` includes the new file                                                                                             |
| `governance/…`                                  | this report, `CURRENT_PHASE.md`, closure index                                                                                     |

No dependency added. No UI, feature flag, Account Claim, legacy reset endpoint or migration
change. No frontend file touched.

---

## 9. Tests

**Backend 146 pass / 0 fail** (was 129).

| Suite                   | Count                                                                   |
| ----------------------- | ----------------------------------------------------------------------- |
| `test:auth-hook`        | **63** (18 hook + 24 reliability + 17 capacity + 4 identifier contract) |
| `test:whatsapp-otp`     | 49                                                                      |
| `test:otp-config-audit` | 8                                                                       |
| `test:launch-critical`  | 26                                                                      |

Capacity and throttling coverage, at real cap size rather than a token sample: 2000
`SUCCEEDED` then a new webhook; 2000 `IN_FLIGHT` then a new webhook; a duplicate of an
`IN_FLIGHT` entry at full capacity; no `IN_FLIGHT` eviction; mixed cache evicts only
completed entries; expired entries reclaimed before refusal; size never exceeds the cap;
same id + same body idempotent; same id + different body refused; the cache holds no OTP,
phone or raw body; 31 distinct recipients unaffected by a shared caller; one recipient
exceeding per-minute refused; a second recipient unaffected; duplicates consume no quota;
an hourly ceiling; an invalid signature never enters the limiter; no phone, recipient key
or OTP in logs; the controller skips the IP throttle.

**Frontend 169 pass / 0 fail** — unchanged, as expected for a backend-only batch.

| Check                                                                   | Result                             |
| ----------------------------------------------------------------------- | ---------------------------------- |
| `auth:guard` · `arch:guard` · `mobile:boundary` · `native:assets:check` | PASS                               |
| `build` · `build:mobile` · backend build                                | ok                                 |
| `web:production-smoke`                                                  | PASS — 3 routes, **0 exceptions**  |
| `lint`                                                                  | 458 problems — unchanged, zero new |
| `cap sync android` + `gradlew assembleDebug`                            | **BUILD SUCCESSFUL**               |
| `git diff --check`                                                      | clean                              |

**APK:** `android/app/build/outputs/apk/debug/app-debug.apk` — 12,943,914 B, byte-identical
to Batch 2A.1 because this batch changes no frontend code.

---

## 10. Remaining production blockers

1. **No isolated staging environment.** Nothing below can begin until the checklist in §6
   is completed.
2. **Durable idempotency store** — design note above, still P0 before production OTP
   enablement.
3. Supabase phone auth, `{{ .Token }}` templates and the Send SMS hook: not enabled anywhere.
4. `SUPABASE_AUTH_HOOK_SECRET`, `SUPABASE_AUTH_HOOK_TIMEOUT_MS`, `OTP_REQUEST_HANDLE_SECRET`
   not provisioned anywhere.
5. Production `OTP_PROVIDER` and the WhatsApp variables still unverified.
6. Meta template category, approval, language and type still unverified.
7. Phone identity alignment unmeasured — phone registration stays off.
8. Profile trigger migration unapplied, so phone-only signup would still fail.
9. No delivery webhook → evidence levels 3–4 structurally unreachable.
10. Batch 1.1 timing mitigation still temporary; the async outbox remains the end state.

---

## 11. Rollback

`git revert` of this single commit restores the previous cache behaviour and the IP
throttle. Backend-only, additive, no data written, no migration applied, no external system
touched — so a revert carries no operational risk and does not need a coordinated frontend
change.

---

## 12. Production untouched — confirmation

No deploy was performed. No Render, Supabase, Netlify or Meta setting was read or written.
No migration was applied to any environment. No production feature flag was changed. Phone
registration remains disabled. Legacy password-reset endpoints remain in place. Account
Claim architecture is unchanged. No force push, no merge, no PR.

The only outbound network activity in this session was `npm` package resolution.
