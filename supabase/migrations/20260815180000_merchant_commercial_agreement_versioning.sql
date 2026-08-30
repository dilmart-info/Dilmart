-- Merchant Commercial Agreement versioning.
--
-- Provides atomic entry points for the admin-facing "Merchant Commercial Agreement" feature to
-- version merchant-scoped commercial_rules rows (rule_type: commission | assisted_fee |
-- platform_fee | delivery_billing) without ever leaving two overlapping active windows for the
-- same (merchant_id, rule_type).
--
-- Model: at most ONE open-ended "current" row (start_at <= now, end_at IS NULL) and at most ONE
-- not-yet-started "pending" row (start_at > now) per (merchant_id, rule_type) at any time.
-- Windows are half-open [start_at, end_at) — start inclusive, end exclusive.
--
--   * Immediate change (effective_from <= now): close the current row's end_at at effective_from,
--     insert the new row open-ended.
--   * Future schedule (effective_from > now): close the current row's end_at at the future
--     effective_from (no gap, no overlap), insert the new row open-ended starting then.
--   * A pending row that already exists is left alone unless the caller passes
--     p_replace_pending = true, in which case it is deactivated and superseded, and the current
--     row's boundary is recalculated from scratch against the NEW effective date (not the
--     replaced pending row's old date).
--
-- Concurrency: two concurrent first-time saves for the same (merchant_id, rule_type) — where no
-- row exists yet for FOR UPDATE to lock — must not both insert an open-ended row. A transaction-
-- scoped advisory lock keyed on (merchant_id, rule_type) is taken before any lookup, so every
-- writer for that pair is fully serialized regardless of whether a row exists yet.
--
-- Atomicity across a whole agreement save: `admin_schedule_merchant_commercial_agreement` accepts
-- every changed term (commission plus any of assisted_fee/platform_fee/delivery_billing) in one
-- call and versions each of them via `admin_schedule_merchant_commercial_term` from inside the
-- SAME function invocation — i.e. the same database transaction. If any term fails, the whole
-- call raises and Postgres rolls back everything, so a save can never leave a merchant with only
-- some of the submitted terms applied.
--
-- Auditability: the previous value/value_type/effective window for each term being changed — and,
-- for a replace_pending save, the pending agreement being superseded — is captured by
-- `admin_schedule_merchant_commercial_term` from the SAME locked rows it reads for the mutation
-- itself (never re-inferred afterwards, never a separate read that could race). The wrapper writes
-- ONE audit_logs row from that captured before/after state, INSIDE the same transaction as the
-- mutation (same pattern as product_import_confirm_atomic's audit insert) — so a commission change
-- can never commit without its audit record, or vice versa: they are the same transaction. Actor
-- identity is REQUIRED (no default) and the whole call fails closed if it's missing, rather than
-- silently skipping the audit row. The application-level NestJS AuditService is intentionally NOT
-- also called for this event, to avoid a duplicate/conflicting audit_logs row for one save.
--
-- This does not introduce a new source of truth: it only writes to the existing commercial_rules
-- table, using the existing scope_type='merchant' convention (see the Al Arsh rows).
--
-- Authorization: these are SECURITY DEFINER functions with EXECUTE explicitly revoked from
-- PUBLIC/anon/authenticated and granted only to service_role. The NestJS admin route
-- (@Roles('super_admin','admin')) is the actual authorization gate; without the REVOKE, PostgREST
-- would let any anon/authenticated client invoke this function directly (Postgres grants EXECUTE
-- on new functions to PUBLIC by default) and bypass that guard entirely.

CREATE OR REPLACE FUNCTION public.admin_schedule_merchant_commercial_term(
  p_merchant_id uuid,
  p_rule_type text,
  p_value_type text,
  p_value numeric,
  p_effective_from timestamptz,
  p_conditions jsonb DEFAULT '{}'::jsonb,
  p_created_by uuid DEFAULT NULL,
  p_replace_pending boolean DEFAULT false
)
RETURNS TABLE (
  new_rule_id uuid,
  closed_rule_id uuid,
  replaced_pending_rule_id uuid,
  previous_value numeric,
  previous_value_type text,
  previous_start_at timestamptz,
  previous_end_at timestamptz,
  replaced_pending_value numeric,
  replaced_pending_value_type text,
  replaced_pending_start_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_current public.commercial_rules%ROWTYPE;
  v_pending public.commercial_rules%ROWTYPE;
  v_current_orig_end_at timestamptz;
  v_new_id uuid;
  v_closed_id uuid;
  v_replaced_id uuid;
BEGIN
  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'merchant_id is required.' USING ERRCODE = '22023';
  END IF;
  IF p_rule_type NOT IN ('commission','assisted_fee','platform_fee','delivery_billing') THEN
    RAISE EXCEPTION 'Invalid rule_type: %', p_rule_type USING ERRCODE = '22023';
  END IF;
  IF p_value_type NOT IN ('percentage','fixed') THEN
    RAISE EXCEPTION 'Invalid value_type: %', p_value_type USING ERRCODE = '22023';
  END IF;
  IF p_value IS NULL THEN
    RAISE EXCEPTION 'value must be a finite number.' USING ERRCODE = '22023';
  END IF;
  -- PostgreSQL numeric treats NaN as equal to itself (unlike IEEE-754 float semantics), so a
  -- self-comparison guard does NOT reject it. Reject it explicitly by value.
  IF p_value = 'NaN'::numeric THEN
    RAISE EXCEPTION 'value must not be NaN.' USING ERRCODE = '22023';
  END IF;
  IF p_value_type = 'percentage' AND (p_value < 0 OR p_value > 100) THEN
    RAISE EXCEPTION 'Percentage value must be between 0 and 100.' USING ERRCODE = '22023';
  END IF;
  IF p_value_type = 'fixed' AND p_value < 0 THEN
    RAISE EXCEPTION 'Fixed value must be >= 0.' USING ERRCODE = '22023';
  END IF;
  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'effective_from is required.' USING ERRCODE = '22023';
  END IF;

  -- Serialize ALL writers for this (merchant, rule_type) — including the very first save, where
  -- there is no existing row for FOR UPDATE to lock. Without this, two concurrent first saves can
  -- both observe zero current/pending rows and both insert an open-ended row.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_merchant_id::text || ':' || p_rule_type, 0));

  -- Row-level lock too, for defense in depth and to make the subsequent SELECTs consistent within
  -- the transaction even though the advisory lock above already fully serializes this pair.
  PERFORM 1 FROM public.commercial_rules
    WHERE scope_type = 'merchant' AND scope_reference_id = p_merchant_id AND rule_type = p_rule_type AND is_active = true
    FOR UPDATE;

  SELECT * INTO v_current FROM public.commercial_rules
    WHERE scope_type = 'merchant' AND scope_reference_id = p_merchant_id AND rule_type = p_rule_type
      AND is_active = true AND start_at <= v_now AND (end_at IS NULL OR end_at > v_now)
    ORDER BY start_at DESC LIMIT 1;
  -- Snapshot the "previous" state for the audit trail BEFORE any mutation below — v_current.end_at
  -- may be reset to NULL further down (replace_pending boundary fix), so this must be captured now.
  v_current_orig_end_at := v_current.end_at;

  SELECT * INTO v_pending FROM public.commercial_rules
    WHERE scope_type = 'merchant' AND scope_reference_id = p_merchant_id AND rule_type = p_rule_type
      AND is_active = true AND start_at > v_now
    ORDER BY start_at ASC LIMIT 1;

  IF v_pending.id IS NOT NULL THEN
    IF NOT p_replace_pending THEN
      RAISE EXCEPTION 'A future scheduled agreement already exists for this merchant and rule_type (starts %). Pass replace_pending=true to overwrite it.', v_pending.start_at
        USING ERRCODE = '23P01';
    END IF;
    UPDATE public.commercial_rules SET is_active = false, updated_at = v_now WHERE id = v_pending.id;
    v_replaced_id := v_pending.id;

    -- The current row's end_at was set to the (now-replaced) pending row's start_at when that
    -- pending row was originally scheduled. Reopen it so the boundary is recalculated fresh
    -- against the NEW effective date below, instead of being compared against the stale one —
    -- otherwise replacing a pending agreement with a different effective date always fails with a
    -- spurious "different end date" conflict.
    IF v_current.id IS NOT NULL AND v_current.end_at = v_pending.start_at THEN
      UPDATE public.commercial_rules SET end_at = NULL, updated_at = v_now WHERE id = v_current.id;
      v_current.end_at := NULL;
    END IF;
  END IF;

  IF v_current.id IS NOT NULL THEN
    IF v_current.end_at IS NOT NULL AND v_current.end_at <> p_effective_from THEN
      -- The current row already has a different, unexpected end date — fail closed rather
      -- than silently create a gap or an overlap.
      RAISE EXCEPTION 'Current agreement already has a different end date (%) than the new effective date (%).', v_current.end_at, p_effective_from
        USING ERRCODE = '23P01';
    END IF;
    IF p_effective_from < v_current.start_at THEN
      RAISE EXCEPTION 'effective_from (%) cannot be before the current agreement start date (%).', p_effective_from, v_current.start_at
        USING ERRCODE = '23P01';
    END IF;
    UPDATE public.commercial_rules SET end_at = p_effective_from, updated_at = v_now WHERE id = v_current.id;
    v_closed_id := v_current.id;
  END IF;

  INSERT INTO public.commercial_rules (
    name, rule_type, scope_type, scope_reference_id, priority, value_type, value, conditions,
    is_active, start_at, end_at, created_by
  ) VALUES (
    'Merchant agreement: ' || p_rule_type, p_rule_type, 'merchant', p_merchant_id, 1000, p_value_type, p_value,
    COALESCE(p_conditions, '{}'::jsonb), true, p_effective_from, NULL, p_created_by
  ) RETURNING id INTO v_new_id;

  RETURN QUERY SELECT
    v_new_id, v_closed_id, v_replaced_id,
    v_current.value, v_current.value_type, v_current.start_at, v_current_orig_end_at,
    v_pending.value, v_pending.value_type, v_pending.start_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_schedule_merchant_commercial_term(uuid, text, text, numeric, timestamptz, jsonb, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_schedule_merchant_commercial_term(uuid, text, text, numeric, timestamptz, jsonb, uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_schedule_merchant_commercial_term(uuid, text, text, numeric, timestamptz, jsonb, uuid, boolean) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Whole-agreement atomic wrapper: applies every submitted term (commission plus any of
-- assisted_fee/platform_fee/delivery_billing) inside ONE function invocation, i.e. one
-- transaction, and writes exactly one audit_logs row for the save in that SAME transaction. A
-- term is a JSONB object: {"rule_type": "...", "value_type": "...", "value": ..., "conditions":
-- {...}}. If any term fails validation or conflicts, the exception propagates and Postgres rolls
-- back every term already applied AND the (not-yet-written) audit row in this call — never a
-- partial agreement, and never a committed change without its audit record.
--
-- p_actor_id/p_actor_role are REQUIRED (no default): a commercial-agreement change is a financial
-- configuration change and must always be traceable to who made it. If either is missing, the
-- whole call raises before touching commercial_rules at all — fail closed, not a silently
-- unaudited write.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_schedule_merchant_commercial_agreement(
  p_merchant_id uuid,
  p_effective_from timestamptz,
  p_terms jsonb,
  p_actor_id uuid,
  p_actor_role text,
  p_replace_pending boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_term jsonb;
  v_rule_type text;
  v_result record;
  v_results jsonb := '[]'::jsonb;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_id is required — a commercial agreement change must always be auditable.' USING ERRCODE = '22023';
  END IF;
  IF p_actor_role IS NULL OR btrim(p_actor_role) = '' THEN
    RAISE EXCEPTION 'actor_role is required — a commercial agreement change must always be auditable.' USING ERRCODE = '22023';
  END IF;
  IF p_terms IS NULL OR jsonb_typeof(p_terms) <> 'array' OR jsonb_array_length(p_terms) = 0 THEN
    RAISE EXCEPTION 'terms must be a non-empty array.' USING ERRCODE = '22023';
  END IF;

  FOR v_term IN SELECT * FROM jsonb_array_elements(p_terms) LOOP
    v_rule_type := v_term->>'rule_type';

    SELECT * INTO v_result FROM public.admin_schedule_merchant_commercial_term(
      p_merchant_id,
      v_rule_type,
      v_term->>'value_type',
      (v_term->>'value')::numeric,
      p_effective_from,
      COALESCE(v_term->'conditions', '{}'::jsonb),
      p_actor_id,
      p_replace_pending
    );

    v_results := v_results || jsonb_build_object(
      'rule_type', v_rule_type,
      'new_rule_id', v_result.new_rule_id,
      'closed_rule_id', v_result.closed_rule_id,
      'replaced_pending_rule_id', v_result.replaced_pending_rule_id
    );

    v_changes := v_changes || jsonb_build_object(
      'rule_type', v_rule_type,
      -- The agreement in effect for this rule_type immediately before this call (null if none).
      'previous_value', v_result.previous_value,
      'previous_value_type', v_result.previous_value_type,
      'previous_effective_from', v_result.previous_start_at,
      'previous_effective_to', v_result.previous_end_at,
      -- The future agreement this call superseded via replace_pending, if any (null otherwise).
      'pending_replaced_value', v_result.replaced_pending_value,
      'pending_replaced_value_type', v_result.replaced_pending_value_type,
      'pending_replaced_effective_from', v_result.replaced_pending_start_at,
      -- What this call actually set.
      'new_value', (v_term->>'value')::numeric,
      'new_value_type', v_term->>'value_type',
      'new_rule_id', v_result.new_rule_id
    );
  END LOOP;

  -- Same transaction as the commercial_rules writes above — same pattern as
  -- product_import_confirm_atomic's audit insert (20260801190000). Never logged from application
  -- code for this event, to avoid a duplicate/conflicting record for one save.
  INSERT INTO public.audit_logs (event_type, actor_id, actor_role, merchant_id, resource_type, resource_id, payload)
  VALUES (
    'MERCHANT_COMMERCIAL_AGREEMENT_SCHEDULED', p_actor_id, p_actor_role, p_merchant_id,
    'merchant_commercial_agreement', p_merchant_id::text,
    jsonb_build_object(
      'merchant_id', p_merchant_id,
      'effective_from', p_effective_from,
      'replace_pending', p_replace_pending,
      'changes', v_changes,
      'timestamp', now()
    )
  );

  RETURN v_results;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_schedule_merchant_commercial_agreement(uuid, timestamptz, jsonb, uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_schedule_merchant_commercial_agreement(uuid, timestamptz, jsonb, uuid, text, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_schedule_merchant_commercial_agreement(uuid, timestamptz, jsonb, uuid, text, boolean) TO service_role;
