# Customer Mobile Boundary — Closure

**Date:** 2026-07-26  
**Branch:** `feat/customer-mobile-boundary`  
**Base SHA:** `b2b4cf170948df80b765d536b28fe67788219bd4`  
**Status:** CODE + ANDROID CI-ARTIFACT DEVICE VALIDATION COMPLETE  
**SUPERVISOR REVIEW PENDING**

```text
CORS_PREFLIGHT=PASS
ANDROID_CI_APK_SHA256=2CE7D4326DB821525578ADB6B394A952BE4C062A9F7A7EBF8D9D32C2B65AA045
INSTALLED_APK_SHA256=2CE7D4326DB821525578ADB6B394A952BE4C062A9F7A7EBF8D9D32C2B65AA045
ANDROID_SMOKE_PASS=30
ANDROID_SMOKE_FAIL=0
ANDROID_SMOKE_BLOCKED=0
ANDROID_SMOKE_NOT_RUN=0
NATIVE_MERCHANT_ENTRY_COUNT=0
TEST_ACCOUNT_CLEANUP=PASS
HEAD_SHA_FOR_APK=9a85181b759cfaa285455124cc3b465edc2d6663
NATIVE_CI=30213607718
LAUNCH_CI=30213607696

Web build: PASS
Mobile build: PASS
Boundary: FORBIDDEN_MODULE_COUNT=0
Web backoffice preserved: PASS
CI Android/iOS Native: PASS
iOS real device: DEVICE VALIDATION BLOCKED — APPLE SIGNING
```

## What changed

- Separate Vite mobile entry (`src/main.mobile.tsx` + `vite.mobile.config.ts` → `dist-mobile`)
- Capacitor `webDir` → `dist-mobile`
- Customer vs WebBackoffice route modules; split guards
- Shared `getCustomerMobileRouteElements()` for app + forbidden-route tests
- Rollup + manifest boundary guard (`npm run mobile:boundary`)
- Native CI uses `build:mobile` + boundary + APK/AAB artifacts; path filters cover `src/**` / `public/**`
- Native CI bakes clean production Vite env
- Fix: Capacitor back-button listener cleanup uses `handle.remove()` (prevents `d is not a function` on navigation)
- BottomNav / Footer / IconNav hide merchant entry points on native (`isNative()`; not CSS-hidden)
- Footer + native chrome boundary tests; strengthened forbidden-route entry-anchor checks
- Render `FRONTEND_ORIGINS` includes `https://localhost` (ops)
- Smoke test accounts cleaned (`TEST_ACCOUNT_CLEANUP=PASS`)
## Explicit non-goals preserved

No Push, Deep Links, Geolocation, Secure Storage, Apple Team, production signing. No Ready/merge without supervisor.

Evidence: `governance/evidence/customer-mobile-boundary/`
