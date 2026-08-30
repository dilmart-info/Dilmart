-- Rollback for 20260820120000_products_true_readiness_generated_column.sql
--
-- Drops the generated readiness projection. Safe and self-contained: the column is derived data
-- with no dependents (no FK, no view, no RLS policy, no index references it), so dropping it
-- loses nothing that cannot be recomputed by re-running the forward migration.
--
-- ORDERING: roll the BACKEND back first (or together). A backend that filters
-- `readiness=ready|not_ready` on `products.is_ready` will error once this column is gone.
-- The readiness object returned per row is computed in TypeScript and is unaffected either way.

BEGIN;

ALTER TABLE public.products
  DROP COLUMN IF EXISTS is_ready;

COMMIT;
