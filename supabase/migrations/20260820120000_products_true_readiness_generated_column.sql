-- True product readiness as a database-derived, queryable predicate
-- (DilMart-STORE-TRUE-PRODUCT-READINESS-FILTERING).
--
-- WHY
-- `ProductsService.listProducts()` translated the operational readiness filter into
-- `is_active = true/false`, then computed the REAL readiness object in JavaScript only after the
-- page had already been fetched and counted. An active-but-incomplete legacy row (no image, empty
-- description) was therefore counted and listed under `readiness=ready`, and was missing from
-- `readiness=not_ready`, with `total` and page boundaries reflecting the wrong predicate.
--
-- WHAT
-- `products.is_ready` is a STORED GENERATED column: Postgres derives it from the product's own
-- source columns on every insert/update. It is a projection of existing data, not a flag the
-- application maintains, so it CANNOT drift:
--   * it can never be written by application code (Postgres rejects any attempt),
--   * it is recomputed automatically whenever any input column changes,
--   * no code path can "forget" to update it.
--
-- PARITY with backend/src/modules/products/product-readiness.ts `buildProductReadiness(...)`
-- (the authoritative TypeScript contract, unchanged by this migration):
--   name_completed      String(name ?? "").trim() !== ""        -> btrim(coalesce(name,''), WS) <> ''
--   slug_completed      String(slug ?? "").trim() !== ""        -> btrim(coalesce(slug,''), WS) <> ''
--   price_valid         Number(price ?? 0) > 0                  -> coalesce(price, 0) > 0
--   category_linked     Boolean(category_id)                    -> category_id IS NOT NULL
--   image_present       Array.isArray(images) && length > 0     -> coalesce(array_length(images,1),0) > 0
--   stock_valid         Number(stock ?? 0) >= 0                 -> coalesce(stock, 0) >= 0
--   discount_valid      discount_price == null                  -> discount_price IS NULL
--                       || (dp > 0 && dp < Number(price ?? 0))     OR (discount_price > 0
--                                                                     AND discount_price < coalesce(price,0))
--   description_present String(description ?? "").trim() !== "" -> btrim(coalesce(description,''), WS) <> ''
--   is_active           Boolean(is_active)                      -> is_active IS TRUE
--
-- WS is the exact character set `String.prototype.trim()` strips: the ASCII whitespace
-- ' \t\n\r\f\v' plus U+00A0, U+1680, U+2000..U+200A, U+2028, U+2029, U+202F, U+205F, U+3000 and
-- U+FEFF. Using the same set on both sides keeps a whitespace-only name/slug/description
-- "not ready" in SQL exactly as it is in TypeScript.
--
-- Type notes (verified against the live catalog): name/slug are TEXT NOT NULL, description TEXT
-- NULL, price NUMERIC NOT NULL, discount_price NUMERIC NULL, category_id UUID NULL, images
-- TEXT[] NULL DEFAULT '{}', stock INTEGER NULL DEFAULT 0, is_active BOOLEAN NULL DEFAULT true.
-- The COALESCE wrappers mirror the `?? 0` / `?? ""` defaults in the TypeScript checklist, so a
-- NULL never makes a product accidentally ready.
--
-- SCOPE
-- This column is only a queryable projection for the OPERATIONAL products list. It does not
-- affect marketplace/public visibility, purchase eligibility, activation rules, or RLS, and the
-- readiness checklist itself is unchanged.
--
-- LOCK/REWRITE: adding a STORED generated column rewrites the table under ACCESS EXCLUSIVE.
-- `public.products` is ~2k rows, so this is a sub-second operation.
--
-- ROLLBACK: `ALTER TABLE public.products DROP COLUMN IF EXISTS is_ready;` (see the rollback file
-- next to this migration). Dropping it is safe: nothing else references the column, and the
-- backend falls back to no readiness filtering only if it is also rolled back — deploy the
-- migration BEFORE the backend that filters on it.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_ready boolean
  GENERATED ALWAYS AS (
    btrim(coalesce(name, ''), E' \t\n\r\f' || U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff') <> ''
    AND btrim(coalesce(slug, ''), E' \t\n\r\f' || U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff') <> ''
    AND coalesce(price, 0) > 0
    AND category_id IS NOT NULL
    AND coalesce(array_length(images, 1), 0) > 0
    AND coalesce(stock, 0) >= 0
    AND (discount_price IS NULL OR (discount_price > 0 AND discount_price < coalesce(price, 0)))
    AND btrim(coalesce(description, ''), E' \t\n\r\f' || U&'\00a0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200a\2028\2029\202f\205f\3000\feff') <> ''
    AND is_active IS TRUE
  ) STORED;

COMMENT ON COLUMN public.products.is_ready IS
  'Generated (STORED) projection of buildProductReadiness(...).is_ready — the operational Products list readiness filter. Derived by Postgres from this row''s own columns; never written by application code, so it cannot drift. Not a visibility/publication flag.';

COMMIT;
