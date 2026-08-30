# DilMart Store — Capacitor Native Baseline Audit

**Task class:** E — Launch Closure / Production Hardening (documentation only)  
**Repository:** `cylendralabs-blip/DilMart-Store`  
**Branch:** `audit/capacitor8-native-baseline`  
**Base SHA:** `bd79bae4c0f3a6a7c973a47f4c610667a0dcdf57`  
**Base commit message:** `Merge pull request #60 from cylendralabs-blip/feat/whatsapp-otp-delivery`  
**Audit date:** 2026-07-26  
**Audit host OS:** Windows 10 (NT 10.0.19045)

**Scope rule:** Documentation only. No dependency updates, no Capacitor migrate adoption, no Android/iOS fixes, no Push/Geolocation/Deep Links, no Router/UI/Backend/migration changes.

**Evidence directory:** `governance/evidence/capacitor-baseline/`  
(`.log` is gitignored in this repo; command transcripts are stored as `.txt`.)

---

## DoD status (this PR)

**Phase 0 iOS classification:** **FAIL — CODE/TOOLCHAIN BLOCKER**  
**PR status:** Draft — technically mergeable, but not approved for merge  
**Closure file:** [`DilMart_STORE_CAPACITOR_NATIVE_BASELINE_CLOSURE.md`](./DilMart_STORE_CAPACITOR_NATIVE_BASELINE_CLOSURE.md)  
**Index:** [`governance/CLOSURE_REPORT.md`](../CLOSURE_REPORT.md) (historical index — does not replace Merchant Push closure)

| Requirement                                 | Status                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Frontend baseline documented                | PASS                                                                                                      |
| Backend regression baseline documented      | PASS (with documented failures)                                                                           |
| Android Debug + Release status documented   | PASS (with toolchain caveat; signing provenance **unverified**)                                           |
| iOS Simulator + Archive status documented   | **EXECUTED on GitHub `macos-26`** — result **FAIL — CODE/TOOLCHAIN BLOCKER** (not a signing-only failure) |
| Versions / permissions / plugins documented | PASS                                                                                                      |
| Failures tied to files/settings             | PASS                                                                                                      |
| No fix/feature changes in PR                | PASS                                                                                                      |
| Ready for Review / merge                    | **NO** — Draft only; supervisor approval required; do not start Phase 1 here                              |

> iOS evidence produced via temporary GitHub-hosted macOS runner (run `30195211313`), then copied into this documentation-only PR. Temporary workflow branch is deleted after artifact capture and is **not** part of PR #61.

---

## 1. Source & environment

| Item                                           | Value                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Base SHA                                       | `bd79bae4c0f3a6a7c973a47f4c610667a0dcdf57`                                                   |
| OS                                             | Microsoft Windows NT 10.0.19045.0 (`Windows_NT`)                                             |
| Node                                           | `v22.22.3`                                                                                   |
| npm                                            | `11.17.0`                                                                                    |
| Java (PATH default)                            | Oracle JDK `25.0.3`                                                                          |
| `JAVA_HOME` (machine)                          | `C:\Program Files\Java\jdk-21.0.11` (Oracle `21.0.11`)                                       |
| Android Studio                                 | `2026.1.1` — build `AI-261.23567.138.2611.15646644`                                          |
| Android Studio JBR                             | `C:\Program Files\Android\Android Studio\jbr` — OpenJDK `21.0.10`, vendor `JetBrains s.r.o.` |
| Gradle Wrapper                                 | `8.13` (`android/gradle/wrapper/gradle-wrapper.properties`)                                  |
| AGP                                            | `8.13.2` (`android/build.gradle` classpath `com.android.tools.build:gradle:8.13.2`)          |
| Xcode                                          | **NOT INSTALLED** (Windows)                                                                  |
| CocoaPods                                      | **NOT INSTALLED** (Windows)                                                                  |
| Capacitor CLI (`npx @capacitor/cli --version`) | `7.5.0`                                                                                      |

### Capacitor packages (resolved via `npm ls --depth=0`)

