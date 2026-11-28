# 45 — PRE-G0-08R7 Final Physical Device Technology Qualification

Status: **PASS WITH NOTES — automated physical-device storage, security and sync qualification on Samsung Android 12 arm64.**
Owner-interaction capability tests (barcode/QR, true locked-screen GPS, unplugged battery): **OPEN — not executed, instructions in section 12.**
D09: **OPEN.** G0: **OPEN / BLOCKED.** No automatic closure, no automatic deferral.

Preceding verdict carried forward: PRE-G0-08R6 PASS WITH NOTES as emulator qualification only (report 44). Reports 36–44 are unchanged.
PR: [#81](https://github.com/dilmart-info/Dilmart/pull/81), previous verified head `ca0e938f572f65f0f6d34d1d8d187b4a5eb86b3f`.

No production database, backend, Render service, Supabase project, customer app or Expo app was touched. No APK, device serial, coordinate, token or private device evidence is committed.

---

## 1. Verdict summary

| Area | Result |
|---|---|
| Architecture (alternative B: Capacitor + native SQLCipher 4.20.0 operation repository) | Accepted by owner as **candidate** architecture only |
| Isolated package `com.dilmart.spike.capacitor.r6` | PASS — coexists, no existing package updated or replaced |
| Security corrections (backup, harness exclusion, legacy removal, session actor) | PASS WITH NOTES (OEM backup behaviour unproven) |
| Final build verification | PASS — emulator 98 / 98 on the final APK |
| Physical install | PASS — r6 only, after checks, byte-identical on device |
| Physical native storage matrix | PASS — all cases (section 8) |
| Physical sync reconciliation (fresh disposable mock) | PASS — 100 → 100, +0, +0, recovered, +1, restart preserved |
| Key protection | Keystore **TRUSTED_ENVIRONMENT (TEE)**, StrongBox not present |
| GPS foreground / background / screen-off | PASS WITH NOTES — screen-off was not a locked screen |
| Shift end / revocation stop | PASS |
| Startup | PASS — phone cold start median 1366 ms |
| Barcode/QR, locked-screen GPS, battery | **OPEN** — owner manual tests |
| Reboot (SP-09), push (SP-13) | **NOT AUTHORIZED** — not executed |

## 2. Identity and scope

```text
Repository:          dilmart-info/Dilmart (documentation only); spike sources outside Git in the local spike workspace
Git branch:          docs/v2-pre-g0-08-driver-mobile-spike
Render service:      none used
Backend hostname:    none used (local disposable mock API only)
Supabase project:    none used
Environment role:    local evidence-only Pre-G0 spike; disposable mock state; Store live identity untouched
Device:              Samsung SM-M315F, Android 12 (API 31), arm64-v8a (serial withheld)
Emulator:            disposable AVD DilMart_R6_Disposable (deleted after use)
```

The live mock state file (`mock-api/state.json`, SHA-256 prefix `3b716c0b`) was verified unchanged before and after every run. Each run used its own fresh disposable mock state directory.

## 3. Isolated R6 package

- Application ID `com.dilmart.spike.capacitor.r6`; Java namespace `com.dilmart.spike.capacitor` (code identity only).
- The installer script refuses to proceed if the application ID is already installed without this round's install marker. On the phone the ID was absent before install.
- Packages present before install and left untouched: `com.dilmart.store`, `com.dilmart.spike.expo`, `com.dilmart.spike.capacitor`.

| Package | Last update time (device) | Changed in R7 |
|---|---|---|
| `com.dilmart.store` | 2026-09-08 | No |
| `com.dilmart.spike.expo` | 2026-11-27 | No |
| `com.dilmart.spike.capacitor` (R5 evidence) | 2026-11-27 | No |
| `com.dilmart.spike.capacitor.r6` | 2026-11-28 (first install = last update, versionCode 1) | New |

- Only fresh synthetic databases were used. The R6 package runs under its own Linux UID and cannot read the R5 package's private storage. The R5 files were **not** read, hashed, migrated, overwritten or reconciled; a read-only hash comparison was deliberately not performed because the round forbids reading R5 data. Preservation rests on the unchanged package update time and sandbox isolation.

## 4. Security corrections

### A. Backup disabled

- `android:allowBackup="false"`, `android:fullBackupContent="@xml/backup_rules"`, `android:dataExtractionRules="@xml/data_extraction_rules"`.
- `backup_rules` excludes every domain (`root`, `file`, `database`, `sharedpref`, `external`).
- `data_extraction_rules` excludes every domain under both `<cloud-backup>` and `<device-transfer>` (D2D).
- Verified in the merged manifest of the built APK and on device: the package manager flags carry no `ALLOW_BACKUP` (checked on emulator and phone).
- **Limitation:** OEM transfer tools (Samsung Smart Switch, vendor cloud backup) may use paths outside the Android backup framework. Their behaviour was not tested and is not claimed. The store remains fail-closed if ciphertext were ever restored without its Keystore key (`store-unmarked` / `key-unavailable`, proven in R6 and section 8).

### B. Crash and diagnostic harness excluded from release

- Crash injection, diagnostics and the exported `StoreHarnessActivity` exist only in the `src/debug` source set (debug manifest, debug `QualificationHooks`, `StoreDiagnostics`).
- The release source set provides a no-op `QualificationHooks`.
- Release proof on the built release APK (`dexdump` + `aapt2 dump`): no `StoreHarnessActivity`, no `StoreDiagnostics`, no crash-point strings, no harness manifest entry, no `pending-action` path. The release merged manifest exports only the launcher `MainActivity`.
- The debug harness activity is exported only for adb and protected by `android.permission.DUMP`.
- Destructive harness steps (`storagefull`, `storagelow`, `keyloss`, `wrongkey`, `corrupt`, `missing`) refuse any store whose name does not start with `harness` (`harness-store-not-disposable`), proven on device.

### C. Legacy queue paths removed

- The whole-file queue, SharedPreferences action ledger, `protocol.js`, `SpikeActions`, `markPersisted` and the Secure Storage / Filesystem plugins are absent from the bundle.
- `verify-bundle.mjs` enforces required markers and a forbidden-marker list on the source and on the packaged `assets/public` of both APKs; it passed for debug and release.

### D. Actor from committed native session

- Every enqueue, query and mutation resolves the actor from the committed native session row. Caller-supplied `actorId` / `driverId` are ignored.
- Business keys are actor-scoped (`parcel|attempt|transition|version`).
- Device evidence (driver-b session): receipt, complete and terminal on a driver-a operation → `operation-not-found`; reusing a driver-a action id → `action-actor-mismatch`; forged `actorId` in caller JSON → operation recorded under driver-b; `pending({actorId:"driver-a"})` → zero driver-a rows; enqueue and query without session → `no-session`; mock foreign lookup → 404.

## 5. Final build record

| Item | Value |
|---|---|
| Final installed APK (debug, versionCode 1) | `744c22a5068d193fafc09bb6efce9663f393508f54db485677762fe24e6b5386` (35,374,297 bytes) |
| Update-test APK (debug, versionCode 2) | `2bde47e89486b210d0a8b3b608a9087b6e7ca07eb20c59acf20e9c0357c63a56` (emulator only) |
| Release APK (unsigned, inspection only) | `93d06a2b2b19a509fd8d2085960eb43d4f457c7380895b12968f6ec5d965e039` (33,996,946 bytes) |
| Application ID | `com.dilmart.spike.capacitor.r6` |
| Signing certificate (debug) | Android Debug, SHA-256 `8400c8daa3996d830f95a220c1c7114dc6945fbc8f10e4c81f39787c1d386939`; release is unsigned (no production certificate exists) |
| Native ABIs | arm64-v8a, armeabi-v7a, x86, x86_64; `libsqlcipher.so` present for arm64-v8a and exercised on the phone |
| SDK | minSdk 24, compile/target 36 |
| Toolchain | AGP 8.13.0, Gradle 8.14.3, JDK 21.0.11, build-tools 37.0.0 |

Build commands (both exit 0):

```text
.\gradlew.bat :app:assembleDebug :app:assembleRelease -PspikeVersionCode=1 -q
.\gradlew.bat :app:assembleDebug -PspikeVersionCode=2 -q
```

Dependency versions: `@capacitor/core|android|cli` 8.6.3, `@capacitor/app` 8.1.0, `@capacitor-mlkit/barcode-scanning` 8.2.2, `net.zetetic:sqlcipher-android` 4.20.0, `androidx.sqlite` 2.7.0.

Source hashes (SHA-256, first 8 bytes):

| File | Hash | File | Hash |
|---|---|---|---|
| package.json | `371df26c` | capacitor.config.json | `f5dd02b0` |
| app/build.gradle | `08072cac` | capacitor.settings.gradle | `4575f7cb` |
| capacitor.build.gradle | `08f14a71` | main AndroidManifest.xml | `88aed0fb` |
| debug AndroidManifest.xml | `23a6d9cd` | backup_rules.xml | `865cae97` |
| data_extraction_rules.xml | `7a4e6def` | MainActivity.java | `dc3df20f` |
| SpikeStorePlugin.java | `ee601eb3` | SpikeLocationPlugin.java | `3b8f67a5` |
| SpikeLocationService.java | `53011376` | OperationStore.java | `0397aba4` |
| StoreKey.java | `4085521e` | StoreException.java | `0ed9587d` |
| debug QualificationHooks.java | `ee56a6db` | debug StoreDiagnostics.java | `9150ec7f` |
| debug StoreHarnessActivity.java | `b8e89af5` | release QualificationHooks.java | `d735ed7b` |
| www/store-client.js | `3d2a4e8d` | www/actions.js | `57fd5c9a` |
| www/app.js | `8aab7769` | www/index.html (unchanged UI) | `82be6c5d` |
| verify-bundle.mjs | `e55bfea2` | mock server.mjs | `c2817d9d` |
| evidence/r7-device.mjs | `df94b565` | evidence/r7-gps.mjs | `1f0feb56` |

Packaged JS verification: `verify-bundle.mjs` confirmed the packaged `actions.js`, `app.js`, `store-client.js` and `index.html` match the source hashes, required markers are present, forbidden markers and `protocol.js` are absent.

## 6. Pre-install verification on the emulator (final APK)

All results are against APK `744c22a5…` unless noted.

| Run | Result | Disposition |
|---|---|---|
| 2 | 93 / 5 | Test-script defects (offline step reused a driver-a business key) and genuine finding F1 (section 13). Retained as history. |
| 3 | — | **INVALID** — the approval-card retry executed the script twice against the same state. File renamed `…-3-INVALID-duplicate-execution`; a results-file-exists guard was added. Not used as evidence. |
| 4 | 96 / 2 | Harness intents swallowed by task reuse; fixed with `am start -f 0x18000000` (test tooling only). |
| 5 | **98 / 0** | Final. Includes in-place update v1 → v2 with identical store identities and digests. Cold start median ~1.7 s. |

No product source changed between run 2 and run 5; only test tooling and the recorded permission setup changed. The final emulator run and the phone run used the same APK hash.

## 7. Physical installation

- Device verified first: model SM-M315F, API 31, arm64-v8a, not an emulator.
- `com.dilmart.spike.capacitor.r6` absent before install; installed once with `adb install` (no `-r` replacement of any other package).
- Device-side `sha256sum` of the installed base APK equals `744c22a5…`; package flags: debuggable test build, no `ALLOW_BACKUP`.
- Test setup recorded: runtime grant of `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION` to the r6 package only. `POST_NOTIFICATIONS` is not a runtime permission on API 31 and was not granted.
- Not performed: uninstall, clear data, reboot, global security setting changes, factory reset, storage filling.

Phone runs: run 1 **90 / 0** (stopped by the test script at the API-31 `POST_NOTIFICATIONS` grant, a tooling defect); run 1b **12 / 0** (resume on the same disposable store and mock state). Combined: **102 checks, 0 failures.** The in-place update test was executed on the emulator only; the phone retains versionCode 1.

## 8. Physical native storage matrix (Android 12 arm64)

Fresh synthetic baseline: 235 operations (128 completed, 1 conflict, 106 blocked, 128 receipts). After every case the harness compared operation identities, states, row hashes, receipts, orphan events and orphan receipts against the baseline.

| Case | Result |
|---|---|
| Crash before-begin, after-inbox-insert, before-commit | No partial action/operation; 235 identities intact; retry creates once; repeat returns original identity |
| Crash after-commit | Operation durable exactly once; redelivery returns original identity |
| Duplicate business transition under new action id | Original operation returned |
| Concurrent (12 threads) | No errors; same action id → one identity; same business key → one identity; distinct → distinct; exactly 6 new, no orphans |
| Receipt before-commit / after-receipt | Stays PENDING_SYNC with no receipt, then confirms; receipt durable; same receipt replays, different effect rejected |
| Completion before-commit | Stays SERVER_CONFIRMED, completes after recovery |
| Session before/after commit, actor switch, repeated login | Previous session intact / new session durable; all operations kept; replay without new generation |
| Logout before-commit, logout | Session intact / cleared; all operations kept; 9 driver-a open operations survive |
| Cross-session | driver-b sees none of driver-a's operations and cannot receipt, complete, terminate or reuse their action ids |
| No session | Enqueue and query rejected |
| Storage full (`SQLITE_FULL` via page cap on a disposable store) | Blocked; 5 accepted before full at 66 pages; no partial row; evidence preserved |
| Low storage (preflight threshold) | Blocked |
| Encryption at rest | Database file (270,336 bytes) contains no plaintext markers |
| Missing database | Fails closed, no replacement; restored store identical |
| Corrupted database | Fails closed, file preserved; restored store identical |
| Wrong key | Fails closed, file untouched; original key reopens identical store |
| Keystore key unavailable | Fails closed, file untouched; never initializes an empty store |
| Destructive step on non-disposable name | Refused |
| Migration | Crash before commit stays v1 with identical identities; v1 → v2 preserves identities; older code refuses newer store |
| JS bridge acknowledgment | Commit precedes acknowledgment; redelivery after lost acknowledgment returns original identity |
| Bridge crash before commit / receipt / completion | No partial row; no orphan receipt; confirmed receipt durable but not completed |

All crashes were process kills (`killProcess`) at named points. No power-cut and no reboot was performed.

## 9. Physical sync reconciliation (fresh disposable mock)

Bridge store seeded with its own 235-operation baseline; baseline receipts were never sent to the mock.

| Step | Expected | Observed |
|---|---|---|
| Cohort of 100 legitimate operations synced | 100 effects | 100 distinct effects (mock total 101 = 100 + 1 acknowledgment-test operation) |
| Second sync | +0 | +0 |
| Duplicate business cohort | +0 operations, +0 effects | +0, +0 |
| Lost response (crash after server commit, before receipt) | Original effect recovered | Recovered, no new effect |
| Next custody transition | +1 | +1 (102) |
| Mock restart | Effects preserved, replay +0 | 102 preserved, +0 |
| Baseline separation | Cohort counted separately | 102 non-baseline local operations ↔ 102 distinct effects |
| Unauthorized actor (driver-b) | No access | Native mutations rejected; mock foreign read 404; driver-a effects unchanged |
| Offline (mock down) | No false confirmation | Remains pending; confirmed exactly once after reconnect (driver-b 2 effects) |
| Revocation | Sync blocked, no new effects | Revoke 200 → task 401; tracking stopped; 1 BLOCKED; driver-a 102, driver-b 2 unchanged |

Live mock state hash unchanged after the round.

## 10. Key protection

| Target | `KeyInfo.getSecurityLevel` | StrongBox feature | Classification |
|---|---|---|---|
| Samsung SM-M315F, API 31 | `SECURITY_LEVEL_TRUSTED_ENVIRONMENT` | absent | **TEE** |
| Emulator API 37 | `SECURITY_LEVEL_SOFTWARE` | absent | Software |

- The wrapping key is AES-256-GCM, generated inside Android Keystore, non-exportable. Key material was never exported or logged.
- Key attestation was not performed, so the TEE classification rests on the platform-reported level only. No StrongBox claim is made.

## 11. Device capability results (automated)

### GPS (phone, location mode high accuracy, r6 foreground service)

| Phase (180 s each) | Updates | Median / max gap | Median accuracy |
|---|---|---|---|
| Foreground | 9 | 20 s / 20 s | 100 m |
| Background (HOME) | 9 | 20 s / 20 s | 100 m |
| Screen off (power key) | 9 | 20 s / 20 s | 100 m |

- The screen-off phase reached Dozing with **keyguard not engaged** (no secure lock set by the harness). It is **not** a locked-screen result. True locked-screen GPS is an owner test (section 12.2).
- Accuracy of ~100 m at a 20 s cadence indicates network/fused fixes indoors; outdoor GNSS accuracy was not measured.
- Only capture time, accuracy and source were read; no coordinates were extracted or stored in evidence.

### Shift end and revocation

- Shift start runs the location service; shift end stops it (service absent, shift flag false).
- Revocation (`POST /v1/session/revoke` on the disposable mock) → next task fetch 401 → tracking stopped → further sync BLOCKED with no new effects.
- Logout stop is covered at the store layer (session cleared); a combined logout-while-tracking UI test is part of the owner checklist.

### Startup

Phone cold start (`am start -W`, 5 runs): 1367, 1356, 1363, 1366, 1376 ms — **median 1366 ms**. Emulator median ~1.7 s.

## 12. Owner manual tests (not executed — exact instructions)

No manual result is recorded or implied. Results must be collected by the owner and reported in a later round.

### 12.1 Barcode / QR scanning (SP-06)

Preparation: print or display on a second screen three codes: QR `SPIKE-R7-SCAN-001`, Code-128 `SPIKE-R7-SCAN-002`, and an invalid QR `HELLO-WORLD`.

1. Open **DilMart R6 spike** on the phone, tap login (button "login"), then tap "scan". Allow camera access if prompted.
2. Scan QR `SPIKE-R7-SCAN-001`. Expected: accepted.
3. Tap "scan" again and scan the same QR. Expected: duplicate (duplicateBusiness), no new operation.
4. Tap "scan" and scan Code-128 `SPIKE-R7-SCAN-002`. Expected: accepted.
5. Tap "scan" and scan `HELLO-WORLD`. Expected: rejected `invalid-code`.
6. Tap "scan" and cancel. Expected: cancelled, no operation.
7. Note whether the Google code scanner module download prompt appeared (Play Services dependency).

Collection (by the agent, read-only, in a later authorized round): `files/harness/bridge-scan-*.json` in the r6 package records accepted, reason, format and durationMs.

### 12.2 True locked-screen GPS (SP-02)

1. Ensure a screen lock (PIN/pattern) is already set on the phone. Do not change security settings for the test if none exists; report that instead.
2. In the r6 app tap login, then "shift". Confirm the tracking notification is visible.
3. Press the power key to lock. Wait 10 minutes without touching the phone; leave it stationary, ideally near a window.
4. Unlock, open the app, tap "queue" to show location diagnostics (gaps only), then tap "end".
5. Report: start and end time, whether the notification persisted, and the diagnostic gap summary. Do not share coordinates.

### 12.3 Battery (SP-05)

1. Charge to ≥ 90 %, then **unplug** the phone. Close other foreground apps; keep normal connectivity.
2. Record battery % and time. In the r6 app tap login, then "shift".
3. Lock the phone and carry or leave it for 60 minutes.
4. Unlock, record battery % and time, tap "end".
5. Repeat the same 60 minutes **without** a shift as a baseline the next day at a similar starting %.
6. Report both drains (% per hour). The phone must remain unplugged throughout; a plugged measurement is invalid.

## 13. Findings

- **F1 — Foreground-service location permission (genuine, product-relevant).** Starting a shift without granted location permission crashes the process: `startForeground` with type `location` throws `SecurityException` on newer Android levels. Production must check/request location permission before shift start, and the service must catch the exception and report a blocked shift. In R7 the permission grant was recorded as test setup; the defect is not fixed in the spike.
- **F2 — Test tooling.** API 31 has no runtime `POST_NOTIFICATIONS`; harness intents need `NEW_TASK|MULTIPLE_TASK` to avoid task reuse; approval-card retries can execute twice (guarded now). None affect product evidence.
- **F3 — ML Kit scanner** uses the Google Play Services code scanner module; availability on devices without Play Services or offline first use is unverified.

## 14. SP-01 – SP-20 mapping

| ID | Capability | R7 status |
|---|---|---|
| SP-01 | Foreground GPS | PASS (phone, 180 s) |
| SP-02 | Screen-locked GPS | **OPEN** — screen-off without keyguard passed; true lock is owner test 12.2 |
| SP-03 | Background GPS | PASS (phone, 180 s) |
| SP-04 | Stop tracking after shift / logout / revocation | PASS for shift end and revocation; logout-while-tracking in owner checklist |
| SP-05 | Battery | **OPEN** — owner test 12.3 (unplugged) |
| SP-06 | Barcode and QR | **OPEN** — owner test 12.1; validation logic (format, duplicate, invalid) in bundle |
| SP-07 | Offline evidence | PASS — offline pending, confirmed once after reconnect |
| SP-08 | Process death | PASS — all named crash points on phone |
| SP-09 | Reboot | **NOT AUTHORIZED** |
| SP-10 | Duplicate and lost response | PASS |
| SP-11 | Encrypted queue | PASS — SQLCipher at rest, Keystore TEE-wrapped key, fail-closed |
| SP-12 | Secure session storage | PASS — session in encrypted store; token absent from raw file |
| SP-13 | Push and API recovery | API recovery PASS (lost response, offline, restart); **push NOT AUTHORIZED** |
| SP-14 | Low-resource performance | PARTIAL — simulated low storage/full on disposable store; no memory pressure test |
| SP-15 | APK size and startup | PASS — 35.4 MB debug / 34.0 MB release (4 ABIs); cold start median 1366 ms |
| SP-16 | Permissions and OS restrictions | PASS WITH NOTES — finding F1; Samsung battery optimisation not exercised |
| SP-17 | Revocation | PASS |
| SP-18 | Cross-session isolation | PASS |
| SP-19 | Reproducible APK | PARTIAL — commands, versions and source hashes recorded; bit-for-bit rebuild not compared |
| SP-20 | Dependencies and licences | PASS — Capacitor MIT, SQLCipher Community BSD-3-Clause, androidx Apache-2.0, ML Kit Google terms; no paid licence |

## 15. Technology decision (three separate acceptances)

**A. D09 technology selection.** Every mandatory automated storage, security and sync gate passed on the physical target. Recommendation: **select Capacitor with the native SQLCipher operation repository (alternative B)**, subject to the owner's decision on the open items in section 16. D09 is **not** closed by this report.

**B. Production driver app acceptance.** Not requested and not met. Requires a production build (signing certificate, release pipeline, real backend contract, F1 fix, permission UX, logout-while-tracking handling, push design), separately authorized.

**C. Field operational acceptance.** Not met. Requires real drivers, routes, battery over full shifts, Samsung/OEM power management across devices, and the deferred reboot and push tests.

## 16. Remaining tests and proposed deferrals

Proposals only; none is accepted until the owner decides.

| Item | Owner | Gate | Rationale | Containment |
|---|---|---|---|---|
| Barcode/QR on phone (SP-06) | Product owner (manual) | D09 | Camera/ML Kit behaviour cannot be automated safely | Instructions 12.1; validation logic already tested |
| True locked-screen GPS (SP-02) | Product owner (manual) | D09 | Requires a user-held screen lock | Instructions 12.2; foreground-service tracking passed screen-off |
| Battery (SP-05) | Product owner (manual) | D09 or B | Requires unplugged phone | Instructions 12.3 |
| Reboot persistence (SP-09) | Owner authorization, then agent | B | Reboot forbidden this round | Store survives process death; DB is file-based and fsync'd |
| Push activation (SP-13) | Owner authorization | B | Push unauthorized | API polling/recovery proven |
| OEM backup / Smart Switch | Owner + agent | B | Vendor paths outside Android backup framework | Backup disabled; restore fails closed without Keystore key |
| Key attestation / StrongBox | Agent | B | Classification is platform-reported | TEE level recorded; no hardware claim beyond it |
| Power-loss durability | Agent (hardware lab) | C | Real power cuts forbidden | `synchronous=FULL` + rollback journal |
| F1 permission fix | Engineering | B | Product defect | Must ship before any driver build |
| Production signing and reproducible rebuild | Engineering + owner | B | No production certificate exists | Release build proven free of harness |

## 17. Limitations

1. One physical device (Samsung API 31). Other OEMs and API levels on hardware are untested.
2. Process kills only; no power loss, no reboot.
3. Storage exhaustion simulated with a page cap and preflight threshold on disposable stores; the phone's storage was never filled.
4. GPS phases were 180 s each, indoors; the screen-off phase was not keyguard-locked.
5. Keystore level is self-reported by the platform; no attestation.
6. Release APK unsigned; inspected, not installed.
7. Update v1 → v2 tested on the emulator only.
8. OEM backup behaviour unproven.
9. R5 evidence preservation is inferred from package update time and sandbox isolation, not re-hashed (reading R5 data was forbidden).

## 18. Device state after the round

- `com.dilmart.spike.capacitor.r6` remains installed (versionCode 1, APK `744c22a5…`), force-stopped, no location service running. Its disposable test stores remain in its private storage.
- No other application, setting or data changed. Not rebooted. Evidence files and APKs remain outside Git in the local spike workspace.

D09 remains **OPEN**. G0 remains **OPEN / BLOCKED**. No PR merge.
