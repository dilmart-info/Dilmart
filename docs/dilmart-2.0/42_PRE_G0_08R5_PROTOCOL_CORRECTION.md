# 42 — PRE-G0-08R5 protocol correction

Status: evidence only. PRE-G0-08R4 remains BLOCKED. G0 remains OPEN / BLOCKED. D09 remains OPEN. No phone installation is requested.

Reports 36 through 41 are unchanged. Expo source, APKs, and device evidence were left in place. The phone was not rebooted, uninstalled, or data-cleared. `com.dilmart.store` was not changed. The corrected APK was not installed.

## P0-01 — failure windows found before the correction

These windows were identified from report 41 and from the source that produced `05E47DC7…`.

| Window | What failed |
| --- | --- |
| Native ledger | `MainActivity` committed the action id as consumed before JavaScript ran. A later delivery of the same id was `skip-accepted`. |
| Bridge result | The evaluated expression returned `ok` with the comma operator before `enqueue` finished `await save()`. `js-accepted` was not durable persistence. On the phone, action `eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01` was claimed and accepted, the queue file did not grow, and the replay added zero rows. |
| Retry target | A not-ready retry called `dispatchSpikeAction` again, which read the current intent. A retry scheduled for an earlier action could deliver a later one. |
| Operation identity | `enqueue` allocated `crypto.randomUUID()` even when the activity had already supplied `spikeActionId`. A crash before the write could not be retried onto the same key. |
| Packaged JavaScript | `assembleDebug` packages `android/app/src/main/assets`. That tree was older than `www`. The installed APK's `protocol.js` was `enqueue(kind, payload)` with no business fields, and `app.js` had no `enqueuenext` branch. Android compilation had succeeded. |
| Mock rejection | Posts without `parcelCode`, `handoverAttempt`, `transition`, and `expectedStateVersion` return HTTP 400 `business-identity-required` and store nothing. That is why 100 local rows produced 0 authoritative effects. |
| Cohort mixing | Rows without a business key were still posted. Historical confirmed, conflict, and blocked rows were not a separate cohort in the sync loop. |
| Unknown actions | An unrecognized action fell through and still wrote an audit. |
| Session replay | Login did not send an action id, so a repeated login created another mock session. |

No Capacitor platform limit was established. The failures are in the spike activity, the packaged script, and the order between those two.

## P0-02 — durable lifecycle

The native ledger now stores `RECEIVED` only when the id is not already `DURABLY_PERSISTED`. `RECEIVED` does not block another delivery. The bridge result `invoked` is traced and is not persistence. `SpikeActions.markPersisted` runs only after the encrypted queue write returns, and it is the only writer of `DURABLY_PERSISTED`.

The operation key is the action id. A second call with that id returns the saved row. The queue status moves `PENDING_SYNC` → `SERVER_CONFIRMED` → `COMPLETED`, with a save between server confirmation and completion. A crash after `SERVER_CONFIRMED` is finished by a later sync without a second effect.

Crash points covered by the preinstall suite, using the same `www/actions.js` and `www/protocol.js` that were copied into the APK:

| Point | Result |
| --- | --- |
| After receipt, before `enqueue` | No row. The same action id then creates one row and that id is the idempotency key. |
| After the queue write, before `markPersisted` | The row is on the storage map. A new client restores it and does not allocate another key. |
| After `SERVER_CONFIRMED`, before `COMPLETED` | The effect id is kept. The following sync completes the same row. |
| Duplicate in-flight calls for one action id | One row. |
| Two action ids for one business transition | One authoritative effect. |
| Lost HTTP response after the mock commit | The following read returns the same effect. |
| Logout and login | The same idempotency keys return. |
| Driver B | Cannot read driver A's operation. Decrypt of driver A's queue with driver B's key is rejected. |
| Mock process restart | The original effect id is returned. The authoritative count stays 100. |

An old boolean ledger value is not treated as consumed. `getString` on a boolean preference is caught, and the action is delivered again for the queue to reconcile.

## P0-03 — packaged JavaScript

`capacitor-driver/verify-bundle.mjs` copies `www/actions.js`, `www/app.js`, `www/protocol.js`, and `www/index.html` onto `android/app/src/main/assets/public` and fails if those bytes differ. It also opens the APK and fails if the packaged files differ from `www`.

The verified APK contains `enqueuenext`, `enqueue100`, `unknown-action`, `PENDING_SYNC`, `SERVER_CONFIRMED`, `businessKey`, and `idempotencyKey: actionId`. An unknown action throws `unknown-action` and does not mark the ledger persisted.

