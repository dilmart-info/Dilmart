# STORE-PR3 — Customer Handoff Foundation: Migration & Security Report

> **Task ID:** `DilMart-CUSTOMER-STORE-STORE-PR3` · **PR:** #76 (Draft) · **Branch:** `feat/customer-handoff-foundation`
> **Governing spec:** `DilMart-CUSTOMER-STORE-MASTER-001` (DilMart `docs/customer-store-integration/00_MASTER_IMPLEMENTATION_SPEC.md`)
> **Phase / Gate:** Phase 2 — Store handoff foundation → **Gate 2** (one-time handoff works without mobile UI).
> **Status:** Draft, unmerged. All feature flags default **false** and are **not enabled** in any environment.

This document is the single current source of truth for the STORE-PR3 migrations and security posture.

---

## 1. Scope & boundary

Store-side Customer Handoff **foundation**: handoff + future federated-session migrations, asymmetric assertion
verification, deterministic identity resolution, `POST /integrations/DilMart/customer/handoff/prepare`, one-time
hash-only code storage, an atomic **prepare** finalize, a DB-time single-use **consume**, audit events, and real
PostgreSQL concurrency/replay proof.

**STORE-PR3 issues no federated session and no token.** It inserts **no** rows into
`store_federated_session_families` / `store_federated_refresh_tokens`, and ships **no** redeem-and-issue RPC —
generating a refresh-token _hash_ without the corresponding _raw_ token (which only the backend can mint and
return) would be an unusable orphan row. Final atomic session issuance (consume + session family + refresh-token
hash + audit committing together, returning the raw refresh token from backend memory) is owned entirely by
**STORE-PR4** via `FederatedSessionIssuer.redeemAndIssue(...)`. In PR3 no concrete issuer is bound, so the public
redeem endpoint is disabled and non-consuming, and enabling `STORE_FEDERATED_AUTH_ENABLED` without a complete
issuer (a bound provider exposing a callable `redeemAndIssue`) **fails application startup**.

The existing **Barber** integration (`/integrations/DilMart/session/exchange`, `DilMart_INTEGRATION_SECRET`, HS256
token, `X-Store-Session`, OWNER/BARBER eligibility, barber cart/checkout/orders) is **unchanged** and covered by a
regression suite.

---

## 2. Migrations (6, additive)

| #   | ID                                                                     | Purpose                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `20260805100000_customer_handoff_linked_profiles_ext.sql`              | Extend `store_linked_profiles` with link lifecycle metadata + one-to-one `store_customer_id` (partial UNIQUE, fail-closed dup preflight)                                                                              |
| 2   | `20260805100100_customer_handoff_core.sql`                             | `DilMart_customer_handoffs` (hash-only, single-use) + immutable append-only audit table (audit refs handoff/profile **by value, no FK**)                                                                              |
| 3   | `20260805100200_customer_handoff_session_foundations.sql`              | `store_federated_session_families` + `store_federated_refresh_tokens` — **schema foundations only; PR3 inserts no rows**                                                                                              |
| 4   | `20260805100300_customer_handoff_functions.sql`                        | `redeem_customer_handoff` (atomic single-use consume; DB-clock expiry; one correctly-typed audit per outcome) + eligibility-aware confirmed-identity lookups + ownership-validating shadow recovery                   |
| 5   | `20260805100400_customer_handoff_finalize_and_guards.sql`              | `finalize_customer_handoff` (per-user advisory lock + `FOR UPDATE` in-tx recheck; exact 120s DB-clock expiry; `linked_at` preserved; `request_id` audit; **never mutates a Barber row**) + audit-immutability trigger |
| 6   | `20260805100500_customer_handoff_redeem_issue_and_reserved_domain.sql` | Reserved-domain `auth.users` trigger (INSERT + UPDATE OF email/metadata) + `provision_DilMart_federated_customer` direct-insert RPC. **No redeem-and-issue RPC**                                                      |

All new tables `ENABLE` + `FORCE ROW LEVEL SECURITY`, no anon/authenticated policies → service-role only. Every
SECURITY DEFINER function pins `SET search_path = pg_catalog, public`, `REVOKE`s EXECUTE from PUBLIC/anon/
authenticated, and `GRANT`s EXECUTE to `service_role` only (anon EXECUTE is denied with a real `42501` permission
error, asserted with the complete function signature). Migrations are additive; the preflight fails closed on any
existing duplicate non-NULL `store_customer_id`.

---

## 3. Cryptography & assertion contract

- **Algorithm:** asymmetric — EdDSA/Ed25519 preferred, RS256 permitted. Library: **`jose`** (sole signature +
  time-claim authority; no hand-rolled parsing).
