-- M28: Orders source tracking for B2B analytics and DilMart integration
-- Adds DilMart-side references to orders so we can track which orders came from
-- Barber App, which barbershop placed them, and which segment the buyer belongs to.
--
-- These fields are optional (nullable) — existing order flow is fully unaffected.
-- They are populated at checkout time when a DilMart session is present.
--
-- Reference: DilMart_Store_Integration_Docs/06_DATA_MODEL_AND_MIGRATIONS.md

ALTER TABLE public.orders
  -- Source tracking
  ADD COLUMN IF NOT EXISTS source_app              TEXT NULL,
  -- Values: barber_app | customer_app | store_web | admin

  ADD COLUMN IF NOT EXISTS segment                 TEXT NULL,
  -- Values: DilMart_APP_BARBER_OWNER | DilMart_APP_BARBER_STAFF | RETAIL_CUSTOMER | etc.

  ADD COLUMN IF NOT EXISTS business_type           TEXT NULL,
  -- Values: men_barbershop | women_salon | nail_studio | beauty_center | spa

  -- DilMart identity references (for B2B reporting — data stays in Store DB)
  ADD COLUMN IF NOT EXISTS DilMart_user_id          UUID NULL,
  ADD COLUMN IF NOT EXISTS DilMart_barbershop_id    UUID NULL,

  -- Link to the Store-side linked profile
  ADD COLUMN IF NOT EXISTS store_linked_profile_id UUID NULL
    REFERENCES public.store_linked_profiles(id) ON DELETE SET NULL;

-- Indexes for B2B analytics queries

CREATE INDEX IF NOT EXISTS idx_orders_source_app
  ON public.orders(source_app)
  WHERE source_app IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_segment
  ON public.orders(segment)
  WHERE segment IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_DilMart_user_id
  ON public.orders(DilMart_user_id)
  WHERE DilMart_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_DilMart_barbershop_id
  ON public.orders(DilMart_barbershop_id)
  WHERE DilMart_barbershop_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_store_linked_profile_id
  ON public.orders(store_linked_profile_id)
  WHERE store_linked_profile_id IS NOT NULL;

-- Column comments

COMMENT ON COLUMN public.orders.source_app IS
  'Origin app that placed this order: barber_app | customer_app | store_web | admin.';

COMMENT ON COLUMN public.orders.segment IS
  'Buyer segment at order time: DilMart_APP_BARBER_OWNER | RETAIL_CUSTOMER | etc.';

COMMENT ON COLUMN public.orders.DilMart_user_id IS
  'DilMart Main user ID for orders placed through Barber App. NULL for public Store orders.';

COMMENT ON COLUMN public.orders.DilMart_barbershop_id IS
  'The barbershop associated with the buyer. Used for B2B analytics.';

COMMENT ON COLUMN public.orders.store_linked_profile_id IS
  'FK to store_linked_profiles for orders from integrated DilMart users.';