## P0-04 — synchronization

The phone's 100-to-0 result was the packaged client omitting the business identity. The mock rejected those posts before creating effects. The corrected client sends the business object and uses the action id as the idempotency key. Rows with no business key are left unchanged and are not posted.

On a fresh mock process, the preinstall suite recorded:

| Count | Value |
| --- | --- |
| Distinct `enqueue100` action ids | 100 |
| Durably restored queue rows for that cohort | 100 |
| `COMPLETED` rows | 100 |
| Unique effect ids | 100 |
| `authoritativeEffectCount` | 100 |
| After a second sync | 100 |
| After a second request UUID for `SPIKE-0` attempt 1 `accept-custody` version 0 | 100 |
| Historical row without a business key | Remained `confirmed` and was absent from the authoritative count |
| After mock restart | 100, and `${batchId}:0` replayed its original effect id |

A later custody transition for the same parcel, attempt 2 and `release-custody`, received a different effect id in the earlier part of the same suite.

## P0-05 — pre-install commands

| Command | Result |
| --- | --- |
| `node protocol/test.mjs` | Passed. Exit 0. |
| `node mock-api/business.test.mjs` | Passed. Exit 0. |
| `node capacitor-driver/preinstall.test.mjs` | Passed. Exit 0. The 100-effect reconciliation above is from this command. |
| `node capacitor-driver/verify-bundle.mjs <apk>` | Passed. Packaged JavaScript matches `www`. |

`Pixel_10a` is present as an AVD. A second boot was refused because an emulator process already held that AVD, and that process never appeared as an adb device. No APK was installed on an emulator. The native `spikeCrashAfter=received` kill and `SpikeActions.crash` path were therefore not executed on an Android runtime. Those crash points were executed in the JavaScript lifecycle that the APK contains. This is not an Android activity execution result.

## P0-06 — corrected artifact

The spike tree is outside Git. The hashes below are the files that the preinstall suite imported and that `verify-bundle.mjs` checked inside the APK.

| Item | Value |
| --- | --- |
| Application id | `com.dilmart.spike.capacitor` |
| versionName | `1.0` |
| APK | `D:\DilMart-driver-spike\evidence\capacitor-r5-verified.apk` |
| APK SHA-256 | `2613AA7158357A19BA80CECC070CD0B7F6C7D3C05CCDC0BDFBA9943B0615E51C` |
| APK size | 27,654,558 bytes |
| Certificate SHA-256 | `8400c8daa3996d830f95a220c1c7114dc6945fbc8f10e4c81f39787c1d386939` |
| Lockfile SHA-256 | `73CA67A64DA383411E1013F9A8E69A9C2A965342E72B7A0643D0FD15BBD895CF` |
| JDK | `C:\Program Files\Java\jdk-21.0.11` |
| `www/actions.js` | `0c80fd30275c7294dada06630d84184f0a31651475c3449afca7745e743f0979` |
| `www/protocol.js` | `425fd328fc3d9ace76ba63cf3699e1184ff423b1fff7c915c3d85868254b98d9` |
| `www/app.js` | `c3a199038ef9c20390156fac3ad00910aebdea88f996566789df1033938a2326` |
| `MainActivity.java` | `53d02e3f317362ba3f97eefb0776c9d0fee8dace652a13446c6b2a4bbbf81769` |
| `SpikeActionPlugin.java` | `70745cac48badfcb3472a7cd94558bf26a6e03efdbe28f3b178b1ac07e1b5269` |

Build: one `clean assembleDebug`, then `verify-bundle.mjs` copied `www` into the asset tree, then `assembleDebug` packaged that tree. The APK above is the post-copy package. It was not installed.

## Remaining limits

The native activity's process-kill behavior has not run on an emulator or the phone. Login's token and `loginAction` are sequential secure-store writes, so a crash between those writes can still open a second session; the mock also returns the original session when the same action id arrives. The queue file write is the durable operation record. The mock remains test-only and is not production financial proof.

Phone installation is not requested. Existing device evidence stays where it is.

## Recommendation

BLOCKED for phone acceptance. The protocol correction and the packaged-JavaScript check are in the artifact above, and the Node suite reconciled 100 durable operations to 100 authoritative effects. The Android activity runtime was not exercised. D09 stays OPEN. G0 stays OPEN / BLOCKED. This PR is not merged.
