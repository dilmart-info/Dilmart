-- Add offer/badge columns to products
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS is_best_seller BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS offer_ends_at TIMESTAMPTZ;

-- Update RLS if needed (usually public read is already there, but let's be safe)
-- The existing policies should cover these new columns automatically since they use select *
