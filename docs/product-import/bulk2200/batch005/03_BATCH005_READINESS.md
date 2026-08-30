# BATCH005 Readiness

## Binding

| Item | Value |
|---|---|
| Batch ID | `batch005` |
| Merchant | `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg`) |
| Manifest SHA-256 | `FC88C0BC84F1F4C53CE5175EA2F65AD1A47F967045CFC70B3FA74D0148B6EB4D` |
| Batch size cap | 300 |
| Selection rule | `stable_source_order_valid_complete_image` |

## Dry-run

| Metric | Value |
|---|---|
| Selected READY (capped) | **300** |
| Would create | **300** |
| Existing SKU skips (corpus) | 1110 |
| Invalid rejects (corpus) | 0 |
| Duplicate rejects | 0 |
| Category failures | 0 |
| Missing image failures | 0 |
| HOLD_REVIEW | 38 |
| Identity Audit Rows | 300 |
| Exact Identity Matches | 6 |
| Identity Holds Selected | 0 |
| Expected Storage uploads | 6 |
| Expected DB inserts | 300 |
| Production writes | **NO / NO** |

## Defaults

Every create would use: private / inactive / unpublished / stock = 0.

## Judgment

**BATCH005_STAGING_READY_FOR_EXECUTION_REVIEW**
