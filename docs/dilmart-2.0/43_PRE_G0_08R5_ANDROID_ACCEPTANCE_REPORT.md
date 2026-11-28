# 43 — PRE-G0-08R5 Android acceptance

Status: evidence only. Android runtime acceptance remains BLOCKED. G0 remains OPEN / BLOCKED. D09 remains OPEN.

Reports 36 through 42 are unchanged. The phone was not rebooted, uninstalled, or data-cleared. Expo was not modified. `com.dilmart.store` was not modified. The APK was not rebuilt. This PR is not merged.

## Installed binary

The approved file was installed with `adb install -r` on the attached Samsung SM-M315F, Android 12, API 31. The installed certificate matched the evidence file before the update: V2 SHA-256 `8400c8daa3996d830f95a220c1c7114dc6945fbc8f10e4c81f39787c1d386939`.

| Check | Result |
| --- | --- |
| Evidence SHA-256 | `2613AA7158357A19BA80CECC070CD0B7F6C7D3C05CCDC0BDFBA9943B0615E51C` |
| Installed base.apk SHA-256 | `2613aa7158357a19ba80cecc070cd0b7f6c7d3c05ccdc0bdfba9943b0615e51c` |
| Size | 27,654,558 bytes |
| Package | `com.dilmart.spike.capacitor`, versionName `1.0` |
| Installed path | `/data/app/~~GG2BNZey_x7NfKYloNFPVw==/com.dilmart.spike.capacitor-lR0oAV-w0rHr0vxQc3HAPg==/base.apk` |
| Packaged JavaScript | `verify-bundle.mjs` passed against the pulled installed APK |

Before the first test launch, `files/spike-queue.txt` was 30 bytes, `files/spike-queue-driver-a.txt` was 67,103 bytes, and `files/spike-queue-driver-b.txt` was 30 bytes. The on-disk audit held 235 historical operations: 128 `confirmed`, 1 `conflict`, 106 `blocked`. Expo `files/spike-samples.jsonl` remained 1,014 bytes. The store and Expo package paths were unchanged.

## Crash windows

The cohort marker was not used in these windows. `cccccccc-cccc-4ccc-8ccc-cccccccccc01` already had older trace lines from a previous `enqueuenext` delivery (`claim`, `skip-accepted`, `js-accepted`). The lines below are the new `enqueue` deliveries from this binary.

| Window | Action id | Observed result |
| --- | --- | --- |
| A. After `RECEIVED`, before the queue write | `…cc01` | Kill left the ledger at `RECEIVED`, 0 matching rows, and the driver A file at 67,103 bytes. Replay then set the ledger to `DURABLY_PERSISTED`. The final audit did not contain this id. |
| B. During the encrypted write | `…cc11`, `…cc12`, `…cc13` | Each delivery was traced `invoked` and then force-stopped. The ledger stayed `RECEIVED` and no row appeared. Between the first and second attempt the driver A file changed from 67,103 bytes to 30 bytes. |
| C. After the queue write, before `DURABLY_PERSISTED` | `…cc03` | `spikeCrashAfter=persisted` left the ledger at `RECEIVED` and 0 rows. Replay set `DURABLY_PERSISTED` and added 0 rows. The final audit did not contain this id. |
| D. After the mock commit, before the response | `…cc04` | `synclose` completed the row as `COMPLETED` with `effect-48`. The retry kept `effect-48`. The authoritative count for `SPIKE-PARCEL-1` attempt 1 `accept-custody` version 0 stayed 1. |
| E. After `SERVER_CONFIRMED`, before `COMPLETED` | `…cc05` | Not executed. `MainActivity` clears every `spikeCrashAfter` value other than `received` and `persisted`. The delivery created one `PENDING_SYNC` row and marked the ledger `DURABLY_PERSISTED`. The process was not stopped between those two queue statuses. |

A and C consumed the action id in the native ledger without a recoverable queue row. That is a lost operation and a premature durable acknowledgment. B did not leave a torn row that could be reconciled. The next login treated the unreadable queue as empty, because `readQueue` returns `[]` when the file is missing, and `login` then saves that empty queue. All 235 historical idempotency keys were absent from the audit after that save.

