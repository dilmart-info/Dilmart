# Batch001 production runtime contract

Task: `DilMart-BULK2200-BATCH001-RUNTIME-LIVE-PREFLIGHT-001`

## Frozen binding

- Batch: `batch001`
- Merchant: `ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7` / `arth-al-khaleg`
- Merchant status: `draft`
- Selected rows: `200`
- Manifest SHA-256: `D5AC84F0FA39F5C962AF882E08EE2C4F8EB9007C2EACCD745C2E3F96D1EE0CDB`
- Source CSV SHA-256: `36B33F70E0B7FC22142C5DE56A4D841913762C94BBEDB59665499E374B56055F`
- Initial merchant product count: `110`

The runtime reads the frozen manifest. It does not regenerate or alter the manifest,
source data, provenance, normalized images, identities, prices, or categories. Each
manifest `source_row_number` must exist and its normalized source SKU must exactly
equal the manifest SKU; there is no SKU fallback.

## Read-only preflight

```bash
node scripts/product-import/bulk-catalog/run.mjs preflight \
  --config docs/product-import/bulk2200/batch001.config.json \
  --batch batch001
```

The operator must provide `BULK2200_APPROVED_HEAD_SHA`, a fresh platform-admin user
JWT through `BULK2200_ADMIN_JWT` (or the established admin JWT variable), and an
accepted server key through the established Batch100 key variables. The command:

- verifies the clean worktree, approved Git HEAD, frozen manifest, merchant, live
  catalog collisions, payloads, safe defaults, local images, and Storage absence;
- uses the Batch100 server-key probe and Storage compatibility client;
- uses only Backend Admin API `GET` calls and Supabase Storage `list`;
- writes evidence only under the gitignored `.tmp-product-import/` directory;
- never sets authorization variables and never calls upload/create/update/delete.

The report includes `adapter_kind`. `checked_live` and `LIVE_PREFLIGHT_PASS` are
possible only for the branded production read-only adapter. Fake adapters require
`NODE_ENV=test` and `BULK2200_TEST_MODE=1` for every runtime CLI command and can
only return `TEST_PREFLIGHT_PASS`.

## Execute and resume

`execute` and `resume` are implemented but remain blocked unless a later operator
sets both:

```text
BULK2200_EXEC_AUTHORIZATION=BULK2200_PIPELINE_EXECUTION_APPROVED
BULK2200_ALLOW_WRITES=1
```

Execution re-runs the full live preflight, uploads with `upsert: false`, verifies a
five-product canary before the remaining 195, and creates products only through
`POST /api/products`. `merchant_sku` is create identity: the create route rejects an
existing merchant SKU, while the update route cannot change it. The authorization
gate is enforced inside `runExecute` and `runResume` as well as at the CLI boundary.
HTTP 409 SKU/slug races are journaled as conflicts using sanitized Backend codes.

The journal is stored at:

```text
.tmp-product-import/ard-al-khaleej/bulk2200/batch001/execution-journal.json
```

It binds the batch, merchant, manifest SHA, source SHA, execution HEAD, expected
image SHA, and expected payload SHA. Resume rechecks the exact merchant ID, slug,
and draft status before any write, then independently reconciles Storage and product state.
Mismatches become `conflict`; unknown write outcomes become `indeterminate`; no
completed stage is blindly repeated.

## Postflight

Postflight is read-only and requires the execution journal. It verifies all 200 new
products and images against every field sent to `POST /api/products`, exact safe
state and prices, merchant total `310`, and exact baseline preservation of the
original 110 products. It also requires `journal_completed = 200` and
`journal_nonterminal = 0`.

No production execution was authorized or performed by this runtime PR.
