-- M11.5 + M11.6 + M11.8
-- Merchant ledger core + courier settlement marker + payout batches.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_settlement_status TEXT NOT NULL DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_courier_settlement_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_courier_settlement_status_check
      CHECK (courier_settlement_status IN ('pending', 'payable', 'settled', 'reversed'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.merchant_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'IQD',
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  reference_type TEXT,
  reference_id TEXT,
  idempotency_key TEXT NOT NULL,
  payout_batch_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_ledger_entries_entry_type_check'
      AND conrelid = 'public.merchant_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.merchant_ledger_entries
      ADD CONSTRAINT merchant_ledger_entries_entry_type_check
      CHECK (
        entry_type IN (
          'order_accrual',
          'commission_charge',
          'assisted_fee_charge',
          'delivery_deduction',
          'refund_reversal',
          'manual_adjustment',
          'payout',
          'payout_reversal'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_ledger_entries_direction_check'
      AND conrelid = 'public.merchant_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.merchant_ledger_entries
      ADD CONSTRAINT merchant_ledger_entries_direction_check
      CHECK (direction IN ('credit', 'debit'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_ledger_entries_status_check'
      AND conrelid = 'public.merchant_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.merchant_ledger_entries
      ADD CONSTRAINT merchant_ledger_entries_status_check
      CHECK (status IN ('pending', 'accrued', 'payable', 'in_payout', 'settled', 'reversed', 'disputed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_ledger_entries_idempotency_key
  ON public.merchant_ledger_entries(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_ledger_entries_order_entry_type
  ON public.merchant_ledger_entries(order_id, entry_type)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_merchant_ledger_entries_merchant_status_created
  ON public.merchant_ledger_entries(merchant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  total_credits NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_debits NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'IQD',
  notes TEXT,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'merchant_payout_batches_status_check'
      AND conrelid = 'public.merchant_payout_batches'::regclass
  ) THEN
    ALTER TABLE public.merchant_payout_batches
      ADD CONSTRAINT merchant_payout_batches_status_check
      CHECK (status IN ('draft', 'approved', 'processing', 'settled', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_payout_batches_merchant_status
  ON public.merchant_payout_batches(merchant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.merchant_payout_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_batch_id UUID NOT NULL REFERENCES public.merchant_payout_batches(id) ON DELETE CASCADE,
  merchant_ledger_entry_id UUID NOT NULL REFERENCES public.merchant_ledger_entries(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_payout_batch_items_batch_entry
  ON public.merchant_payout_batch_items(payout_batch_id, merchant_ledger_entry_id);
