-- DilMart-STORE-MERCHANT-SETTINGS-ATOMICITY-001
-- Atomic merchant settings + logo upsert as one service-role-only RPC.
--
-- WHY
-- `MerchantsService.upsertMerchantSettings()` performed the write as two independent statements:
--
--   1. merchant_settings.upsert(...)                 -- commits on its own
--   2. merchants.update({ logo_url })                -- separate statement, may fail
--
-- Step 1 commits before step 2 runs, so a failure in step 2 returned an HTTP error to a caller
-- whose settings had already been persisted — a torn write in which the saved settings and the
-- stored logo disagree, and the client believes nothing was saved. Both writes now happen inside
-- this function, i.e. inside ONE PostgreSQL transaction: either both land or neither does.
--
-- SPARSE PATCH SEMANTICS (unchanged contract)
-- `POST /merchants/settings` is patch-like despite being a POST: callers send only the fields they
-- are changing (`MerchantNewOrderAlertBanner` sends `{ sound_enabled }`, the push panel sends
-- `{ push_enabled, sound_enabled }`). Only keys PRESENT in `p_patch` are written; absent keys keep
-- their stored value. Presence, not truthiness, decides: `contact_phone: ""` is a real update that
-- clears the field, exactly as before.
--
-- FIRST CREATION
-- The settings row is created by an INSERT that names ONLY `merchant_id` (plus `updated_at`), so
-- every omitted NOT NULL column keeps its database default — `order_auto_accept` false,
-- `push_enabled` true, `sound_enabled` true, `sound_repeat_interval_seconds` 15,
-- `sound_max_duration_seconds` 300, `default_low_stock_threshold` 5. Defaults are never replaced
-- by NULL. The subsequent UPDATE then applies only the keys the caller actually sent.
--
-- LOGO SEMANTICS (preserved exactly)
-- The previous code touched `merchants.logo_url` only when `typeof logo_url === "string"`. That
-- decision stays in the backend: it includes `logo_url` in `p_patch` only for a real string, so
--   * omitted / undefined  -> key absent -> logo unchanged
--   * null                 -> key absent -> logo unchanged (null is NOT reinterpreted as "clear")
--   * ""                   -> key present -> logo set to the empty string (the existing clear path)
--   * "https://..."        -> key present -> logo replaced
-- Inside this function `logo_url`, when present, must be a JSON string; anything else fails closed.
--
-- KEY VALIDATION
-- Unknown keys are rejected rather than ignored, so a typo or an injected field can never mutate an
-- unintended column. Nullable text columns accept JSON null (an explicit clear); the NOT NULL
-- boolean and integer columns reject null and reject any other JSON type, so DTO validation cannot
-- be bypassed by string-to-boolean coercion.
--
-- AUTHORIZATION
-- SECURITY DEFINER bypasses RLS, so this function is service_role only and takes the merchant id as
-- a parameter. The backend resolves merchant scope (`scopeResolver.resolveMerchantScope`) BEFORE
-- calling it and passes the RESOLVED id — never a merchant id supplied by the browser. This
-- function performs no authorization of its own and must never be exposed to browser roles.
--
-- RETURN
-- The canonical post-write snapshot read inside the same transaction: the whole merchant_settings
-- row plus `logo_url` from merchants — the exact shape `getMerchantSettings()` returns for a
-- merchant that has settings. Write and result are therefore one consistent snapshot.
--
-- ROLLBACK: supabase/migrations/rollback/20260820150000_merchant_settings_atomic_upsert.ROLLBACK.sql
-- Roll the backend back to the split-write implementation BEFORE dropping this function.

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_merchant_settings_atomic(
  p_merchant_id uuid,
  p_patch jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- Every key the request contract may carry. Anything else is refused.
  c_text_keys    CONSTANT text[] := ARRAY['contact_phone', 'whatsapp_phone', 'support_email', 'city', 'address', 'delivery_notes'];
  c_bool_keys    CONSTANT text[] := ARRAY['push_enabled', 'sound_enabled'];
  c_int_keys     CONSTANT text[] := ARRAY['sound_repeat_interval_seconds', 'sound_max_duration_seconds'];
  v_key          text;
  v_type         text;
  v_merchant_id  uuid;
  v_now          timestamptz;
  v_settings     jsonb;
  v_logo         text;
BEGIN
  IF p_merchant_id IS NULL THEN
    RAISE EXCEPTION 'MERCHANT_ID_REQUIRED' USING ERRCODE = '22023';
  END IF;

  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'PATCH_MUST_BE_OBJECT: received %', COALESCE(jsonb_typeof(p_patch), 'null')
      USING ERRCODE = '22023';
  END IF;

  -- Fail closed on anything outside the known contract, and on values of the wrong JSON type.
  FOR v_key IN SELECT jsonb_object_keys(p_patch)
  LOOP
    v_type := jsonb_typeof(p_patch -> v_key);

    IF v_key = ANY(c_text_keys) OR v_key = 'logo_url' THEN
      -- Nullable text columns may be cleared with JSON null. `logo_url` is only ever sent as a
      -- string by the backend (null means "leave the logo alone", so the key is simply absent).
      IF v_key = 'logo_url' THEN
        IF v_type <> 'string' THEN
          RAISE EXCEPTION 'INVALID_SETTINGS_VALUE: logo_url must be a string, received %', v_type
            USING ERRCODE = '22023';
        END IF;
      ELSIF v_type NOT IN ('string', 'null') THEN
        RAISE EXCEPTION 'INVALID_SETTINGS_VALUE: % must be a string or null, received %', v_key, v_type
          USING ERRCODE = '22023';
      END IF;

    ELSIF v_key = ANY(c_bool_keys) THEN
      IF v_type <> 'boolean' THEN
        RAISE EXCEPTION 'INVALID_SETTINGS_VALUE: % must be a boolean, received %', v_key, v_type
          USING ERRCODE = '22023';
      END IF;

    ELSIF v_key = ANY(c_int_keys) THEN
      IF v_type <> 'number' THEN
        RAISE EXCEPTION 'INVALID_SETTINGS_VALUE: % must be a number, received %', v_key, v_type
          USING ERRCODE = '22023';
      END IF;
      IF (p_patch ->> v_key)::numeric <> trunc((p_patch ->> v_key)::numeric) THEN
        RAISE EXCEPTION 'INVALID_SETTINGS_VALUE: % must be an integer, received %', v_key, p_patch ->> v_key
          USING ERRCODE = '22023';
      END IF;

    ELSE
      RAISE EXCEPTION 'UNSUPPORTED_SETTINGS_FIELD: %', v_key USING ERRCODE = '22023';
    END IF;
  END LOOP;

  -- Lock the merchant for the duration of the transaction: the settings write and the logo write
  -- below cannot interleave with a concurrent settings write for the same merchant.
  SELECT m.id INTO v_merchant_id
    FROM public.merchants m
   WHERE m.id = p_merchant_id
     FOR UPDATE;

  IF v_merchant_id IS NULL THEN
    RAISE EXCEPTION 'MERCHANT_NOT_FOUND: %', p_merchant_id USING ERRCODE = 'P0002';
  END IF;

  -- Stamped AFTER the lock is granted, not at function entry: a call that waited on the lock would
  -- otherwise commit an updated_at older than the call it queued behind. clock_timestamp() rather
  -- than now(), because now() is the TRANSACTION timestamp — the previous implementation stamped
  -- the request wall clock (new Date().toISOString()), and this keeps that behaviour.
  v_now := clock_timestamp();

  -- Ensure the settings row exists WITHOUT naming any defaulted column, so a first creation keeps
  -- every database default. On an existing row this only advances updated_at.
  INSERT INTO public.merchant_settings (merchant_id, updated_at)
  VALUES (p_merchant_id, v_now)
  ON CONFLICT (merchant_id) DO UPDATE SET updated_at = EXCLUDED.updated_at;

  -- Apply ONLY the keys present in the patch; every other column keeps its stored value.
  UPDATE public.merchant_settings s
     SET contact_phone  = CASE WHEN p_patch ? 'contact_phone'  THEN p_patch ->> 'contact_phone'  ELSE s.contact_phone  END,
         whatsapp_phone = CASE WHEN p_patch ? 'whatsapp_phone' THEN p_patch ->> 'whatsapp_phone' ELSE s.whatsapp_phone END,
         support_email  = CASE WHEN p_patch ? 'support_email'  THEN p_patch ->> 'support_email'  ELSE s.support_email  END,
         city           = CASE WHEN p_patch ? 'city'           THEN p_patch ->> 'city'           ELSE s.city           END,
         address        = CASE WHEN p_patch ? 'address'        THEN p_patch ->> 'address'        ELSE s.address        END,
         delivery_notes = CASE WHEN p_patch ? 'delivery_notes' THEN p_patch ->> 'delivery_notes' ELSE s.delivery_notes END,
         push_enabled   = CASE WHEN p_patch ? 'push_enabled'   THEN (p_patch ->> 'push_enabled')::boolean  ELSE s.push_enabled  END,
         sound_enabled  = CASE WHEN p_patch ? 'sound_enabled'  THEN (p_patch ->> 'sound_enabled')::boolean ELSE s.sound_enabled END,
         sound_repeat_interval_seconds = CASE WHEN p_patch ? 'sound_repeat_interval_seconds'
                                              THEN (p_patch ->> 'sound_repeat_interval_seconds')::int
                                              ELSE s.sound_repeat_interval_seconds END,
         sound_max_duration_seconds    = CASE WHEN p_patch ? 'sound_max_duration_seconds'
                                              THEN (p_patch ->> 'sound_max_duration_seconds')::int
                                              ELSE s.sound_max_duration_seconds END,
         updated_at = v_now
   WHERE s.merchant_id = p_merchant_id;

  -- Same transaction as the settings write: if this fails, the settings write never commits.
  IF p_patch ? 'logo_url' THEN
    UPDATE public.merchants m
       SET logo_url = p_patch ->> 'logo_url'
     WHERE m.id = p_merchant_id;
  END IF;

  -- Canonical post-write snapshot, read inside this transaction.
  SELECT to_jsonb(s) INTO v_settings
    FROM public.merchant_settings s
   WHERE s.merchant_id = p_merchant_id;

  IF v_settings IS NULL THEN
    RAISE EXCEPTION 'SETTINGS_SNAPSHOT_MISSING: %', p_merchant_id USING ERRCODE = 'P0002';
  END IF;

  SELECT m.logo_url INTO v_logo
    FROM public.merchants m
   WHERE m.id = p_merchant_id;

  RETURN v_settings || jsonb_build_object('logo_url', to_jsonb(v_logo));
END
$fn$;

COMMENT ON FUNCTION public.upsert_merchant_settings_atomic(uuid, jsonb) IS
  'Atomic merchant settings + logo upsert (admin/merchant backend only, service_role). Applies only the keys present in p_patch, preserves database defaults on first creation, updates merchants.logo_url in the same transaction, and returns the post-write settings snapshot including logo_url. Authorization is performed by the backend scope resolver before this function is called.';

REVOKE EXECUTE ON FUNCTION public.upsert_merchant_settings_atomic(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_merchant_settings_atomic(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.upsert_merchant_settings_atomic(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_merchant_settings_atomic(uuid, jsonb) TO service_role;

COMMIT;
