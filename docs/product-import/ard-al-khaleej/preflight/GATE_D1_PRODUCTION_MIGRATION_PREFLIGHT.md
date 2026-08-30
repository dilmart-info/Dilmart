# Gate D1 — Production Migration Impact Preflight

**Task:** `DilMart-PRODUCT-IMPORT-PRODUCTION-MIGRATION-PREFLIGHT-001`  
**Gate:** D1 — **READ ONLY**  
**Project:** `ztplxqlthuqkuktbznbo` (DilMart-Store production) — **not** Staging-3  
**Executed:** 2026-08-01 (UTC+3 session)  
**Authority:** No DDL · no remote apply · no PR merge · no image upload · no product create

## Supervisor decision (official)

```text
Decision: PASS
Deployment judgment: GO FOR GATE D2
Merge authorization: NO
Remote migration authorization: NO
Image upload authorization: NO
```

Independent production re-check confirmed all report counts (346 / 316 / 30 / 0 · 8 import sessions · 442 storage objects · 0/3 migrations applied).

## Related gate status

| Gate                     | Status                                | Notes                                                                              |
| ------------------------ | ------------------------------------- | ---------------------------------------------------------------------------------- |
| Gate 1 Safe importer     | ✅ PASS                               | Approved code head `93a920d` · PR #65 Draft unmerged · docs head may differ        |
| Gate 2 Category          | ✅ CLOSED                             | Option B · `fc662e9f-…`                                                            |
| Gate S1 Storage security | ✅ PASS                               | Reviewed head `f6bd50a` · PR #66 Draft · Review `4835354377` · **remote apply NO** |
| Gate D1 Preflight        | ✅ **PASS** (this report) · GO FOR D2 |                                                                                    |
| Gate D2 Apply            | ⏳ **NOT AUTHORIZED**                 | Preliminary sequence recorded below; requires explicit D2 auth                     |

---

## Migrations under review (none applied on production)

| Version          | File                                    | Source PR | Applied on prod? |
| ---------------- | --------------------------------------- | --------- | ---------------- |
| `20260801190000` | `product_import_confirm_atomic.sql`     | #65       | **No**           |
| `20260801200000` | `products_public_read_triple_state.sql` | #65       | **No**           |
| `20260801210000` | `products_storage_write_lockdown.sql`   | #66       | **No**           |

Latest applied migration on prod: `20260725180000_merchant_push_alerts_phase1`.

---

## 1. Product readability impact (RLS Triple-State)

### Current production policies on `public.products`

| Policy                                     | Cmd    | Effective USING (summary)                           |
| ------------------------------------------ | ------ | --------------------------------------------------- |
| `Products are publicly readable`           | SELECT | `is_active = true`                                  |
| `Public can view active merchant products` | SELECT | `is_active = true` AND merchant `status = 'active'` |
| `Admins can manage all products`           | ALL    | `is_platform_admin()`                               |
| `Merchant members can manage own products` | ALL    | `is_merchant_member(merchant_id)`                   |

Postgres OR’s permissive policies → **effective anon/authenticated public read today ≈ `is_active = true`** (the looser policy wins).  
That means products of a **suspended** merchant with `is_active=true` remain RLS-readable today — a leak vs marketplace intent.

### Counts

| Metric                                                 |   Count |
| ------------------------------------------------------ | ------: |
| Total products                                         | **653** |
| Active products (`is_active=true`)                     | **346** |
| Readable under **old effective** policy (`is_active`)  | **346** |
| Readable under named “active merchant” policy only     | **317** |
| Readable under **new Triple-State**                    | **316** |
| **Would become hidden** (old effective → Triple-State) |  **30** |
| Published (`is_published=true`)                        |     653 |
| `visibility_status=public`                             |     356 |
| `visibility_status=private`                            |       1 |
| `visibility_status=archived`                           |     296 |
| `is_active=true` AND `is_published=false`              |   **0** |
| `is_active=true` AND `visibility_status != public`     |   **1** |

### Hide-reason breakdown (the 30)

