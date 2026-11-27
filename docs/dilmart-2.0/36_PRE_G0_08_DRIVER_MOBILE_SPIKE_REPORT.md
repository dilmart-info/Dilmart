# DilMart 2.0 — PRE-G0-08 Driver Mobile Spike

Date: 2026-11-27
Task: PRE-G0-08
Decision: D09
G0: **OPEN / BLOCKED**
D09: **OPEN**
Production application, database, backend, and the connected phone were not modified.

## Verdict

**BLOCKED.** Neither candidate can be selected. The shared protocol harness passed on loopback. The device matrix was not executed, so the hard gates are not met.

## 1. Baseline

Expected reference in the task brief: `920e2c8b6a0311ca6ca139a37b87bb274e562170`.

Fetched `origin/main` is `a661927fbfcb0e24e08feabc6c784c6a23ce6e23`, message `fix(audit): include tracked function sources in isolated Supabase bootstrap (#68)`. This report is based on that fetched SHA. PR #68 is merged. PRs #76 through #80 were open and were not treated as main. Their files are not in this baseline.

Docs worktree: `D:\DilMart-v2-preg0-08`, branch `docs/v2-pre-g0-08-driver-mobile-spike`.
Prototype workspace, outside the repository: `D:\DilMart-driver-spike`.
The dirty checkout `D:\DilMart` was not edited.

## 2. Environment

| Item | Observed |
|---|---|
| OS | Windows 10, 64-bit |
| Node / npm | v22.22.3 / 11.17.0 |
| Java on PATH | 25.0.3. Not used for the Android build. |
| JDK used for Gradle | 21.0.11 |
| Android SDK | `D:\Android\Sdk` |
| Build tools | 35.0.0, 36.0.0, 36.1.0, 37.0.0 |
| Platforms | android-35, android-36, android-36.1, android-37.0 |
| Gradle | 8.14.3, from the generated wrapper |
| ADB | 1.0.41 |
| Emulator AVD | `Pixel_10a` listed. Not booted. |
| Physical device | One arm64 phone, Android 12, API 31. The serial stays in the private session log and is not published here. |
| Disk free | C: 65 GB, D: 543 GB |
| Expo CLI | not installed globally |
| Gradle CLI | not installed globally |

No application was installed, uninstalled, or reset. Emulator results and phone results are therefore both absent. Battery and background GPS are not inferred from the emulator list or from the protocol harness.

## 3. Libraries

Customer baseline remains Capacitor 8.4.2. It was not copied into the spike and was not upgraded.

Registry versions read on 2026-11-27, all MIT, none purchased:

| Package | Version | Role |
|---|---|---|
| `expo` | 58.1.0 | Expo SDK. Not installed and not built. |
| `expo-location` | 58.0.23 | Declared only. Background updates need a development build, not Expo Go. |
| `expo-task-manager` | 58.0.14 | Declared only. |
| `expo-secure-store` | 58.0.3 | Declared only. |
| `expo-camera` | 58.0.14 | Declared only. |
| `@capacitor/core`, `cli`, `android` | 8.6.3 | Installed in the spike. |
| `@capacitor/app` | 8.1.0 | Installed. |
| `@capacitor/geolocation` | 8.2.5 | Installed. This plugin exposes current position and a watch. It is not an Android foreground location service. |
| `@capacitor-community/background-geolocation` | 1.3.2 | Not installed. MIT. Not treated as proof of background tracking. |

No paid plugin was required for the packages above. Push was not configured. Creating a Firebase or other push project would be a separate activation and was not done.

Capacitor spike lockfile SHA-256: `025334274b20535af2a53c4985757eb034a8498a5976055989876f909952c2be`.
`npm audit --package-lock-only` on that lockfile: total 0. That result does not apply to the DilMart root or backend audits.

Expo has no lockfile because its native peers were not installed. Expo's published peer range for React Native is `*`, so a development build was not started from an unverified native version.

## 4. What was built

The Capacitor shell uses application id `com.dilmart.spike.capacitor`. Gradle `assembleDebug` with JDK 21 exited 0 in 2m 1s.

APK, local only, not committed:

`D:\DilMart-driver-spike\capacitor-driver\android\app\build\outputs\apk\debug\app-debug.apk`

Size 4,815,786 bytes. SHA-256 `bf977a0e6d44d4039851c51af02106c81ee5e26ecfd7ce46677c78490ae58dff`.

The shell draws the nine requested screens and keeps custody and COD rows at `PENDING`. It does not read GPS, encrypt a queue, scan a barcode, or store a token in platform secure storage. It was not installed on the phone or the emulator.

The Expo tree has `package.json` and `app.json` with application id `com.dilmart.spike.expo`. No Expo APK exists.

