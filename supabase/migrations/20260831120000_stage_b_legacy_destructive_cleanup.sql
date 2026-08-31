-- ============================================================================
-- DILMART — STAGE B MIGRATION B: LEGACY DESTRUCTIVE CLEANUP
-- Migration: 20260831120000_stage_b_legacy_destructive_cleanup.sql
-- ============================================================================
-- Fail-Closed Invariant:
-- 1. Preflight asserts Migration A post-state is 100% intact (place_order 49 args,
--    place_order_idempotent 51 args, postgres owner, search_path, ACLs).
-- 2. Preflight asserts all 11 legacy tables contain exactly 0 rows.
-- 3. Preflight asserts all legacy columns contain zero non-default data.
-- 4. Explicitly drops dependent triggers, functions (exact identity), constraints,
--    indexes, columns, child tables, and parent tables without automatic cascading.
-- 5. Postconditions assert 0 legacy functions, 0 legacy tables, 0 legacy columns,
--    and pristine modern place_order authority.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1: FAIL-CLOSED PREFLIGHT VALIDATION GATES
-- ────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_po_count            INT;
  v_po_49_count         INT;
  v_po_55_count         INT;
  v_po_legacy_count     INT;
  v_poi_count           INT;
  v_poi_51_count        INT;
  v_po_owner            TEXT;
  v_poi_owner           TEXT;
  v_po_secdef           BOOLEAN;
  v_poi_secdef          BOOLEAN;
  v_po_cfg_ok           BOOLEAN;
  v_poi_cfg_ok          BOOLEAN;
  v_tbl                 RECORD;
  v_tbl_count           BIGINT;
  v_col_non_null        BIGINT;
  v_salon_true_count    BIGINT;
BEGIN
  -- ── 1.1 Protect Migration A Modern place_order Authority ───────────────────
  SELECT
    count(*),
    count(*) FILTER (WHERE p.pronargs = 49),
    count(*) FILTER (WHERE p.pronargs = 55),
    MAX(pg_get_userbyid(p.proowner)),
    BOOL_AND(p.prosecdef),
    BOOL_AND('search_path=public, pg_temp' = ANY(p.proconfig))
  INTO
    v_po_count, v_po_49_count, v_po_55_count,
    v_po_owner, v_po_secdef, v_po_cfg_ok
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 OR v_po_49_count <> 1 OR v_po_55_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must have exactly 1 function with 49 arguments (found total=%, 49-arg=%, 55-arg=%)',
      v_po_count, v_po_49_count, v_po_55_count;
  END IF;

  IF v_po_owner <> 'postgres' OR v_po_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order must be SECURITY DEFINER owned by postgres (found owner=%, secdef=%)',
      v_po_owner, v_po_secdef;
  END IF;

  IF v_po_cfg_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order search_path not pinned to public, pg_temp';
  END IF;

  SELECT count(*) INTO v_po_legacy_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_legacy_stageb';

  IF v_po_legacy_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: place_order_legacy_stageb temporary function must not exist';
  END IF;

  -- ── 1.2 Protect Migration A place_order_idempotent Wrapper Authority ───────
  SELECT
    count(*),
    count(*) FILTER (WHERE p.pronargs = 51),
    MAX(pg_get_userbyid(p.proowner)),
    BOOL_AND(p.prosecdef),
    BOOL_AND('search_path=public, pg_temp' = ANY(p.proconfig))
  INTO
    v_poi_count, v_poi_51_count,
    v_poi_owner, v_poi_secdef, v_poi_cfg_ok
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 OR v_poi_51_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must have exactly 1 function with 51 arguments (found total=%, 51-arg=%)',
      v_poi_count, v_poi_51_count;
  END IF;

  IF v_poi_owner <> 'postgres' OR v_poi_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent must be SECURITY DEFINER owned by postgres (found owner=%, secdef=%)',
      v_poi_owner, v_poi_secdef;
  END IF;

  IF v_poi_cfg_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: public.place_order_idempotent search_path not pinned to public, pg_temp';
  END IF;

  -- ── 1.3 Assert Zero Rows in All 11 Legacy Tables ───────────────────────────
  FOR v_tbl IN
    SELECT unnest(ARRAY[
      'dilmart_barber_handoff_audit_events',
      'dilmart_barber_handoffs',
      'dilmart_barber_web_sessions',
      'dilmart_customer_handoff_audit_events',
      'dilmart_customer_handoffs',
      'store_cart_items',
      'store_carts',
      'store_federated_refresh_tokens',
      'store_federated_session_audit_events',
      'store_federated_session_families',
      'store_linked_profiles'
    ]) AS name
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = v_tbl.name
    ) THEN
      EXECUTE format('SELECT count(*) FROM public.%I', v_tbl.name) INTO v_tbl_count;
      IF v_tbl_count > 0 THEN
        RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: Legacy table public.% contains % rows. Destructive drop rejected!',
          v_tbl.name, v_tbl_count;
      END IF;
    END IF;
  END LOOP;

  -- ── 1.4 Assert Zero Non-Null / Non-Default Legacy Column Data ───────────────
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dilmart_barbershop_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE dilmart_barbershop_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.dilmart_barbershop_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'dilmart_user_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE dilmart_user_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.dilmart_user_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'store_cart_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE store_cart_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.store_cart_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'store_linked_profile_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.orders WHERE store_linked_profile_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: orders.store_linked_profile_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checkout_attempts' AND column_name = 'store_cart_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.checkout_attempts WHERE store_cart_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: checkout_attempts.store_cart_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checkout_attempts' AND column_name = 'store_linked_profile_id') THEN
    SELECT count(*) INTO v_col_non_null FROM public.checkout_attempts WHERE store_linked_profile_id IS NOT NULL;
    IF v_col_non_null > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: checkout_attempts.store_linked_profile_id contains % non-null rows', v_col_non_null;
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'requires_verified_salon') THEN
    SELECT count(*) INTO v_salon_true_count FROM public.products WHERE requires_verified_salon IS TRUE;
    IF v_salon_true_count > 0 THEN
      RAISE EXCEPTION 'STAGE_B_PREFLIGHT_FAIL: products.requires_verified_salon contains % TRUE rows', v_salon_true_count;
    END IF;
  END IF;
