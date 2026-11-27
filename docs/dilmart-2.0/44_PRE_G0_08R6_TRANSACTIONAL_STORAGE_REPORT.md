# 44 — PRE-G0-08R6 Transactional Local Storage Architecture

Status: **PASS WITH NOTES — native storage qualification on a disposable emulator.**
Physical-phone acceptance: **NOT EXECUTED (not authorized).** D09: **OPEN.** G0: **OPEN / BLOCKED.**

Preceding verdict carried forward: PRE-G0-08R5 Android acceptance FAIL / BLOCKED (report 43). Reports 36–43 are unchanged.
PR: [#81](https://github.com/dilmart-info/Dilmart/pull/81), previous verified head `4e043c948cbed51a0bdd2ee8477df390a8c25066`.

No production database, backend, Render service, Supabase project, Expo app or customer app was touched.
No APK was installed on the phone. The phone was not rebooted, its application data was not cleared, and no historical record was merged, replayed, overwritten or deleted.

---

## 1. Decision

The driver operation store moves from the whole-file encrypted queue (R5) to **an isolated native transactional store: SQLCipher for Android 4.20.0 behind a minimal Capacitor plugin (`SpikeStore`), keyed by a random 256-bit database key wrapped by a non-exportable Android Keystore AES-256-GCM key** (alternative B).

The whole-file queue is no longer the primary operation store in the qualification build. The historical R5 files on the phone are not read, migrated or replaced by the new store.

## 2. Alternatives and compatibility evidence

| Criterion | A. `@capacitor-community/sqlite` 8.1.1 | B. Minimal native plugin + `net.zetetic:sqlcipher-android` 4.20.0 (chosen) |
|---|---|---|
| Capacitor 8 | Peer `@capacitor/core >=8.0.0` | Plain `@CapacitorPlugin`, built against Capacitor 8.6.3 |
| Android API | minSdk 24, compileSdk 36 | minSdk 24, compile/target 36; native libs for arm64-v8a, armeabi-v7a, x86, x86_64 |
| Licence / cost | MIT; bundles SQLCipher 4.17.0 (BSD) | SQLCipher Community Edition BSD-3-Clause (Zetetic LLC); `androidx.sqlite` 2.7.0 Apache-2.0; no paid licence |
| Maintenance | Last publish 2026-11-23 | SQLCipher 4.20.0 released 2026-10-27; plugin code is ~1 k lines owned by us |
| Transaction semantics | `beginTransaction` / `commitTransaction` / `rollbackTransaction` are **separate bridge calls**; a WebView death between them leaves the outcome to the plugin's connection lifecycle | One bridge call = one native transaction (inbox + queue + event + seq), resolved only after commit |
| Encryption key path | Passphrase is supplied **from JavaScript** (`setEncryptionSecret`) and stored in EncryptedSharedPreferences | DB key never enters the WebView; generated, wrapped and unwrapped natively |
| Key protection | `androidx.security:security-crypto:1.1.0-alpha06` (alpha, deprecated line) | Android Keystore directly; wrapped key file written with tmp + fsync + rename |
| Fail-closed behaviour | Legacy fallback secret `"sqlite secret"` present in source; default corruption handling not under our control | Custom `DatabaseErrorHandler` that throws (the framework default deletes the file); explicit codes, never re-initializes |
| Schema migration | Upgrade statements via JS API | Versioned migrations, one transaction per version, newer schema refused |
| Build complexity | Larger dependency set (room-runtime, biometric, jeep-sqlite web) | Two Gradle dependencies (`sqlcipher-android`, `androidx.sqlite`) plus transitive `kotlin-stdlib` |

Ordinary SQLite was not assumed to be encrypted: the raw database file was inspected on device (section 7). Encrypted preferences were not treated as a transactional store; they are not used for operations or session.

A was rejected because the key crosses the JS bridge, it depends on an alpha crypto library, it contains a hard-coded fallback secret, and its transactions span multiple bridge calls — the exact failure class R5 exhibited.

## 3. Source revisions and dependency versions

The spike workspace is not a Git repository; revisions are identified by SHA-256 (first 16 hex shown; full values in the local evidence folder).

| Artifact | SHA-256 (prefix) |
|---|---|
| `store/OperationStore.java` (final) | `1983BDA6747363A2` |
| `store/StoreKey.java` | `E1FD95688A1CD73E` |
| `SpikeStorePlugin.java` | `6DFEC93EFC941DF7` |
| `StoreHarnessActivity.java` (final) | `44D396C3989D4D74` |
| `www/store-client.js` | `341955B1EB26066D` |
| `www/actions.js` | `90D3C80E54A5A3E7` |
| `www/app.js` | `060F345921C6E6CC` |
| Host driver `r6-native.mjs` | `3FDD059FD1549223` |
| Qualification APK v1 / v2 (bridge run) | `649557F5CBDB8A2C` / `8DE7967E9B5C2E7A` |
| Qualification APK v5 / v6 (final store) | `83F503A785C7BC9A` / `7AD0E65CC5680A22` |

Dependencies: Capacitor core/android/cli 8.6.3, `net.zetetic:sqlcipher-android:4.20.0`, `androidx.sqlite:sqlite:2.7.0`, JDK 21.0.11, compileSdk/targetSdk 36, minSdk 24.
`verify-bundle.mjs` confirmed every packaged `assets/public` JS file (including `store-client.js`) is byte-identical to source for v1, v2, v3, v4, v5 and v6.

APKs and device evidence are kept locally only and are not committed.

## 4. Schema

Database `databases/<name>.db` (SQLCipher); wrapped key and initialization marker in `noBackupFilesDir/store/`. PRAGMAs `journal_mode=DELETE`, `synchronous=FULL`, `foreign_keys=ON`. Schema version 2.

| Table | Purpose | Key constraints |
|---|---|---|
| `meta` | `store_id`, `seq`, `schema_version` | PK `key` |
| `session_state` | single row: `actor_id`, `token`, `shift`, `login_action_id`, `generation` | `CHECK (id = 1)` |
| `action_inbox` | every delivered action | PK `action_id`; `disposition IN ('CREATED','DUPLICATE_BUSINESS')`; no UPDATE/DELETE (triggers) |
| `operation_queue` | one row per business operation | PK `operation_id`; `action_id UNIQUE REFERENCES action_inbox`; `UNIQUE(actor_id, business_operation_key)`; status CHECK; no DELETE; identity columns immutable (trigger) |
| `operation_events` | append-only state history | FK to queue; no UPDATE/DELETE |
| `sync_receipts` | server effect per operation | PK/FK `operation_id`; no UPDATE/DELETE |

Stable identities: `action_id`, `operation_id` (= creating `action_id`), `business_operation_key` (`parcel|attempt|transition|expectedVersion`, parsed natively from the payload), `actor_id` (from `session_state`, never from the caller), `expected_version`, `payload_hash` (SHA-256 computed natively). v2 migration adds `sync_attempts`.

## 5. Transaction boundaries

| Call | Single transaction contains | Acknowledgment |
|---|---|---|
| `enqueue` | session-actor check → inbox lookup (replay / actor mismatch) → business-key lookup (duplicate) → inbox insert → queue insert → event → seq | Bridge resolves after `endTransaction` returns |
| `login` | replay check (same `loginActionId` + actor) → session row update, generation + 1 | after commit |
| `logout` | session actor/token cleared, generation + 1; operations untouched | after commit |
| `recordReceipt` | ownership check → existing receipt (replay / `receipt-conflict`) → receipt insert → `SERVER_CONFIRMED` → event | after commit |
| `complete`, `markTerminal` | state guard → status update → event | after commit |
| migration | one transaction per schema version | — |

Errors map to codes: `storage-full`, `storage-low`, `constraint-violation`, `store-write-failed`, `no-session`, `action-actor-mismatch`, `business-identity-required`, `receipt-conflict`.

## 6. Encryption and key model

1. First open generates 32 random bytes (DB key) and a Keystore AES-256-GCM key `dilmart.spike.store.<name>` (non-exportable, randomized encryption).
2. Wrapped key `[version][ivLen][iv][ciphertext+tag]` is written to `noBackupFilesDir/store/<name>.key` via tmp + fsync + rename. A marker `<name>.initialized` records the `store_id`.
3. Each open unwraps the DB key and passes it as a raw-key passphrase (`x'…'`), so no KDF secret exists in code or JS.
4. Fail-closed rules: marker without DB → `store-missing`; missing/unwrappable key → `key-unavailable`; open/read failure → `store-unreadable`; `quick_check`/`cipher_integrity_check` failure → `store-corrupt`; `store_id` mismatch → `store-identity-mismatch`; DB without marker and with records → `store-unmarked`; newer schema → `schema-newer`. None of these paths creates a replacement database.

Actor isolation is **logical** (every read/write scoped to the committed session actor; cross-actor action ids rejected). R5's per-actor encryption keys are not reproduced. See section 11.

## 7. Native crash and fault results

Target: disposable AVD `DilMart_R6_Disposable` (Google APIs Play Store image, Android API 37, x86_64), created for R6 and **deleted after the tests**. The locked `Pixel_10a` AVD and its hung emulator processes were not stopped, unlocked or modified; a read-only second instance was refused by the emulator because the original was not started read-only.

Every native case ran through the real APK: a translucent harness activity calling the production store class in a new process, process death by `killProcess` at named crash points, then a cold reopen. A deterministic baseline of **235 synthetic operations** (128 COMPLETED with receipts, 1 CONFLICT, 106 BLOCKED) was seeded; after every recovery all 235 canonical identity lines (`operation|action|actor|businessKey|version|payloadHash|status|effect`) were compared, plus counts, orphan checks and a digest. File size was not used as evidence.

### Final native run (APK v5, update to v6): **59 / 59 PASS**

| Case | Result |
|---|---|
| Crash before transaction begins | no row, no inbox orphan; retry creates once; repeat returns original identity |
| Crash after inbox insert (during insertion) | no partial action or operation |
| Crash before commit | no partial action or operation |
| Crash immediately after commit | operation durable exactly once; redelivery returns original identity |
| Duplicate action delivery | `replayed: true`, same `operation_id`, no new row |
| Duplicate business transition (new action id) | returns original operation, `DUPLICATE_BUSINESS` inbox row, 0 new operations |
| Concurrent insertion (12 threads) | same action → 1 identity; same business key → 1 identity; 4 distinct → 4 identities; exactly 6 rows; no errors |
| Crash before receipt commit / after receipt | stays `PENDING_SYNC` / receipt durable; same effect replays, different effect `receipt-conflict` |
| Crash before completion commit | stays `SERVER_CONFIRMED`, completes after recovery |
| Session crash before / after commit | previous session intact / new session durable; repeated login action replays without new generation |
| Logout crash before commit; logout | session intact; logout clears actor + token and keeps all operations |
| Actor switch | driver-b sees 0 of driver-a's operations; reusing driver-a's action id → `action-actor-mismatch`; driver-a's 9 open operations return after re-login |
| Storage full (`SQLITE_FULL` under `max_page_count`) | 5 accepted then `storage-full`; failed operation left no partial row; evidence preserved |
| Low storage preflight | `storage-low`, no write |
| Encryption at rest | raw file has no SQLite header and no parcel, payload or token plaintext |
| Missing DB file | `store-missing`, no replacement created; restored file identical |
| Corrupted DB | `store-corrupt`, corrupted file preserved byte-for-byte; restored file identical |
| Incorrect key | `store-unreadable`, DB hash unchanged; original key reopens identical store |
| Keystore key loss | `key-unavailable`, DB hash unchanged, file kept; repeated opens still `key-unavailable` (never re-initialized) |
| Migration v1 → v2 with crash before commit | stays v1 with identical identities; migrates on next open; older code refuses with `schema-newer` |
| Application update in place (v5 → v6) | all stores reopen with identical digests (also passed v1 → v2 and v3 → v4) |

### JS-bridge and sync protocol run (APK v1 → v2, disposable mock state, separate from live mock state)

| Case | Result |
|---|---|
| Crash before bridge acknowledgment (`store-before-ack`) | committed row present; redelivery returned original identity |
| Crash before commit via bridge | no partial row, no orphan |
| 100-operation cohort | 100 created |
| Crash after mock commit, before response handling (`store-after-post`) | next sync re-posted with same idempotency key; mock 101 effects / 101 distinct |
| Full sync then second sync | all completed; second sync posted 0 |
| Duplicate business cohort with 100 new action ids | 0 created, 100 duplicates |
| Lost response (`?lose=1`) | recovered by status lookup, 0 pending |
| Legitimate next custody transition | completed once, new effect |
| Mock effects | 102 authoritative / 102 distinct = local 102 operations / 102 distinct effects |
| Mock restart, replay sync | 0 posted, effects stay 102 |
| Baseline 235 identities | intact |

Run history (no result was discarded):
- Run 1 aborted before any check: the host driver parsed `adb exec-out` error text as JSON (driver defect).
- Run 2 (v1/v2): 70 / 74. Failures: storage-full ×2 (a single insert fit in page slack, so no `SQLITE_FULL` occurred — harness defect), low-storage (correct `storage-low`, but count check inherited the extra row), local-effect count (driver split the row on `|` although the business key contains `|`; the mock independently showed 102 distinct effects). The local effects were re-verified correctly in runs 3 and 4: 102 COMPLETED, 102 distinct.
- Run 3 (v3/v4): 56 / 59. The looped storage-full harness exposed a **real store defect**: after SQLCipher's automatic rollback on `SQLITE_FULL`, the explicit `endTransaction` threw "cannot rollback – no transaction is active" and replaced the `storage-full` code with a raw exception (data stayed consistent: 245 + 5 accepted, no orphans).
- Fix: `tx()` keeps the primary error authoritative and attaches the rollback failure as suppressed.
- Run 4 (v5/v6): 59 / 59.

The JS-bridge run used the pre-fix v1 build; the fix only changes the error path when rollback itself fails. The bridge store was re-verified under v3–v6 (102 operations, 102 distinct effects, 235 baseline identities intact).

Run 2 mock state SHA-256 prefix `4AD1E67087257732`; result files `r6-native-results-2/3/4.json` prefixes `5ADF4225042B3EBF` / `64D9D23C1DDD7EC7` / `59EAB072CE91E46A`.

## 8. Preserved mock behaviours

Request idempotency, business-effect uniqueness, lost-response recovery, persistent mock restart recovery, 100 operations = 100 effects, zero additional effects on replay, and a legitimate next custody transition all held through the new store. The sync wire format (`idempotencyKey`, `payloadHash`, `business`, `kind`, `payload`) is unchanged.

## 9. Session consistency

R5 audit:
- Token, actor, shift and loginAction were separate encrypted-preference writes, and the queue was a separate file.
- `readQueue` returned `[]` when the file was missing or undecryptable, and login then saved that empty queue.
- That is how 235 historical keys were lost in window B.

R6 protocol:
- The session is one row in the same encrypted database, written in one transaction.
- Login with the same `loginActionId` and actor replays.
- Login never writes operations.
- Logout clears only actor and token, then increments the generation.
- The actor used for every operation is read from the committed session row inside the same transaction.
- A partial session write is impossible (crash before commit leaves the old row); a session failure cannot expose another actor's rows or remove pending work (section 7).

## 10. Historical evidence preservation

Inventory written read-only (`adb exec-out run-as … cat`; nothing written to the phone). Manifest `r6-preserve/manifest.json` SHA-256 `d957a2f70ff05eb441b112c7962f840be8235a6789196a518b565cf10520fba5`, 20 files. The live mock `state.json` remained `3B716C0B…` throughout.

| Evidence | Size (bytes) | SHA-256 (prefix) |
|---|---|---|
| Historical encrypted queue backup `r5-queue-before-b.bin` | 67,103 | `5C4AF640` |
| Separate cohort ciphertext `r5-queue-after-cohort.bin` | 121,055 | `DB1A1594` |
| Cohort audit `r5-audit-after-cohort.json` | 62,007 | `F03DE76B` |
| Baseline keys `r5-baseline-keys.json` | 9,166 | `9B0C24A3` |
| Mock persistent state `state.json` | 79,961 | `3B716C0B` |
| R5 APK `capacitor-r5-verified.apk` | 27,654,558 | `2613AA71` |

Plus device read-only copies of the current queue files, audit, action trace and action ledger, and an R5 source snapshot.

Reconciliation findings (not resolved, preserved as-is):
- The restored device queue contains all 235 historical identities. Its ciphertext differs from the backup because the post-restore login re-encrypted with a new AES-GCM IV, so byte equality is not expected.
- The device audit has 235 operations. The separate cohort audit has 203, and none of them are among the 235 historical keys.
- The device queue holds 0 cohort keys. Device and cohort evidence are therefore disjoint and both must be kept.
- Ledger: 23 DURABLY_PERSISTED and 1 RECEIVED. The RECEIVED entry is the never-completed first R5 login `aaaaaaaa-…aa01`; the mock has no session for it.
- Mock: 31 sessions and 223 operations.

No merge, replay, overwrite or deletion was performed. No sensitive evidence is in Git.

## 11. Blockers and limitations

1. **Phone acceptance not executed.** The emulator is API 37 x86_64. The phone is API 31 arm64 (Samsung). Keystore behaviour, the SQLCipher arm64 native library and Samsung storage behaviour are unverified on target hardware.
2. **Emulator Keystore is software-backed.** Key-loss and wrong-key behaviour was proven functionally; hardware-backed protection (TEE/StrongBox) and attestation were not.
3. **Process death, not power loss.** Crashes used `killProcess`. `synchronous=FULL` with a rollback journal is designed for power-loss durability but was not tested with a power cut.
4. **Simulated storage exhaustion.** Storage full was produced with `max_page_count` (a real `SQLITE_FULL`), and low storage with the preflight threshold. A physically full disk was not tested.
5. **Logical actor isolation only.** There is no per-actor key.
6. **Fresh install and cleared data look the same** when both marker and database are gone. The store cannot detect that case.
7. **Exported test harness.** `StoreHarnessActivity` is exported and accepts crash points. It is a spike-only test surface and must not ship.
8. **Legacy code still bundled.** The whole-file queue code and the SharedPreferences action ledger remain in the APK for the old actions. The R6 store neither reads nor migrates the historical queue.
9. **Bridge run predates the fix.** The JS-bridge run used the pre-fix build (see section 7).
10. **Backup exposure (untested).** The manifest keeps `android:allowBackup="true"`, so the encrypted `databases/` file is eligible for Android backup while its key is not. A restore would fail closed (`store-unmarked` or `key-unavailable`), but the ciphertext could still leave the device. Exclude it from backup, or disable backup, before any phone round.
11. Emulator `Pixel_10a` remains locked by a hung Android Studio emulator session that has been running since 2026-11-25. It was left untouched.

## 12. Recommendation

- Adopt alternative B as the candidate local operation store for the driver app spike.
- Do **not** install it on the phone until the product owner separately authorizes a physical-device acceptance round. That round should include:
  - (a) an R6-only package with the harness kept out of production builds and backup exclusion for the store;
  - (b) a phone-side rerun of the native matrix on fresh synthetic stores;
  - (c) explicit confirmation that the historical R5 files remain untouched and unread;
  - (d) a separately approved, manual and read-only reconciliation plan for the historical queue and cohort evidence.
- Hardware-backed key verification and a power-loss test are recommended before G0.

D09 remains **OPEN**. G0 remains **OPEN / BLOCKED**. No PR merge.
