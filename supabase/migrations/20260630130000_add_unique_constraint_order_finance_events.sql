-- Migration: Add standard unique constraint on order_finance_events(idempotency_key)
-- Resolves the ON CONFLICT (idempotency_key) Postgres parser unique constraint matching issue.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_order_finance_events_idempotency_key_constraint'
      AND conrelid = 'public.order_finance_events'::regclass
  ) THEN
    ALTER TABLE public.order_finance_events
    ADD CONSTRAINT uq_order_finance_events_idempotency_key_constraint
    UNIQUE (idempotency_key);
  END IF;
END $$;
