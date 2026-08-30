-- M25: product brand + attributes for stronger marketplace filters

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS sizes TEXT[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS dimensions TEXT,
  ADD COLUMN IF NOT EXISTS weight_grams NUMERIC;

UPDATE public.products
SET
  colors = COALESCE(colors, '{}'::text[]),
  sizes = COALESCE(sizes, '{}'::text[])
WHERE colors IS NULL OR sizes IS NULL;

ALTER TABLE public.products
  ALTER COLUMN colors SET DEFAULT '{}'::text[],
  ALTER COLUMN sizes SET DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_products_brand ON public.products (brand);
CREATE INDEX IF NOT EXISTS idx_products_colors_gin ON public.products USING GIN (colors);
CREATE INDEX IF NOT EXISTS idx_products_sizes_gin ON public.products USING GIN (sizes);
CREATE INDEX IF NOT EXISTS idx_products_weight_grams ON public.products (weight_grams);
