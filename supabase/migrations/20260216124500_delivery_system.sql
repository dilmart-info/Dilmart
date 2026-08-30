-- Create delivery_companies table
CREATE TABLE IF NOT EXISTS public.delivery_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.delivery_companies ENABLE ROW LEVEL SECURITY;

-- Create delivery_prices table to store custom pricing per governorate per company
CREATE TABLE IF NOT EXISTS public.delivery_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES public.delivery_companies(id) ON DELETE CASCADE,
  governorate_id UUID REFERENCES public.governorates(id) ON DELETE CASCADE,
  price NUMERIC NOT NULL DEFAULT 5000,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, governorate_id)
);

-- Enable RLS
ALTER TABLE public.delivery_prices ENABLE ROW LEVEL SECURITY;

-- Add delivery_company_id to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_company_id UUID REFERENCES public.delivery_companies(id);

-- Policies
CREATE POLICY "Admins have full access to delivery_companies" 
ON public.delivery_companies 
FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins have full access to delivery_prices" 
ON public.delivery_prices 
FOR ALL 
TO authenticated 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Public read access for active companies (if needed for frontend selection later)
CREATE POLICY "Public can read active delivery_companies" 
ON public.delivery_companies 
FOR SELECT 
USING (is_active = true);
