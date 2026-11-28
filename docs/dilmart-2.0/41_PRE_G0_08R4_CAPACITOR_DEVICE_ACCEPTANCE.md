# 41 — PRE-G0-08R4 Capacitor device acceptance

Status: evidence only. G0 remains OPEN / BLOCKED. D09 remains OPEN until independent review. Capacitor is not the approved production stack.

Reports 36, 37, 38, 39, and 40 are unchanged. Expo source, APKs, and device evidence were left in place. No Expo test was run. The phone was not rebooted. No uninstall and no data clear were performed. `com.dilmart.store` was not changed.

## Installed binary

| Item | Value |
| --- | --- |
| Device | Samsung SM-M315F, Android 12, API 31 |
| Package | `com.dilmart.spike.capacitor` |
| Install | `adb install -r` after hash, package, and certificate checks. Result: Success |
| File | `D:\DilMart-driver-spike\evidence\capacitor-r4-clean-1.apk` |
| SHA-256 | `05E47DC711EF83B595167AF4DEBE66BF7E12CDADB5455519602FA6405FA08537` |
| Installed path hash | same SHA-256, 27,651,694 bytes |
| Certificate SHA-256 | `8400c8daa3996d830f95a220c1c7114dc6945fbc8f10e4c81f39787c1d386939` |
| Installed path after update | `/data/app/~~e8TcMndAGCwi_AymVbT0kg==/com.dilmart.spike.capacitor-qm0DxtP-vl0aSmzGWBE7EQ==/base.apk` |

The on-device hash was read again from that path at the end of the run and matched. The store package path stayed `/data/app/~~VeQwGOEmY_4vBhCB6dJi1A==/com.dilmart.store-VKS-jAm1KSgPbav017wJHA==/base.apk`. Expo stayed at `/data/app/~~F1wd_J-8-RDnYV8_E9GCbg==/com.dilmart.spike.expo-AVJwniqTZyXiBRy_W2wfWQ==/base.apk`. Expo `files/spike-samples.jsonl` stayed 1,014 bytes. Historical Capacitor `files/spike-queue.txt` stayed 30 bytes.

## What this binary contains

The native activity in this APK records `spikeActionId` in `spike-action-ledger` with `commit` before the WebView callback, and it accepts both `ok` and `"ok"`. The trace file `files/spike-action-trace.log` shows that path on the phone.

The JavaScript packaged in the same APK is older than the workspace copies of `www/app.js` and `www/protocol.js`. Inside the APK:

- `assets/public/protocol.js` defines `enqueue(kind, payload)` and allocates a new `crypto.randomUUID()` with no `actionId` and no business fields.
- `assets/public/app.js` defines `__spikeAction(action)` with one parameter. `enqueue` sends only `parcelCode` and `evidence`. There is no `enqueuenext` branch. `enqueue100` loops 100 plain enqueues and does not store action ids.

The bridge still calls `window.__spikeAction(action, actionId)`. The extra argument is ignored. `js-accepted` in the trace means the call was invoked. It does not mean the queue file grew, and it does not mean the mock stored an effect.

This is a prototype packaging defect in `05E47DC7…`. It is not a Capacitor platform limit. The workspace source that does pass business identity was not the source inside this installed APK. No second APK was built or installed.

## Preserved local evidence

Before the first new enqueue, the audit had 129 operations and no pending row: 128 confirmed and 1 conflict, all from earlier binaries. Driver A queue file was 39,941 bytes. After the run it was 67,103 bytes. The historical 30-byte file was unchanged. Logout during the run kept the driver A file at 40,203 bytes on both sides of logout. Process death with `am force-stop` kept the same idempotency keys. Driver B's audit had zero operations and `foreignDecryptRejected: true`.

Final audit on this binary: 235 operations, 128 confirmed, 1 conflict, 106 blocked. The 106 blocked rows are the rows this run created. Revoke changed them from pending to blocked. It did not delete the queue file.

## Crash window

The required distinction is: action received, operation durably persisted, authoritative effect confirmed.

The tight attempt used action id `eeeeeeee-eeee-4eee-8eee-eeeeeeeeee01` and ran `am start` and `am force-stop` in one shell command. The trace shows `claim` and then `js-accepted` 13 ms later. The driver A queue file stayed 67,103 bytes. The audit stayed 235. Replaying the same action id produced `skip-accepted` and added zero rows.

