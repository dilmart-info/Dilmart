-- M12 P0 foundation
-- Courier ledger, courier payout batches, and lifecycle alignment.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_settlement_reference TEXT,
  ADD COLUMN IF NOT EXISTS courier_adjustment_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_courier_settlement_status_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders DROP CONSTRAINT orders_courier_settlement_status_check;
  END IF;
END $$;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_courier_settlement_status_check
  CHECK (courier_settlement_status IN ('pending', 'accrued', 'payable', 'in_payout', 'settled', 'reversed', 'disputed'));

CREATE TABLE IF NOT EXISTS public.courier_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_company_id UUID NOT NULL REFERENCES public.delivery_companies(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency_code TEXT NOT NULL DEFAULT 'IQD',
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  reference_type TEXT,
  reference_id TEXT,
  payout_batch_id UUID,
  idempotency_key TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courier_ledger_entries_entry_type_check'
      AND conrelid = 'public.courier_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.courier_ledger_entries
      ADD CONSTRAINT courier_ledger_entries_entry_type_check
      CHECK (
        entry_type IN (
          'delivery_fee_accrual',
          'manual_adjustment',
          'reversal',
          'payout',
          'payout_reversal',
          'dispute_hold',
          'dispute_release'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courier_ledger_entries_direction_check'
      AND conrelid = 'public.courier_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.courier_ledger_entries
      ADD CONSTRAINT courier_ledger_entries_direction_check
      CHECK (direction IN ('credit', 'debit'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courier_ledger_entries_status_check'
      AND conrelid = 'public.courier_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.courier_ledger_entries
      ADD CONSTRAINT courier_ledger_entries_status_check
      CHECK (status IN ('pending', 'accrued', 'payable', 'in_payout', 'settled', 'reversed', 'disputed'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_courier_ledger_entries_idempotency_key
  ON public.courier_ledger_entries(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_courier_ledger_entries_order_entry_type
  ON public.courier_ledger_entries(order_id, entry_type)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_courier_ledger_entries_company_status_created
  ON public.courier_ledger_entries(delivery_company_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_courier_ledger_entries_order
  ON public.courier_ledger_entries(order_id);
CREATE INDEX IF NOT EXISTS idx_courier_ledger_entries_status
  ON public.courier_ledger_entries(status);

CREATE TABLE IF NOT EXISTS public.courier_payout_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_company_id UUID NOT NULL REFERENCES public.delivery_companies(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft',
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  total_credits NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_debits NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL DEFAULT 'IQD',
  notes TEXT,
  reference TEXT,
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
    WHERE conname = 'courier_payout_batches_status_check'
      AND conrelid = 'public.courier_payout_batches'::regclass
  ) THEN
    ALTER TABLE public.courier_payout_batches
      ADD CONSTRAINT courier_payout_batches_status_check
      CHECK (status IN ('draft', 'approved', 'processing', 'settled', 'cancelled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_courier_payout_batches_company_status
  ON public.courier_payout_batches(delivery_company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.courier_payout_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_batch_id UUID NOT NULL REFERENCES public.courier_payout_batches(id) ON DELETE CASCADE,
  courier_ledger_entry_id UUID NOT NULL REFERENCES public.courier_ledger_entries(id) ON DELETE RESTRICT,
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_courier_payout_batch_items_batch_entry
  ON public.courier_payout_batch_items(payout_batch_id, courier_ledger_entry_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courier_ledger_entries_payout_batch_id_fkey'
      AND conrelid = 'public.courier_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.courier_ledger_entries
      ADD CONSTRAINT courier_ledger_entries_payout_batch_id_fkey
      FOREIGN KEY (payout_batch_id)
      REFERENCES public.courier_payout_batches(id)
      ON DELETE SET NULL;
  END IF;
END $$;
