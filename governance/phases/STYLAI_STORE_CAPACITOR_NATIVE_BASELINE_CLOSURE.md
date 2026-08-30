# Capacitor Native Baseline — Closure / Gate Status

**Date:** 2026-07-26  
**Phase:** DilMart Store — Capacitor Native Baseline Audit (Phase 0 documentation)  
**PR:** #61 (`audit/capacitor8-native-baseline`)  
**Base SHA:** `bd79bae4c0f3a6a7c973a47f4c610667a0dcdf57`  
**Baseline report:** [`DilMart_STORE_CAPACITOR_NATIVE_BASELINE.md`](./DilMart_STORE_CAPACITOR_NATIVE_BASELINE.md)  
**Evidence:** `governance/evidence/capacitor-baseline/`

```text
Phase 0 audit deliverable: COMPLETE
Native iOS baseline outcome: FAIL — CODE/TOOLCHAIN BLOCKER
Required remediation: Phase 1
```

The audit itself is **complete** (Android + iOS executed, evidence retained, first true root cause identified).  
The **native iOS foundation** failed and must be remediated in a **separate Phase 1 PR** — not inside PR #61.

---

## What was implemented

Documentation-only audit of Capacitor Android/iOS native baseline:

- Branch `audit/capacitor8-native-baseline` from required base SHA
- Frontend / backend / Android baseline commands executed and logged
- iOS baseline executed on GitHub-hosted **macos-26** runner (temporary branch; evidence copied into this PR only)
- Gap report with file-linked findings
- No iOS/Android native fixes and no Capacitor dependency bumps in this PR

**Out of scope (unchanged):** dependency updates, Capacitor migrate adoption, Android/iOS fixes, Push/Geolocation/Deep Links, Router/UI, Backend, Supabase migrations, Phase 1 start.

---

## Files in this audit deliverable

- `governance/phases/DilMart_STORE_CAPACITOR_NATIVE_BASELINE.md`
- `governance/phases/DilMart_STORE_CAPACITOR_NATIVE_BASELINE_CLOSURE.md` (this file)
- `governance/evidence/capacitor-baseline/*.txt` (including `40`–`53` iOS runner evidence)
- `governance/CLOSURE_REPORT.md` — **index only** (must preserve Merchant Push and other phase pointers)

Temporary workflow branch `audit/ios-baseline-macos-runner` is **not** part of PR #61 and was deleted after artifact capture.

---

## Validation summary

| Suite                                                                    | Status                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Frontend lint                                                            | FAIL (existing baseline, 462 problems)                           |
| Frontend test                                                            | PASS (1/1)                                                       |
| Frontend build                                                           | PASS                                                             |
| Frontend arch:guard                                                      | PASS                                                             |
| Backend lint                                                             | FAIL (existing baseline, 541 problems)                           |
| Backend build                                                            | PASS                                                             |
| Backend launch-critical / whatsapp-otp / policy / hardening / commercial | PASS                                                             |
| Backend merchant-push                                                    | FAIL (`SUPABASE_SERVICE_ROLE_KEY` missing on Windows audit host) |
| Android `cap sync`                                                       | PASS                                                             |
| Android Gradle on Oracle JDK 21                                          | FAIL (`gradle-daemon-jvm.properties` requires JetBrains vendor)  |
| Android Gradle on Android Studio JBR 21                                  | PASS (`clean`, `assembleDebug`, `bundleRelease`)                 |
| iOS `cap sync` / `pod install`                                           | **FAIL** (deployment target)                                     |
| iOS Simulator Debug                                                      | **FAIL** (exit 65 — no scheme; cascade)                          |
| iOS Generic Release no-sign                                              | **FAIL** (exit 65 — cascade)                                     |
| iOS Archive                                                              | **FAIL** (exit 65 — cascade; **not** signing-only)               |

### CI notes

- CI on latest pre-iOS head `3ee4d4c`: **success** — run [`30194587307`](https://github.com/cylendralabs-blip/DilMart-Store/actions/runs/30194587307)
- CI on iOS-evidence docs head `3658a60`: **success** — run [`30195412099`](https://github.com/cylendralabs-blip/DilMart-Store/actions/runs/30195412099)
- Latest audited head before this finalize micro-patch: `11269e1b8ee58b17dcd98859e54ea5b2914ca679` — **success** — run [`30195636550`](https://github.com/cylendralabs-blip/DilMart-Store/actions/runs/30195636550)
- After this finalize docs push: wait for the new head CI run, then mark Ready if green and docs-only.

### macOS iOS runner

- Run ID: [`30195211313`](https://github.com/cylendralabs-blip/DilMart-Store/actions/runs/30195211313)
- Artifact: `DilMart-store-ios-baseline-30195211313`
- Checkout inside job: `3ee4d4ca12aa0e25c8a1606aa35398b387a03b77`

---

## iOS root cause (first true)

`ios/App/Podfile` sets `platform :ios, '14.0'` while `@capacitor/ios@8.1.0` `Capacitor.podspec` requires `s.ios.deployment_target = '15.0'`.

CocoaPods: dependency found but **required a higher minimum deployment target**.  
Cascade: no schemes → Simulator / Generic Release / Archive all exit 65.

**Not** classified as `PASS WITH SIGNING BLOCKER` because Simulator and Generic Release no-sign did not succeed.  
**Do not fix iOS inside PR #61.**

---

## Android artifact note (signing)

Release AAB was generated successfully. Production signing configuration and actual signing certificate provenance were not verified. This artifact must not be treated as Play-ready.

---

## Decision

```text
Phase 0 audit deliverable: COMPLETE
Native iOS baseline outcome: FAIL — CODE/TOOLCHAIN BLOCKER
Required remediation: Phase 1
```

- Audit documentation + evidence are complete.
- Native foundation remediation belongs in a **separate** Phase 1 PR.
- Do **not** merge without supervisor squash-merge approval.
- Do **not** start Phase 1 or bump Capacitor dependencies in this PR.
