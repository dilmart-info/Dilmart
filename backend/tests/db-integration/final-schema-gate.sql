-- Final Schema Gate
-- Run via: psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/tests/db-integration/final-schema-gate.sql
-- Any RAISE EXCEPTION causes psql to exit with a nonzero code and fails CI.

-- ── RPC Signature Assertions ──────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure(
    'public.mark_return_item_received_atomic(uuid,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy mark-return-item-received overload exists';
  END IF;

  IF to_regprocedure(
    'public.mark_return_item_received_atomic(uuid,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Canonical mark-return-item-received RPC is missing';
  END IF;

  IF to_regprocedure(
    'public.review_return_request_atomic(uuid,text,uuid,text,text)'
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'Legacy return-review overload exists';
  END IF;

  IF to_regprocedure(
    'public.review_return_request_atomic(uuid,text,uuid,text,text,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Scoped return-review RPC is missing';
  END IF;

  IF to_regprocedure(
    'public.begin_password_reset_finalization(uuid,uuid,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Password finalization RPC is missing';
  END IF;
END;
$$;

-- ── Token Status Constraint Assertion ─────────────────────────────────────────
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid)
  INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.auth_action_tokens'::regclass
    AND conname = 'auth_action_tokens_status_check';

  IF v_constraint IS NULL
     OR v_constraint NOT LIKE '%finalizing%' THEN
    RAISE EXCEPTION
      'auth_action_tokens status constraint does not contain finalizing';
  END IF;
END;
$$;

-- ── Notification INSERT Policy Assertion ──────────────────────────────────────
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_notifications'
    AND cmd = 'INSERT';

  IF v_count <> 0 THEN
    RAISE EXCEPTION
      'user_notifications still has % INSERT policies',
      v_count;
  END IF;
END;
$$;

-- ── profiles.account_type & Core Tables Exist ─────────────────────────────────
DO $$
DECLARE
  v_col_exists BOOLEAN;
BEGIN
  -- Verify profiles.account_type exists
  SELECT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'account_type'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'Column public.profiles.account_type does not exist';
  END IF;

  -- Verify customer_phone_identities exists
  IF to_regclass('public.customer_phone_identities') IS NULL THEN
    RAISE EXCEPTION 'Table public.customer_phone_identities does not exist';
  END IF;

  -- Verify auth_action_tokens exists
  IF to_regclass('public.auth_action_tokens') IS NULL THEN
    RAISE EXCEPTION 'Table public.auth_action_tokens does not exist';
  END IF;

  -- Verify auth_action_operations exists
  IF to_regclass('public.auth_action_operations') IS NULL THEN
    RAISE EXCEPTION 'Table public.auth_action_operations does not exist';
  END IF;
END;
$$;

-- ── Phase-1 Merchant Web Push Schema Gate Assertions ─────────────────────────
DO $$
DECLARE
  v_col_exists BOOLEAN;
  v_constraint_exists BOOLEAN;
BEGIN
  -- Verify merchant_push_subscriptions exists
  IF to_regclass('public.merchant_push_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'Table public.merchant_push_subscriptions does not exist';
  END IF;

  -- Verify merchant_push_deliveries exists
  IF to_regclass('public.merchant_push_deliveries') IS NULL THEN
    RAISE EXCEPTION 'Table public.merchant_push_deliveries does not exist';
  END IF;

  -- Verify UNIQUE(merchant_id, endpoint) constraint exists on merchant_push_subscriptions
  SELECT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'public.merchant_push_subscriptions'::regclass 
      AND conname = 'uq_merchant_push_merchant_endpoint'
  ) INTO v_constraint_exists;

  IF NOT v_constraint_exists THEN
    RAISE EXCEPTION 'Unique constraint uq_merchant_push_merchant_endpoint does not exist on merchant_push_subscriptions';
  END IF;

  -- Verify UNIQUE(outbox_id, subscription_id) constraint exists on merchant_push_deliveries
  SELECT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'public.merchant_push_deliveries'::regclass 
      AND conname = 'uq_merchant_push_delivery'
  ) INTO v_constraint_exists;

  IF NOT v_constraint_exists THEN
    RAISE EXCEPTION 'Unique constraint uq_merchant_push_delivery does not exist on merchant_push_deliveries';
  END IF;

  -- Verify acknowledgement columns on merchant_notifications
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_notifications' AND column_name = 'acknowledged_at') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'acknowledged_at missing on merchant_notifications'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_notifications' AND column_name = 'acknowledged_by') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'acknowledged_by missing on merchant_notifications'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_notifications' AND column_name = 'acknowledged_device_id') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'acknowledged_device_id missing on merchant_notifications'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_notifications' AND column_name = 'opened_at') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'opened_at missing on merchant_notifications'; END IF;

  -- Verify authenticated and anon have NO UPDATE privilege on merchant_notifications
  IF has_table_privilege('authenticated', 'public.merchant_notifications', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated role must not have UPDATE privilege on merchant_notifications';
  END IF;
  IF has_table_privilege('anon', 'public.merchant_notifications', 'UPDATE') THEN
    RAISE EXCEPTION 'anon role must not have UPDATE privilege on merchant_notifications';
  END IF;

  -- Verify authenticated and anon have NO privileges on merchant_push_subscriptions
  IF has_table_privilege('authenticated', 'public.merchant_push_subscriptions', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated role must not have SELECT privilege on merchant_push_subscriptions';
  END IF;
  IF has_table_privilege('authenticated', 'public.merchant_push_subscriptions', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated role must not have INSERT privilege on merchant_push_subscriptions';
  END IF;
  IF has_table_privilege('authenticated', 'public.merchant_push_subscriptions', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated role must not have UPDATE privilege on merchant_push_subscriptions';
  END IF;
  IF has_table_privilege('authenticated', 'public.merchant_push_subscriptions', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated role must not have DELETE privilege on merchant_push_subscriptions';
  END IF;

  IF has_table_privilege('anon', 'public.merchant_push_subscriptions', 'SELECT') THEN
    RAISE EXCEPTION 'anon role must not have SELECT privilege on merchant_push_subscriptions';
  END IF;
  IF has_table_privilege('anon', 'public.merchant_push_subscriptions', 'INSERT') THEN
    RAISE EXCEPTION 'anon role must not have INSERT privilege on merchant_push_subscriptions';
  END IF;
  IF has_table_privilege('anon', 'public.merchant_push_subscriptions', 'UPDATE') THEN
    RAISE EXCEPTION 'anon role must not have UPDATE privilege on merchant_push_subscriptions';
  END IF;
  IF has_table_privilege('anon', 'public.merchant_push_subscriptions', 'DELETE') THEN
    RAISE EXCEPTION 'anon role must not have DELETE privilege on merchant_push_subscriptions';
  END IF;

  -- Verify authenticated and anon have no direct access to merchant_push_deliveries
  IF has_table_privilege('authenticated', 'public.merchant_push_deliveries', 'SELECT')
     OR has_table_privilege('authenticated', 'public.merchant_push_deliveries', 'INSERT')
     OR has_table_privilege('authenticated', 'public.merchant_push_deliveries', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.merchant_push_deliveries', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated role must not have direct access to merchant_push_deliveries';
  END IF;

  IF has_table_privilege('anon', 'public.merchant_push_deliveries', 'SELECT')
     OR has_table_privilege('anon', 'public.merchant_push_deliveries', 'INSERT')
     OR has_table_privilege('anon', 'public.merchant_push_deliveries', 'UPDATE')
     OR has_table_privilege('anon', 'public.merchant_push_deliveries', 'DELETE') THEN
    RAISE EXCEPTION 'anon role must not have direct access to merchant_push_deliveries';
  END IF;

  -- Verify acknowledge_merchant_notification_atomic exists and is service_role-only
  IF to_regprocedure('public.acknowledge_merchant_notification_atomic(uuid,uuid,uuid,uuid,boolean)') IS NULL THEN
    RAISE EXCEPTION 'acknowledge_merchant_notification_atomic RPC does not exist';
  END IF;

  IF has_function_privilege('authenticated', 'public.acknowledge_merchant_notification_atomic(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not EXECUTE acknowledge_merchant_notification_atomic';
  END IF;
  IF has_function_privilege('anon', 'public.acknowledge_merchant_notification_atomic(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not EXECUTE acknowledge_merchant_notification_atomic';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.acknowledge_merchant_notification_atomic(uuid,uuid,uuid,uuid,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must EXECUTE acknowledge_merchant_notification_atomic';
  END IF;

  -- Verify merchant_settings Phase-1 columns exist
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_settings' AND column_name = 'push_enabled') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'push_enabled missing on merchant_settings'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_settings' AND column_name = 'sound_enabled') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'sound_enabled missing on merchant_settings'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_settings' AND column_name = 'sound_repeat_interval_seconds') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'sound_repeat_interval_seconds missing on merchant_settings'; END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'merchant_settings' AND column_name = 'sound_max_duration_seconds') INTO v_col_exists;
  IF NOT v_col_exists THEN RAISE EXCEPTION 'sound_max_duration_seconds missing on merchant_settings'; END IF;

  -- Verify notification_outbox event_key constraint remains unique
  SELECT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conrelid = 'public.notification_outbox'::regclass 
      AND (conname = 'notification_outbox_event_key_key' OR conname = 'uq_notification_outbox_event_key')
  ) OR EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE tablename = 'notification_outbox'
      AND indexdef LIKE '%UNIQUE%event_key%'
  ) INTO v_constraint_exists;

  IF NOT v_constraint_exists THEN
    RAISE EXCEPTION 'Unique constraint/index on notification_outbox.event_key does not exist';
  END IF;
END;
$$;



-- ── FRA-S2-001 — public.profiles must never be browser-writable ───────────────
--
-- Authoritative ACL gate. This runs after every repository migration has been
-- applied to the local CI Postgres, so it sees the state PostgreSQL actually
-- computed — direct table grants, column grants,
-- `GRANT ... ON ALL TABLES IN SCHEMA public`, grants issued through dynamic SQL,
-- and privileges inherited from PUBLIC. The static replay in
-- backend/tests/profiles-acl-lockdown.test.mjs is an early tripwire over
-- migration text; THIS block is the source of truth.
--
-- Background: public.profiles.role is the authority both
-- SupabaseActorResolverService and app_private.is_admin() trust. While browser
-- roles held UPDATE on this table alongside an unrestricted self-UPDATE policy,
-- any customer could promote themselves to platform admin.
DO $fra_s2_001$
DECLARE
  v_rls_enabled       boolean;
  v_public_update     boolean;
  v_browser_update    boolean;
  v_unsafe_policy     text;
BEGIN
  -- 1. authenticated must keep SELECT — the owner/admin read policies need it.
  IF NOT has_table_privilege('authenticated', 'public.profiles', 'SELECT') THEN
    RAISE EXCEPTION
      'FRA-S2-001 gate: authenticated lost SELECT on public.profiles';
  END IF;

  -- 2. authenticated must NOT hold table-level UPDATE.
  IF has_table_privilege('authenticated', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION
      'FRA-S2-001 REOPENED: authenticated holds table-level UPDATE on public.profiles';
  END IF;

  -- 3. authenticated must NOT hold UPDATE on the role column.
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION
      'FRA-S2-001 REOPENED: authenticated holds UPDATE on public.profiles.role';
  END IF;

  -- 4. anon must NOT hold table-level UPDATE.
  IF has_table_privilege('anon', 'public.profiles', 'UPDATE') THEN
    RAISE EXCEPTION
      'FRA-S2-001 REOPENED: anon holds table-level UPDATE on public.profiles';
  END IF;

  -- 5. anon must NOT hold UPDATE on the role column.
  IF has_column_privilege('anon', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION
      'FRA-S2-001 REOPENED: anon holds UPDATE on public.profiles.role';
  END IF;

  -- 6. PUBLIC must not restore UPDATE authority. has_table_privilege already
  --    resolves PUBLIC for a named role, so checks 2-5 cover the practical case;
  --    this reads the ACL directly so a PUBLIC grant is named explicitly rather
  --    than surfacing as a confusing "authenticated" failure. Grantee OID 0 is
  --    PUBLIC. Column ACLs are inspected too, since a column grant to PUBLIC
  --    would not appear in relacl.
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c,
           LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid = 'public.profiles'::regclass
        AND a.grantee = 0
        AND a.privilege_type = 'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute att,
           LATERAL aclexplode(att.attacl) a
      WHERE att.attrelid = 'public.profiles'::regclass
        AND att.attnum > 0
        AND NOT att.attisdropped
        AND att.attacl IS NOT NULL
        AND a.grantee = 0
        AND a.privilege_type = 'UPDATE'
    )
  INTO v_public_update;

  IF v_public_update THEN
    RAISE EXCEPTION
      'FRA-S2-001 REOPENED: PUBLIC holds UPDATE on public.profiles';
  END IF;

  -- 7. service_role must keep full CRUD — the backend is the only writer.
  IF NOT (
    has_table_privilege('service_role', 'public.profiles', 'SELECT')
    AND has_table_privilege('service_role', 'public.profiles', 'INSERT')
    AND has_table_privilege('service_role', 'public.profiles', 'UPDATE')
    AND has_table_privilege('service_role', 'public.profiles', 'DELETE')
  ) THEN
    RAISE EXCEPTION
      'FRA-S2-001 gate: service_role lost CRUD on public.profiles';
  END IF;

  -- 8. RLS must remain enabled.
  SELECT c.relrowsecurity
  INTO v_rls_enabled
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'profiles';

  IF v_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'FRA-S2-001 gate: RLS is not enabled on public.profiles';
  END IF;

  -- 9. The original unrestricted self-UPDATE policy must stay dropped.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Users can update their own profiles'
  ) THEN
    RAISE EXCEPTION
      'FRA-S2-001 REOPENED: policy "Users can update their own profiles" exists again';
  END IF;

  -- 10. No EQUIVALENT self-UPDATE policy may exist while a browser role holds
  --     effective UPDATE authority. Policy names are not trusted here — any
  --     browser-applicable UPDATE/ALL policy whose USING or WITH CHECK is
  --     satisfied by the row owner (an auth.uid() = <column> shape) counts.
  --     A policy alone is harmless without the grant, and a grant alone is
  --     caught above; it is the pair that reopens the P0.
  v_browser_update :=
    has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE')
    OR has_table_privilege('anon', 'public.profiles', 'UPDATE')
    OR has_column_privilege('anon', 'public.profiles', 'role', 'UPDATE')
    OR v_public_update;

  IF v_browser_update THEN
    SELECT string_agg(policyname, ', ' ORDER BY policyname)
    INTO v_unsafe_policy
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND cmd IN ('UPDATE', 'ALL')
      AND (
        roles = '{public}'
        OR 'anon' = ANY (roles)
        OR 'authenticated' = ANY (roles)
      )
      AND (
        COALESCE(qual, '')       ~* 'auth\.uid\(\)'
        OR COALESCE(with_check, '') ~* 'auth\.uid\(\)'
      );

    IF v_unsafe_policy IS NOT NULL THEN
      RAISE EXCEPTION
        'FRA-S2-001 REOPENED: browser role holds UPDATE while self-update policy/policies exist: %',
        v_unsafe_policy;
    END IF;
  END IF;
END;
$fra_s2_001$;

-- ── FRA-S5-001 — public.orders must never be browser-writable ─────────────────
--
-- Authoritative ACL gate, run after every repository migration has been applied
-- to the local CI Postgres, so it sees the state PostgreSQL actually computed:
-- table grants, column grants, `GRANT ... ON ALL TABLES IN SCHEMA public`,
-- grants issued through dynamic SQL, and privileges inherited from PUBLIC. The
-- static replay in backend/tests/orders-acl-lockdown.test.mjs is an early
-- tripwire over migration text; THIS block is the source of truth.
--
-- Background: orders carries the COD money — cash_expected_amount,
-- cash_received_amount, cash_actual_remitted_amount, cash_remittance_difference,
-- collection_status, courier_fee_payable, commission_rule_id — plus the
-- lifecycle and tenancy keys. While browser roles held UPDATE alongside a
-- column-unrestricted self/owner-scoped policy, any delivery agent could rewrite
-- the cash owed on their assigned orders and any merchant member the commission
-- and settlement state of theirs.
DO $fra_s5_001$
DECLARE
  v_rls_enabled    boolean;
  v_public_update  boolean;
  v_browser_update boolean;
  v_bad_columns    text;
  v_unsafe_policy  text;
BEGIN
  -- 1. RLS must remain enabled.
  SELECT c.relrowsecurity
  INTO v_rls_enabled
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'orders';

  IF v_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'FRA-S5-001 gate: RLS is not enabled on public.orders';
  END IF;

  -- 2. Neither browser role may hold table-level UPDATE.
  IF has_table_privilege('authenticated', 'public.orders', 'UPDATE') THEN
    RAISE EXCEPTION
      'FRA-S5-001 REOPENED: authenticated holds table-level UPDATE on public.orders';
  END IF;

  IF has_table_privilege('anon', 'public.orders', 'UPDATE') THEN
    RAISE EXCEPTION
      'FRA-S5-001 REOPENED: anon holds table-level UPDATE on public.orders';
  END IF;

  -- 3. PUBLIC must not restore UPDATE through the table ACL or a column ACL.
  --    Grantee OID 0 is PUBLIC.
  SELECT
    EXISTS (
      SELECT 1
      FROM pg_catalog.pg_class c,
           LATERAL aclexplode(COALESCE(c.relacl, acldefault('r', c.relowner))) a
      WHERE c.oid = 'public.orders'::regclass
        AND a.grantee = 0
        AND a.privilege_type = 'UPDATE'
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.pg_attribute att,
           LATERAL aclexplode(att.attacl) a
      WHERE att.attrelid = 'public.orders'::regclass
        AND att.attnum > 0
        AND NOT att.attisdropped
        AND att.attacl IS NOT NULL
        AND a.grantee = 0
        AND a.privilege_type = 'UPDATE'
    )
  INTO v_public_update;

  IF v_public_update THEN
    RAISE EXCEPTION
      'FRA-S5-001 REOPENED: PUBLIC holds UPDATE on public.orders';
  END IF;

  -- 4. No column of public.orders may be UPDATE-able by a browser role. This
  --    catches a column-level grant that survives or follows the table REVOKE.
  SELECT string_agg(DISTINCT att.attname, ', ' ORDER BY att.attname)
  INTO v_bad_columns
  FROM pg_catalog.pg_attribute att
  CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(role)
  WHERE att.attrelid = 'public.orders'::regclass
    AND att.attnum > 0
    AND NOT att.attisdropped
    AND has_column_privilege(r.role, 'public.orders', att.attname, 'UPDATE');

  IF v_bad_columns IS NOT NULL THEN
    RAISE EXCEPTION
      'FRA-S5-001 REOPENED: browser role holds UPDATE on public.orders columns: %',
      v_bad_columns;
  END IF;

  -- 5. service_role must keep full CRUD — the backend is the only writer.
  IF NOT (
    has_table_privilege('service_role', 'public.orders', 'SELECT')
    AND has_table_privilege('service_role', 'public.orders', 'INSERT')
    AND has_table_privilege('service_role', 'public.orders', 'UPDATE')
    AND has_table_privilege('service_role', 'public.orders', 'DELETE')
  ) THEN
    RAISE EXCEPTION
      'FRA-S5-001 gate: service_role lost CRUD on public.orders';
  END IF;

  -- 6. The two vulnerable policies must stay dropped.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
      AND policyname IN (
        'Agents can update their assigned orders',
        'Merchant members can update own merchant orders'
      )
  ) THEN
    RAISE EXCEPTION
      'FRA-S5-001 REOPENED: a dropped orders UPDATE policy exists again';
  END IF;

  -- 7. No EQUIVALENT browser-facing write policy may exist while a browser role
  --    holds effective UPDATE. Policy names are not trusted: any browser-
  --    applicable UPDATE/ALL policy counts. A policy alone is inert without the
  --    grant, and a grant alone is caught above; it is the pair that reopens
  --    the P0.
  v_browser_update :=
    has_table_privilege('authenticated', 'public.orders', 'UPDATE')
    OR has_table_privilege('anon', 'public.orders', 'UPDATE')
    OR v_public_update;

  IF v_browser_update THEN
    SELECT string_agg(policyname, ', ' ORDER BY policyname)
    INTO v_unsafe_policy
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'orders'
      AND cmd IN ('UPDATE', 'ALL')
      AND (
        roles = '{public}'
        OR 'anon' = ANY (roles)
        OR 'authenticated' = ANY (roles)
      );

    IF v_unsafe_policy IS NOT NULL THEN
      RAISE EXCEPTION
        'FRA-S5-001 REOPENED: browser role holds UPDATE while orders write policies exist: %',
        v_unsafe_policy;
    END IF;
  END IF;
END;
$fra_s5_001$;

-- ── FRA-S-UNIVERSAL-001 — Every public table must have RLS enabled ───────────
DO $fra_universal_rls$
DECLARE
  v_unprotected_tables text;
  v_bad_table_count    integer;
BEGIN
  SELECT count(*), string_agg(c.relname, ', ' ORDER BY c.relname)
  INTO v_bad_table_count, v_unprotected_tables
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = false;

  IF v_bad_table_count > 0 THEN
    RAISE EXCEPTION
      'UNIVERSAL RLS GATE FAILED: % table(s) in public schema have RLS disabled: %',
      v_bad_table_count, v_unprotected_tables;
  END IF;
END;
$fra_universal_rls$;

-- ── FRA-S-PIS-001 — public.product_import_sessions lockdown gate ──────────────
DO $fra_pis_001$
DECLARE
  v_rls_enabled  boolean;
  v_policy_count integer;
BEGIN
  -- 1. RLS must be enabled
  SELECT c.relrowsecurity
  INTO v_rls_enabled
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'product_import_sessions';

  IF v_rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION
      'FRA-S-PIS-001 gate: RLS is not enabled on public.product_import_sessions';
  END IF;

  -- 2. anon must have NO access (SELECT, INSERT, UPDATE, DELETE all denied)
  IF has_table_privilege('anon', 'public.product_import_sessions', 'SELECT')
     OR has_table_privilege('anon', 'public.product_import_sessions', 'INSERT')
     OR has_table_privilege('anon', 'public.product_import_sessions', 'UPDATE')
     OR has_table_privilege('anon', 'public.product_import_sessions', 'DELETE') THEN
    RAISE EXCEPTION
      'FRA-S-PIS-001 gate: anon holds table privileges on public.product_import_sessions';
  END IF;

  -- 3. authenticated must have NO direct access (SELECT, INSERT, UPDATE, DELETE all denied)
  IF has_table_privilege('authenticated', 'public.product_import_sessions', 'SELECT')
     OR has_table_privilege('authenticated', 'public.product_import_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'public.product_import_sessions', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.product_import_sessions', 'DELETE') THEN
    RAISE EXCEPTION
      'FRA-S-PIS-001 gate: authenticated holds direct table privileges on public.product_import_sessions';
  END IF;

  -- 4. service_role must retain full CRUD (backend is the sole trusted writer/reader)
  IF NOT (
    has_table_privilege('service_role', 'public.product_import_sessions', 'SELECT')
    AND has_table_privilege('service_role', 'public.product_import_sessions', 'INSERT')
    AND has_table_privilege('service_role', 'public.product_import_sessions', 'UPDATE')
    AND has_table_privilege('service_role', 'public.product_import_sessions', 'DELETE')
  ) THEN
    RAISE EXCEPTION
      'FRA-S-PIS-001 gate: service_role lost CRUD on public.product_import_sessions';
  END IF;

  -- 5. Expected policy count is 0 (service-role mediated, zero browser surface)
  SELECT count(*)
  INTO v_policy_count
  FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'product_import_sessions';

  IF v_policy_count > 0 THEN
    RAISE EXCEPTION
      'FRA-S-PIS-001 gate: unexpected browser policies found on product_import_sessions: %',
      v_policy_count;
  END IF;
END;
$fra_pis_001$;

-- ── Stage B Migration A: place_order Authority & ACL Gate ────────────────────
DO $stage_b_place_order_gate$
DECLARE
  v_po_count INT;
  v_poi_count INT;
  v_po_rec RECORD;
  v_poi_rec RECORD;
  v_expected_po_identity TEXT := 'p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
  v_expected_idempotent_identity TEXT := 'p_checkout_attempt_id uuid, p_checkout_request_hash text, p_customer_name text, p_customer_phone text, p_governorate_id uuid, p_area text, p_nearest_landmark text, p_notes text, p_subtotal numeric, p_delivery_cost numeric, p_discount numeric, p_total numeric, p_coupon_id uuid, p_items jsonb, p_user_id uuid, p_latitude double precision, p_longitude double precision, p_map_url text, p_points_spent integer, p_points_discount numeric, p_points_earned integer, p_merchant_id uuid, p_payment_method text, p_merchant_notes text, p_merchandise_subtotal numeric, p_discount_total numeric, p_delivery_fee_charged numeric, p_platform_commission_type text, p_platform_commission_rate numeric, p_platform_commission_amount numeric, p_platform_assisted_fee_amount numeric, p_platform_extra_fee_amount numeric, p_courier_fee_payable numeric, p_merchant_gross_amount numeric, p_merchant_net_amount numeric, p_gross_collected_amount numeric, p_platform_net_revenue_amount numeric, p_currency_code text, p_financial_snapshot_version integer, p_payment_status text, p_collection_status text, p_settlement_status text, p_cash_expected_amount numeric, p_commission_rule_id uuid, p_assisted_fee_rule_id uuid, p_platform_fee_rule_id uuid, p_delivery_billing_rule_id uuid, p_resolved_plan_id uuid, p_resolved_plan_code text, p_commercial_snapshot_version integer, p_channel text';
BEGIN
  -- 1. Assert exactly 1 public.place_order function
  SELECT count(*) INTO v_po_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_count <> 1 THEN
    RAISE EXCEPTION 'Stage B Gate: Expected exactly 1 public.place_order, found %', v_po_count;
  END IF;

  -- 2. Assert exactly 1 public.place_order_idempotent function
  SELECT count(*) INTO v_poi_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_count <> 1 THEN
    RAISE EXCEPTION 'Stage B Gate: Expected exactly 1 public.place_order_idempotent, found %', v_poi_count;
  END IF;

  -- 2. Inspect public.place_order attributes
  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_po_rec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order';

  IF v_po_rec.pronargs <> 49 THEN
    RAISE EXCEPTION 'Stage B Gate: Expected 49 arguments on public.place_order, found %', v_po_rec.pronargs;
  END IF;

  IF v_po_rec.identity_args <> v_expected_po_identity THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order identity arguments [%] do not match expected [%]', v_po_rec.identity_args, v_expected_po_identity;
  END IF;

  IF NOT v_po_rec.prosecdef THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order is not SECURITY DEFINER';
  END IF;

  IF v_po_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order owner [%] is not postgres', v_po_rec.owner_name;
  END IF;

  IF NOT ('search_path=public, pg_temp' = ANY(v_po_rec.proconfig)) THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order search_path is not pinned to public, pg_temp';
  END IF;

  -- 3. Assert temporary legacy function absent
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'place_order_legacy_stageb'
  ) THEN
    RAISE EXCEPTION 'Stage B Gate: Temporary legacy function place_order_legacy_stageb still exists';
  END IF;

  -- 4. Inspect public.place_order_idempotent
  SELECT
    p.oid,
    p.pronargs,
    pg_get_function_identity_arguments(p.oid) AS identity_args,
    p.prosecdef,
    pg_get_userbyid(p.proowner) AS owner_name,
    p.proconfig
  INTO v_poi_rec
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'place_order_idempotent';

  IF v_poi_rec.pronargs <> 51 THEN
    RAISE EXCEPTION 'Stage B Gate: Expected 51 arguments on public.place_order_idempotent, found %', v_poi_rec.pronargs;
  END IF;

  IF v_poi_rec.identity_args <> v_expected_idempotent_identity THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order_idempotent identity arguments [%] do not match expected [%]', v_poi_rec.identity_args, v_expected_idempotent_identity;
  END IF;

  IF NOT v_poi_rec.prosecdef THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order_idempotent is not SECURITY DEFINER';
  END IF;

  IF v_poi_rec.owner_name <> 'postgres' THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order_idempotent owner [%] is not postgres', v_poi_rec.owner_name;
  END IF;

  IF v_poi_rec.proconfig IS NOT NULL AND NOT (array_to_string(v_poi_rec.proconfig, ',') ~* 'search_path=public,\s*pg_temp') THEN
    RAISE EXCEPTION 'Stage B Gate: public.place_order_idempotent search_path [%] is not pinned to public, pg_temp', v_poi_rec.proconfig;
  END IF;

  -- 5. ACL assertions
  IF NOT has_function_privilege('service_role', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Stage B Gate: service_role lacks EXECUTE on public.place_order';
  END IF;
  IF has_function_privilege('anon', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_po_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_po_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Stage B Gate: Non-service-role role has EXECUTE on public.place_order';
  END IF;

  IF NOT has_function_privilege('service_role', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Stage B Gate: service_role lacks EXECUTE on public.place_order_idempotent';
  END IF;
  IF has_function_privilege('anon', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('authenticated', v_poi_rec.oid, 'EXECUTE') OR has_function_privilege('public', v_poi_rec.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'Stage B Gate: Non-service-role role has EXECUTE on public.place_order_idempotent';
  END IF;
END;
$stage_b_place_order_gate$;

-- ── Stage B Migration B: Legacy Destructive Cleanup Gate ──────────────────────
DO $stage_b_migration_b_gate$
DECLARE
  v_legacy_fn_count INT;
  v_legacy_tbl_count INT;
  v_legacy_col_count INT;
  v_user_id_nullable TEXT;
  v_auth_guard_count INT;
BEGIN
  -- 1. Assert zero Migration-B-target legacy functions exist (17 removed functions)
  SELECT count(*) INTO v_legacy_fn_count
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'finalize_barber_handoff',
      'finalize_customer_handoff',
      'logout_all_federated_sessions',
      'logout_federated_session',
      'place_b2b_cart_order_idempotent',
      'provision_dilmart_federated_customer',
      'redeem_and_create_federated_session',
      'redeem_barber_handoff_and_create_session',
      'redeem_customer_handoff',
      'reject_barber_handoff_audit_mutation',
      'reject_handoff_audit_mutation',
      'reject_federated_session_audit_mutation',
      'resolve_dilmart_federated_customer',
      'revoke_barber_web_sessions_for_user',
      'revoke_federated_sessions_for_identity',
      'rotate_federated_refresh_token',
      'validate_federated_session_family',
      'verify_barber_web_session'
    );

  IF v_legacy_fn_count <> 0 THEN
    RAISE EXCEPTION 'Stage B Migration B Gate: % legacy functions still exist', v_legacy_fn_count;
  END IF;

  -- 2. Assert zero legacy tables exist (all 11 target tables removed)
  SELECT count(*) INTO v_legacy_tbl_count
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

  IF v_legacy_tbl_count <> 0 THEN
    RAISE EXCEPTION 'Stage B Migration B Gate: % legacy tables still exist', v_legacy_tbl_count;
  END IF;

  -- 3. Assert zero Migration-B-target legacy columns exist (7 active-table columns)
  SELECT count(*) INTO v_legacy_col_count
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND (
      (table_name = 'products' AND column_name = 'requires_verified_salon')
      OR (table_name = 'orders' AND column_name IN ('dilmart_barbershop_id', 'dilmart_user_id', 'store_cart_id', 'store_linked_profile_id'))
      OR (table_name = 'checkout_attempts' AND column_name IN ('store_cart_id', 'store_linked_profile_id'))
    );

  IF v_legacy_col_count <> 0 THEN
    RAISE EXCEPTION 'Stage B Migration B Gate: % legacy columns still exist', v_legacy_col_count;
  END IF;

  -- 4. Assert checkout_attempts.user_id is NOT NULL
  SELECT is_nullable INTO v_user_id_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'checkout_attempts'
    AND column_name = 'user_id';

  IF v_user_id_nullable <> 'NO' THEN
    RAISE EXCEPTION 'Stage B Migration B Gate: checkout_attempts.user_id must be NOT NULL (found is_nullable=%)', v_user_id_nullable;
  END IF;

  -- 5. Assert reject_reserved_federated_email auth guard remains intact (deferred to Migration F)
  SELECT count(*) INTO v_auth_guard_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'reject_reserved_federated_email';

  IF v_auth_guard_count <> 1 THEN
    RAISE EXCEPTION 'Stage B Migration B Gate: public.reject_reserved_federated_email must be preserved for separate Migration F (found %)', v_auth_guard_count;
  END IF;
END;
$stage_b_migration_b_gate$;