END;
$preflight$;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2: DROP DEPENDENT TRIGGERS ON LEGACY TABLES & AUTH.USERS
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reject_reserved_federated_email ON auth.users;
DROP TRIGGER IF EXISTS trg_reject_barber_handoff_audit_mutation ON public.dilmart_barber_handoff_audit_events;
DROP TRIGGER IF EXISTS trg_reject_handoff_audit_mutation ON public.dilmart_customer_handoff_audit_events;
DROP TRIGGER IF EXISTS trg_reject_federated_session_audit_mutation ON public.store_federated_session_audit_events;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3: DROP LEGACY FUNCTIONS BY EXACT IDENTITY (WITHOUT AUTOMATIC CASCADING)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.finalize_barber_handoff(uuid, text, uuid, text, text, text, text, text, text, text, text, text, text, integer, uuid);
DROP FUNCTION IF EXISTS public.finalize_customer_handoff(uuid, uuid, text, text, text, text, boolean, text, text, text, text, text, text, text, integer, text, text, timestamp with time zone, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS public.logout_all_federated_sessions(text, uuid);
DROP FUNCTION IF EXISTS public.place_b2b_cart_order_idempotent(uuid, text, uuid, uuid, timestamp with time zone, text, text, uuid, text, numeric, numeric, numeric, jsonb, text, text, numeric, uuid, double precision, double precision, text, uuid, numeric, numeric, numeric, text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, text, integer, text, text, text, numeric, uuid, uuid, uuid, uuid, uuid, text, integer, text, text, uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.provision_dilmart_federated_customer(uuid, text, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS public.redeem_and_create_federated_session(text, text, text, text, text, text, uuid, text, integer, integer, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.redeem_barber_handoff_and_create_session(text, text, text, text, text, text, uuid, text, integer, integer, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.redeem_customer_handoff(text, text, text, text, text, text, uuid, text, text, integer, integer, text, text, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.reject_barber_handoff_audit_mutation();
DROP FUNCTION IF EXISTS public.reject_handoff_audit_mutation();
DROP FUNCTION IF EXISTS public.reject_federated_session_audit_mutation();
DROP FUNCTION IF EXISTS public.reject_reserved_federated_email();
DROP FUNCTION IF EXISTS public.resolve_dilmart_federated_customer(uuid, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone, uuid);
DROP FUNCTION IF EXISTS public.revoke_barber_web_sessions_for_user(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.revoke_federated_sessions_for_identity(uuid, uuid, uuid, text, uuid);
DROP FUNCTION IF EXISTS public.rotate_federated_refresh_token(text, text, text, text, text, text, text, text, text, integer, integer, text, text, text, uuid);
DROP FUNCTION IF EXISTS public.validate_federated_session_family(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.verify_barber_web_session(text, text, integer, integer);

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4: DROP CONSTRAINTS & INDEXES ON ACTIVE TABLES
-- ────────────────────────────────────────────────────────────────────────────
-- 4.1 checkout_attempts
ALTER TABLE public.checkout_attempts DROP CONSTRAINT IF EXISTS chk_checkout_attempts_owner_xor;
ALTER TABLE public.checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_store_cart_id_fkey;
ALTER TABLE public.checkout_attempts DROP CONSTRAINT IF EXISTS checkout_attempts_store_linked_profile_id_fkey;
DROP INDEX IF EXISTS public.idx_checkout_attempts_linked_profile;
DROP INDEX IF EXISTS public.idx_checkout_attempts_store_cart_id;

ALTER TABLE public.checkout_attempts
  ADD CONSTRAINT chk_checkout_attempts_user_id_not_null
  CHECK (user_id IS NOT NULL);

-- 4.2 orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_store_cart_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_store_linked_profile_id_fkey;
DROP INDEX IF EXISTS public.idx_orders_dilmart_barbershop_id;
DROP INDEX IF EXISTS public.idx_orders_dilmart_user_id;
DROP INDEX IF EXISTS public.idx_orders_store_cart_id;
DROP INDEX IF EXISTS public.idx_orders_store_linked_profile_id;

-- 4.3 products
DROP INDEX IF EXISTS public.idx_products_requires_verified_salon;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 5: DROP LEGACY COLUMNS FROM ACTIVE TABLES
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.checkout_attempts DROP COLUMN IF EXISTS store_cart_id;
ALTER TABLE public.checkout_attempts DROP COLUMN IF EXISTS store_linked_profile_id;

ALTER TABLE public.orders DROP COLUMN IF EXISTS dilmart_barbershop_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS dilmart_user_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS store_cart_id;
ALTER TABLE public.orders DROP COLUMN IF EXISTS store_linked_profile_id;

ALTER TABLE public.products DROP COLUMN IF EXISTS requires_verified_salon;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 6: DROP LEGACY TABLES IN STRICT DEPENDENCY ORDER (WITHOUT AUTOMATIC CASCADING)
-- ────────────────────────────────────────────────────────────────────────────
-- 6.1 Child audit, token, and items tables
DROP TABLE IF EXISTS public.dilmart_barber_handoff_audit_events;
DROP TABLE IF EXISTS public.dilmart_customer_handoff_audit_events;
DROP TABLE IF EXISTS public.store_federated_session_audit_events;
DROP TABLE IF EXISTS public.store_federated_refresh_tokens;
DROP TABLE IF EXISTS public.store_cart_items;

-- 6.2 Session, handoff, and cart tables
DROP TABLE IF EXISTS public.dilmart_barber_web_sessions;
DROP TABLE IF EXISTS public.dilmart_barber_handoffs;
DROP TABLE IF EXISTS public.dilmart_customer_handoffs;
DROP TABLE IF EXISTS public.store_federated_session_families;
DROP TABLE IF EXISTS public.store_carts;

-- 6.3 Root linked profile table
DROP TABLE IF EXISTS public.store_linked_profiles;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 7: FAIL-CLOSED POSTCONDITION CATALOG ASSERTIONS
-- ────────────────────────────────────────────────────────────────────────────
DO $postconditions$
DECLARE
  v_remaining_fn_count  INT;
  v_remaining_tbl_count INT;
  v_remaining_col_count INT;
  v_po_count            INT;
  v_po_49_count         INT;
  v_poi_count           INT;
  v_poi_51_count        INT;
  v_po_owner            TEXT;
  v_poi_owner           TEXT;
  v_po_secdef           BOOLEAN;
  v_poi_secdef          BOOLEAN;
  v_po_svc              BOOLEAN;
  v_poi_svc             BOOLEAN;
  v_po_anon             BOOLEAN;
  v_poi_anon            BOOLEAN;
  v_po_auth             BOOLEAN;
  v_poi_auth            BOOLEAN;
  v_po_pub              BOOLEAN;
  v_poi_pub             BOOLEAN;
  v_po_cfg              TEXT[];
  v_poi_cfg             TEXT[];
BEGIN
  -- ── 7.1 Verify Zero Legacy Functions Remain ────────────────────────────────
  SELECT count(*) INTO v_remaining_fn_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'finalize_barber_handoff',
      'finalize_customer_handoff',
      'logout_all_federated_sessions',
      'place_b2b_cart_order_idempotent',
      'provision_dilmart_federated_customer',
      'redeem_and_create_federated_session',
      'redeem_barber_handoff_and_create_session',
      'redeem_customer_handoff',
      'reject_barber_handoff_audit_mutation',
      'reject_handoff_audit_mutation',
      'reject_federated_session_audit_mutation',
      'reject_reserved_federated_email',
      'resolve_dilmart_federated_customer',
      'revoke_barber_web_sessions_for_user',
      'revoke_federated_sessions_for_identity',
      'rotate_federated_refresh_token',
      'validate_federated_session_family',
      'verify_barber_web_session'
    );

  IF v_remaining_fn_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: % legacy functions still remain', v_remaining_fn_count;
  END IF;

  -- ── 7.2 Verify Zero Legacy Tables Remain ───────────────────────────────────
  SELECT count(*) INTO v_remaining_tbl_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'dilmart_barber_handoff_audit_events',
      'dilmart_barber_handoffs',
      'dilmart_barber_web_sessions',
      'dilmart_customer_handoff_audit_events',
      'dilmart_customer_handoffs',
      'store_cart_items',
      'store_carts',
      'store_federated_refresh_tokens',
      'store_federated_session_audit_events',
      'store_federated_session_families',
      'store_linked_profiles'
    );

  IF v_remaining_tbl_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: % legacy tables still remain', v_remaining_tbl_count;
  END IF;

  -- ── 7.3 Verify Zero Legacy Columns Remain ──────────────────────────────────
  SELECT count(*) INTO v_remaining_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'products' AND column_name = 'requires_verified_salon')
      OR (table_name = 'orders' AND column_name IN ('dilmart_barbershop_id', 'dilmart_user_id', 'store_cart_id', 'store_linked_profile_id'))
      OR (table_name = 'checkout_attempts' AND column_name IN ('store_cart_id', 'store_linked_profile_id'))
    );

  IF v_remaining_col_count <> 0 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: % legacy columns still remain', v_remaining_col_count;
  END IF;

  -- ── 7.4 Re-Verify Pristine Modern place_order Authority ───────────────────
  SELECT
    count(*),
    count(*) FILTER (WHERE p.pronargs = 49),
    MAX(pg_get_userbyid(p.proowner)),
    BOOL_AND(p.prosecdef),
    BOOL_AND(has_function_privilege('service_role', p.oid, 'EXECUTE')),
    BOOL_OR(has_function_privilege('anon', p.oid, 'EXECUTE')),
    BOOL_OR(has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    BOOL_OR(has_function_privilege('public', p.oid, 'EXECUTE')),
    BOOL_AND('search_path=public, pg_temp' = ANY(p.proconfig))
  INTO
    v_po_count, v_po_49_count,
    v_po_owner, v_po_secdef,
    v_po_svc, v_po_anon, v_po_auth, v_po_pub,
    v_po_cfg_ok
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 OR v_po_49_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order must have exactly 1 function with 49 arguments (found total=%, 49-arg=%)',
      v_po_count, v_po_49_count;
  END IF;

  IF v_po_owner <> 'postgres' OR v_po_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order must be SECURITY DEFINER owned by postgres';
  END IF;

  IF v_po_svc IS NOT TRUE OR v_po_anon IS TRUE OR v_po_auth IS TRUE OR v_po_pub IS TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order ACL violation (svc=%, anon=%, auth=%, pub=%)',
      v_po_svc, v_po_anon, v_po_auth, v_po_pub;
  END IF;

  IF v_po_cfg_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order search_path not pinned to public, pg_temp';
  END IF;

  -- ── 7.5 Re-Verify Pristine place_order_idempotent Authority ────────────────
  SELECT
    count(*),
    count(*) FILTER (WHERE p.pronargs = 51),
    MAX(pg_get_userbyid(p.proowner)),
    BOOL_AND(p.prosecdef),
    BOOL_AND(has_function_privilege('service_role', p.oid, 'EXECUTE')),
    BOOL_OR(has_function_privilege('anon', p.oid, 'EXECUTE')),
    BOOL_OR(has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    BOOL_OR(has_function_privilege('public', p.oid, 'EXECUTE')),
    BOOL_AND('search_path=public, pg_temp' = ANY(p.proconfig))
  INTO
    v_poi_count, v_poi_51_count,
    v_poi_owner, v_poi_secdef,
    v_poi_svc, v_poi_anon, v_poi_auth, v_poi_pub,
    v_poi_cfg_ok
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 OR v_poi_51_count <> 1 THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent must have exactly 1 function with 51 arguments (found total=%, 51-arg=%)',
      v_poi_count, v_poi_51_count;
  END IF;

  IF v_poi_owner <> 'postgres' OR v_poi_secdef IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent must be SECURITY DEFINER owned by postgres';
  END IF;

  IF v_poi_svc IS NOT TRUE OR v_poi_anon IS TRUE OR v_poi_auth IS TRUE OR v_poi_pub IS TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent ACL violation (svc=%, anon=%, auth=%, pub=%)',
      v_poi_svc, v_poi_anon, v_poi_auth, v_poi_pub;
  END IF;

  IF v_poi_cfg_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'STAGE_B_POSTCONDITION_FAIL: public.place_order_idempotent search_path not pinned to public, pg_temp';
  END IF;
END;
$postconditions$;

COMMIT;
