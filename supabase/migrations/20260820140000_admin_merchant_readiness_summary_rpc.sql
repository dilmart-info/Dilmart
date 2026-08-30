-- DilMart-STORE-ADMIN-GOVERNANCE-READINESS-N1-001
-- Platform-wide MERCHANT readiness summary as one set-based, service-role-only RPC.
--
-- WHY
-- `AdminAnalyticsService.getExecutiveGovernance()` calls
-- `MerchantsService.getPlatformMerchantReadinessSummariesForAdmin()`, which listed every merchant
-- and then ran `computeReadinessByMerchantId()` once per merchant. Each of those performs six
-- Supabase operations (merchant, merchant_settings, three product counts, and a commercial-rules
-- lookup the platform summary then throws away), so the block cost 1 + 6N operations — ~133 for
-- today's 22 merchants — and grew linearly with the merchant count.
--
-- WHAT
-- One function returning the whole summary. Cost is O(1) network calls and a single grouped scan
-- of products, independent of merchant count.
--
-- SEMANTIC PARITY with the TypeScript `computeReadinessByMerchantId()` checklist (unchanged by
-- this migration — MERCHANT readiness, a different contract from the `products.is_ready` PRODUCT
-- readiness column added in 20260820120000):
--   1 profile_completed         trim(display_name) <> ''
--   2 contact_completed         any of trim(contact_phone|whatsapp_phone|support_email) <> ''
--   3 address_completed         trim(city) <> '' AND trim(address) <> ''
--   4 has_products              at least one product
--   5 has_active_products       at least one product with is_active = true
--   6 has_categorized_products  at least one product with category_id IS NOT NULL
--   7 merchant_is_active        merchants.status = 'active'
--
--   score      = round(passed_checks / 7 * 100)   -- per merchant, rounded FIRST
--   is_ready   = passed_checks = 7
--   avg score  = round(avg(per-merchant ROUNDED score))  -- same order of operations as the
--                TypeScript code: round each merchant, average, then round again
--   buckets    = score < 50 | 50..79 | >= 80, with the existing Arabic labels
--
-- WHITESPACE
-- Single-argument `btrim(x)` strips SPACES ONLY, so a tab-only contact field would count as
-- filled while the TypeScript `String(x ?? "").trim()` treats it as empty (caught by the
-- whitespace-only contact fixture in
-- backend/scripts/verify-admin-merchant-readiness-summary.sql). Every text check therefore trims
-- against `ws.chars` — the exact character set `String.prototype.trim()` removes: ASCII
-- whitespace plus U+00A0, U+1680, U+2000..U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and
-- U+FEFF. This is the same set the product readiness column uses in 20260820120000.
--
-- DELIBERATE OMISSION
-- No `commercial_rules` lookup. `getPlatformMerchantReadinessSummariesForAdmin()` already dropped
-- `commercial_agreement_configured` and never used it for score, is_ready, distribution, average,
-- ready count or the Executive page. Imitating that per-merchant query here would reproduce work
-- with no observable effect. Single-merchant readiness, activation and the scorecard keep their
-- existing commercial-agreement behaviour — this migration does not touch them.
--
-- ORDERING
-- `merchants` is ordered by `display_name` ascending (Postgres ASC puts NULLs last, matching the
-- previous PostgREST `.order("display_name", { ascending: true })`), with `id` as a tiebreaker so
-- equal names return in a stable order instead of an arbitrary one.
--
-- FAILURE SEMANTICS
-- Missing data is not an error: no settings row, null contact fields, or no products simply make
-- the corresponding checks false. Unlike the previous per-merchant loop — which caught a failing
-- merchant and silently dropped it from the platform totals — a genuine database failure here
-- aborts the whole call so the backend surfaces an error instead of a quietly incomplete summary.
--
-- SECURITY: service_role only, matching executive_governance_metrics().
-- ROLLBACK: see supabase/migrations/rollback/20260820140000_..._ROLLBACK.sql (DROP FUNCTION).
-- Roll the backend back to the per-merchant implementation BEFORE dropping this function.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_merchant_readiness_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH ws AS (
    -- exactly the characters String.prototype.trim() strips
    SELECT E' \t\n\r\f' ||
           U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff' AS chars
  ),
  product_stats AS (
    -- ONE grouped scan for every merchant, instead of three counts per merchant.
    SELECT
      p.merchant_id,
      count(*)                                          AS products_count,
      count(*) FILTER (WHERE p.is_active IS TRUE)       AS active_products_count,
      count(*) FILTER (WHERE p.category_id IS NOT NULL) AS categorized_products_count
    FROM public.products p
    GROUP BY p.merchant_id
  ),
  scored AS (
    SELECT
      m.id,
      COALESCE(m.display_name, '') AS display_name,
      COALESCE(m.status, '')       AS status,
      m.display_name               AS raw_display_name,
      (
        (CASE WHEN btrim(COALESCE(m.display_name, ''), (SELECT chars FROM ws)) <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN btrim(COALESCE(s.contact_phone, ''), (SELECT chars FROM ws)) <> ''
                  OR btrim(COALESCE(s.whatsapp_phone, ''), (SELECT chars FROM ws)) <> ''
                  OR btrim(COALESCE(s.support_email, ''), (SELECT chars FROM ws)) <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN btrim(COALESCE(s.city, ''), (SELECT chars FROM ws)) <> ''
                 AND btrim(COALESCE(s.address, ''), (SELECT chars FROM ws)) <> '' THEN 1 ELSE 0 END)
        + (CASE WHEN COALESCE(ps.products_count, 0) > 0 THEN 1 ELSE 0 END)
        + (CASE WHEN COALESCE(ps.active_products_count, 0) > 0 THEN 1 ELSE 0 END)
        + (CASE WHEN COALESCE(ps.categorized_products_count, 0) > 0 THEN 1 ELSE 0 END)
        + (CASE WHEN m.status = 'active' THEN 1 ELSE 0 END)
      ) AS passed_checks
    FROM public.merchants m
    LEFT JOIN public.merchant_settings s ON s.merchant_id = m.id
    LEFT JOIN product_stats ps ON ps.merchant_id = m.id
  ),
  rounded AS (
    SELECT
      id,
      display_name,
      raw_display_name,
      status,
      passed_checks,
      -- rounded per merchant FIRST, exactly like Math.round((passed / 7) * 100)
      round((passed_checks::numeric / 7) * 100)::int AS score,
      (passed_checks = 7) AS is_ready
    FROM scored
  )
  SELECT jsonb_build_object(
    'merchants', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'merchant_id', r.id,
            'display_name', r.display_name,
            'status', r.status,
            'score', r.score,
            'is_ready', r.is_ready
          )
          ORDER BY r.raw_display_name ASC, r.id ASC
        )
        FROM rounded r
      ),
      '[]'::jsonb
    ),
    'distribution', jsonb_build_array(
      jsonb_build_object('key', '0-49',   'label', 'منخفض (0–49)',   'count', (SELECT count(*) FROM rounded WHERE score < 50)),
      jsonb_build_object('key', '50-79',  'label', 'متوسط (50–79)',  'count', (SELECT count(*) FROM rounded WHERE score >= 50 AND score < 80)),
      jsonb_build_object('key', '80-100', 'label', 'مرتفع (80–100)', 'count', (SELECT count(*) FROM rounded WHERE score >= 80))
    ),
    -- average of the ALREADY-ROUNDED scores, then rounded again (matches the TypeScript order)
    'avg_readiness_score', COALESCE((SELECT round(avg(score))::int FROM rounded), 0),
    'ready_merchants', (SELECT count(*) FROM rounded WHERE is_ready),
    'total_merchants', (SELECT count(*) FROM rounded)
  );
$fn$;

COMMENT ON FUNCTION public.admin_merchant_readiness_summary() IS
  'Platform-wide MERCHANT readiness summary for executive governance (admin only, service_role). Set-based replacement for the per-merchant readiness loop; identical checklist/score/distribution semantics. Not related to products.is_ready (PRODUCT readiness).';

REVOKE EXECUTE ON FUNCTION public.admin_merchant_readiness_summary() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_merchant_readiness_summary() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_merchant_readiness_summary() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merchant_readiness_summary() TO service_role;

COMMIT;
