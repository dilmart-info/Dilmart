-- P1-6: Atomic payout batch creation.
--
-- Root cause: AdminService.createPayoutBatch previously performed three separate
-- non-transactional DB writes (INSERT batch → INSERT items → UPDATE ledger).
-- A network error or process crash between any two writes leaves the ledger in an
-- inconsistent state: orphaned batch row with no items, or items with ledger entries
-- not yet advanced to 'in_payout'.
--
-- Fix: single PL/pgSQL function that wraps all four operations in one implicit
-- PostgreSQL transaction:
--   1. SELECT candidate ledger entries FOR UPDATE  (row-level lock)
--   2. INSERT merchant_payout_batches
--   3. INSERT merchant_payout_batch_items
--   4. UPDATE merchant_ledger_entries → status='in_payout', payout_batch_id
--
-- Concurrency: FOR UPDATE on step 1 prevents two concurrent calls from picking
-- the same entries. The payout_batch_id IS NULL guard is re-evaluated under the
-- lock, closing the TOCTOU window between "read candidates" and "write batch".
--
-- Idempotency: the unique index uq_merchant_payout_batch_items_batch_entry
-- (payout_batch_id, merchant_ledger_entry_id) provides a final backstop against
-- duplicate inserts even if the caller retries on a transient error.

CREATE OR REPLACE FUNCTION public.create_payout_batch_atomic(
  p_merchant_id  UUID,
  p_actor_id     UUID        DEFAULT NULL,
  p_period_start TIMESTAMPTZ DEFAULT NULL,
  p_period_end   TIMESTAMPTZ DEFAULT NULL,
  p_notes        TEXT        DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id      UUID;
  v_batch_row     public.merchant_payout_batches%ROWTYPE;
  v_total_credits NUMERIC(12,2) := 0;
  v_total_debits  NUMERIC(12,2) := 0;
  v_net_amount    NUMERIC(12,2) := 0;
  v_entry_count   INT           := 0;
  v_entry_ids     UUID[]        := ARRAY[]::UUID[];
  v_rec           RECORD;
BEGIN
  -- Phase 1: Lock eligible entries.
  -- FOR UPDATE OF mle acquires a row-level exclusive lock on each matching ledger
  -- row before we read the data. Concurrent calls for the same merchant will block
  -- here until our transaction commits, guaranteeing each entry is included in at
  -- most one batch.
  FOR v_rec IN
    SELECT mle.id,
           mle.direction,
           mle.amount
    FROM   public.merchant_ledger_entries mle
    LEFT   JOIN public.orders o ON o.id = mle.order_id
    WHERE  mle.merchant_id     = p_merchant_id
      AND  mle.status          = 'payable'
      AND  mle.payout_batch_id IS NULL
      AND  (mle.order_id IS NULL OR COALESCE(o.financial_snapshot_version, 0) > 0)
    FOR UPDATE OF mle
  LOOP
    v_entry_ids   := v_entry_ids || v_rec.id;
    v_entry_count := v_entry_count + 1;
    IF v_rec.direction = 'credit' THEN
      v_total_credits := v_total_credits + COALESCE(v_rec.amount, 0);
    ELSE
      v_total_debits  := v_total_debits  + COALESCE(v_rec.amount, 0);
    END IF;
  END LOOP;

  -- Early return if no eligible entries (non-error; caller handles UI message).
  IF v_entry_count = 0 THEN
    RETURN jsonb_build_object(
      'ok',      true,
      'empty',   true,
      'message', 'No payable entries available for payout batch.'
    );
  END IF;

  v_net_amount := v_total_credits - v_total_debits;

  -- Phase 2: Create the batch header.
  INSERT INTO public.merchant_payout_batches (
    merchant_id,   status,   period_start,   period_end,
    total_credits, total_debits, net_amount, currency_code,
    notes,         created_by
  )
  VALUES (
    p_merchant_id, 'draft',  p_period_start, p_period_end,
    v_total_credits, v_total_debits, v_net_amount, 'IQD',
    p_notes, p_actor_id
  )
  RETURNING id INTO v_batch_id;

  -- Phase 3: Create one item row per candidate entry.
  -- The unique index uq_merchant_payout_batch_items_batch_entry prevents duplicate
  -- items if the caller somehow retries within the same batch id.
  INSERT INTO public.merchant_payout_batch_items (
    payout_batch_id, merchant_ledger_entry_id, amount
  )
  SELECT v_batch_id, mle.id, mle.amount
  FROM   public.merchant_ledger_entries mle
  WHERE  mle.id = ANY(v_entry_ids);

  -- Phase 4: Advance ledger entries to in_payout and bind them to the batch.
  UPDATE public.merchant_ledger_entries
  SET    status          = 'in_payout',
         payout_batch_id = v_batch_id
  WHERE  id = ANY(v_entry_ids);

  -- Fetch full batch row for the return payload (NestJS deserialises the JSONB).
  SELECT * INTO v_batch_row
  FROM   public.merchant_payout_batches
  WHERE  id = v_batch_id;

  RETURN jsonb_build_object(
    'ok',            true,
    'empty',         false,
    'entries_count', v_entry_count,
    'batch',         row_to_json(v_batch_row)::jsonb
  );
END;
$$;

-- Security: restrict to service_role only.
-- NestJS backend uses the service-role key; no JWT client should invoke this directly.
REVOKE ALL ON FUNCTION public.create_payout_batch_atomic(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_payout_batch_atomic(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM anon;
REVOKE ALL ON FUNCTION public.create_payout_batch_atomic(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_payout_batch_atomic(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT)
  TO service_role;