The protocol harness is `D:\DilMart-driver-spike\protocol\test.mjs`. Command `node protocol/test.mjs` printed `driver-spike protocol proof: passed` and exited 0. The mock API bound `127.0.0.1` on an ephemeral port. That harness is not a phone test.

## 5. Protocol harness

The harness checked synthetic behavior only:

- Off-shift samples are rejected, and ending the shift rejects a later sample.
- A stale sample is rejected and is not stored.
- Pickup JSON has no destination or contact. Delivery JSON has no merchant name.
- A queued custody row stays `PENDING` until the mock confirms it.
- The exported queue ciphertext does not contain the parcel code.
- The same idempotency key and payload return the same effect id.
- The same key with a different payload returns conflict and is not confirmed.
- A 503 after the mock has committed is recovered by a status query, and a second submit does not create a second effect.
- A 429 leaves the row `PENDING`.
- Another driver cannot read the first driver's operation and cannot decrypt the first queue with a new key.
- A revoked session blocks the next protected submit and clears the shift flag.

Process death, reboot, Android secure storage, and OS location permissions were not part of this process.

## 6. SP-01–SP-20

| Test | Expo | Capacitor |
|---|---|---|
| SP-01 Foreground GPS | BLOCKED | BLOCKED |
| SP-02 Screen-locked GPS | BLOCKED | BLOCKED |
| SP-03 Background GPS | BLOCKED | BLOCKED |
| SP-04 Stop tracking after shift, logout, revocation | BLOCKED on device. Logic harness only. | BLOCKED on device. Logic harness only. |
| SP-05 Battery | BLOCKED. Not measured. | BLOCKED. Not measured. |
| SP-06 Barcode and QR | BLOCKED | BLOCKED |
| SP-07 Offline evidence | BLOCKED on device. Harness kept `PENDING`. | BLOCKED on device. Shell label only. |
| SP-08 Process death | BLOCKED | BLOCKED |
| SP-09 Reboot | BLOCKED | BLOCKED |
| SP-10 Duplicate and lost response | BLOCKED on device. Harness passed against the mock. | BLOCKED on device. Harness passed against the mock. |
| SP-11 Encrypted queue | BLOCKED on device. Harness used AES-GCM in Node. | BLOCKED. Shell queue is not encrypted. |
| SP-12 Secure session storage | BLOCKED | BLOCKED |
| SP-13 Push and API recovery | BLOCKED. No push project. | BLOCKED. No push project. |
| SP-14 Low-resource performance | BLOCKED | BLOCKED |
| SP-15 APK size and startup | BLOCKED. No APK and no startup time. | APK size recorded above. Startup time BLOCKED. |
| SP-16 Permissions and OS restrictions | BLOCKED | BLOCKED |
| SP-17 Revocation | BLOCKED on device. Harness blocked a revoked submit. | BLOCKED on device. |
| SP-18 Cross-session isolation | BLOCKED on device. Harness isolated the other driver. | BLOCKED on device. |
| SP-19 Reproducible APK | NOT RUN | Debug build exit 0, one machine, one APK hash. |
| SP-20 Dependencies and licenses | NOT RUN. Packages were not installed. | Spike lockfile audit total 0. Inspected packages are MIT. No paid license. |

No score is awarded. Missing device evidence is not averaged into a winner.

## 7. Hard gates

| Gate | Result |
|---|---|
| Queued evidence survives | Not proven on device |
| No duplicate custody or cash effect | Proven only against the mock |
| Tracking stops off shift | Proven only in the Node client |
| Prior-user data stays hidden | Proven only for the harness key and mock operation |
| Unauthorized task fields stay hidden | Proven only in the mock JSON |
| Pending evidence is not shown as confirmed | Proven in the harness and the Capacitor label |
| Secure storage | Not proven |

A failed or unproven hard gate blocks approval. No candidate is approved.

## 8. Recommendation

D09 stays open. The next authorized pass needs the same phone, the same synthetic workload, and both development builds installed under the spike application ids only.

Still required, and not claimed here:

- Foreground, locked-screen, and background location at 15 and 30 second cadence for 30 minutes, with real timestamps.
- A 60 minute battery comparison on the phone.
- 100 controlled scans.
- 100 offline operations surviving process death and reboot.
- Ten interruption cycles.
- Platform secure storage and an encrypted queue inside each APK.
- Push left blocked until a separately authorized push project exists.
- Expo development build. Expo Go remains unacceptable.

Android will still refuse some background work after force-stop or a vendor restriction. Recovery on the next authorized start has to be measured, not promised.

## 9. Reproduce the local evidence

```text
node D:\DilMart-driver-spike\protocol\test.mjs
```

Capacitor debug build, from the spike Android directory, with `JAVA_HOME` pointed at JDK 21:

```text
gradlew.bat assembleDebug --no-daemon
```

Do not install either prototype over `com.dilmart.store`.
