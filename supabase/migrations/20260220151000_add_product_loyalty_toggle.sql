-- Add loyalty_points_enabled to products table
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS loyalty_points_enabled BOOLEAN DEFAULT TRUE;

-- Update existing products to have loyalty points enabled by default
UPDATE public.products SET loyalty_points_enabled = TRUE WHERE loyalty_points_enabled IS NULL;
