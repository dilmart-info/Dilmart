# 38 — PRE-G0-08R2 driver technology validation

Status: evidence only. G0 remains OPEN / BLOCKED. D09 remains OPEN. No candidate is selected.

Reports 36 and 37 are unchanged. This file uses the SP-01–SP-20 definitions from report 36. Subtests are named SP-04a, SP-07a, and so on. They do not replace the parent IDs.

## Baseline

| Item | Value |
| --- | --- |
| `origin/main` | `a661927fbfcb0e24e08feabc6c784c6a23ce6e23` |
| Documentation branch | `docs/v2-pre-g0-08-driver-mobile-spike` |
| PR | https://github.com/dilmart-info/Dilmart/pull/81 |
| PR head before this report | `146c4e501b4c1a219ff5812f640f644c41a126f7` |
| Prototype workspace | `D:\DilMart-driver-spike` |
| Device | Samsung SM-M315F, Android 12, API 31. Serial omitted. USB powered, battery level 100. |

`com.dilmart.store` remained `/data/app/~~VeQwGOEmY_4vBhCB6dJi1A==/com.dilmart.store-VKS-jAm1KSgPbav017wJHA==/base.apk`. No production database, Render service, push project, uninstall, or data clear was used. The loopback mock and `adb reverse tcp:55480` were removed after the tests.

## P0 — logout deleted unresolved evidence

Report 37 recorded `spike-queue.txt` shrinking from 1,757 bytes to 30 bytes after logout. The installed source did this:

- `logout()` set `state.queue = []`.
- It then replaced the encryption key.
- `save()` wrote that empty queue over the only queue file.

The 30-byte file is the ciphertext of an empty queue under a new key. The previous pending operations were not acknowledged, were not left pending, and could not be decrypted afterward. That was a FAIL.

The spike now stores one ciphertext file and one Keystore-wrapped key per synthetic driver (`spike-queue-driver-a.txt`, `spike.key.driver-a`). Logout saves that file, then clears only the session token, active driver, and shift flag. It does not rotate the driver key and does not write an empty queue. Login of the same driver reads that file. Login of the other driver reads a different file. Driver B's key cannot decrypt driver A's ciphertext. Recovery is a new login as driver A followed by sync. The historical 30-byte file was left in place.

Controlled device result on Capacitor build `A2647E92…`:

| Step | Result |
| --- | --- |
| Offline custody enqueue | File `spike-queue-driver-a.txt` was 815 bytes. A search for `SPIKE` returned 0. |
| Logout while the mock was down | The same file stayed 815 bytes. The search still returned 0. |
| Driver B login | Audit `operations` was empty. `foreignDecryptRejected` was true. |
| Driver A login | Three PENDING rows returned, keys `42b4dbbb-2b9f-48a0-8eaf-c0f01a85e30b`, `ec96d578-5cf4-46fb-8795-af9665b4c538`, and `98a5838c-44b5-4be9-81bb-b5060efd474e`, one shared payload hash. |
| Sync | Those three rows became `confirmed` with `effect-3`, `effect-4`, and `effect-5`. |

The three rows came from one offline action that the activity dispatched more than once. None was lost. The later build sets an in-flight guard so one intent runs once. The 100-operation run below used that guard.

## Canonical SP map

| ID from report 36 | Capacitor this round | Expo this round |
| --- | --- | --- |
| SP-01 Foreground GPS | PASS for short windows. SP-01a requested 15 s and observed live gaps of 20,565 ms, 20,005 ms, and 20,004 ms. SP-01b requested 30 s and observed 30,004 ms, 30,005 ms, and 30,005 ms. Accuracy was 41.5–100 m. Coordinates are not published. | Not retested. Report 37 still records four samples about 30 s apart on the installed bundle. |
| SP-02 Screen-locked GPS | PENDING MANUAL | PENDING MANUAL |
| SP-03 Background GPS | PARTIAL. During the 30 s request the app was sent Home and samples continued at 30 s. This is not a screen-locked or 30-minute result. | NOT RUN this round |
| SP-04 Stop after shift, logout, revocation | PASS for the observed stop. SP-04a: after shift end, `SpikeLocationService` was absent. SP-04b: logout stopped the service call and kept the queue. Revocation also called stop. | NOT RUN this round |
| SP-05 Battery | BLOCKED. USB powered, level 100. | BLOCKED. Same phone and power state. |
| SP-06 Barcode and QR | NOT RUN | NOT RUN |
| SP-07 Offline evidence | PASS. SP-07a persisted PENDING before send. SP-07b logout kept it. Recovery decrypted it. | NOT RUN on the corrected build. The installed Expo build still has the report 37 queue failure. |
| SP-08 Process death | PASS. 103 operations, 103 unique keys, 100 PENDING, before and after `am force-stop`. `adb shell kill` is still EPERM. | NOT RUN |
| SP-09 Reboot | NOT RUN. No reboot approval. | NOT RUN |
| SP-10 Duplicate and lost response | PASS for one mock process. See reconciliation. | NOT RUN |
| SP-11 Encrypted queue | PASS. Ciphertext file, plaintext marker absent, key in the Keystore-backed plugin. | NOT RUN on device for the corrected encoder. |
| SP-12 Secure session storage | PASS. Session and per-driver key are in secure storage. The queue file does not hold the key. | Secure-store file existed in report 37. Per-driver behavior was not installed. |
| SP-13 Push and API recovery | Push BLOCKED. API recovery PASS, separate from push. | Push BLOCKED. API recovery NOT RUN this round. |
| SP-14 Low-resource performance | NOT RUN as a dedicated test. | NOT RUN |
| SP-15 APK size and startup | Tested debug APK 29,377,307 bytes. Cold `am start -W` TotalTime 1,397 ms. | Corrected APK built, not installed. |
| SP-16 Permissions and OS restrictions | PASS with notes. Fine, coarse, and background location were already granted. API 31 has no `POST_NOTIFICATIONS` grant. The foreground service still started. | Not retested. |
| SP-17 Revocation | PASS. One new row became `blocked`, stayed in the queue, and did not gain an effect. | NOT RUN |
| SP-18 Cross-session isolation | PASS for queue and decrypt. Driver B's audit was empty and driver A's ciphertext rejected driver B's key. | NOT RUN on device. |
| SP-19 Reproducible APK | Two clean builds matched. See below. | One corrected build. No clean pair. |
| SP-20 Dependencies and licenses | Capacitor 8.6.3, ML Kit barcode 8.2.2 Apache-2.0, secure-storage plugin 0.14.2 MIT, noble 2.4.0 MIT. No paid plugin. | Expo SDK 58 modules as in report 37. No paid plugin. |

