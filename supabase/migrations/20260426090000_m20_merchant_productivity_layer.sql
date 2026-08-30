-- M20 — Merchant Productivity & Bulk Product Management

ALTER TABLE public.merchant_settings
  ADD COLUMN IF NOT EXISTS default_low_stock_threshold integer NOT NULL DEFAULT 5;

CREATE TABLE IF NOT EXISTS public.product_import_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'previewed',
  original_filename text,
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  preview_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'product_import_sessions_status_check'
  ) THEN
    ALTER TABLE public.product_import_sessions
      ADD CONSTRAINT product_import_sessions_status_check
      CHECK (status IN ('previewed', 'confirmed', 'expired', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_product_import_sessions_merchant_id ON public.product_import_sessions(merchant_id);
CREATE INDEX IF NOT EXISTS idx_product_import_sessions_created_by ON public.product_import_sessions(created_by);
CREATE INDEX IF NOT EXISTS idx_product_import_sessions_status ON public.product_import_sessions(status);
CREATE INDEX IF NOT EXISTS idx_product_import_sessions_expires_at ON public.product_import_sessions(expires_at);

