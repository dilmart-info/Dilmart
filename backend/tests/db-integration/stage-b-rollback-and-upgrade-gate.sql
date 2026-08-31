-- ==============================================================================
-- DILMART — STAGE B PASS 3: DISTINCT IMMEDIATE PRE-A & ROLLBACK GATE
-- ==============================================================================

-- ── 1. PRE-A STATE VERIFICATION (55 args & 51 args) ──────────────────────────
DO $pre_a_state_gate$
DECLARE
  v_po_count INT;
  v_poi_count INT;
  v_po_nargs INT;
  v_poi_nargs INT;
BEGIN
  SELECT count(*), COALESCE(MAX(pronargs), 0) INTO v_po_count, v_po_nargs
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 OR v_po_nargs <> 55 THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Expected exactly 1 public.place_order with 55 args, found count %, nargs %', v_po_count, v_po_nargs;
  END IF;

  SELECT count(*), COALESCE(MAX(pronargs), 0) INTO v_poi_count, v_poi_nargs
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 OR v_poi_nargs <> 51 THEN
    RAISE EXCEPTION 'PRE-A GATE FAILED: Expected exactly 1 public.place_order_idempotent with 51 args, found count %, nargs %', v_poi_count, v_poi_nargs;
  END IF;
END;
$pre_a_state_gate$;

-- ── 2. REAL FORCED-FAILURE ROLLBACK PROOF ──────────────────────────────────────
DO $forced_failure_test$
BEGIN
  -- Perform rename inside anonymous block, then deliberately raise exception
  -- to trigger an automatic transaction abort and rollback.
  BEGIN
    ALTER FUNCTION public.place_order(
      text, text, uuid, text, text, text, numeric, numeric, numeric, numeric,
      uuid, jsonb, uuid, double precision, double precision, text, integer, numeric, integer, uuid,
      text, text, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric,
      numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text,
      numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text,
      uuid, uuid, uuid, text, text
    ) RENAME TO place_order_legacy_stageb;

    -- Forced failure immediately after rename
    RAISE EXCEPTION 'STAGE_B_TEST_FORCED_FAILURE';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT LIKE '%STAGE_B_TEST_FORCED_FAILURE%' THEN
        RAISE;
      END IF;
      -- Sub-transaction rolled back cleanly
  END;
END;
$forced_failure_test$;

-- ── 3. ASSERT RESTORATION AFTER FORCED-FAILURE ROLLBACK ───────────────────────
DO $post_rollback_gate$
DECLARE
  v_po_count INT;
  v_legacy_count INT;
  v_po_nargs INT;
  v_poi_count INT;
  v_po_rec RECORD;
BEGIN
  -- Verify original 55-arg function is restored
  SELECT count(*), COALESCE(MAX(pronargs), 0) INTO v_po_count, v_po_nargs
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 OR v_po_nargs <> 55 THEN
    RAISE EXCEPTION 'ROLLBACK GATE FAILED: Expected 1 place_order with 55 args after rollback, found count %, nargs %', v_po_count, v_po_nargs;
  END IF;

  -- Verify place_order_legacy_stageb does NOT exist
  SELECT count(*) INTO v_legacy_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_legacy_stageb';

  IF v_legacy_count <> 0 THEN
    RAISE EXCEPTION 'ROLLBACK GATE FAILED: Temporary legacy function exists after rollback, count %', v_legacy_count;
  END IF;

  -- Verify place_order attributes intact
  SELECT p.oid, p.prosecdef, pg_get_userbyid(p.proowner) AS owner_name
  INTO v_po_rec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF NOT v_po_rec.prosecdef OR v_po_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'ROLLBACK GATE FAILED: place_order attributes degraded after rollback';
  END IF;

  -- Verify idempotent function untouched
  SELECT count(*) INTO v_poi_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 THEN
    RAISE EXCEPTION 'ROLLBACK GATE FAILED: place_order_idempotent count is not 1 after rollback';
  END IF;
END;
$post_rollback_gate$;