- **Key ring:** env `DilMart_CUSTOMER_HANDOFF_PUBLIC_KEYS_JSON` is a **JSON array** `[{kid, alg, publicKeyPem}, …]`
  (an array — not an object — so **duplicate kids are detected**, since `JSON.parse` silently collapses duplicate
  object keys). Store holds public keys only; none committed; staging/production keys are separate. At boot (when
  enabled) every PEM is imported with `jose.importSPKI` and alg/key-type + kid length/charset validated (a
  malformed key that merely contains the `BEGIN PUBLIC KEY` marker is rejected).
- **Header discipline:** protected `kid` mandatory; `kid` selects exactly one key; configured alg must equal the
  header alg. Rejected: HS256/384/512, `none`, unknown/missing kid, alg/key mismatch, payload-selected alg. The
  customer verifier never calls the Barber HMAC verifier or reuses its secret.
- **Claims:** `iss`/`aud` exact; `sub` UUID; `jti` bounded; `iat`/`nbf`/`exp` present; `exp > nbf`; lifetime
  `≤ 60 s`; bounded clock tolerance; `role = CUSTOMER`; `sourceApp = customer_app`; validated target; bounded
  `sourceSurface`/`campaign`; `clientStateHash` = SHA-256 hex. Verified-phone → canonical E.164 + valid timestamp;
  verified-email → normalized `lower(trim())` + valid timestamp. **Unverified phone/email never drive linking.**

---

## 4. Identity resolution & shadow provisioning

Deterministic, fail-closed order (spec §10.1): existing DilMart link reuse → confirmed phone/email candidates from
authoritative, **customer-compatible** `auth.users` only (admin/merchant/agent/courier/staff/disabled excluded) →
`STORE_IDENTITY_AUTO_LINK_ENABLED` (default **false**, never enabled) makes any confirmed candidate produce
`LINK_REQUIRED` → otherwise provision a new `NEW_FEDERATED` shadow customer. A `BLOCKED`/`REVOKED` or non-CUSTOMER
existing link fails closed.

**Shadow provisioning (task B4).** The internal identifier is **opaque** —
`base64url(HMAC-SHA256(STORE_FEDERATED_ID_SECRET, DilMartUserId))` — and the reserved email is
`DilMart-federated+<federated_id>@federated.DilMart.internal`; **the raw DilMart UUID never appears in the
identifier or email**. Because GoTrue applies admin `app_metadata` _after_ the initial INSERT (so a
BEFORE-INSERT trigger keyed on it would also block the provisioner), the shadow user is created by the SECURITY
DEFINER **direct-insert RPC** `provision_DilMart_federated_customer`, which writes full ownership metadata
(`account_type`, `origin`, `federated_id`, `DilMart_user_id`) **at INSERT time** and an unusable
password computed **inside SQL** (`encode(sha256(…),'hex')` — no raw password is generated, returned, or logged).
A `BEFORE INSERT OR UPDATE OF email/raw_app_meta_data/raw_user_meta_data ON auth.users` trigger then requires,
for any row on the reserved domain, the ownership metadata **and** a `federated_id` matching the email local part
— so public signup / OTP / admin-arbitrary create / email-change to the reserved domain are all rejected, while
the provisioner is permitted. Recovery (`resolve_DilMart_federated_customer`) additionally validates ownership, so
a foreign/public reserved-domain account is a collision and is **never reused/linked**. `isReservedFederatedEmail()`
guards backend-mediated routes as defence in depth.

**Persisted link metadata** is correct per method (`NEW_FEDERATED`→`DilMart_SESSION`, `VERIFIED_PHONE`→`OTP_PHONE`,
`VERIFIED_EMAIL`→`OTP_EMAIL`); `linked_at` is set only on first link and preserved across handoffs; unverified
email is never written into a verified identity field.

---

## 5. Prepare finalize, consume, concurrency, and Barber isolation

- **Atomic prepare finalize.** `finalize_customer_handoff` does link + handoff + `HANDOFF_PREPARED` audit in one
  transaction. It takes a transaction-scoped `pg_advisory_xact_lock` keyed on `DilMart_user_id`, then `SELECT …
FOR UPDATE`s the link and rechecks role/status/ownership; the **locked** `store_customer_id` is what is written
  to the handoff. `expires_at = clock_timestamp() + interval '120 seconds'` (creation and validation both DB-time);
  the code TTL is **exactly 120s** or the RPC raises. The `request_id` is stored on the PREPARED audit (API id ===
  DB id). Unique races map deterministically: `assertion_jti`/`code_hash` → `HANDOFF_INVALID`; `store_customer_id`
  one-to-one → `IDENTITY_BLOCKED` — never a generic 503. Any failure rolls back link + handoff + audit together.
- **Deterministic concurrency (proven, 25 iterations each).** Same DilMart user + same Store customer → both OK, one
  link, two handoffs, two PREPARED audits (a same-customer race is never `HANDOFF_INVALID`). Same user + different
  customers → one OK, one `IDENTITY_BLOCKED`, one link, the winning-customer handoff (no mismatch). Barber
  collision → `IDENTITY_BLOCKED`, Barber row unchanged.
