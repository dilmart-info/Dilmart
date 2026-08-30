-- M27: store_linked_profiles — links DilMart Main users to Store domain
-- This table bridges the identity gap between DilMart Main auth and the Store.
-- Created when a Barber App user exchanges a DilMart session token for a Store session.
--
-- Reference: DilMart_Store_Integration_Docs/02_ARCHITECTURE_AND_AUTH.md
--            DilMart_Store_Integration_Docs/06_DATA_MODEL_AND_MIGRATIONS.md

CREATE TABLE IF NOT EXISTS public.store_linked_profiles (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- DilMart Main identity (nullable for public Store users)
  DilMart_user_id        UUID        NULL,
  DilMart_role           TEXT        NULL,  -- OWNER | BARBER | STAFF | CUSTOMER | ADMIN
  DilMart_barbershop_id  UUID        NULL,

  -- Store identity (linked to existing Store customer profile if exists)
  store_customer_id     UUID        NULL REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- Segmentation context (computed at session exchange time)
  segment               TEXT        NOT NULL,
  -- Allowed segment values:
  -- DilMart_APP_BARBER_OWNER | DilMart_APP_BARBER_STAFF | VERIFIED_SALON_OWNER
  -- PROFESSIONAL_BARBER_UNVERIFIED | SALON_OWNER_LEAD | RETAIL_CUSTOMER | DilMart_APP_CUSTOMER

  -- Profile display data (synced from DilMart Main at exchange time)
  display_name          TEXT        NULL,
  phone                 TEXT        NULL,
  city                  TEXT        NULL,
  business_type         TEXT        NULL,  -- men_barbershop | women_salon | nail_studio | etc.

  -- Source tracking
  source_app            TEXT        NOT NULL DEFAULT 'store_web',
  -- Allowed: barber_app | customer_app | store_web | admin

  -- Sync timestamps
  last_synced_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Indexes

-- Unique: one linked profile per DilMart user
-- NOTE: Using a UNIQUE CONSTRAINT (not a partial index) because Supabase PostgREST
-- upsert (onConflict) does not support partial unique indexes.
ALTER TABLE public.store_linked_profiles
  ADD CONSTRAINT uq_store_linked_profiles_DilMart_user_id UNIQUE (DilMart_user_id);

-- Lookup by barbershop (for B2B reports)
CREATE INDEX IF NOT EXISTS idx_store_linked_profiles_barbershop_id
  ON public.store_linked_profiles(DilMart_barbershop_id)
  WHERE DilMart_barbershop_id IS NOT NULL;

-- Lookup by segment (for analytics)
CREATE INDEX IF NOT EXISTS idx_store_linked_profiles_segment
  ON public.store_linked_profiles(segment);

-- Lookup by source_app
CREATE INDEX IF NOT EXISTS idx_store_linked_profiles_source_app
  ON public.store_linked_profiles(source_app);

-- Lookup by Store customer (reverse link)
CREATE INDEX IF NOT EXISTS idx_store_linked_profiles_store_customer_id
  ON public.store_linked_profiles(store_customer_id)
  WHERE store_customer_id IS NOT NULL;

-- 3) Enable RLS — only service_role (NestJS backend) reads/writes this table
ALTER TABLE public.store_linked_profiles ENABLE ROW LEVEL SECURITY;

-- No public RLS policies: access is controlled entirely by service_role key in the backend.
-- Frontend/mobile clients never access this table directly.

-- 4) Column comments

COMMENT ON TABLE public.store_linked_profiles IS
  'Links DilMart Main App users to their Store identity. Created/updated on DilMart session exchange. Service-role access only.';

COMMENT ON COLUMN public.store_linked_profiles.DilMart_user_id IS
  'UUID from DilMart Main auth. NULL for public Store users.';

COMMENT ON COLUMN public.store_linked_profiles.DilMart_role IS
  'DilMart app role at time of exchange: OWNER | BARBER | STAFF | CUSTOMER | ADMIN.';

COMMENT ON COLUMN public.store_linked_profiles.segment IS
  'Computed segment: DilMart_APP_BARBER_OWNER | DilMart_APP_BARBER_STAFF | VERIFIED_SALON_OWNER | PROFESSIONAL_BARBER_UNVERIFIED | SALON_OWNER_LEAD | RETAIL_CUSTOMER | DilMart_APP_CUSTOMER.';

COMMENT ON COLUMN public.store_linked_profiles.source_app IS
  'Origin app: barber_app | customer_app | store_web | admin.';

COMMENT ON COLUMN public.store_linked_profiles.last_synced_at IS
  'Last time this profile was refreshed from a session exchange.';
