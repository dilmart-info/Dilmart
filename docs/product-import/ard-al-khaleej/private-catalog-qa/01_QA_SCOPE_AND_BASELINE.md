# Private Catalog QA — Scope and Baseline

Task: `DilMart-ARD-AL-KHALEEJ-PRIVATE-CATALOG-QA-001`  
Authorization: `PRIVATE_CATALOG_QA_READ_ONLY_APPROVED`  
Mode: **read-only** (no production writes)

## Scope

| Cohort         | Count   |
| -------------- | ------- |
| Golden / Pilot | 10      |
| Batch 100      | 100     |
| **Total**      | **110** |

Target merchant: `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` (`arth-al-khaleg` / ارض الخليج) — expected **draft**  
Similar merchant (never modify): `1689ae4a-41f5-425b-bebe-c99c74880008`

## Approved sources

- Batch CSV: `docs/product-import/ard-al-khaleej/batch100/18_BATCH100_FINAL_IMPORT.csv`
- Frozen CSV SHA-256 (LF): `A4378AAFC3121C880230C960563F9DB7E148CA567B79CEAEE5930A873E4BA181`
- Confirm import_id: `ff3274c4-7f65-455b-8bda-549c4ecd3fad`
- Golden: `PILOT_10_MANIFEST.json` + `content/03_GOLDEN10_READY.csv` + HOLD rules for ARD-1191

## Phase 0 production snapshot (read-only)

| Check                                                                  | Result                                                                                         |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Product count                                                          | **110**                                                                                        |
| Merchant status                                                        | **draft**                                                                                      |
| Safe state (stock0 / inactive / unpublished / private / discount null) | **110/110**                                                                                    |
| Unique merchant_sku                                                    | **110**                                                                                        |
| Missing image URL                                                      | **0**                                                                                          |
| Non-leaf category                                                      | **0**                                                                                          |
| Target public leak (active+published+public)                           | **0**                                                                                          |
| Short populated                                                        | **109** (empty only ARD-1191)                                                                  |
| Detailed populated                                                     | **67** (Batch detailed 59 + Golden detailed 8; ARD-1191 & ARD-2800 empty detailed as expected) |
| Category distribution                                                  | perfumes=97, home-linen-air=8, mini-travel-perfume=3, musk-oils-mukhammaria=2                  |
| Public marketplace count (global active merchants)                     | **311**                                                                                        |
| Similar merchant                                                       | suspended / 15 products                                                                        |

## Known intentional states

- **ARD-1191**: content HOLD — short/description empty in production (do not treat emptiness as regression)
- **ARD-2800**: short present; detailed empty allowed

## Hard stop

No fixes, activation, publication, stock, Preview/Confirm, Batch 101+, or PR merge in this task.