The 67,103-byte ciphertext copied immediately before window B was written back to `files/spike-queue-driver-a.txt`. The restored bytes matched that copy. A later login decrypted it: the audit returned 235 operations and all 235 baseline keys. `files/spike-queue.txt` and `files/spike-queue-driver-b.txt` were still 30 bytes. This restore puts the historical client rows back. It does not merge them with the cohort rows that were written after the wipe.

## Cohort

The new cohort used parent action `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10`. Child identities are `${parent}:${index}` for `SPIKE-0` through `SPIKE-99`, attempt 1, `accept-custody`, version 0. It ran on the replacement queue, after the historical rows had been overwritten.

| Check | Count |
| --- | --- |
| Distinct child action ids persisted | 100 |
| Child idempotency key equals action id | 100 |
| `PENDING_SYNC` before sync | 100 |
| `COMPLETED` after sync | 100 |
| Unique client effect ids | 100 |
| New authoritative effects for `SPIKE-0`…`SPIKE-99` | 100 |
| Authoritative effects after a second sync | 100 |
| Second parent `…bb11`, local rows added | 100 |
| Authoritative effects after that second parent | 100 |
| `SPIKE-0` effect shared by both parents | `effect-49` |
| Next transition `…bb12`, `SPIKE-PARCEL-1` attempt 2 `release-custody` | 1 new effect, `effect-149` |

The duplicate parent added local rows and no authoritative effects. The lost-response accept remained `effect-48`. After the mock process was stopped and started on the same `state.json`, `GET` of `…bb10:0` returned `effect-49` with status `confirmed`. The driver A summary then reported 105 authoritative effects: the 100 cohort effects, `effect-48`, `effect-149`, and the pre-existing `effect-38`, `effect-39`, and `effect-41`.

The post-cohort client audit held 203 operations and 0 of the 235 historical keys. After the ciphertext restore, the device audit held the 235 historical keys and did not hold the cohort rows. The cohort ciphertext copied before the restore is retained outside Git. The mock file still holds the cohort effects and the older host effects. `mock-api/state.pre-r5-android.json` was not deleted.

## Session writes

`save()` writes the queue ciphertext, then the session token, then the driver, then the shift, then `loginAction`, as separate storage calls. This APK has no crash hook between the token write and the `loginAction` write.

A login for `dddddddd-dddd-4ddd-8ddd-dddddddddd01` was force-stopped in the same shell as the start. The mock already had one session for that action id. Replaying the same id left the count at one. Across the mock file, 31 sessions contain 0 duplicate action ids. The test did not land between the two secure-store writes, so it does not prove that gap is safe. It also did not create a second session for that action id.

Driver B was not opened in this run. Its queue file stayed 30 bytes. The historical driver A rows were lost by the queue-file replacement above and then restored from the pre-interruption copy. That is not evidence that a session crash preserves pending operations.

## Device functionality

These were not run. Windows A, B, and C failed, window E could not be armed, and the historical queue was overwritten during the run.

When a later run is authorized, use the screen `نموذج سائق تجريبي` and do not reboot:

1. Background location: tap `بدء الوردية`, press Home, and leave the phone for the agreed interval. Record sample count and gaps only. Do not record coordinates.
2. Shift end: tap `إنهاء الوردية` and confirm the location service is gone. Do not use revocation while unreconciled rows are pending. Revocation marks pending rows blocked.
3. Screen lock: a USB stay-awake setting can leave the device Awake after the power key. The lock counts only when the display state is Asleep. Then record location samples without coordinates.
4. Scan: tap `مسح تجريبي` and scan one barcode and one QR code with the camera. Record that a value was returned, not a customer payload.
5. Battery: unplug USB before the measurement. Record the start level, duration, and end level. A USB-connected run is not a drain result.

Push notifications were not enabled. Reboot was not performed.

## Recommendation

BLOCKED. The installed APK is the verified `2613AA71…` binary, and its packaged JavaScript matches the pre-install source. On that runtime, receipt-before-write and the persisted-crash replay marked action ids durable without leaving those operations in the queue. A force-stop during the encrypted write was followed by replacement of the historical driver A queue; the pre-interruption ciphertext was restored and decrypted back to 235 historical keys. The new 100-operation cohort reconciled to 100 authoritative effects, a second sync and a second request UUID added none, the next custody transition added one, and a mock restart returned `effect-49`. The server-confirmed crash window cannot be armed in this binary. Screen-lock, scan, and unplugged battery measurements were not taken.

D09 stays OPEN. G0 stays OPEN / BLOCKED. This PR is not merged.