| Package                    | Installed |
| -------------------------- | --------- |
| `@capacitor/android`       | `8.1.0`   |
| `@capacitor/app`           | `8.0.1`   |
| `@capacitor/browser`       | `8.0.1`   |
| `@capacitor/cli`           | `7.5.0`   |
| `@capacitor/core`          | `8.1.0`   |
| `@capacitor/ios`           | `8.1.0`   |
| `@capacitor/network`       | `8.0.1`   |
| `@capacitor/splash-screen` | `8.0.1`   |
| `@capacitor/assets` (dev)  | `3.0.5`   |

**Critical mismatch:** CLI is Capacitor **7.5.0** while core/android/ios/plugins are Capacitor **8.x**. `npx cap doctor` reports latest as `8.4.2` and flags CLI skew.

Evidence: `00-environment.txt`, `00-capacitor-packages.txt`, `06-cap-doctor.txt`.

---

## 2. Frontend results

| Command              | Exit | Result                                                                                                    |
| -------------------- | ---- | --------------------------------------------------------------------------------------------------------- |
| `npm ci`             | 0    | PASS — 934 packages; deprecation warnings (whatwg-encoding, q, inflight, rimraf, glob, xmldom, tar, etc.) |
| `npm run lint`       | 1    | FAIL — **462 problems (453 errors, 9 warnings)**                                                          |
| `npm test`           | 0    | PASS — Vitest 1 file / 1 test                                                                             |
| `npm run build`      | 0    | PASS — Vite built in ~14.9s                                                                               |
| `npm run arch:guard` | 0    | PASS — 0 temporary baseline violations                                                                    |
| `npx cap doctor`     | 1    | FAIL — Android OK; **Xcode is not installed**                                                             |

Evidence: `01`–`08` under `governance/evidence/capacitor-baseline/`.

### dist size & largest JS chunks

| Metric            | Value                           |
| ----------------- | ------------------------------- |
| `dist` total size | **7.69 MB** (`8,065,606` bytes) |

Largest JS chunks (from `07-dist-analysis.txt`):

| Size     | Chunk                                 |
| -------- | ------------------------------------- |
| 952.2 KB | `assets/vendor-ixgCorFR.js`           |
| 240.3 KB | `assets/index-CESq-sFx.js`            |
| 154.2 KB | `assets/vendor-react-D9Ie8oh4.js`     |
| 103.2 KB | `assets/vendor-radix-B66HTNTV.js`     |
| 54.9 KB  | `assets/OrderDetail-Dy1i4XCB.js`      |
| 36.5 KB  | `assets/ProductForm-DEZLI0K5.js`      |
| 26.9 KB  | `assets/JenniIntegration-BoB3pULm.js` |
| 24.2 KB  | `assets/MerchantLayout-SZYG7_ap.js`   |
| 19.4 KB  | `assets/OrderDetail-BqUk9h6U.js`      |
| 16.7 KB  | `assets/Dashboard-BkaCbee5.js`        |

Build warnings:

- Browserslist: caniuse-lite is 13 months old (advisory only).
- Large vendor chunk (~972 KB / gzip ~267 KB) — within `chunkSizeWarningLimit: 2000` in `vite.config.ts`.

### Admin / Merchant chunks in mobile `dist`?

**YES — present.** Same Vite `dist` is copied into Android assets via `cap sync`.

| Area     | Present? | Examples                                                                                                                               |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Admin    | YES      | `assets/AdminLayout-CoQsQgR5.js` (+ admin route chunks: Executive, Delivery, Finance\*, Merchants, etc.)                               |
| Merchant | YES      | `MerchantLayout-SZYG7_ap.js`, `MerchantDetail-BKXnc5pS.js`, `merchant-push-Dn7-CiAM.js`, `use-current-merchant-Bzm8xIvv.js`, plus more |

`vite.config.ts` explicitly avoids excluding admin/merchant from the bundle (`manualChunks` comment: let Rollup split via `React.lazy()`). Mobile shell therefore ships admin/merchant JS.

### Frontend lint root themes (existing baseline)

Dominant rule: `@typescript-eslint/no-explicit-any` across many `src/` files. Also:

- `react-refresh/only-export-components` warnings
- `@typescript-eslint/no-empty-object-type`
- occasional `react-hooks/exhaustive-deps`

Full transcript: `02-frontend-lint.txt`.

