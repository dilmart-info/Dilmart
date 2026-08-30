# BATCH006 Readiness

## Binding

| Item | Value |
|---|---|
| Batch ID | `batch006` |
| Merchant | `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg`) |
| Manifest SHA-256 | `F395142ED7335E1B4045A3ED3C30EDCBB64D5507A44DE53937ACFF3B0CA80DB7` |
| Batch size cap | 300 |
| Selection rule | `stable_source_order_valid_complete_image` |

## Dry-run

| Metric | Value |
|---|---|
| Selected READY (capped) | **300** |
| Would create | **300** |
| Existing SKU skips (corpus) | 1410 |
| Invalid rejects (corpus) | 0 |
| Duplicate rejects | 0 |
| Category failures | 0 |
| Missing image failures | 0 |
| HOLD_REVIEW | 38 |
| Identity Audit Rows | 300 |
| Exact Identity Matches | 0 |
| Identity Holds Selected | 0 |
| Expected Storage uploads | 0 |
| Expected DB inserts | 300 |
| Production writes | **NO / NO** |

## Defaults

Every create would use: private / inactive / unpublished / stock = 0.

## Judgment

**BATCH006_STAGING_READY_FOR_EXECUTION_REVIEW**
