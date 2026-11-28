# 39 — PRE-G0-08R3 additional device evidence

Status: evidence only. G0 remains OPEN / BLOCKED. D09 remains OPEN. No candidate is selected.

Reports 36, 37, and 38 are unchanged. Results below belong to the binaries named in this file. They do not replace results recorded for a different APK.

## Baseline

| Item | Value |
| --- | --- |
| Documentation branch | `docs/v2-pre-g0-08-driver-mobile-spike` |
| PR | https://github.com/dilmart-info/Dilmart/pull/81 |
| PR head before this report | `ee853554cff9ad881811f51fd257c4641edec017` |
| Prototype workspace | `D:\DilMart-driver-spike` |
| Device | Samsung SM-M315F, Android 12, API 31. Serial omitted. USB powered, battery level 100. |

`com.dilmart.store` stayed `/data/app/~~VeQwGOEmY_4vBhCB6dJi1A==/com.dilmart.store-VKS-jAm1KSgPbav017wJHA==/base.apk`. No production database, Render service, push project, uninstall, or data clear was used.

## In-place updates

Identity and signing were checked before `adb install -r`.

| Package | Approved or retested file | SHA-256 | Bytes | Certificate SHA-256 | Installed certificate |
| --- | --- | --- | --- | --- | --- |
| `com.dilmart.spike.expo` | `evidence/expo-r2-uninstalled.apk` | `FB9B45904A93A74714992A587283426EDFDCE11691EFC0D1A9465ED0BDE12401` | 171,646,714 | `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` | Same debug certificate as the previously installed Expo APK |
| `com.dilmart.spike.capacitor` | `evidence/capacitor-clean-1.apk` | `796DACCAA3B5B18BF2E901CC1537300E311C23D053A7418CAC37C33814AB59F5` | 27,651,694 | `8400c8daa3996d830f95a220c1c7114dc6945fbc8f10e4c81f39787c1d386939` | Same debug certificate as the previously installed Capacitor APK |

Both `adb install -r` commands returned Success. Pulled base APKs matched those two hashes. The Expo sample file was 312 bytes before and after install. The historical Capacitor file `files/spike-queue.txt` stayed 30 bytes. Neither package was uninstalled.

Report 38's integrity numbers were measured on Capacitor `A2647E92…`. They are not results for `796DACCA…`.

## One action and several operation IDs

On `796DACCA…`, after `am force-stop` and a fresh synthetic login, one `spikeAction=enqueue` intent created two PENDING keys. The same measurement was repeated:

| Start | Queue length before | Queue length after | New keys |
| --- | --- | --- | --- |
| First controlled enqueue | 123 | 125 | `e3746861-b203-4d5d-a9a8-67b1c78426aa`, `9e59cf4c-6d68-4f68-a733-d33de0982e2e` |
| Second controlled enqueue | 125 | 127 | `6aef5521-1498-4ee7-b16b-c7d0a4c426b1`, `e4786f3a-40d8-4c09-a49f-3cabb08f3bc4` |
| Enqueue after another force-stop and login | 127 | 129 | `482b114a-b5cc-4faa-aad1-62f630722a1f`, `f8c8ba6d-2076-4821-9669-a56b03e7ed93` |

Two enqueue intents sent back to back, before this controlled restart, added four keys: `d053bfb1-cd8a-4d91-8e8d-bae33c0553ab`, `5a0c8fcb-718c-4283-8f07-7b06bda920ba`, `4a7f0805-7387-4b3e-99db-e17da137907b`, and `9049544d-de22-418c-8dac-6ebc909de800`. All of these rows used the same custody payload hash `686b2217e1d7f4acb7cd55567ed08540510ce39ae8ddf750680d67e2254774d6`.

Bringing the existing task to the front with `am start` and no new `spikeAction` left the queue at 127. That relaunch did not add a key. The duplicate is the redelivery of an enqueue intent, not an ordinary resume.

A later sync of one key did not create a second effect for that key. After the lost-response sync, keys `e3746861…`, `9e59cf4c…`, `6aef5521…`, and `e4786f3a…` were `confirmed` as `effect-23` through `effect-26`. A second sync kept those four ids. The two keys created for the 429 test stayed PENDING and were absent from the mock store while `?status=429` was applied. The following normal sync confirmed them once, as `effect-28` and `effect-29`. Another sync kept those ids.