The action was received and the ledger consumed the id. The operation was not on disk. The replay did not recreate it. There is no authoritative effect for that action. Recovery did not reuse an operation identity because the queue never received one.

Three earlier attempts, killed by a separate `adb` call after `am start` returned, persisted a row before the kill. Each grew the queue file by 262 bytes. Replay of those ids added zero further rows. Those three show the ledger suppressing a second execution after a row already exists. They do not show survival of an id that was claimed before `save()`.

The installed activity commits the ledger, and the evaluated expression returns `ok`, before `enqueue` finishes `save()`. The phone reproduced silent loss when the process died inside that gap.

## Device tests A–M

Counts below are from this installed hash only. Earlier effect labels on the 128 confirmed rows are historical. The mock started this run with `authoritativeEffectCount` 0. Phone posts did not increase it.

| Test | Result on `05E47DC7…` |
| --- | --- |
| A. One intent, one local operation | One `enqueue` intent, one `js-accepted`, audit 129 to 130, queue file 39,941 to 40,203 bytes. New pending key `ea7dbfc0-14c3-44f3-8345-d4f5f173e3a5`. The native ledger stored the supplied action id. The queue row did not. |
| B. Rapid repeated actions | Two intents with two action ids added two local keys, `e74972f7-5ac1-4942-b931-0c87bb74cf05` and `6868e5a2-97f4-491a-82a3-a14a2fda9a98`. |
| C. Duplicate delivery | The same action id as A was delivered again. Trace `skip-accepted`. Added zero rows. |
| D. Relaunch | Home, then start with no new action, while A's row was the only addition in that window. A configuration-change recreation command was not run. |
| E. Two UUIDs, one business effect | The two rapid keys stayed local. The mock stored neither. Authoritative effect count from the phone stayed 0. |
| F. Lost response | `synclose` posted `ea7dbfc0-14c3-44f3-8345-d4f5f173e3a5` and then fetched it. The key is absent from `mock-api/state.json`. The row stayed pending. No effect id was recovered. |
| G. Mock restart | Phone rows were never stored, so there was no phone effect to recover. Host-only records below did replay after a process restart. |
| H. Concurrent duplicate | Not executed as two in-flight phone requests. The rapid pair is the phone evidence: two local rows, zero effects. |
| I. Next custody transition | `enqueuenext` was `js-accepted` and added zero rows. The installed `app.js` has no branch for that action. |
| J. Logout with pending evidence | Queue file 40,203 bytes before and after logout. Historical file 30 bytes. Relogin restored the same keys, including the pending row. |
| K. Second driver | Driver B audit operations 0. `foreignDecryptRejected: true`. |
| L. Restart with pending evidence | `am force-stop`, then login, same key set. |
| M. 100 distinct operations | `enqueue100` added 100 local rows. Total audit became 235. Sync left those rows pending. Mock `authoritativeEffectCount` stayed 0 and `state.json` operation count stayed 15 until later host-only posts. |

The mock log for the phone sync is `POST /v1/operations` followed by `GET` of the local key. The handler returns HTTP 400 `business-identity-required` when `parcelCode`, `handoverAttempt`, `transition`, or `expectedStateVersion` is missing, and it does not store the row. The installed client does not send those fields.

After revoke, the 106 new rows were blocked: the original pending key, 3 persisted crash rows, 2 rapid keys, and the 100 batch keys. Confirmed stayed 128. Conflict stayed 1. Queue file size stayed 67,103 bytes. Historical file stayed 30 bytes.

## Host-only mock checks

These requests were sent from the workstation to `127.0.0.1:55480`. The phone did not create them. They are not the 100-operation reconciliation.

| Request | Result |
| --- | --- |
| `11111111-1111-4111-8111-111111111111` for `SPIKE-HOST-R41` attempt 1 `accept-custody` version 0 | `effect-38` |
| `22222222-2222-4222-8222-222222222222` for the same business identity | `effect-38`, `businessDuplicate: true` |
| `33333333-3333-4333-8333-333333333333` for attempt 2 `release-custody` version 1 | `effect-39` |
| `Promise.all` of `44444444-4444-4444-8444-444444444444` and `55555555-5555-4555-8555-555555555555` for `SPIKE-HOST-CONCURRENT` | both `effect-41`, one of them `businessDuplicate: true` |
| After stopping the mock process and starting it on the same `state.json` | both host keys for `SPIKE-HOST-R41` returned `effect-38`. Summary `authoritativeEffectCount` 3: `effect-38`, `effect-39`, `effect-41` |

