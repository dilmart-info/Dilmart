-- ============================================================
-- Merchant Decision Tracking Fields
-- Adds accept/reject decision tracking to orders table.
-- ============================================================

-- 1. Add columns (nullable first for safe backfill)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS merchant_decision_status TEXT
    CHECK (merchant_decision_status IN ('pending', 'accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS merchant_rejection_reason_code TEXT NULL,
  ADD COLUMN IF NOT EXISTS merchant_decision_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS merchant_decision_by UUID NULL;

-- 2. Backfill: All existing orders → accepted (all current orders are test data)
UPDATE public.orders
SET merchant_decision_status = 'accepted'
WHERE merchant_decision_status IS NULL;

-- 3. Set default for new orders
ALTER TABLE public.orders
  ALTER COLUMN merchant_decision_status SET DEFAULT 'pending';

-- 4. Set NOT NULL after backfill
ALTER TABLE public.orders
  ALTER COLUMN merchant_decision_status SET NOT NULL;

-- 5. Index for merchant filtering by decision status
CREATE INDEX IF NOT EXISTS idx_orders_merchant_decision_status
  ON public.orders(merchant_id, merchant_decision_status);