- **Barber isolation (task C3).** A `LINK_REQUIRED`/`BLOCKED` finalize performs **no** UPDATE of
  `store_linked_profiles`; the conflict lives only in the handoff (`identity_outcome`/`status`) and the audit
  (`error_code` + metadata). Proven: a Customer `BLOCKED` finalize leaves a fully-populated Barber row byte-for-byte
  unchanged, and the BLOCKED handoff is created unattached (`linked_profile_id IS NULL`).
- **Atomic single-use consume.** `redeem_customer_handoff` is the DB-time single-use primitive: guarded
  `UPDATE … WHERE redeemed_at IS NULL AND expires_at > clock_timestamp() AND state_hash = $2`; exactly one
  concurrent winner (15×2 proven); state-mismatch/expiry never consume; and it writes exactly one correctly-typed
  audit per outcome (`HANDOFF_REDEEMED` / `HANDOFF_REDEEM_LINK_REQUIRED` / `HANDOFF_REDEEM_BLOCKED`).
- **Audit immutability** is DB-trigger-enforced (`BEFORE UPDATE OR DELETE` rejects all mutation); the audit is
  append-only and references handoff/profile by value (no cascading FK).

---

## 6. Config, rate limiting, errors

- **Strict fail-closed config.** Numerics reject NaN/Infinity/negative/decimal/whitespace/oversize;
  `assertionMaxTtl`∈[1,60], `codeTtl`=exactly 120, `clockTolerance`∈[0,10]; approved hosts non-empty valid;
  `issuer`/`audience`/`codeTtl`/`approvedHosts`/secret whitespace-only fail closed. `STORE_FEDERATED_ID_SECRET`
  must be base64url decoding to **≥32 bytes** (a short human password is rejected).
- **Rate limiting.** Independent per-IP **and** per-device 10/min (neither bypasses the other); keys are hashed and
  length-bounded; the map enforces `maxKeys` **before** inserting a new key (sweep → evict-until-below-cap, so
  `size` never exceeds the cap; an existing key is not evicted). `resolveClientIp(req, trustedHops)` uses an
  **explicit hop count** (never `trust proxy = true`); `main.ts` sets the Express hop count from
  `STORE_TRUSTED_PROXY_HOPS`. **Production gate:** with the feature enabled in staging/production, boot fails unless
  `STORE_HANDOFF_SINGLE_INSTANCE_ACK=true`; a `STORE_HANDOFF_SHARED_LIMITER_URL` is **ignored** and does **not**
  activate production (no distributed limiter is implemented in PR3).
- **Errors** are safe structured `{code, message, requestId, retryable}` (§14.5); no stack/raw DB/constraint/key
  material leaks.

---

## 7. Test evidence (clean local Supabase + CI)

- **Unit — `npm run test:customer-handoff`: 94 pass / 0 fail.**
- **Handoff PostgreSQL — `npm run test:customer-handoff-db`: 39 pass / 0 fail / 0 skipped** (Phase-0 proof;
  migrations/RLS/permissions incl. `42501` anon denial + session-tables-empty + absent redeem-and-issue RPC;
  atomic consume; 15×2 redeem concurrency; finalize metadata/linked_at/DB-time/rollback/exact-TTL/request-id/
  revoked + Barber no-mutation; 25× same-identity / 25× conflicting-identity / 25× Barber-collision finalize
  concurrency; reserved-domain INSERT/UPDATE + ownership provisioning; audit UPDATE/DELETE rejection).
- **Full DB glob — `npm run test:db-integration`: 86 pass / 0 fail / 0 skipped.**
- **Regression — `npm test`: 144 pass; `npm run test:customer-entry`: 45 pass** (PR#71 surface, PR#75
  customer-entry, marketplace public-visibility/category-hierarchy/ViewerContext, cart surface, Barber exchange).
- **Guards & builds:** `arch:guard`, `auth:guard`, frontend build, backend build — pass (CI).

---

## 8. Feature flags & rollback

Backend-authoritative flags, all default **false** and **not enabled** anywhere by this PR:
`STORE_CUSTOMER_HANDOFF_ENABLED`, `STORE_FEDERATED_AUTH_ENABLED`, `STORE_IDENTITY_AUTO_LINK_ENABLED`
(`STORE_CUSTOMER_APP_SURFACE_ENABLED` from STORE-PR2 preserved).

**Fastest rollback:** the flags are false by default. **Do not** drop linked profiles or customer/order data.
Migrations are additive; the session-foundation tables are unused (empty) in PR3. Each migration documents
preflight / forward / postflight / rollback; no data-destructive rollback is required or permitted for linked
identities.
