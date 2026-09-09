-- Migration: 20260909170000_update_dilmart_primary_support_phone.sql
-- Description: Forward-only migration to update official support contact numbers strictly for the DilMart primary store
-- Authority: Product owner directive for DilMart customer care contact line (+9647759600068 / 07759600068)
-- Invariants:
--   - Does NOT modify any user or customer profiles
--   - Scoped strictly to the specific merchant slug 'DilMart-primary'
--   - Zero effect if DilMart-primary does not exist

DO $$
DECLARE
  v_dilmart_merchant_id UUID;
BEGIN
  -- 1. Locate the specific DilMart-primary merchant record
  SELECT id INTO v_dilmart_merchant_id
  FROM public.merchants
  WHERE slug = 'DilMart-primary';

  -- 2. Strictly update only this merchant's settings if found
  IF v_dilmart_merchant_id IS NOT NULL THEN
    UPDATE public.merchant_settings
    SET
      contact_phone = '+9647759600068',
      whatsapp_phone = '9647759600068',
      updated_at = timezone('utc'::text, now())
    WHERE merchant_id = v_dilmart_merchant_id;
  END IF;
END $$;
