-- M11-R: collection idempotency guard + courier settlement timestamp.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS courier_settled_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_collection_event_log_order_event'
  ) THEN
    CREATE UNIQUE INDEX uq_collection_event_log_order_event
      ON public.collection_event_log(order_id, event_type);
  END IF;
END $$;
