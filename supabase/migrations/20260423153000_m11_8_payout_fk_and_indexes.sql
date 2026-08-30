-- M11.8 hardening: formal FK between ledger entries and payout batches.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_ledger_entries_payout_batch_id_fkey'
      AND conrelid = 'public.merchant_ledger_entries'::regclass
  ) THEN
    ALTER TABLE public.merchant_ledger_entries
      ADD CONSTRAINT merchant_ledger_entries_payout_batch_id_fkey
      FOREIGN KEY (payout_batch_id)
      REFERENCES public.merchant_payout_batches(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_ledger_entries_payout_batch_id
  ON public.merchant_ledger_entries(payout_batch_id);
