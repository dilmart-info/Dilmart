-- Create loyalty settings table to control point generation and redemption
CREATE TABLE IF NOT EXISTS public.loyalty_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    points_per_dinar NUMERIC DEFAULT 1, -- How many points earned per 1000 IQD (scaled for readability)
    dinar_per_point NUMERIC DEFAULT 0.05, -- Monetary value of 1 point in dinars
    min_spend_to_redeem NUMERIC DEFAULT 10000, -- Minimum order total to allow redeeming points
    points_expiry_days INTEGER DEFAULT 365,
    is_active BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings
INSERT INTO public.loyalty_settings (points_per_dinar, dinar_per_point, min_spend_to_redeem, points_expiry_days)
SELECT 1, 0.05, 10000, 365
WHERE NOT EXISTS (SELECT 1 FROM public.loyalty_settings);

-- Add points_rule to products to allow custom point calculations per product if needed
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS points_multiplier NUMERIC DEFAULT 1.0;

-- Enable RLS
ALTER TABLE public.loyalty_settings ENABLE ROW LEVEL SECURITY;

-- Allow admins full access
CREATE POLICY "Admins can do everything on loyalty_settings" ON public.loyalty_settings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Allow public read of settings
CREATE POLICY "Public can read loyalty_settings" ON public.loyalty_settings
    FOR SELECT TO public USING (true);
