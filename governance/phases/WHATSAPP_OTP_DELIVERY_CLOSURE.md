# WhatsApp OTP Delivery Integration — Closure Report

**Date:** 2026-07-26  
**Branch:** `feat/whatsapp-otp-delivery`  
**Status:** CODE COMPLETE — SUPERVISOR REVIEW PENDING (security micro-fix applied)

### Supervisor micro-patch (post `dac16f4`)

- Default `OTP_PROVIDER=disabled` (no silent fake success)
- `fake/test` forbidden in production
- Strict WhatsApp config (no unknown template-type fallback)
- Anti-enumeration on password-reset/request + account-claim/recover
- Meta acceptance wording (`accepted` / `providerAcceptedMessageId`)
- Production requires distinct `OTP_HMAC_SECRET` + `OTP_TOKEN_SECRET`
- `PasswordRecoveryService` also fails closed when `OTP_TOKEN_SECRET` missing in production
- Challenge cleanup: expire → delete fallback on failure
- Real `PasswordRecoveryService` / `AccountClaimService` tests

### Validation

`npm run test:whatsapp-otp` → **22 pass / 0 fail** (local + CI target)

- Ported Meta Cloud API WhatsApp OTP provider from DilMart-main (delivery only).
- `OtpDeliveryService` now uses `ConfigService`:
  - `OTP_PROVIDER=fake|test` → no HTTP
  - `OTP_PROVIDER=whatsapp` → Meta request only
- Send-time phone conversion `07XXXXXXXXX` → `+9647XXXXXXXXX` (DB storage unchanged).
- Missing WhatsApp config fails clearly (no fake success).
- Delivery failure expires the OTP challenge (`status=expired`) so it is not left active.
- `.env.example` documents OTP env vars without real secrets.
- Tests: `npm run test:whatsapp-otp` (also wired in CI).

## Explicit non-goals confirmed

- No Phone OTP Login
- No SMS fallback / adaptive routing
- No Checkout / orders / provisional account changes
- No secrets in git / frontend / DB
- No Render / Production apply in this PR

## Validation

```bash
cd backend && npm run build && npm run test:whatsapp-otp
# 13 pass / 0 fail
```

## Ops after merge (blocked until supervisor approves)

1. Set Staging env: `OTP_PROVIDER=whatsapp` + Meta WABA vars
2. Keep Production on `OTP_PROVIDER=fake` until Staging smoke passes
3. Never commit access tokens