## Operation reconciliation

Capacitor audit after the guarded 100-operation run, process restart, and sync, still inside the first mock process:

| State | Count |
| --- | --- |
| Operations | 103 |
| Unique idempotency keys | 103 |
| PENDING before sync | 100 |
| Confirmed after sync | 103 |
| Unique effect ids | 103 |

Later, on that same process: a 429 left the new row PENDING and the effect count at 103; the retry confirmed it and the effect count became 104. A lost response (`?lose=1`) then a second sync left the effect count at 105. A same-key different-hash submit became `conflict` and did not add an effect. Final for that process: 105 confirmed or conflict rows and 105 unique effect ids, with zero duplicate keys.

Ten offline enqueue cycles then ran. Each cycle stopped the mock, persisted one row, and started a new mock process. The replacement process had no sessions, so those rows stayed `blocked` or PENDING. The queue grew from 106 to 116 rows and no key was duplicated. After a new driver A login and sync, the audit was 115 confirmed, 1 conflict, 116 rows, and 0 duplicate keys. Eight effect-id strings were shared because the new process numbered effects from `effect-1` again. That is a mock label collision across process lifetimes, not a second effect for one idempotency key.

## Background location

The 15-second and 30-second requests were measured for under two minutes each, not 30 minutes. Screen lock was not performed. Explicit `am force-stop` ends the `START_NOT_STICKY` service; the following login did not resume tracking until a new shift start. Coordinates are not published.

## Expo corrected APK

The report 37 hash `EEACE48D…` was the uninstalled encoder-only build. This round changed the Expo source again: per-driver queue files, no key rotation on login, and logout that keeps the pending file. The new debug APK is local only:

| Item | Value |
| --- | --- |
| Package | `com.dilmart.spike.expo` |
| Bytes | 171,646,714 |
| SHA-256 | `FB9B45904A93A74714992A587283426EDFDCE11691EFC0D1A9465ED0BDE12401` |
| Installed | no |

The installed Expo app still holds location samples from report 37. This build was not installed. Building it does not prove the queue fix. An in-place `adb install -r` needs explicit owner approval and must not clear those samples.

## Build reproducibility

Two `gradlew clean assembleDebug` runs of the final Capacitor source, same lockfile, both exited 0:

| Build | Bytes | SHA-256 |
| --- | --- | --- |
| Clean 1 | 27,651,694 | `796DACCAA3B5B18BF2E901CC1537300E311C23D053A7418CAC37C33814AB59F5` |
| Clean 2 | 27,651,694 | `796DACCAA3B5B18BF2E901CC1537300E311C23D053A7418CAC37C33814AB59F5` |

The build process is reproducible, and these two outputs are bit-for-bit identical. They are not identical to the installed test APK `A2647E92…` (29,377,307 bytes), which was an incremental package of an earlier source step. Different hashes across source changes are not evidence of a non-reproducible build.

## Hard gates

| Gate | Capacitor | Expo |
| --- | --- | --- |
| No lost critical evidence | PASS for the logout, 100-row, and process-death tests | NOT PROVEN on device |
| No duplicate custody or cash effect | PASS per idempotency key | NOT PROVEN |
| No unauthorized tracking | PARTIAL. Shift end removed the service. Screen lock was not measured. | NOT PROVEN this round |
| No prior-user disclosure | PASS for queue contents and decrypt | NOT PROVEN |
| No unauthorized task disclosure | NOT RUN as a device HTTP call. The mock now returns a driver-scoped pickup task. | NOT RUN |
| No offline false confirmation | PASS. Offline and 429 rows stayed unresolved. | NOT PROVEN |
| Verified secure storage | PASS | NOT PROVEN for the corrected encoder |
| Safe uncertain-operation recovery | PASS for lost response and re-login | NOT PROVEN |

## Remaining manual actions

1. Approve an in-place Expo update of `FB9B4590…` without clearing `com.dilmart.spike.expo`, then repeat the logout, second-driver, and sync checks.
2. Lock the screen during an active shift for each app, wait one minute, unlock, and confirm samples continued. Then end the shift and confirm they stop.
3. Show each app one barcode, one QR code, one invalid code, and one duplicate. The 100-scan p50/p95 run is still open.
4. Unplug the phone before any 60-minute battery comparison.
5. Approve a reboot immediately beforehand if reboot retention is required.
6. A 30-minute background window is still open for both cadences.

## Recommendation

BLOCKED. Capacitor now passes the executed integrity gates: pending evidence survives logout and process death, a second synthetic driver cannot read it, and sync does not create a second effect for one key. Expo's corrected queue has not been shown on the device. Screen-locked tracking, physical scans, unplugged battery, reboot, and a 30-minute window are still open. Push remains a separate blocked acceptance item, not a reason to ignore the Expo queue gap. D09 stays OPEN. G0 stays OPEN / BLOCKED.
