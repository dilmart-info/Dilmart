# Production Execution Plan (NOT AUTHORIZED YET)

Wait for: `PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED`

## When authorized (future)

1. Re-validate this package SHA + validator output
2. Upload only READY local assets to Storage under merchant prefix
3. Apply `06_PROPOSED_DB_PATCH.csv` rows with `decision_status=READY_FOR_EXECUTION_REVIEW` only
4. Skip all HOLD rows and ARD-1191
5. Do not activate/publish/stock/price
6. Re-run private-catalog QA read-only export

## Explicitly out of scope until new auth

- ARD-4300 / ARD-4750 / ARD-4751 / ARD-4807 (HOLD_NO_VERIFIED_REPLACEMENT)
- ARD-1191
- Batch 101+
