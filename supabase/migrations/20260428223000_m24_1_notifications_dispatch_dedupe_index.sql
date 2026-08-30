-- M24.1: index support for outbound dispatch dedupe checks

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'outbound_dispatch_attempts'
      AND column_name = 'ok'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_outbound_dispatch_attempts_dedupe_lookup ON public.outbound_dispatch_attempts(dispatch_key, channel, ok, created_at DESC)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_outbound_dispatch_attempts_dedupe_lookup ON public.outbound_dispatch_attempts(dispatch_key, channel, created_at DESC)';
  END IF;
END $$;
