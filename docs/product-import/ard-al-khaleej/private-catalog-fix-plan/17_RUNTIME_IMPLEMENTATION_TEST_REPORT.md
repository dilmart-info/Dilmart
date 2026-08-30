# Runtime Implementation Test Report

## Adapter design

- **Storage adapter**: `products` bucket only; `upload({ upsert: false })`; `pathExists`; `verifyObject` (download SHA + public GET + MIME).
- **Admin DB adapter**: authenticated platform-admin JWT → `POST /api/products/:id?merchant_id=…` with full UpsertProductDto merged from live GET (one grouped update per SKU).
- **Catalog fetch**: live `GET /merchants/:id` + `GET /products?merchant_id=…` (injected fakes in tests).

## Admin endpoint used

`POST https://DilMart-store-backend.onrender.com/api/products/:id?merchant_id=ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7`

## Storage authentication method

Server key via Batch100-compatible resolution (`sb_secret_` or legacy service_role JWT). Publishable/anon rejected. Project host must be `ztplxqlthuqkuktbznbo.supabase.co`; staging `zlmdwhuphuxppxznsgso` rejected.

## Authorization gates

All three required for `--execute` / `--resume`:

1. Explicit mode flag
2. `FIX_EXEC_AUTHORIZATION=PRIVATE_CATALOG_QA_FIX_EXECUTION_APPROVED`
3. `FIX_EXEC_ALLOW_WRITES=1`

Bare `--auth` → `BARE_AUTH_REJECTED`. Authorization is never self-generated. Values are never printed.

## Live preflight

Requires live adapters. Offline/stale `products.json` alone cannot yield `LIVE_PREFLIGHT_PASS`. Storage target paths probed with `checked_live=true`.

## Test counts

`private-catalog-fix-execution.test.mjs`: **26 tests, 0 failures** (CLI spawn + injected fake adapters covering the 25 mandated cases plus helpers).

Also green locally: `validate-private-catalog-fix-plan.mjs`, `prepare-private-catalog-fix-execution.mjs`, fake-adapter `--preflight` → `LIVE_PREFLIGHT_PASS`, `private-catalog-fix-plan-readonly.test.mjs` (14).

## Known limitations

- Production adapters are implemented but must not be exercised without the future execution authorization.
- Storage object count listing is best-effort under merchant prefix.
- Journal resume for indeterminate SKUs requires operator re-fetch before `--resume`.

execution_status = NOT_EXECUTED  
production_storage_writes = NO  
production_db_writes = NO
