# Native bridge contract (candidate, not a frozen interface)
Evidence: PR #81 reports 44–46, merged historical evidence; 45 records real Android 12 arm64 102/102 and emulator 98/98, SQLCipher 4.20.0 and platform-reported TEE. 46 records scanner module now installed, UI opened/canceled, no decode; SP-06 BLOCKED. SP-02 true lock OPEN, SP-05 battery OPEN, reboot/push not authorized, F1 unfixed. D09 OPEN. No production stack version frozen.
| Logical capability | Required contract |
|---|---|
| Session | authenticated actor derived natively; atomic/recoverable token and actor transition; no caller actor override |
| Operation repository | native transaction commits action inbox, operation and event; stable action/operation/business IDs; only then bridge ACK |
| Queue | encrypted SQLCipher candidate, Keystore wrapping non-exportable key, no key in JS; per-actor queries; receipts/events atomic |
| Recovery | query by ID; same action returns original row; missing/corrupt/wrong-key/full fails closed; no empty overwrite |
| Synchronization | durable pending, status lookup on uncertainty, same key/hash retry, server effect dedupe; dependencies and bounded retry |
| Location | check/request permission before shift/service; catch SecurityException; authorized shift only, stop on end/logout/revoke, report actual freshness |
| Scanner | bundled ML Kit startScan candidate or verified ZXing fallback; explicit camera permission, cancel, opaque scoped code, no first-use download reliance; physical offline tests outstanding |
| Navigation | approved adapter/deep link; context and version; no fabricated ETA |
| Push | not authorized; wake-up hint then API fetch |
| Storage migration | versioned transactions; preserve pending evidence across upgrade; refuse downgrade or unsafe recovery |
Names/types above are logical, not actual plugin method signatures. PRE-G0-10 and D09 approve final interfaces. No crash harness/exported bypass in release; backup and transfer exclusions, OEM testing and attestation limitations; no real PII in logs, no database key extraction. Test each crash boundary, actor switch, revocation, wrong key, storage full, power/reboot as separately authorized. Preserve historical spike evidence, never migrate it to product. Production native code must be independently reviewed, not blindly copied from spike.
