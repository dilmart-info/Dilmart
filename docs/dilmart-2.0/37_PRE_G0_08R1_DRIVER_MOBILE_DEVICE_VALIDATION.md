# 37 — PRE-G0-08R1 driver mobile device validation

Status: evidence only. G0 remains OPEN / BLOCKED. D09 remains OPEN. No candidate is selected.

This file supplements `36_PRE_G0_08_DRIVER_MOBILE_SPIKE_REPORT.md`. Report 36 is unchanged. Its BLOCKED result remains the historical outcome. A UI shell plus the Node protocol harness does not satisfy this round.

## Baseline

| Item | Value |
| --- | --- |
| `origin/main` | `a661927fbfcb0e24e08feabc6c784c6a23ce6e23` |
| Documentation branch | `docs/v2-pre-g0-08-driver-mobile-spike` |
| PR | https://github.com/dilmart-info/Dilmart/pull/81 |
| PR head before this report | `be9d7932e47d98e69371711b0f539405e66bac8a` |
| Documentation worktree | `D:\DilMart-v2-preg0-08` |
| Experimental workspace | `D:\DilMart-driver-spike` (not committed) |
| Device role | one connected physical phone, no emulator results |

Production identity was not used. No DilMart Main or Store database, Render service, paid plugin, push project, factory reset, or bootloader change was touched. `com.dilmart.store` stayed at the same package path before and after the spike installs:

`/data/app/~~VeQwGOEmY_4vBhCB6dJi1A==/com.dilmart.store-VKS-jAm1KSgPbav017wJHA==/base.apk`

## Versions

Expo SDK 58 from `expo-template-blank`. `expo install --check` reported dependencies up to date. Expo Doctor 1.21.9 reported 20/20. The React Native peer range `*` was not treated as a blocker. Versions were taken from the official template and Expo install, not forced.

| Component | Expo spike | Capacitor spike |
| --- | --- | --- |
| Application ID | `com.dilmart.spike.expo` | `com.dilmart.spike.capacitor` |
| Platform | Expo `~58.1.0`, React 19.3.0, React Native 0.88.1 | Capacitor core/cli/android 8.6.3 |
| Location | `expo-location` `~58.0.23`, `expo-task-manager` `~58.0.14` | Isolated `SpikeLocationService` foreground service. `@capacitor/geolocation` is not used. Community background-geolocation 1.3.2 was not installed. |
| Camera | `expo-camera` `~58.0.14` | `@capacitor-mlkit/barcode-scanning` 8.2.2 (Apache-2.0) |
| Secure storage | `expo-secure-store` `~58.0.3` | `capacitor-secure-storage-plugin` 0.14.2 (MIT), Android Keystore RSA wrap |
| Files | `expo-file-system` `~58.0.15` | `@capacitor/filesystem` 8.1.5 |
| Cipher | `@noble/ciphers` 2.4.0, `@noble/hashes` 2.4.0 | same libraries in the WebView protocol |
| JDK used for Gradle | 21.0.11 | 21.0.11 |
| Gradle wrapper | 9.4.1 | 8.14.3 |
| Android | compileSdk 37, target from the Expo template | compileSdk 36, minSdk 24, targetSdk 36 |
| Lockfile SHA-256 | `631BB7E2EAEF6FD9512055FD09B617389BC944443BE33A70031E038C8F331FB3` | `73CA67A64DA383411E1013F9A8E69A9C2A965342E72B7A0643D0FD15BBD895CF` |

npm reported 3 moderate vulnerabilities during the Expo install. `npm audit fix` was not run.

## What was implemented

Both applications contain the protocol behavior: persist before send, UUID/idempotency key, payload hash, encrypted queue, PENDING until a confirmed response, and handlers for 200, 401, 409, and a follow-up GET after 503. The Node harness `protocol/test.mjs` is not counted as a mobile test.

Capacitor loopback HTTP was blocked first by a missing `window.Capacitor.registerPlugin` (the native bridge object does not provide it until `capacitor.js` loads) and then by WebView CORS from `https://localhost` to `http://127.0.0.1`. The mock now answers OPTIONS only for `https://localhost`, and cleartext is allowed only for `127.0.0.1` and `localhost` in each spike manifest. The mock stayed bound to `127.0.0.1:55480`. `adb reverse tcp:55480 tcp:55480` was used and removed after the tests.

Capacitor location uses a non-exported foreground service, `foregroundServiceType=location`, `START_NOT_STICKY`. It records last-known and live updates. It does not restart after process death. Shift end calls `stopService`.

## APK evidence