`mock-api/state.pre-r4-device.json` was left in place. The mock is test-only. It is not production financial proof.

## Background location

`shift` called `SpikeLocation.start` with `intervalMs` 15000. The foreground service was listed. With the app sent home for 60 seconds, the sample file grew from 20 rows to 23. New rows in this run used source `update` and accuracy 100. The gaps between consecutive new samples were 20,001 ms through 20,106 ms. Coordinates are omitted.

`stop` removed the service. The sample count stayed 47 across the next 25 seconds. A later `shift` listed the service again. `revoke` posted `/v1/session/revoke`, removed the service, left the sample count at 49, set `shift` false, and left the queue file in place.

This is not a 30-minute background result.

## Screen lock, scan, battery, reboot

`mWakefulness` stayed `Awake` immediately after `KEYCODE_POWER` and again 45 seconds later. `KEYCODE_SLEEP` left it `Awake` immediately and 70 seconds later. No screen-locked interval was observed. A 30-minute locked collection was not run.

No physical barcode, QR, invalid code, or duplicate scan was performed. The USB cable stayed connected, so this run is not a battery-drain result. The phone was not rebooted.

## Manual steps still required

Screen lock, on the same phone, after the USB "stay awake" behavior seen here:

1. Disconnect the USB cable.
2. Leave Settings → Developer options → Stay awake off.
3. Open the Capacitor spike and tap `بدء الوردية`.
4. Lock the screen with the power button and leave it locked for 30 minutes.
5. Reconnect only when the 30 minutes have elapsed.

Physical scan, on the spike screen `نموذج سائق تجريبي`:

1. Tap `مسح تجريبي`.
2. Present one barcode, then one QR code.
3. Present one code the scanner cannot accept, then present the first barcode again.
4. Record the on-screen count and whether a second scan of the same code created a second queue row.

Battery: repeat a 60-minute idle period with the cable unplugged, starting from a noted charge level, and record the level at the end. Do not combine it with a reboot.

Reboot needs a separate approval. It was not performed.

## Classification

| Kind | Item |
| --- | --- |
| Prototype defect | The installed APK's JavaScript does not persist `spikeActionId` or the business identity, even though the activity passes the action id and the workspace source has the newer client. |
| Prototype defect | The ledger consumes the action id before durable `save()`. One force-stop in that gap dropped the operation, and the same action id was then skipped. |
| Prototype defect | `js-accepted` is recorded before the asynchronous queue write. `enqueuenext` was accepted and stored nothing, because that action is absent from the packaged script. |
| Technology limit | Not established. The failures are in this spike package and its activity order. |
| Passed on this binary | In-place install preserved the historical 30-byte queue, the driver A ciphertext, Expo, and the store package. One enqueue intent created one local row. A repeated action id added no second row. Logout, process death, and driver B isolation held. Shift stop and revoke stopped the location service and left the queue file in place. |
| Failed on this binary | Stable operation identity was not stored on the row. The crash gap silently dropped one action. Lost-response sync confirmed no effect. Two local UUIDs produced zero authoritative effects. The next transition was not stored. 100 local rows produced 0 authoritative effects. |
| Host-only | The mock collapsed two request UUIDs to one effect, allowed a later transition, collapsed a concurrent pair, and replayed the stored effect after restart. |
| Remaining manual | 30-minute screen-locked GPS, physical scans, unplugged 60-minute battery, and reboot. |
| Future production acceptance | A production design has to separate action receipt, durable operation identity, and the authoritative effect, and it has to refuse to consume the action before the durable write is verified. This binary and this mock do not provide that acceptance. |

## Recommendation

BLOCKED. `05E47DC711EF83B595167AF4DEBE66BF7E12CDADB5455519602FA6405FA08537` was installed and hashed on the device. The crash-window requirement failed on that binary: an action id was permanently consumed before the queue file grew, and replaying it did not restore the operation. The 100 local operations were not reconciled to 100 authoritative effects.

D09 stays OPEN until independent review. G0 stays OPEN / BLOCKED. This PR is not merged.
