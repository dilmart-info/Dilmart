-- ============================================================================
-- PREFLIGHT_BLOCKED — products_merchant_sku_unique
--
-- STATUS: BLOCKED. Do NOT move this file into supabase/migrations/. Applying the intended
-- unique index below today would fail immediately.
--
-- Why it's blocked:
--   Production (project ztplxqlthuqkuktbznbo) has ~123 (merchant_id, merchant_sku) groups with
--   more than one row on merchant 65575f7c-4204-44d0-99a0-fc1902e2ed91 (شركة العرش / "alarsh")
--   alone. `CREATE UNIQUE INDEX` over (merchant_id, merchant_sku) WHERE merchant_sku IS NOT NULL
--   cannot be created while duplicates exist — it will error out mid-migration.
--
--   Verified read-only via Supabase MCP on 2026-08-01:
--     select count(*) from (
--       select merchant_sku from public.products
--       where merchant_id = '65575f7c-4204-44d0-99a0-fc1902e2ed91' and merchant_sku is not null
--       group by merchant_sku having count(*) > 1
--     ) x;
--     -> dup_sku_groups = 123
--
-- Consequence for Gate 1 (DilMart-ARD-AL-KHALEEJ-VERTICAL-PILOT-10-001):
--   The product import path (`ProductImportService`) enforces merchant_id+SKU uniqueness at the
--   APPLICATION level (upsert-by-lookup before insert) instead of relying on a DB constraint.
--   This migration exists only to record the intended future state and the exact blocker; it
--   must stay out of supabase/migrations/ until the dedup work below is done and re-verified.
--
-- Unblocking sequence (do NOT run out of order):
--   1. Run the preflight SELECTs below and export the full duplicate list.
--   2. Get merchant/ops sign-off on a deduplication plan for merchant 65575f7c and any other
--      merchants surfaced by query 2 below (widen from a single merchant to ALL merchants).
--   3. Deduplicate/relabel the offending merchant_sku values (merge, archive, or re-SKU).
--   4. Re-run query 1/2 and confirm dup_groups = 0 for every merchant.
--   5. Only then copy the "intended migration" block below into a new
--      supabase/migrations/<timestamp>_products_merchant_sku_unique.sql and apply it normally.
--
-- SELECTs only below this line. Nothing here modifies anything.
-- ============================================================================

-- 1. Duplicate (merchant_id, merchant_sku) groups on the known-blocked merchant (alarsh).
--    Expected today: 123 groups, each with count > 1.
select
  merchant_sku,
  count(*) as row_count,
  array_agg(id order by created_at) as product_ids
from public.products
where merchant_id = '65575f7c-4204-44d0-99a0-fc1902e2ed91'
  and merchant_sku is not null
group by merchant_sku
having count(*) > 1
order by row_count desc;

-- 2. Same check, ALL merchants — required before this index can ever be applied globally.
--    Expected today: at least the 123 groups from merchant 65575f7c above; possibly more.
select
  merchant_id,
  merchant_sku,
  count(*) as row_count
from public.products
where merchant_sku is not null
group by merchant_id, merchant_sku
having count(*) > 1
order by row_count desc;

-- 3. Scale/summary for sign-off: how many merchants are affected, how many duplicate rows total.
select
  count(distinct merchant_id) as merchants_with_dupes,
  count(*) as duplicate_groups,
  sum(row_count) as duplicate_rows_total
from (
  select merchant_id, merchant_sku, count(*) as row_count
  from public.products
  where merchant_sku is not null
  group by merchant_id, merchant_sku
  having count(*) > 1
) dupes;

-- 4. Re-run this after dedup work. Expected: 0 rows from both queries above before proceeding.

-- ============================================================================
-- INTENDED MIGRATION (NOT APPLIED — copy into supabase/migrations/ only after query 2 = 0 rows)
-- ============================================================================
--
-- create unique index if not exists products_merchant_sku_unique
-- on public.products (merchant_id, merchant_sku)
-- where merchant_sku is not null;
