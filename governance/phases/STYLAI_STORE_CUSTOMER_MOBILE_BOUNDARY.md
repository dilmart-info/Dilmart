# DilMart Store — Customer Mobile Boundary & Android Real-Device Baseline

**Phase:** Customer Mobile Boundary & Android Real-Device Baseline  
**Branch:** `feat/customer-mobile-boundary`  
**Base SHA:** `b2b4cf170948df80b765d536b28fe67788219bd4`  
**Status:** CODE + ANDROID CI-ARTIFACT DEVICE VALIDATION COMPLETE  
**SUPERVISOR REVIEW PENDING**  
**Evidence:** `governance/evidence/customer-mobile-boundary/`  
**Closure:** `governance/phases/DilMart_STORE_CUSTOMER_MOBILE_BOUNDARY_CLOSURE.md`

## Device validation notes

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
CI ARTIFACT DEVICE VALIDATION: PASS
```

## Objective

Ship a Capacitor customer-only Vite entry (`src/main.mobile.tsx` → `dist-mobile`) while preserving the full Web SPA (`dist`) including Admin/Merchant/Agent.

## Targets

| Area               | Target                                                 |
| ------------------ | ------------------------------------------------------ |
| Web build          | `npm run build` → `dist/` (backoffice preserved)       |
| Mobile build       | `npm run build:mobile` → `dist-mobile/`                |
| Capacitor `webDir` | `dist-mobile`                                          |
| Boundary guard     | `npm run mobile:boundary` → `FORBIDDEN_MODULE_COUNT=0` |
| Native CI          | `build:mobile` + boundary + Android/iOS Phase-1 gates  |
| Android device     | Physical smoke matrix documented                       |
| iOS device         | `DEVICE VALIDATION BLOCKED — APPLE SIGNING`            |

## Explicit non-goals

Push, Deep Links, Geolocation, Secure Storage, production signing, Apple Team, backend/migrations, UI redesign.
