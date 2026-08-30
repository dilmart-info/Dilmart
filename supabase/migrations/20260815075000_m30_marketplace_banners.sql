-- ==============================================================================
-- Migration: 20260815075000_m30_marketplace_banners.sql
-- Description: M30 Marketplace Promotional Banners (Hero & Campaign) Schema
-- Author: Cylendra Core Team (H5-A Hardened)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_type TEXT NOT NULL CHECK (banner_type IN ('hero_banner', 'campaign_banner')),
  title TEXT NULL CHECK (title IS NULL OR (char_length(trim(title)) > 0 AND char_length(title) <= 200)),
  subtitle TEXT NULL CHECK (subtitle IS NULL OR (char_length(trim(subtitle)) > 0 AND char_length(subtitle) <= 500)),
  image_url TEXT NOT NULL CHECK (char_length(image_url) <= 2000 AND image_url ~* '^https://'),
  mobile_image_url TEXT NULL CHECK (mobile_image_url IS NULL OR (char_length(mobile_image_url) <= 2000 AND mobile_image_url ~* '^https://')),
  action_type TEXT NOT NULL DEFAULT 'none' CHECK (action_type IN ('none', 'category', 'search', 'external_url')),
  action_category_id UUID NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  action_search_query TEXT NULL CHECK (action_search_query IS NULL OR (char_length(trim(action_search_query)) > 0 AND char_length(action_search_query) <= 200)),
  action_external_url TEXT NULL CHECK (action_external_url IS NULL OR (char_length(trim(action_external_url)) > 0 AND char_length(action_external_url) <= 500 AND action_external_url ~* '^https://')),
  visible_in TEXT[] NOT NULL DEFAULT ARRAY['barber_app']::TEXT[] CHECK (cardinality(visible_in) > 0 AND visible_in <@ ARRAY['web_store', 'barber_app', 'customer_app', 'all']::TEXT[]),
  target_audience TEXT[] NOT NULL DEFAULT ARRAY['all']::TEXT[] CHECK (cardinality(target_audience) > 0),
  business_type_tags TEXT[] NOT NULL DEFAULT ARRAY['all']::TEXT[] CHECK (cardinality(business_type_tags) > 0),
  requires_verified_salon BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ NULL,
  ends_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_banner_action_integrity CHECK (
    (action_type = 'none' AND action_category_id IS NULL AND action_search_query IS NULL AND action_external_url IS NULL) OR
    (action_type = 'category' AND action_category_id IS NOT NULL AND action_search_query IS NULL AND action_external_url IS NULL) OR
    (action_type = 'search' AND action_category_id IS NULL AND action_search_query IS NOT NULL AND action_external_url IS NULL) OR
    (action_type = 'external_url' AND action_category_id IS NULL AND action_search_query IS NULL AND action_external_url IS NOT NULL)
  ),

  CONSTRAINT chk_banner_schedule CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at
  )
);

-- Indexes for efficient querying and segmentation filtering
CREATE INDEX IF NOT EXISTS idx_marketplace_banners_active_sort
  ON public.marketplace_banners (sort_order, created_at, id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_marketplace_banners_visible_in
  ON public.marketplace_banners USING GIN (visible_in);

CREATE INDEX IF NOT EXISTS idx_marketplace_banners_audience
  ON public.marketplace_banners USING GIN (target_audience);

CREATE INDEX IF NOT EXISTS idx_marketplace_banners_business_type
  ON public.marketplace_banners USING GIN (business_type_tags);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_marketplace_banners_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_banners_set_updated_at ON public.marketplace_banners;
CREATE TRIGGER trg_marketplace_banners_set_updated_at
  BEFORE UPDATE ON public.marketplace_banners
  FOR EACH ROW
  EXECUTE FUNCTION public.set_marketplace_banners_updated_at();

-- RLS: Fail closed for direct anon/auth client access.
-- All client access is mediated by the NestJS backend via Supabase service_role.
ALTER TABLE public.marketplace_banners ENABLE ROW LEVEL SECURITY;
