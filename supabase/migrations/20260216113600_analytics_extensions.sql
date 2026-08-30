-- Add purchase_price to products for profit calculation
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS purchase_price NUMERIC DEFAULT 0;

-- Create a view for easier analytics querying (optional, but good for performance if logic gets complex)
-- For now, we'll use direct queries in the UI for flexibility.
