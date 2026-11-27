# 40 — PRE-G0-08R4 Capacitor focused qualification

Status: evidence only. G0 remains OPEN / BLOCKED. D09 remains OPEN. Capacitor is the leading candidate. It is not the approved production stack.

Reports 36, 37, 38, and 39 are unchanged. Expo source, APKs, and device evidence were left in place. No Expo test was run in this round.

## Baseline

| Item | Value |
| --- | --- |
| Documentation branch | `docs/v2-pre-g0-08-driver-mobile-spike` |
| PR | https://github.com/dilmart-info/Dilmart/pull/81 |
| PR head before this report | `c6470b5be2cbf9aa2d4cb33d55940c823d944220` |
| Prototype workspace | `D:\DilMart-driver-spike` (outside the PR) |
| Installed Capacitor binary | `796DACCAA3B5B18BF2E901CC1537300E311C23D053A7418CAC37C33814AB59F5` |
| Corrected candidate | `05E47DC711EF83B595167AF4DEBE66BF7E12CDADB5455519602FA6405FA08537` |

`com.dilmart.store` was not changed. The corrected APK was not installed. No uninstall or data clear was performed.

## P0-01 — why one enqueue intent created two operation IDs

This is a prototype defect in the spike activity, not a Capacitor platform limit.

`Bridge.eval` posts `WebView.evaluateJavascript`. That callback receives a JSON-encoded result, so the JavaScript value `ok` arrives as `"ok"` with quotation marks. `MainActivity` compared the callback with the bare string `ok`. The comparison failed, so `spikeConsumed` was never set and the in-memory `inFlight` flag was cleared.

The same intent was then dispatched again:

- `BridgeActivity.load()` calls `onNewIntent` during creation.
- `onResume` called `dispatchSpikeAction` immediately.
- `onResume` also posted the same dispatch again after 1,500 ms, with no new action identity.

The immediate second call was skipped while `inFlight` was set. After the quoted callback cleared that flag, the delayed call ran `enqueue` again. `enqueue` allocated a new `crypto.randomUUID()` and had no action id. The button listener was not on this path. Report 39 measured the result on `796DACCA…`: one enqueue intent added two local keys.

The corrected activity gives each intent one `spikeActionId`. That id is stored on the intent, in `onSaveInstanceState`, and in `SharedPreferences` name `spike-action-ledger` with `commit` before JavaScript runs. A later lifecycle call for the same id is skipped. The WebView result is accepted both as `ok` and as `"ok"`. A retry is scheduled only when the page is not ready, and it reuses the same id. The queue row stores `actionId`. A second call with that id returns the existing row instead of allocating another UUID.

A local model of the old comparison reproduces two executions for the quoted result. The same event sequence with the persisted id produces one execution. That model is not a phone test of `05E47DC7…`.

## P0-02 — request idempotency and business uniqueness

The mock remains test-only. It is not production transaction or financial proof.

Request idempotency is unchanged: the same idempotency key and payload hash replay; the same key with a different hash returns HTTP 409.

Business identity is separate. It is `parcelCode`, `handoverAttempt`, `transition`, and `expectedStateVersion`, scoped by the synthetic driver. Payload hash is not the business key. The check and the write happen before the handler yields. The record is stored in `mock-api/state.json`. A second request UUID for the same business identity is stored as an alias and returns the original `effectId`. A later handover uses a different attempt, transition, and expected version, and receives a new effect.

The custody action now sends `SPIKE-PARCEL-1`, attempt `1`, transition `accept-custody`, expected version `0`. `enqueuenext` sends attempt `2`, transition `release-custody`, expected version `1`.

## Local proofs

These ran on the workstation. They are not results from the corrected APK on the phone.

| Proof | Result |
| --- | --- |
| `node protocol/test.mjs` | Passed. Exit 0. |
| `node mock-api/business.test.mjs` | Passed. Two UUIDs for one transition returned one effect. A changed hash on the same key returned 409. A lost response and a second UUID recovered the same effect. Two concurrent posts returned one effect. The next transition received a different effect. One hundred distinct parcel operations were included in an authoritative count of 104 unique effect ids (those 100 plus the four earlier distinct transitions). After a new mock process loaded the same file, the original key replayed the original effect. Driver B received HTTP 404 for driver A's operation. |
| `node capacitor-driver/action-lifecycle.test.mjs` | Passed. Quoted `ok` produced 2 legacy executions and 1 persisted-id execution. |

## P0-04 — corrected binary

The spike workspace is not the Git revision. The lockfile was not changed.

| Item | Value |
| --- | --- |
| Lockfile SHA-256 | `73CA67A64DA383411E1013F9A8E69A9C2A965342E72B7A0643D0FD15BBD895CF` |
| Command | `gradlew.bat clean assembleDebug` |
| JDK | `C:\Program Files\Java\jdk-21.0.11` |
| First build | Exit 0, 40 s |
| Second build | Exit 0, 12 s |
| Both APKs | 27,651,694 bytes |
| Both SHA-256 | `05E47DC711EF83B595167AF4DEBE66BF7E12CDADB5455519602FA6405FA08537` |
| Application id | `com.dilmart.spike.capacitor` |
| versionName | `1.0` |
| Certificate SHA-256 | `8400c8daa3996d830f95a220c1c7114dc6945fbc8f10e4c81f39787c1d386939` |

The certificate matches the Capacitor package already on the phone, so an in-place update is signature-compatible. It was not installed.

## P0-03 and P0-05 — not run on `05E47DC7…`

Phone tests A through M were not run on this binary. Report 39's counts remain evidence for `796DACCA…` only.

Not run: 30-minute background GPS, 30-minute screen-locked GPS, shift-end and revocation stop on this binary, physical barcode and QR scans, invalid and duplicate scans, unplugged 60-minute battery, and reboot. Push remains separately blocked.

## Classification

| Kind | Item |
| --- | --- |
| Prototype defect | One intent dispatched twice because the WebView result was quoted and the delayed dispatch had no stable action id. |
| Prototype defect | `enqueue` allocated a new UUID for every call. |
| Technology limit | Not established. The duplicate was in the spike activity. |
| Passed locally | Mock business uniqueness, request conflict, restart replay, and the lifecycle model. |
| Passed on the previous phone binary | Retention and driver isolation from report 39. Those results are not transferred to `05E47DC7…`. |
| Remaining | Install approval, then phone tests A–M on the installed hash, then the manual qualification list. |
| Future production acceptance | A production design must define the authoritative business identity, persistence, and concurrency control. This mock does not provide that. |

## Recommendation

BLOCKED. The corrected candidate is built and reproducible, and the local uniqueness proofs passed. The required phone regression has not been run on `05E47DC7…`.

Owner approval is required before `adb install -r` of `D:\DilMart-driver-spike\evidence\capacitor-r4-clean-1.apk` onto `com.dilmart.spike.capacitor`. The update must keep existing spike data. No uninstall and no data clear.

D09 stays OPEN. G0 stays OPEN / BLOCKED. This PR is not merged.
