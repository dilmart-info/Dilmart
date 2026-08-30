# Capacitor 8 Native Foundation - Closure

**Date:** 2026-07-26  
**Branch:** `chore/capacitor8-native-foundation`  
**PR:** #62 (Draft - not Ready without supervisor)  
**Base SHA:** `c1b5c3a98e8aa1ad1b0bf765a377f74dc2a7b017`  
**Verified head:** `4ad84dcff562d438bacb3c62c49a3b877514cc5a`  

```text
Implementation status: CODE COMPLETE - SUPERVISOR REVIEW PENDING
Android: PASS
iOS Simulator and Generic Release: PASS
iOS Archive: PASS WITH SIGNING BLOCKER
PR: Draft
```

## Outcome summary

| Gate | Result |
|---|---|
| Capacitor core/cli/android/ios | exact `8.4.2` |
| Plugins | exact Stable Major 8 (`app 8.1.1`, `browser 8.0.4`, `network 8.0.1`, `splash-screen 8.0.2`) |
| CLI location | `devDependencies` |
| `cap migrate` | PARTIAL - exit `4294967295`; remaining checklist completed manually after diff inspection |
| Android min/compile/target | 24 / 36 / 36 |
| Android CI Temurin 21 | PASS - run `30200058584` |
| iOS deployment target | 15.0 |
| `ios/App/Podfile.lock` | **committed** (Pods still ignored) |
| iOS `cap sync` / `pod install` / Simulator / Generic Release no-sign | PASS - run `30200058584` |
| iOS Archive | EXIT `65` Development Team -> classifier **SIGNING-ONLY PASS** -> **PASS WITH SIGNING BLOCKER** |
| Launch Critical CI (Node 22) | PASS - run `30200058581` |

## Archive root cause

`Signing for "App" requires a development team.`  
Classifier allows job success only for signing/provisioning patterns; non-signing Archive failures fail the iOS job.

## Explicit non-goals preserved

No Push, Geolocation, Deep Links, Secure Storage, UI/router, backend/migrations, production keystores, or store submission in this PR.

Evidence: `governance/evidence/capacitor8-native-foundation/`
