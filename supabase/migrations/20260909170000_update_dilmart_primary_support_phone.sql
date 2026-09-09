-- Migration: 20260909170000_update_dilmart_primary_support_phone.sql
-- Description: Forward-only migration to update official support contact numbers strictly for the DilMart primary store
-- Authority: Product owner directive for DilMart customer care contact line (+9647759600068 / 07759600068)
-- Invariants:
--   - Does NOT modify any user or customer profiles
--   - Scoped strictly to DilMart primary merchant candidate ('dilmart-store' in production, 'DilMart-primary' in historical fixtures)
--   - Asserts count(*) = 1 to fail-closed against ambiguous or missing records
--   - Asserts that exactly 1 merchant_settings row is updated via GET DIAGNOSTICS ROW_COUNT

DO $$
DECLARE
  v_merchant_count INT := 0;
  v_dilmart_merchant_id UUID;
  v_updated_count INT := 0;
BEGIN
  -- 1. Assert exactly one candidate merchant exists across production and fixtures
  SELECT count(*)
  INTO v_merchant_count
  FROM public.merchants
  WHERE slug IN ('dilmart-store', 'DilMart-primary');

  IF v_merchant_count <> 1 THEN
    RAISE EXCEPTION
      'MIGRATION_INTEGRITY_FAILED: Expected exactly one DilMart merchant candidate, found %',
      v_merchant_count;
  END IF;

  -- 2. Retrieve the unambiguous merchant ID
  SELECT id
  INTO v_dilmart_merchant_id
  FROM public.merchants
  WHERE slug IN ('dilmart-store', 'DilMart-primary');

  -- 3. Strictly update only this merchant's settings and verify row count
  UPDATE public.merchant_settings
  SET
    contact_phone = '+9647759600068',
    whatsapp_phone = '9647759600068',
    updated_at = timezone('utc'::text, now())
  WHERE merchant_id = v_dilmart_merchant_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_INTEGRITY_FAILED: Expected exactly 1 merchant_settings row updated for DilMart primary, but updated % rows', v_updated_count;
  END IF;
END $$;
