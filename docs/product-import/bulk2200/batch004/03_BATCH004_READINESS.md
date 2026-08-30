# BATCH004 Readiness

## Binding

| Item | Value |
|---|---|
| Batch ID | `batch004` |
| Merchant | `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg`) |
| Manifest SHA-256 | `A9896FC2D13B3AFC0F708CF2A8C60D806A3028F3317B287DF72C1EB8DA78E911` |
| Batch size cap | 300 |
| Selection rule | `stable_source_order_valid_complete_image` |

## Dry-run

| Metric | Value |
|---|---|
| Selected READY (capped) | **300** |
| Would create | **300** |
| Existing SKU skips (corpus) | 810 |
| Invalid rejects (corpus) | 0 |
| Duplicate rejects | 0 |
| Category failures | 0 |
| Missing image failures | 0 |
| HOLD_REVIEW | 44 |
| Identity Audit Rows | 300 |
| Exact Identity Matches | 9 |
| Identity Holds Selected | 0 |
| Expected Storage uploads | 9 |
| Expected DB inserts | 300 |
| Production writes | **NO / NO** |

## Defaults

Every create would use: private / inactive / unpublished / stock = 0.

## Judgment

**BATCH004_STAGING_READY_FOR_EXECUTION_REVIEW**
