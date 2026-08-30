-- M16: Customer profile + address book

CREATE TABLE IF NOT EXISTS public.customer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_profiles_user_id ON public.customer_profiles(user_id);

CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  governorate_id UUID REFERENCES public.governorates(id) ON DELETE SET NULL,
  area TEXT NOT NULL,
  nearest_landmark TEXT,
  map_url TEXT,
  delivery_notes TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON public.customer_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_default ON public.customer_addresses(user_id, is_default);

CREATE UNIQUE INDEX IF NOT EXISTS one_default_address_per_user
ON public.customer_addresses(user_id)
WHERE is_default = true;

CREATE OR REPLACE FUNCTION public.set_customer_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_customer_profiles_set_updated_at ON public.customer_profiles;
CREATE TRIGGER trg_customer_profiles_set_updated_at
BEFORE UPDATE ON public.customer_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_profiles_updated_at();

CREATE OR REPLACE FUNCTION public.set_customer_addresses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_customer_addresses_set_updated_at ON public.customer_addresses;
CREATE TRIGGER trg_customer_addresses_set_updated_at
BEFORE UPDATE ON public.customer_addresses
FOR EACH ROW
EXECUTE FUNCTION public.set_customer_addresses_updated_at();

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own customer profile" ON public.customer_profiles;
CREATE POLICY "Users can manage own customer profile"
ON public.customer_profiles
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage customer profiles" ON public.customer_profiles;
CREATE POLICY "Admins can manage customer profiles"
ON public.customer_profiles
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS "Users can manage own customer addresses" ON public.customer_addresses;
CREATE POLICY "Users can manage own customer addresses"
ON public.customer_addresses
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage customer addresses" ON public.customer_addresses;
CREATE POLICY "Admins can manage customer addresses"
ON public.customer_addresses
FOR ALL
USING (public.is_platform_admin())
WITH CHECK (public.is_platform_admin());