---

## 3. Backend regression baseline

Working directory: `backend/`

| Command                        | Exit | Result                                           |
| ------------------------------ | ---- | ------------------------------------------------ |
| `npm ci`                       | 0    | PASS                                             |
| `npm run lint`                 | 1    | FAIL — **541 problems (539 errors, 2 warnings)** |
| `npm run build`                | 0    | PASS (`nest build`)                              |
| `npm run test:launch-critical` | 0    | PASS — 26/26                                     |
| `npm run test:merchant-push`   | 1    | FAIL — env/config (see root cause)               |
| `npm run test:whatsapp-otp`    | 0    | PASS — 22/22                                     |
| `npm run test:policy`          | 0    | PASS — 23/23                                     |
| `npm run test:hardening`       | 0    | PASS — 39/39                                     |
| `npm run test:commercial`      | 0    | PASS — 6/6                                       |

Evidence: `10`–`19` under `governance/evidence/capacitor-baseline/`.

### Backend failures (documented, not fixed)

1. **Lint (existing baseline)**
   - Mostly `@typescript-eslint/no-explicit-any` across services/controllers.
   - Also `@typescript-eslint/no-require-imports` in `backend/src/main.ts:9` and `backend/src/modules/merchants/merchant-push.service.ts:88`.
   - Full list: `11-backend-lint.txt`.

2. **`test:merchant-push` root cause**
   - File: `backend/tests/merchant-push-alerts.test.mjs` line **20**
   - Current: throws `Error: SUPABASE_SERVICE_ROLE_KEY is required` when env var missing.
   - Required for this suite: real/local env with `SUPABASE_SERVICE_ROLE_KEY`.
   - Classification: **Environment blocker**, not a code regression introduced by this audit.

---

## 4. Android baseline

### Commands

| Command                           | Exit (default Oracle JDK 21 via `JAVA_HOME`) | Exit (supplemental: Android Studio JBR) |
| --------------------------------- | -------------------------------------------- | --------------------------------------- |
| `npm run build`                   | 0                                            | (same)                                  |
| `npx cap sync android`            | 0                                            | (same)                                  |
| `cd android && gradlew.bat clean` | **1**                                        | **0**                                   |
| `gradlew.bat assembleDebug`       | **1**                                        | **0**                                   |
| `gradlew.bat bundleRelease`       | **1**                                        | **0**                                   |

Evidence: `21`–`28`, plus `23b` / `24c` / `25b` for JBR success path.

### Root cause of primary Gradle failure

- **File:** `android/gradle/gradle-daemon-jvm.properties`
- **Settings:** `toolchainVendor=jetbrains`, `toolchainVersion=21`
- **Current behavior:** Gradle Daemon JVM discovery requires JetBrains vendor JDK 21. Oracle JDK 21 at `JAVA_HOME` is rejected. Auto-download fails on Windows x86_64 (`No defined toolchain download url`).
- **Required:** JetBrains Runtime 21 (e.g. Android Studio JBR) on PATH/`JAVA_HOME`, **or** Phase-1 change to daemon JVM criteria (out of scope here).
- **Severity:** P0 for CI/agents that only have Oracle/Temurin JDK.
- **Phase:** Phase 1 (native toolchain hardening).

With Android Studio JBR (`java.vendor=JetBrains s.r.o.`), builds succeeded **without repo edits**.

### Artifacts (JBR success path)

| Artifact    | Size         | Path (local only — **not committed**)                      |
| ----------- | ------------ | ---------------------------------------------------------- |
| Debug APK   | **11.76 MB** | `android/app/build/outputs/apk/debug/app-debug.apk`        |
| Release AAB | **10.21 MB** | `android/app/build/outputs/bundle/release/app-release.aab` |

### SDK / toolchain versions (from project files)

