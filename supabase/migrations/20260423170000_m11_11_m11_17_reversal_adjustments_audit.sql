-- M11.11 + M11.17
-- Reversal reason coding, manual adjustments metadata, and finance event audit trail.

ALTER TABLE public.merchant_ledger_entries
  ADD COLUMN IF NOT EXISTS reversal_reason_code TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

CREATE TABLE IF NOT EXISTS public.order_finance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_finance_events_order_created
  ON public.order_finance_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_finance_events_merchant_created
  ON public.order_finance_events(merchant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_finance_events_type_created
  ON public.order_finance_events(event_type, created_at DESC);
