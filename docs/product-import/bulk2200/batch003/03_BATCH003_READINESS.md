# BATCH003 Readiness

## Binding

| Item | Value |
|---|---|
| Batch ID | `batch003` |
| Merchant | `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg`) |
| Manifest SHA-256 | `74E63B66567FC7B4D93AE6A249DE84CD9F0DEEF3965F2E56C9993CEB467F0901` |
| Batch size cap | 300 |
| Selection rule | `stable_source_order_valid_complete_image` |

## Dry-run

| Metric | Value |
|---|---|
| Selected READY (capped) | **300** |
| Would create | **300** |
| Existing SKU skips (corpus) | 510 |
| Invalid rejects (corpus) | 0 |
| Duplicate rejects | 0 |
| Category failures | 0 |
| Missing image failures | 0 |
| HOLD_REVIEW | 53 |
| Identity Audit Rows | 300 |
| Exact Identity Matches | 17 |
| Identity Holds Selected | 0 |
| Expected Storage uploads | 17 |
| Expected DB inserts | 300 |
| Production writes | **NO / NO** |

## Defaults

Every create would use: private / inactive / unpublished / stock = 0.

## Judgment

**BATCH003_STAGING_READY_FOR_EXECUTION_REVIEW**
