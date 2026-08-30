-- 1. Add public.profiles.account_type as a nullable TEXT column
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS account_type TEXT;

-- 2. Add CHECK constraint on account_type
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_account_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_account_type_check
  CHECK (account_type IN ('customer', 'provisional_customer', 'claimed_provisional'));

-- 3. Backfill existing profile rows
UPDATE public.profiles p
SET account_type = COALESCE(
  (
    SELECT u.raw_app_meta_data->>'account_type'
    FROM auth.users u
    WHERE u.id = p.id
      AND (u.raw_app_meta_data->>'account_type') IN ('customer', 'provisional_customer', 'claimed_provisional')
  ),
  (
    SELECT u.raw_user_meta_data->>'account_type'
    FROM auth.users u
    WHERE u.id = p.id
      AND (u.raw_user_meta_data->>'account_type') IN ('customer', 'provisional_customer', 'claimed_provisional')
  ),
  CASE
    WHEN p.email LIKE 'provisional_%' OR p.email LIKE '%@provisional.DilMart.com' OR p.email LIKE '%@provisional.DilMart.org' THEN 'provisional_customer'
    WHEN p.role = 'customer' THEN 'customer'
    ELSE NULL
  END
);

-- 4. Update handle_new_user trigger safely to copy account_type from Auth metadata or fallback
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_account_type TEXT;
BEGIN
  -- Extract account_type from raw metadata fields
  v_account_type := COALESCE(
    new.raw_app_meta_data->>'account_type',
    new.raw_user_meta_data->>'account_type'
  );

  -- Fallback logic if metadata doesn't contain a valid value
  IF v_account_type IS NULL OR v_account_type NOT IN ('customer', 'provisional_customer', 'claimed_provisional') THEN
    IF new.email LIKE 'provisional_%' OR new.email LIKE '%@provisional.DilMart.com' OR new.email LIKE '%@provisional.DilMart.org' THEN
      v_account_type := 'provisional_customer';
    ELSE
      v_account_type := 'customer';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, role, account_type)
  VALUES (new.id, new.email, 'customer', v_account_type);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
