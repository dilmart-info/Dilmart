-- Phase 2F: Jenni Aggregator Merchant Provisioning (Schema Changes)
-- SAFETY: Schema changes only (new columns, unique partial index, table-based lock). No data backfills.

-- 1) merchants: Jenni Merchant identity columns
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS jenni_merchant_id TEXT,
  ADD COLUMN IF NOT EXISTS jenni_merchant_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS jenni_merchant_sync_error TEXT;

COMMENT ON COLUMN public.merchants.jenni_merchant_id
  IS 'Jenni aggregator sub-merchant ID. NULL = not yet linked.';
COMMENT ON COLUMN public.merchants.jenni_merchant_synced_at
  IS 'Timestamp of last successful merchant sync with Jenni API.';
COMMENT ON COLUMN public.merchants.jenni_merchant_sync_error
  IS 'Last merchant sync error message from Jenni API. Cleared on success.';

-- 2) Unique partial index: each merchant has at most one Jenni merchant ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_jenni_merchant_id
  ON public.merchants (jenni_merchant_id)
  WHERE jenni_merchant_id IS NOT NULL;

-- 3) Create table-based lock for merchant provisioning
CREATE TABLE IF NOT EXISTS public.jenni_merchant_provisioning_locks (
  merchant_id uuid PRIMARY KEY REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.jenni_merchant_provisioning_locks
  IS 'Table-based locking mechanism to prevent concurrent merchant provisioning calls to Jenni API.';

-- Allow service_role full access
GRANT ALL ON public.jenni_merchant_provisioning_locks TO service_role;