The in-flight guard inside `796DACCA…` does not make one enqueue intent produce one operation id. This gate fails on that binary.

## Preserved Capacitor queue

The clean APK decrypted the queue left by the earlier Capacitor install. Logout wrote no empty queue. `files/spike-queue-driver-a.txt` stayed 38,051 bytes across logout, and `files/spike-queue.txt` stayed 30 bytes. Login as driver A restored the same 123 keys that were present before that logout. Login as driver B showed `operations: []` and `foreignDecryptRejected: true`. `am force-stop` left driver B's empty audit unchanged. The next driver A login restored the same 123 keys.

That is retention of existing ciphertext on this binary. It is not a new 100-operation run, and it is not the report 38 result.

## Mock persistence and task isolation

The loopback mock now writes sessions, operations, and the sequence counter to `mock-api/state.json`. After the mock process was stopped and started again, a repeat POST of key `86bb8d6f-16df-48db-858c-1b6edc53be7f` with the same payload hash returned `replayed: true` and `effect-2`. A different hash for that key returned HTTP 409. A new key after the restart received `effect-20`, so the counter continued instead of starting again at `effect-1`.

Direct calls, not the spike screens:

| Call | Result |
| --- | --- |
| Driver A `GET /v1/tasks?mode=pickup` | HTTP 200, task `task-pickup-1`, parcel `SPIKE-PARCEL-1`, merchant `Synthetic Merchant`, no `contactPhone` |
| Driver B `GET /v1/tasks?mode=pickup` | HTTP 200, task `task-pickup-b`, parcel `SPIKE-B`, merchant `Synthetic Merchant B`, no `contactPhone` |
| Driver B `GET /v1/tasks?mode=delivery` | HTTP 404 `not-assigned` |
| Driver A `GET /v1/tasks?mode=delivery` | HTTP 404 `not-assigned` |
| Pickup with no token | HTTP 401 `unauthorized` |
| Driver B `GET /v1/operations/86bb8d6f-16df-48db-858c-1b6edc53be7f` | HTTP 404 `missing` |
| `GET /v1/summary` | Driver A had 8 stored operations. Driver B had 0 |

These are persistent mock records for this test process. Older effect labels still stored in the phone's historical queue came from an earlier in-memory mock and are not records in this state file.

## Expo `FB9B4590…`

Synthetic login for driver A and driver B changed the on-screen session line. The custody button did not. After those taps there was no `queue-driver-a.txt` or `queue-driver-b.txt`, the pending line stayed `معلّق 0`, and a search of the app directory found no queue file. Logout also left the session line unchanged. Login and shift start do not encrypt a queue; custody and logout do. The device result is that this APK did not persist a custody operation.

Shift start set `files/shift.txt` to `1` and the screen to `وردية نشطة`. New samples, excluding the four historical lines, were about 30,021–30,106 ms apart. Accuracy on those lines was 100. Coordinates are not published. The workspace source for this APK requests 15 seconds. The device did not deliver a 15-second cadence in this window.

The screen was turned off for about 50 seconds during that shift. The sample count went from 11 to 13, with the same about-30-second spacing. This is a short locked window, not a 30-minute result. Shift stop set `shift.txt` back to `0`. A later read stayed at 13 lines. The historical sample bytes remain in the same file. The file was 312 bytes immediately after the in-place install.

Driver B's screen did not show driver A rows because driver A had no stored queue. That is not a passed isolation test. The mock HTTP test above is the isolation evidence.

## Not run on these binaries

- Capacitor foreground, background, and screen-locked location on `796DACCA…`.
- A 30-minute location window for either app.
- Physical barcode, QR, invalid, duplicate, and 100-scan timing.
- Unplugged 60-minute battery. The phone remained on USB power.
- Reboot and wireless ADB.
- Push delivery.
- A second clean Expo pair. Only the named Expo hash was installed.
- An enqueue of 100 new parcels on `796DACCA…`.

## Recommendation

BLOCKED. `796DACCA…` keeps an existing encrypted queue across logout and process death, and a second synthetic driver cannot decrypt it. One enqueue intent on that same binary creates two operation ids and, after sync, two effects for one custody payload. `FB9B4590…` logs in and can record a short location window, including about 50 seconds with the screen off, and it stops after shift end. It does not write a custody queue. Screen lock longer than this short window, physical scans, unplugged battery, reboot, and push remain open. D09 stays OPEN. G0 stays OPEN / BLOCKED.
