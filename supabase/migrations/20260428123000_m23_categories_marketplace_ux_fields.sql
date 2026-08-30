ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS icon_url text NULL,
ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS layout_variant text NOT NULL DEFAULT 'normal',
ADD COLUMN IF NOT EXISTS background_color text NULL,
ADD COLUMN IF NOT EXISTS text_color text NULL;

UPDATE public.categories
SET layout_variant = 'normal'
WHERE layout_variant IS NULL
   OR layout_variant NOT IN ('normal', 'wide', 'promo');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'categories_layout_variant_check'
  ) THEN
    ALTER TABLE public.categories
      ADD CONSTRAINT categories_layout_variant_check
      CHECK (layout_variant IN ('normal', 'wide', 'promo'));
  END IF;
END $$;
