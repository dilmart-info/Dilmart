-- M18 — Courier COD Remittance Policy & Net Settlement Mode

ALTER TABLE public.delivery_companies
  ADD COLUMN IF NOT EXISTS cod_remittance_mode TEXT NOT NULL DEFAULT 'gross_remittance',
  ADD COLUMN IF NOT EXISTS allow_courier_fee_offset BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_remittance_cycle TEXT NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS remittance_notes TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_companies_cod_remittance_mode_check'
      AND conrelid = 'public.delivery_companies'::regclass
  ) THEN
    ALTER TABLE public.delivery_companies
      ADD CONSTRAINT delivery_companies_cod_remittance_mode_check
      CHECK (cod_remittance_mode IN ('gross_remittance', 'net_remittance'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'delivery_companies_default_remittance_cycle_check'
      AND conrelid = 'public.delivery_companies'::regclass
  ) THEN
    ALTER TABLE public.delivery_companies
      ADD CONSTRAINT delivery_companies_default_remittance_cycle_check
      CHECK (default_remittance_cycle IN ('daily', 'weekly', 'custom'));
  END IF;
END $$;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_cod_remittance_mode TEXT,
  ADD COLUMN IF NOT EXISTS cash_gross_expected_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS courier_fee_retained_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_net_expected_from_courier NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cash_actual_remitted_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cash_remittance_difference NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS courier_fee_offset_applied BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS courier_fee_offset_settled_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_courier_cod_remittance_mode_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_courier_cod_remittance_mode_check
      CHECK (courier_cod_remittance_mode IS NULL OR courier_cod_remittance_mode IN ('gross_remittance', 'net_remittance'));
  END IF;
END $$;

ALTER TABLE public.collection_event_log
  ADD COLUMN IF NOT EXISTS cash_collected_from_customer_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS cash_remitted_to_platform_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS courier_retained_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS remittance_mode TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'collection_event_log_remittance_mode_check'
      AND conrelid = 'public.collection_event_log'::regclass
  ) THEN
    ALTER TABLE public.collection_event_log
      ADD CONSTRAINT collection_event_log_remittance_mode_check
      CHECK (remittance_mode IS NULL OR remittance_mode IN ('gross_remittance', 'net_remittance'));
  END IF;
END $$;

ALTER TABLE public.courier_ledger_entries
  ADD COLUMN IF NOT EXISTS settlement_method TEXT NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'courier_ledger_entries_settlement_method_check'
      AND conrelid = 'public.courier_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.courier_ledger_entries
      ADD CONSTRAINT courier_ledger_entries_settlement_method_check
      CHECK (settlement_method IN ('standard', 'offset'));
  END IF;
END $$;
