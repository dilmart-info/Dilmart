-- M26: Product segmentation metadata for DilMart B2B Barber App integration
-- Phase 1 of the native B2B store integration foundation.
--
-- Adds audience/segment/surface visibility fields to products table.
-- Backward-compatible: all defaults preserve current public web-store behavior.
-- Existing products will be visible on web_store and NOT exposed to barber_app
-- unless explicitly configured by an admin/merchant.
--
-- Reference: DilMart_Store_Integration_Docs/06_DATA_MODEL_AND_MIGRATIONS.md

-- 1) Core segmentation fields

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS target_audience    TEXT[]  NOT NULL DEFAULT ARRAY['all']::TEXT[],
  ADD COLUMN IF NOT EXISTS business_type_tags TEXT[]  NOT NULL DEFAULT ARRAY['all']::TEXT[],
  -- product_use_cases: TEXT[] to support multi-use products (e.g. furniture + salon_equipment)
  ADD COLUMN IF NOT EXISTS product_use_cases  TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS visible_in         TEXT[]  NOT NULL DEFAULT ARRAY['web_store']::TEXT[],
  ADD COLUMN IF NOT EXISTS purchase_mode      TEXT[]  NOT NULL DEFAULT ARRAY['retail']::TEXT[],
  ADD COLUMN IF NOT EXISTS is_b2b_offer       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requires_verified_salon BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_order_qty      INT     NULL,
  ADD COLUMN IF NOT EXISTS max_order_qty      INT     NULL;

-- 2) GIN indexes for efficient array-overlap queries
--    These power the ?| (overlap) and @> (contains) operators used by segmentation filters.

CREATE INDEX IF NOT EXISTS idx_products_target_audience_gin
  ON public.products USING GIN (target_audience);

CREATE INDEX IF NOT EXISTS idx_products_business_type_tags_gin
  ON public.products USING GIN (business_type_tags);

CREATE INDEX IF NOT EXISTS idx_products_product_use_cases_gin
  ON public.products USING GIN (product_use_cases);

CREATE INDEX IF NOT EXISTS idx_products_visible_in_gin
  ON public.products USING GIN (visible_in);

CREATE INDEX IF NOT EXISTS idx_products_purchase_mode_gin
  ON public.products USING GIN (purchase_mode);

-- 3) Column comments for documentation

COMMENT ON COLUMN public.products.target_audience IS
  'Who can see this product: customer | barber_staff | salon_owner | professional_buyer | all. Defaults to all (visible to everyone).';

COMMENT ON COLUMN public.products.business_type_tags IS
  'Business types this product targets: men_barbershop | women_salon | nail_studio | beauty_center | spa | all.';

COMMENT ON COLUMN public.products.product_use_cases IS
  'Product use cases (multi-value): personal_tool | barber_tool | salon_equipment | consumable | furniture | professional_cosmetic | setup_package | wholesale | nail_tool | beauty_equipment | hair_care | beard_care | sterilization.';

COMMENT ON COLUMN public.products.visible_in IS
  'Surfaces where this product appears: web_store | barber_app | customer_app | all. Defaults to web_store only. Products are NOT exposed to barber_app unless explicitly configured.';

COMMENT ON COLUMN public.products.purchase_mode IS
  'How this product can be purchased: retail | b2b | wholesale | quote_request.';

COMMENT ON COLUMN public.products.is_b2b_offer IS
  'True if this product is a B2B-specific offer (special pricing, bulk, etc.).';

COMMENT ON COLUMN public.products.requires_verified_salon IS
  'True if this product requires the buyer to be a verified DilMart salon before purchase.';

COMMENT ON COLUMN public.products.min_order_qty IS
  'Minimum order quantity for B2B/wholesale products. NULL means no minimum.';

COMMENT ON COLUMN public.products.max_order_qty IS
  'Maximum order quantity. NULL means no limit.';
