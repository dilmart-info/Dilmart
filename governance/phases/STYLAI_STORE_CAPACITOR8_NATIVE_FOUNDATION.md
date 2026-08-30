# DilMart Store - Capacitor 8 Native Foundation

**Phase:** Capacitor 8 Native Foundation  
**Branch:** `chore/capacitor8-native-foundation`  
**Base SHA:** `c1b5c3a98e8aa1ad1b0bf765a377f74dc2a7b017`  
**Status:** CODE COMPLETE - SUPERVISOR REVIEW PENDING (Draft PR #62; Archive = PASS WITH SIGNING BLOCKER)  
**Evidence:** `governance/evidence/capacitor8-native-foundation/`  
**Closure:** `governance/phases/DilMart_STORE_CAPACITOR8_NATIVE_FOUNDATION_CLOSURE.md`  
**Verified head:** `4ad84dcff562d438bacb3c62c49a3b877514cc5a`  
**Native CI:** `30200058584` · **Launch Critical CI:** `30200058581`

## Objective

Align Android and iOS with Capacitor 8 and prove reproducible native builds (Debug APK, Release AAB, iOS Simulator + Generic Release no-sign).

## Targets

| Area                                        | Target                                   |
| ------------------------------------------- | ---------------------------------------- |
| Capacitor core/cli/android/ios              | exact `8.4.2`                            |
| Plugins (app/browser/network/splash-screen) | Stable Major 8, exact pins               |
| Node (CI)                                   | 22                                       |
| Android                                     | minSdk 24 / compileSdk 36 / targetSdk 36 |
| Android AGP                                 | keep `8.13.2`                            |
| Gradle Wrapper                              | `8.14.3`                                 |
| iOS deployment target                       | `15.0`                                   |
| `allowMixedContent`                         | `false`                                  |
| `allowBackup`                               | `false`                                  |
| App display name                            | `DilMart Store`                          |
| `appId`                                     | unchanged `com.DilMart.store`            |

## Explicit non-goals

Push, Geolocation, Deep Links, Secure Storage, account deletion, Admin/Merchant bundle split, UI/router, backend/migrations, production signing/submission.

## Progress log

See evidence files and closure report when the phase completes.

### Implementation notes (local)

#### Capacitor packages (exact)

- `@capacitor/core` / `cli` / `android` / `ios` = `8.4.2`
- `@capacitor/app` = `8.1.1`
- `@capacitor/browser` = `8.0.4`
- `@capacitor/network` = `8.0.1`
- `@capacitor/splash-screen` = `8.0.2`
- CLI moved to `devDependencies`

#### `cap migrate`

Partially completed, then exited abnormally with code 4294967295 after the mono-repo advisory. The resulting diff was inspected and the remaining foundation checklist was completed manually.

#### Android

- `variables.gradle` targets applied (min 24 / compile 36 / target 36 + AndroidX pins)
- AGP kept `8.13.2`; google-services `4.4.4`; Gradle Wrapper `8.14.3`
- Deleted `gradle-daemon-jvm.properties` (JetBrains vendor lock removed)
- Kotlin `1.8.22` force removed; no Kotlin sources -> no Kotlin plugin added
- Manifest `allowBackup=false`; `density` added to `configChanges`
- Display name `DilMart Store`
- Local builds **PASS** on JDK 21 and Android Studio JBR 21

#### iOS

- Podfile + pbxproj deployment target `15.0`
- Display name `DilMart Store`
- `ios/App/Podfile.lock` committed from macOS CI artifact (Pods still ignored)
- Native CI run `30200058584`: `cap sync` / `pod install` / App scheme / Simulator Debug / Generic Release no-sign = **PASS**
- Archive attempt: **EXIT 65** - `Signing for "App" requires a development team`
- Archive classifier: **SIGNING-ONLY PASS** -> overall **PASS WITH SIGNING BLOCKER**

#### CI

- Existing workflow Node `22` - Launch Critical run `30200058581` **PASS**
- `native-foundation.yml` Android + iOS jobs **PASS** - run `30200058584` (includes Podfile.lock upload + Archive classifier gate)
