-- Pre-Final-Patch Historical State Fixture
-- Purpose: Simulate the legacy schema that existed BEFORE 20260725090000 was applied.
-- This fixture is injected in CI before running `supabase migration up` so that
-- the additive migration is proven to cleanly remove these artifacts.

-- Historical legacy 2-argument overload of mark_return_item_received_atomic
CREATE OR REPLACE FUNCTION
public.mark_return_item_received_atomic(
  p_return_request_id UUID,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Legacy stub: historical overload with no actor_id.
  RETURN '{}'::jsonb;
END;
$$;

-- Historical authenticated INSERT policy on user_notifications
-- (This is exactly what the additive migration is expected to remove.)
CREATE POLICY "Users can insert own notifications only"
  ON public.user_notifications
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);