APKs are local only, under `D:\DilMart-driver-spike\evidence\`. They are not in Git.

| File | Bytes | SHA-256 | Installed |
| --- | --- | --- | --- |
| `capacitor-debug-4.apk` | 29,377,307 | `4584A85AE6CCDFFEC1DA8D7F86A9232C054AC63403EC91ABF5C7FC1134F038D0` | yes, `adb install -r`, exit 0. This is the measured Capacitor build. |
| earlier Capacitor debug outputs | 29,377,154 then 29,377,235 then 29,377,307 | `1A93C9C8…FD69`, `2434BC9A…DEAA`, `2AC38F1C…FE12` | replaced only while the app had no protocol queue, or with `-r` after a queue existed so the queue file remained |
| `expo-debug-4.apk` | 171,644,178 | `FA49D14A0AD93A47201EBB902DB2B2FD4575E3728E74808694291A48C2D404B9` | yes, exit 0. This is the measured Expo build. It embeds the JS bundle. |
| later Expo debug output | 171,644,554 | `EEACE48D0A6F3555C78774C59D863C6EB622552DB120E13EADE0A8F3C2BFA6F1` | no. Not installed, because the installed Expo app already held location samples. |

`aapt dump badging` confirmed the two spike application IDs before install. Before the first install, `pm path` for both spike IDs was empty. No uninstall, no `pm clear`, and no data wipe was run.

The builds are not reproducible. Successive debug APKs of the same candidate differ in SHA-256. A second clean controlled rebuild from an empty output directory was not completed. Identical bytes are not claimed.

Gradle commands were `assembleDebug --no-daemon` with `JAVA_HOME` at JDK 21.0.11. Capacitor and the embedded Expo bundle builds exited 0. One Expo bundle attempt exited 1 because `expo-linking` was imported and not installed. That import was removed. The successful embedded build is the one above.

## Device

One phone: Samsung SM-M315F, Android 12, API 31, arm64-v8a. Serial is omitted. Earlier in the same session: MemTotal 5,706,216 kB, about 2.2 GB available, `/data` about 111 GB with about 80 GB free. At the end of this run, battery status was 5, level 100, USB powered true, AC powered false. That battery state cannot support a drain claim.

`pm grant` succeeded for fine, coarse, and background location, and for camera, on both spike packages. `POST_NOTIFICATIONS` is not a grantable permission on API 31. The Capacitor foreground notification still started.

## Smoke and measured results

### Capacitor, installed build `4584A85A…`

| Check | Result |
| --- | --- |
| Launch | PASS. Process stayed up. |
| Synthetic login | PASS. Mock logged `POST /v1/session`. |
| Shift start | PASS. Mock logged `POST /v1/shift/start`. Foreground service id 41, `isForeground=true`. |
| Location samples | PASS for a short window only. 1 last-known sample and 4 live updates. Live gaps were 20,565 ms, 20,005 ms, and 20,006 ms. Requested interval was 15,000 ms. Accuracy values were 41.5 m, 44.1 m, 72.2 m, then 100 m. Coordinates are not published. |
| Shift end | PASS. Mock logged `POST /v1/shift/end`. The service was absent afterward. |
| Encrypted queue | PASS for the observed file. `files/spike-queue.txt` grew from 971 to 1,757 bytes. A plaintext search for `SPIKE` returned 0. `shared_prefs/cap_sec.xml` exists. The queue key is not stored in the queue file. |
| Sync | PASS for the observed posts. Mock logged `POST /v1/operations`. |
| Process death | PASS for file survival only. `adb shell kill` returned EPERM. `am force-stop` was used. It does not clear data. The 1,757-byte queue file was still 1,757 bytes after restart, still with no plaintext match. The location service did not resume. |
| Logout | PARTIAL. The queue file shrank to 30 bytes. No second driver identity exists in the app, so cross-session decryption was not tested. |
| Barcode camera | NOT RUN. No controlled code was presented. |
| 100 operations | NOT RUN. |
| 30-second cadence | NOT RUN. The shift action requests 15,000 ms only. |
| 60-minute battery | BLOCKED. USB powered. |

### Expo, installed build `FA49D14A…`

The first installed Expo APK showed the redbox `Unable to load script` because the debug variant expected Metro. `debuggableVariants = []` was set so the next debug APK embeds the bundle. That embedded APK launched to the Arabic buttons.

| Check | Result |
| --- | --- |
| Launch | PASS after the embedded bundle. |
| Synthetic login | PASS. Mock logged `POST /v1/session`. `shared_prefs/SecureStore.xml` was created. |
| Shift start and stop | PASS. `files/shift.txt` changed to `1`, then to `0` after the stop control. Mock logged shift start. |
| Location samples | PASS for a short window only. 4 updates, gaps 30,019 ms, 30,032 ms, and 30,016 ms. Requested `timeInterval` was 15,000 ms. Accuracy was 100 m on each. Coordinates are not published. |
| Encrypted queue | FAIL on the installed build. The custody control did not create `files/queue.txt`. `saveQueue` depends on `btoa`, which is not a reliable Hermes primitive. A later APK replaces that with a pure encoder. It was built (`EEACE48D…`, 171,644,554 bytes) and not installed, because location samples were already on the device. |
| Sync, process death, logout, second session | NOT RUN on device. |
| Barcode camera | NOT RUN. The control is present. No controlled code was scanned. |
| 60-minute battery | BLOCKED. USB powered. |

## SP-01–SP-20

Device evidence only. There is no emulator column with results.

| ID | Capacitor | Expo |
| --- | --- | --- |
| SP-01 foreground location | PASS, short window, ~20 s actual gaps | PASS, short window, ~30 s actual gaps |
| SP-02 screen locked | PENDING MANUAL | PENDING MANUAL |
| SP-03 background / service | PASS while the app process stayed up and the service was foreground | PARTIAL. Samples arrived with the app in use. A locked or backgrounded window was not measured. |
| SP-04 15 s and 30 s cadence | FAIL the 15 s request (observed ~20 s). 30 s NOT RUN. | FAIL the 15 s request (observed ~30 s). A separate 30 s request was NOT RUN. |
| SP-05 battery, 60 min, not charging | BLOCKED, USB powered, level 100 | BLOCKED, USB powered, level 100 |
| SP-06 stop after shift end | PASS for the observed stop | PASS for `shift.txt=0` after stop |
| SP-07 revocation stops tracking | NOT RUN | NOT RUN |
| SP-08 stale location | PARTIAL. One last-known sample was labeled `last-known` and was not treated as a fresh fix. | NOT RUN |
| SP-09 reboot retention | NOT RUN. Reboot was not approved. | NOT RUN |
| SP-10 100 queued operations | NOT RUN | NOT RUN |
| SP-11 process death | PASS, one queue file, size unchanged | NOT RUN |
| SP-12 lost response / duplicate effect | NOT RUN on device. Server code can replay the same key and reject a different hash. | NOT RUN |
| SP-13 push | BLOCKED. Push project creation is not authorized. | BLOCKED |
| SP-14 100 physical scans, p50/p95 | NOT RUN | NOT RUN |
| SP-15 offline PENDING display | PARTIAL. Ciphertext file existed before sync. On-screen PENDING text was not captured. | FAIL. No queue file. |
| SP-16 401 / 409 / 429 / 503 | NOT RUN on device | NOT RUN on device |
| SP-17 session and task scope | NOT RUN on device | NOT RUN on device |
| SP-18 prior-user isolation | NOT PROVEN. Logout replaced the queue. No second driver session was authenticated. | NOT RUN |
| SP-19 startup latency | NOT RUN as a measured value | NOT RUN as a measured value |
| SP-20 second clean build | FAIL as reproducibility. Hashes differ. No clean second build. | FAIL as reproducibility. Hashes differ. The last APK was not installed. |

## Hard gates

| Gate | Outcome |
| --- | --- |
| No lost critical queued evidence | NOT PROVEN. Capacitor kept one file across `force-stop`. One hundred operations, reboot, and Expo queue persistence were not shown. |
| No duplicate financial or custody effect | NOT PROVEN on device. |
| No off-shift tracking | PARTIAL. Both candidates stopped the observed shift. A locked-screen or post-revoke watch was not run. |
| No unauthorized customer or task disclosure | NOT RUN on device. |
| No previous-user data leakage | NOT PROVEN. |
| No offline false confirmation | NOT RUN on device. |
| Verified secure storage and encryption | PARTIAL. Capacitor queue file is ciphertext and the Keystore-backed plugin file is separate. Expo secure-store file exists. Expo queue encryption was not produced on device. |
| Safe recovery from uncertain operations | NOT RUN on device. |

No score is assigned. Missing evidence is not a pass.

## Remaining manual steps

1. Present one controlled barcode and one controlled QR code to each installed app. One hundred physical scans, with p50/p95, remain PENDING MANUAL.
2. Lock the screen during an active shift and record whether samples continue, then end the shift and confirm they stop.
3. Approve a reboot immediately beforehand if reboot retention is required.
4. Run the 60-minute comparison only while the phone is unplugged.
5. Install the uninstalled Expo APK `EEACE48D…` only if the owner accepts replacing the current Expo spike that already holds location samples. Do not clear that data first.
6. Add a second synthetic driver identity before claiming cross-session isolation.

## Recommendation

BLOCKED. Neither candidate may be selected. Capacitor demonstrated login, shift, a foreground location service, ciphertext queue survival across process death, and sync against the loopback mock. Expo demonstrated an embedded native launch, login, shift, and location samples, and did not demonstrate the encrypted queue on the installed build. Battery, physical scan, reboot, push, duplicate-effect, and prior-user gates are unproven. G0 remains OPEN / BLOCKED. D09 remains OPEN.