| Reason                  | Merchant                                                                   | Merchant status |                                                    N |
| ----------------------- | -------------------------------------------------------------------------- | --------------- | ---------------------------------------------------: |
| `merchant_not_active`   | DilMart Store (`DilMart-primary` / `a3e3b17d-450f-4ccf-81dd-72cc4d4172d4`) | **suspended**   |                                               **29** |
| `visibility_not_public` | شركة العرش (`alarsh` / `65575f7c-4204-44d0-99a0-fc1902e2ed91`)             | active          | **1** (`visibility_status=archived`, SKU `S-A-0060`) |

**No** currently active+unpublished products would disappear.  
Pilot draft merchant `ac7c356b-…` has **0** products — unaffected.

### Customer-facing expectation

Backend marketplace contracts already require merchant `status = 'active'` on storefront/detail paths. Closing the loose `Products are publicly readable` policy therefore primarily closes an **RLS leak** for the 29 suspended-merchant products, plus correctly hides 1 archived-visibility product from raw PostgREST.  
**Storefront catalog delta for healthy active merchants: effectively 0 unexpected removals** (316 remain publicly listable under Triple-State).

### Affected product IDs (30)

**Alarsh (1):** `6e13f078-eb03-4d1e-8a36-c261c97612ce`

**DilMart Store suspended (29):**  
`03ca21f9-eeb9-4519-ba32-2ed583aaa6a3`, `08626a92-7199-45e4-a3bd-55f55179c9ed`, `08b51d37-4e98-4092-b8ae-441a83252b8b`, `09eeab94-b9e1-4da3-bc08-457fc4182e53`, `17d9b0b8-11d2-49d5-9cf0-94b4b75e134f`, `1fc65617-1699-409a-8136-c039c261a29e`, `282d2968-1f83-4eab-8ca3-c69a6ca29067`, `2d632456-76f3-43de-b8e4-b18b2cfc69f5`, `319abd56-6156-45e1-bd51-5f80fa8df37e`, `3644f0c1-bd17-4e19-94a6-9af41208834a`, `3f13cd94-25a9-4b08-81b9-54e77799fa7d`, `3f71ad89-e119-44ac-977d-bebf63a4a9b5`, `5bae580a-8dcb-4dbc-aa09-8174b9b10f2b`, `5c874495-aaae-45f0-9610-b7814474c9bd`, `5e2ca502-5d47-430b-a214-61b19c0bdcd9`, `6de55685-27a8-436f-bbf7-669e8d9c2feb`, `7221091d-f37e-44cd-a4f6-afa3b5d99782`, `724c84a9-9de8-4fb3-9985-1db8587f7f38`, `7562ee54-82a2-4d06-a0ce-be765dda9007`, `7a2d5198-5daa-4556-8ab3-a561ca7d6092`, `7bcc238e-0c84-48fa-86c3-5188c570c9ca`, `a47ea5ee-39ca-422d-8e00-1ed832fa47a7`, `d0571e41-2f64-4f0c-bcc3-0a5417a0c08a`, `d57c585f-2f9f-4d2c-bc4b-64c8e4734336`, `d7355b10-3068-48f4-8f75-d69fb2d4b4d6`, `d778339a-568d-4e18-b808-1c6395a6739c`, `d9f07450-62c5-46c4-b436-5bde818a87b1`, `e694c5a3-1499-480a-beeb-9fefe84c5fa4`, `ed7f7d3e-e16d-4490-8f12-ce140da50616`

Full row detail (name / flags) captured in SQL appendix below and query results at execution time.

**Decision on the 30:** Accept hide as **correct** (suspended merchant + archived visibility). No data repair required before apply. Optional hygiene (out of D1 scope): set suspended merchant products `is_active=false` later.

---

## 2. Import sessions vs new RPC

### Inventory

| Status                              |   N | Expired by `expires_at`          | Claimable by new RPC?               |
| ----------------------------------- | --: | -------------------------------- | ----------------------------------- |
| `previewed`                         |   6 | 6 / 6                            | **No** (all expired)                |
| `confirmed`                         |   2 | 2 / 2 (status already confirmed) | **No** (claim requires `previewed`) |
| `processing` / `failed` / `expired` |   0 | —                                | —                                   |

