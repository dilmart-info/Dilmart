# BATCH001 Readiness

## Binding

| Item | Value |
|---|---|
| Batch ID | `batch001` |
| Merchant | `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg`) |
| Manifest SHA-256 | `D5AC84F0FA39F5C962AF882E08EE2C4F8EB9007C2EACCD745C2E3F96D1EE0CDB` |
| Batch size cap | 200 |
| Selection rule | `stable_source_order_valid_complete_image` |

## Dry-run

| Metric | Value |
|---|---|
| Selected READY (capped) | **200** |
| Would create | **200** |
| Existing SKU skips (corpus) | 110 |
| Invalid rejects (corpus) | 1851 |
| Duplicate rejects | 0 |
| Category failures | 0 |
| Missing image failures | 1851 |
| HOLD_REVIEW | 35 |
| Expected Storage uploads | 200 |
| Expected DB inserts | 200 |
| Production writes | **NO / NO** |

## Defaults

Every create would use: private / inactive / unpublished / stock = 0.

## Judgment

**BATCH001_READY_FOR_EXECUTION_REVIEW**