| Setting                         | Value      | Source                                            |
| ------------------------------- | ---------- | ------------------------------------------------- |
| minSdk                          | **23**     | `android/variables.gradle`                        |
| compileSdk                      | **36**     | `android/variables.gradle`                        |
| targetSdk                       | **35**     | `android/variables.gradle`                        |
| AGP                             | **8.13.2** | `android/build.gradle`                            |
| Gradle Wrapper                  | **8.13**   | `gradle-wrapper.properties`                       |
| Java compile target (Capacitor) | **21**     | `android/app/capacitor.build.gradle`              |
| Kotlin stdlib force             | **1.8.22** | `android/build.gradle` `resolutionStrategy.force` |
| AndroidX Activity               | `1.9.2`    | `variables.gradle`                                |
| AndroidX AppCompat              | `1.7.0`    | `variables.gradle`                                |
| AndroidX CoordinatorLayout      | `1.2.0`    | `variables.gradle`                                |
| AndroidX Core                   | `1.15.0`   | `variables.gradle`                                |
| AndroidX Fragment               | `1.8.4`    | `variables.gradle`                                |
| AndroidX WebKit                 | `1.12.1`   | `variables.gradle`                                |
| Core SplashScreen               | `1.0.1`    | `variables.gradle`                                |

### Permissions

From `android/app/src/main/AndroidManifest.xml`:

- `android.permission.INTERNET` only.

### Manifest intent filters

- LAUNCHER only on `.MainActivity`:
  - `android.intent.action.MAIN`
  - `android.intent.category.LAUNCHER`
- No deep-link / App Links intent filters.

### Backup / mixed content

| Setting             | Current    | Source                                                                                                                      |
| ------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| `allowBackup`       | **`true`** | `AndroidManifest.xml` `<application android:allowBackup="true">`                                                            |
| `allowMixedContent` | **`true`** | `capacitor.config.ts` → `android.allowMixedContent: true` (synced into `android/app/src/main/assets/capacitor.config.json`) |

### Native plugins registered

From sync + `android/app/src/main/assets/capacitor.plugins.json` + `capacitor.settings.gradle`:

| Package                          | Android class                                             |
| -------------------------------- | --------------------------------------------------------- |
| `@capacitor/app@8.0.1`           | `com.capacitorjs.plugins.app.AppPlugin`                   |
| `@capacitor/browser@8.0.1`       | `com.capacitorjs.plugins.browser.BrowserPlugin`           |
| `@capacitor/network@8.0.1`       | `com.capacitorjs.plugins.network.NetworkPlugin`           |
| `@capacitor/splash-screen@8.0.1` | `com.capacitorjs.plugins.splashscreen.SplashScreenPlugin` |

### Android identity / naming

| Field                     | Value                 | Source                                        |
| ------------------------- | --------------------- | --------------------------------------------- |
| applicationId / namespace | `com.DilMart.store`   | `android/app/build.gradle`                    |
| versionCode / versionName | `1` / `1.0`           | `android/app/build.gradle`                    |
| Display name (resources)  | `DilMart متجر`        | `android/app/src/main/res/values/strings.xml` |
| Capacitor `appName`       | `DilMart-store Store` | `capacitor.config.ts`                         |

### Android environment findings

- `android/local.properties` points to `sdk.dir=C:\\Users\\Venera\\AppData\\Local\\Android\\Sdk` (foreign machine path). Build warned: directory does not exist; build still succeeded via other SDK discovery. File is local/VCS-ignored pattern in Capacitor templates — do not commit secrets.
- No release `signingConfig` / keystore block is present in `android/app/build.gradle` (expected that Play/CI secrets stay out of Git). Evidence shows `bundleRelease` succeeded, an AAB was produced, and Gradle ran `signReleaseBundle`. **Certificate type / provenance was not inspected.**
- **Signing statement (required wording):** Release AAB was generated successfully. Production signing configuration and actual signing certificate provenance were not verified. This artifact must not be treated as Play-ready.
- Gradle deprecation: features incompatible with Gradle 9.0; `flatDir` warning on Capacitor Cordova plugins module.

---

## 5. iOS baseline — **FAIL — CODE/TOOLCHAIN BLOCKER**

