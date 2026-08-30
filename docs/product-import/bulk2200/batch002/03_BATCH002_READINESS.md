# BATCH002 Readiness

## Binding

| Item | Value |
|---|---|
| Batch ID | `batch002` |
| Merchant | `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg`) |
| Manifest SHA-256 | `6A4C5E375316150741F1C9D06E1A035752F6462AB2FB79936C39178F9C4EB191` |
| Batch size cap | 200 |
| Selection rule | `stable_source_order_valid_complete_image` |

## Dry-run

| Metric | Value |
|---|---|
| Selected READY (capped) | **200** |
| Would create | **200** |
| Existing SKU skips (corpus) | 310 |
| Invalid rejects (corpus) | 0 |
| Duplicate rejects | 0 |
| Category failures | 0 |
| Missing image failures | 0 |
| HOLD_REVIEW | 70 |
| Identity Audit Rows | 200 |
| Exact Identity Matches | 3 |
| Identity Holds Selected | 0 |
| Expected Storage uploads | 3 |
| Expected DB inserts | 200 |
| Production writes | **NO / NO** |

## Defaults

Every create would use: private / inactive / unpublished / stock = 0.

## Judgment

**BATCH002_STAGING_READY_FOR_EXECUTION_REVIEW**