All 8 sessions belong to merchant **alarsh** (`65575f7c-…`). Dates: 2026-05-29 → 2026-05-30.

### Current status constraint

```text
CHECK (status IN ('previewed','confirmed','expired','failed'))
```

Migration `20260801190000` replaces this with an additional `'processing'` value — **compatible**, no conflicting rows.

### Function / name conflicts

- `public.product_import_confirm_atomic(...)` — **does not exist** on production.
- No other `product_import%` functions found.
- `products_slug_key` unique constraint **exists** (required by RPC slug-retry path).
- No `(merchant_id, merchant_sku)` unique index (known; RPC uses advisory locks + `IMPORT_SKU_AMBIGUOUS`).

### Payload compatibility (legacy vs Gate 1 RPC)

Legacy `normalized` keys observed:

```text
sku, name, price, stock, image_url, is_active, category_id, description, category_name, compare_at_price
```

**Missing vs new RPC expectations:** `slug`, `visibility_status`, `is_published`, `discount_price`, `brand`, `sizes`, …

| Session class                        | Compatible with new atomic confirm?                    |
| ------------------------------------ | ------------------------------------------------------ |
| Legacy `previewed` (all expired)     | Would fail integrity / claim anyway — **do not reuse** |
| Legacy `confirmed`                   | Not re-confirmable — historical only                   |
| **New** Gate 1 Preview (PR #65 code) | Required before any Pilot Confirm                      |

**Conclusion:** Old sessions are inert. Pilot must run a **fresh Preview** after RPC apply + backend deploy. Not a D2 blocker.

---

## 3. Storage snapshot (pre–write lockdown)

### Buckets

| id         | public | notes           |
| ---------- | ------ | --------------- |
| `products` | true   | **Only** bucket |

### Policies on `storage.objects` (current)

| Policy          | Cmd    | Qual / check |
| --------------- | ------ | ------------ |
| `Public Access` | SELECT | `true`       |
| `Public Insert` | INSERT | `true`       |
| `Public Update` | UPDATE | `true`       |
| `Public Delete` | DELETE | `true`       |

Not bucket-scoped (`bucket_id = 'products'`). Safe **today** because only one bucket exists; any future bucket needs an independent policy review (Gate S1 note).

### Objects (read-only inventory)

| Metric                  |                     Value |
| ----------------------- | ------------------------: | --- | ------------- |
| Object count            |                   **442** |
| Path pattern            | All `products/<uuid>.{jpg | png | webp}` (flat) |
| Approx bytes (metadata) |                  ~65.7 MB |
| jpg-like / png / webp   |               421 / 8 / 1 |

No objects listed or downloaded beyond aggregate counts. No mutations.

After `20260801210000`: Insert/Update/Delete policies dropped; SELECT retained; backend service_role uploads continue.

---

## 4. Migration / object conflicts

| Check                                                 | Result                                     |
| ----------------------------------------------------- | ------------------------------------------ |
| Target versions already in `schema_migrations`        | **None**                                   |
| Duplicate function name                               | **None**                                   |
| Status check conflict                                 | Additive `'processing'` — OK               |
| Triple-State drops both legacy public SELECT policies | Matches prod names exactly                 |
| Storage drop policy names                             | Match prod (`Public Insert/Update/Delete`) |
| Cross-PR file overlap                                 | None — #65 owns 190/200; #66 owns 210      |

---

## 5. Recommended Apply plan (Gate D2 — **not authorized yet**)

Prerequisites for D2 authorization:

1. Explicit merge/deploy/apply authorization from supervisor.
2. Backend image containing Gate 1 importer + RPC caller deployed **before or with** Confirm usage (RPC alone without code is inert).
3. Accept documented hide of 30 products (section 1).

### Ordered steps

```text
A. Merge PR #66 (Storage) and/or PR #65 (Importer+RLS) per supervisor packaging decision
B. Deploy backend that matches merged code
C. Apply migrations in timestamp order on production:

   1) 20260801190000_product_import_confirm_atomic.sql
   2) 20260801200000_products_public_read_triple_state.sql
   3) 20260801210000_products_storage_write_lockdown.sql

D. Run Verification plan (section 6)
E. Only then Gate 3 image prep for Pilot 10
```

**Rationale for timestamp order:** keeps `schema_migrations` monotonic with CI/local history. Security-wise, Storage lockdown (3) can be applied alone earlier if supervisor wants a split D2; Triple-State (2) is the customer-visible RLS change and should be paired with verification of the 316 count.

**Do not** create unique `(merchant_id, merchant_sku)` index in D2 (alarsh 123 dup groups — separate cleanup track).

---

## 6. Verification plan (post-apply)

1. **Migrations recorded:** three versions present in `supabase_migrations.schema_migrations`.
2. **Products RLS:** only Triple-State public SELECT + admin/merchant policies; old two public policies gone.
3. **Count check:** `readable_under_triple_state = 316` (re-run same SQL as D1).
4. **Anon probe products:** suspended-merchant product IDs return 0 rows under anon key; a known active public product still readable.
5. **Storage policies:** `Public Insert/Update/Delete` absent; `Public Access` present.
6. **Anon storage write:** upload/upsert/delete fail; service_role upload succeeds; public URL GET 200.
7. **RPC:** `\df product_import_confirm_atomic`; status check includes `processing`.
8. **Smoke:** expired legacy session confirm → claim/expired failure, no product writes.
9. **Marketplace smoke:** homepage / store listing for active merchants still shows expected catalog (no surprise empty).

---

## 7. Rollback plan

| Migration        | Rollback approach                                                                                                                        | Notes                                                                                                          |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Triple-State RLS | Recreate prior two SELECT policies from snapshot in §1                                                                                   | Restores leak — use only if storefront emergency                                                               |
| Import RPC       | `DROP FUNCTION public.product_import_confirm_atomic(...)`; restore status check **without** `processing` only if no rows in `processing` | Prefer leave function if unused                                                                                |
| Storage lockdown | **Emergency only:** recreate Public Insert/Update/Delete                                                                                 | Reopens P0 write hole — requires explicit security authorization; prefer keep lockdown and use backend uploads |

Default posture: **do not re-open public Storage writes**. Prefer forward-fix.

---

## 8. Final judgment

```text
GO for Gate D2
```

**Supervisor confirmed:** PASS · GO FOR GATE D2 · merge/apply/image still **NO**.

**Conditions / notes (non-blocking):**

1. Accept intentional hide of **30** products (29 suspended DilMart Store + 1 archived alarsh).
2. Do **not** reuse legacy import sessions — require fresh Preview after code+RPC deploy.
3. Gate D2 still needs **separate** merge/apply authorization; this report does not grant it.
4. Unique SKU index remains blocked by alarsh duplicates — out of D2 critical path for Pilot 10.
5. Future new Storage buckets must not inherit unscoped `Public Access` without review.
6. Before D2: keep this preflight report in git on PR #65 (docs-only); merge #65 then refresh #66 for `governance/CLOSURE_REPORT.md` overlap.

```text
Merge authorization: NO (until D2)
Remote apply authorization: NO (until D2)
Image upload authorization: NO
```

---

## 9. Preliminary D2 sequence (authorized later only)

```text
D2-A Freeze → D2-B Merge #65 then refresh/merge #66 + deploy code
→ D2-C Apply migrations in timestamp order with per-migration stop points
→ D2-D Verify RPC / Triple-State / Storage
```

Storage rollback must **not** auto-restore Public Insert/Update/Delete.

---

## Appendix — Reproducible read-only SQL

```sql
-- Effective old vs triple-state counts
SELECT
  count(*) FILTER (WHERE is_active) AS readable_old_effective,
  count(*) FILTER (
    WHERE is_active AND is_published AND visibility_status = 'public'
      AND EXISTS (SELECT 1 FROM merchants m WHERE m.id = products.merchant_id AND m.status = 'active')
  ) AS readable_triple_state
FROM products;

-- Affected rows
SELECT p.id, p.merchant_id, m.status, p.is_active, p.is_published, p.visibility_status
FROM products p
JOIN merchants m ON m.id = p.merchant_id
WHERE p.is_active
  AND NOT (p.is_published AND p.visibility_status = 'public' AND m.status = 'active');
```