**Execution method:** GitHub-hosted `macos-26` runner via temporary branch `audit/ios-baseline-macos-runner` (workflow not retained in PR #61).  
**Source checkout inside job:** `3ee4d4ca12aa0e25c8a1606aa35398b387a03b77`  
**macOS Run ID:** [`30195211313`](https://github.com/cylendralabs-blip/DilMart-Store/actions/runs/30195211313)  
**Artifact:** `DilMart-store-ios-baseline-30195211313`  
**Provenance:** `53-ios-macos-runner-provenance.txt`

### Environment (runner)

| Item       | Value                                                   | Evidence                 |
| ---------- | ------------------------------------------------------- | ------------------------ |
| Runner     | macOS ARM64 (`macos-26`)                                | `40-ios-environment.txt` |
| macOS      | ProductVersion **26.4** (Build 25E246)                  | same                     |
| Xcode      | **26.5** (Build 17F42) — `/Applications/Xcode_26.5.app` | same                     |
| CocoaPods  | **1.17.0**                                              | same                     |
| Ruby       | 3.4.10                                                  | same                     |
| Node / npm | v22.23.1 / 10.9.8                                       | same                     |

### Command results

| Step                                        | Exit   | Result                                                                                       | Evidence                                  |
| ------------------------------------------- | ------ | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `npm ci`                                    | 0      | PASS                                                                                         | `41-ios-npm-ci.txt`                       |
| `npm run build`                             | 0      | PASS                                                                                         | `42-ios-web-build.txt`                    |
| `npx cap doctor`                            | 1      | WARN/FAIL (Android assets missing on clean checkout; **iOS looking great** in doctor output) | `43-ios-cap-doctor.txt`                   |
| `npx cap sync ios`                          | **1**  | **FAIL** — `pod install` during update                                                       | `44-ios-cap-sync.txt`                     |
| `pod install --repo-update`                 | **1**  | **FAIL** — deployment target incompatibility                                                 | `45-ios-pod-install.txt`                  |
| `xcodebuild -list`                          | 0      | Workspace exists but **“There are no schemes in workspace App”**                             | `46-ios-workspace-list.txt`               |
| Simulator Debug (`CODE_SIGNING_ALLOWED=NO`) | **65** | **FAIL** — scheme `App` missing (cascade from pods)                                          | `47-ios-simulator-debug-build.txt`        |
| Generic iOS Release no-sign                 | **65** | **FAIL** — scheme `App` missing                                                              | `48-ios-generic-release-build-nosign.txt` |
| Archive (natural signing)                   | **65** | **FAIL** — scheme `App` missing (**not** reached as signing-only failure)                    | `49-ios-archive-attempt.txt`              |
| `-showBuildSettings`                        | **65** | FAIL — same scheme error                                                                     | `50-ios-build-settings.txt`               |

Exit matrix: `52-ios-exit-summary.txt`.

### First true root cause

**File:** `ios/App/Podfile` line `platform :ios, '14.0'`  
**Also:** `ios/App/App.xcodeproj/project.pbxproj` → `IPHONEOS_DEPLOYMENT_TARGET = 14.0`  
**Capacitor requirement:** `node_modules/@capacitor/ios/Capacitor.podspec` → `s.ios.deployment_target = '15.0'` (and `pods_helpers.rb` asserts ≥ 15.0)

CocoaPods error (verbatim theme from `44` / `45`):

> Specs satisfying the `Capacitor (from ../../node_modules/@capacitor/ios)` dependency were found, but they required a higher minimum deployment target.

**Cascade:** failed `pod install` → empty/unusable schemes in `App.xcworkspace` → all `xcodebuild -scheme App` invocations exit **65**.

This is a **CODE/TOOLCHAIN** blocker (Capacitor 8 vs iOS 14 deployment target), **not** `SIGNING_ENVIRONMENT_BLOCKER`. Archive never reached Team/Provisioning evaluation.

### Static config (from repo + `51-ios-static-config.txt`)

| Item                                                  | Value                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Deployment Target                                     | **14.0** (Podfile + pbxproj) — **below Capacitor 8.1.0 minimum 15.0**                                |
| Bundle ID                                             | `com.DilMart.store`                                                                                  |
| Display Name                                          | Mojibake in `Info.plist` `CFBundleDisplayName`: `Ù…ØªØ¬Ø± Ø³Ø¨Ø£`                                    |
| Marketing Version                                     | `1.0`                                                                                                |
| Build Number                                          | `1`                                                                                                  |
| `PRODUCT_NAME`                                        | `$(TARGET_NAME)` / scheme target `App`                                                               |
| `DEVELOPMENT_TEAM`                                    | **not set** in `project.pbxproj` (grep in `51`)                                                      |
| `CODE_SIGN_STYLE`                                     | Automatic                                                                                            |
| `CODE_SIGN_IDENTITY`                                  | `iPhone Developer`                                                                                   |
| Supported orientations                                | iPhone: Portrait, LandscapeLeft, LandscapeRight; iPad: + UpsideDown                                  |
| Entitlements files                                    | **none** found under `ios/`                                                                          |
| Push / Associated Domains / Background Modes          | **none** found                                                                                       |
| Native pods declared                                  | Capacitor, CapacitorCordova, CapacitorApp, CapacitorBrowser, CapacitorNetwork, CapacitorSplashScreen |
| `pod install` resolves Cap 8 pods?                    | **NO** at current 14.0 target                                                                        |
| Does Deployment Target 14 cause actual Cap 8 failure? | **YES** (proven on runner)                                                                           |
| Simulator / Generic Release succeed?                  | **NO**                                                                                               |
| Archive fail code vs signing?                         | **CODE/TOOLCHAIN cascade** (scheme missing); signing not evaluated                                   |

> Generic Release with `CODE_SIGNING_ALLOWED=NO` did **not** succeed, so it does **not** prove compilation readiness. Do not treat Archive as signing-only.

---

## 6. Gap report

### 6.1 Existing baseline failures

| Issue                            | File / setting                                        | Current                                   | Required                                       | Severity        | Phase                     |
| -------------------------------- | ----------------------------------------------------- | ----------------------------------------- | ---------------------------------------------- | --------------- | ------------------------- |
| Frontend ESLint debt             | many under `src/` (see `02-frontend-lint.txt`)        | 453 errors / 9 warnings                   | Clean or waived CI policy                      | P2              | Later                     |
| Backend ESLint debt              | many under `backend/src/` (see `11-backend-lint.txt`) | 539 errors / 2 warnings                   | Clean or waived CI policy                      | P2              | Later                     |
| Merchant push test needs secrets | `backend/tests/merchant-push-alerts.test.mjs:20`      | fails without `SUPABASE_SERVICE_ROLE_KEY` | Documented CI secrets or skip-in-audit mode    | P1 (CI)         | Phase 1 tooling / CI docs |
| Cap doctor fails on Windows      | host tooling                                          | Xcode missing                             | Expected on Windows; macOS runner used for iOS | P2 (historical) | Environment               |

### 6.2 Capacitor 8 incompatibilities

| Issue                                       | File / setting                                                                           | Current                            | Required                                                                 | Severity       | Phase                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------- |
| CLI major behind runtime                    | `package.json` `@capacitor/cli@^7.5.0` vs `@capacitor/core@^8.1.0`                       | CLI 7.5.0 / core 8.1.0             | Align CLI to Capacitor 8 (same major as core/android/ios)                | **P0**         | Phase 1 (dependency alignment — **not done in this audit**) |
| Packages behind latest Cap 8                | installed 8.1.0 / doctor latest 8.4.2                                                    | 8.1.0                              | Decide target patch within Cap 8 after CLI align                         | P2             | Later / Phase 1 migrate window                              |
| Cap doctor incomplete                       | Windows host                                                                             | Android success, iOS error         | Closed via macOS runner evidence                                         | Closed for env | —                                                           |
| **iOS deployment target too low for Cap 8** | `ios/App/Podfile` `platform :ios, '14.0'` + pbxproj `14.0` vs `Capacitor.podspec` `15.0` | CocoaPods cannot resolve Capacitor | Raise iOS deployment target to **≥ 15.0** (Phase 1 — **not in this PR**) | **P0**         | Phase 1                                                     |

### 6.3 Android blockers

| Issue                                    | File / setting                                                | Current                                                             | Required                                                                                  | Severity                      | Phase                                                        |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------ |
| Daemon JVM vendor lock                   | `android/gradle/gradle-daemon-jvm.properties`                 | `toolchainVendor=jetbrains`                                         | Document JBR requirement **or** relax vendor for CI JDKs                                  | **P0**                        | Phase 1                                                      |
| Stale `sdk.dir` in local props           | `android/local.properties`                                    | path under `C:\Users\Venera\...`                                    | Machine-local correct SDK (never commit)                                                  | P2                            | Local env                                                    |
| Admin/Merchant shipped in APK web assets | Vite `dist` + `cap sync`                                      | Admin/Merchant chunks present                                       | Mobile shell should exclude or gate ops panels if storefront-only app is the product goal | P1 (product/security surface) | Later (explicit product decision) — **no change in this PR** |
| No production signing config             | `android/app/build.gradle`                                    | no release keystore block                                           | Play App Signing / CI secrets outside Git                                                 | P0 release                    | Release prep (later than native migrate)                     |
| MainActivity path/package drift          | `android/app/src/main/java/com/sabaa/store/MainActivity.java` | filesystem path `com/sabaa/store/` but `package com.DilMart.store;` | Path should match package (`com/DilMart/store/`) for maintainability                      | P2                            | Phase 1 cleanup                                              |
| Gradle 9 deprecations / `flatDir`        | Capacitor generated Gradle                                    | warnings                                                            | Track for AGP/Gradle upgrades                                                             | P3                            | Later                                                        |

### 6.4 iOS blockers

| Issue                                 | File / setting                     | Current                       | Required                                                | Severity   | Phase                              |
| ------------------------------------- | ---------------------------------- | ----------------------------- | ------------------------------------------------------- | ---------- | ---------------------------------- |
| Cap 8 pod requires iOS ≥ 15           | `Podfile` + `Capacitor.podspec`    | platform/target **14.0**      | **≥ 15.0**                                              | **P0**     | Phase 1                            |
| `cap sync ios` / `pod install` fail   | `44`/`45` evidence                 | EXIT 1                        | Successful pod resolution                               | **P0**     | Phase 1                            |
| No schemes after failed pods          | `46-ios-workspace-list.txt`        | “no schemes in workspace App” | Schemes available after successful `pod install`        | **P0**     | Phase 1                            |
| Simulator / Generic Release / Archive | `47`/`48`/`49`                     | EXIT 65 (scheme missing)      | Successful builds (Archive may still hit signing later) | **P0**     | Phase 1                            |
| Display name encoding                 | `Info.plist` `CFBundleDisplayName` | mojibake `Ù…ØªØ¬Ø± Ø³Ø¨Ø£`    | Correct UTF-8 Arabic display name                       | P1         | Phase 1 iOS polish                 |
| `DEVELOPMENT_TEAM` unset              | `project.pbxproj`                  | absent                        | Team ID for Archive/store                               | P0 release | Release prep (after toolchain fix) |

### 6.5 Release blockers

| Issue                           | File / setting                                              | Current                            | Required                                                          | Severity | Phase                |
| ------------------------------- | ----------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------- | -------- | -------------------- |
| iOS Archive / store build       | Cap 8 + iOS 14 mismatch                                     | CODE/TOOLCHAIN fail before signing | Fix deployment target then re-run Archive                         | P0       | Phase 1 then release |
| Android Play signing provenance | `app/build.gradle` + unverified `signReleaseBundle`         | AAB built; cert type not inspected | Verify production signing config / certificate before Play upload | P0       | Release prep         |
| Capacitor CLI/core major skew   | `package.json`                                              | 7 vs 8                             | Aligned Cap 8 toolchain before migrate                            | P0       | Phase 1              |
| App naming inconsistency        | `capacitor.config.ts` vs Android `strings.xml` vs iOS plist | three different names              | Single approved store listing name                                | P2       | Phase 1 branding     |

### 6.6 Security / configuration findings

| Issue                                    | File / setting                      | Current                             | Required                                                         | Severity   | Phase                |
| ---------------------------------------- | ----------------------------------- | ----------------------------------- | ---------------------------------------------------------------- | ---------- | -------------------- |
| `allowBackup=true`                       | `AndroidManifest.xml:3`             | enabled                             | Usually `false` for production marketplace apps (confirm policy) | P1         | Phase 1 hardening    |
| `allowMixedContent=true`                 | `capacitor.config.ts:11-12`         | enabled                             | Prefer `false` unless clear HTTP asset need                      | P1         | Phase 1 hardening    |
| Admin/Merchant code in mobile web bundle | `dist/assets/*Admin*`, `*Merchant*` | shipped inside native asset package | Storefront-only split or auth-hardened remote loading strategy   | P1         | Later (architecture) |
| Only INTERNET permission                 | Manifest                            | minimal                             | Keep minimal; add only when Push/Geo/etc. approved               | OK / watch | Future features      |
| No deep links yet                        | Manifest / iOS plist                | none                                | Add only when product requires                                   | OK         | Future               |

### 6.7 Environment / signing blockers

| Issue                               | File / setting                 | Current                       | Required                       | Severity   | Phase                           |
| ----------------------------------- | ------------------------------ | ----------------------------- | ------------------------------ | ---------- | ------------------------------- |
| JetBrains daemon JVM                | `gradle-daemon-jvm.properties` | Oracle JDK fails              | JBR or config change           | P0         | Phase 1                         |
| Merchant-push test secret           | env                            | missing on Windows audit host | CI secret injection            | P1         | CI                              |
| `local.properties` foreign SDK path | local file                     | invalid path warning          | Per-developer SDK              | P2         | Local                           |
| iOS signing (future)                | Automatic; no team             | not evaluated yet             | Apple team after toolchain fix | P0 release | After Phase 1 iOS compile green |

---

## 7. Outputs & PR policy

### Included in this PR

- `governance/phases/DilMart_STORE_CAPACITOR_NATIVE_BASELINE.md` (this file)
- `governance/phases/DilMart_STORE_CAPACITOR_NATIVE_BASELINE_CLOSURE.md`
- `governance/evidence/capacitor-baseline/*.txt` (command transcripts / summaries)
- `governance/CLOSURE_REPORT.md` — **index only** (preserves Merchant Push Phase 1 pointer and other phase links)

### Explicitly excluded

- APK / AAB / IPA binaries
- keystores / provisioning profiles
- `google-services.json`
- `.env` / service role keys
- Dependency bumps, Capacitor migrate diffs, Android/iOS “fixes”, UI/router/backend changes

### Merge policy

Draft PR → **main**. Status: **Draft — technically mergeable, but not approved for merge**. Do **not** Ready/merge without supervisor review. iOS macOS evidence is attached; Phase 0 iOS outcome is **FAIL — CODE/TOOLCHAIN BLOCKER** (fix is Phase 1, out of this PR).

---

## Appendix A — Quick command exit matrix

```
FRONTEND: ci=0 lint=1 test=0 build=0 arch=0 doctor=1
BACKEND:  ci=0 lint=1 build=0 launch-critical=0 merchant-push=1 whatsapp-otp=0 policy=0 hardening=0 commercial=0
ANDROID:  build=0 sync=0 | clean/assemble/bundle = FAIL on Oracle JDK21 ; PASS on Android Studio JBR21
IOS (macos-26 run 30195211313):
  npm_ci=0 build=0 cap_doctor=1 cap_sync=1 pod_install=1
  workspace_list=0 (no schemes)
  simulator=65 generic_release_nosign=65 archive=65 showBuildSettings=65
CLASSIFICATION: FAIL — CODE/TOOLCHAIN BLOCKER
```

## Appendix B — Evidence index

| File                                                      | Content                            |
| --------------------------------------------------------- | ---------------------------------- |
| `00-environment.txt`                                      | Host toolchain snapshot (Windows)  |
| `00-capacitor-packages.txt`                               | `npm ls` Capacitor packages        |
| `01-frontend-npm-ci.txt` … `08-frontend-exit-summary.txt` | Frontend suite                     |
| `10-backend-npm-ci.txt` … `19-backend-exit-summary.txt`   | Backend suite                      |
| `20`–`28` (+ `23b`/`24c`/`25b`)                           | Android sync/build attempts        |
| `30-ios-blocked-by-environment.txt`                       | Historical Windows blocker note    |
| `31-supervisor-micro-patch-notes.txt`                     | Supervisor micro-patch notes       |
| `40`–`52` iOS runner transcripts                          | macOS-26 baseline commands         |
| `53-ios-macos-runner-provenance.txt`                      | Run ID / classification provenance |
