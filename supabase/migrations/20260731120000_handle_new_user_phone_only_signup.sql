-- Batch 2A — make profile creation survive a phone-only signup.
--
-- NOT APPLIED TO PRODUCTION. Local/staging verification only until the supervisor
-- approves the deployment order.
--
-- Three defects block Supabase phone OTP registration today:
--
--   1. profiles.email is TEXT NOT NULL, but a phone-only auth.users row has email = NULL.
--      The trigger's INSERT therefore raises a not-null violation, which aborts the
--      auth.users insert itself — Supabase cannot create the user at all.
--   2. The trigger copies neither phone nor full_name, so a phone-registered customer
--      would land with a profile that the claim and password-reset lookups cannot find.
--   3. The INSERT is not idempotent. A retried or replayed trigger raises a duplicate key
--      error instead of settling.
--
-- Everything here is additive and backwards compatible: existing email users keep the
-- exact same profile row they have today.

-- 1. Allow a profile with no email. Phone-only accounts are legitimate identities.
ALTER TABLE public.profiles ALTER COLUMN email DROP NOT NULL;

-- 2. Trigger rewrite: copy phone and full_name, tolerate a missing email, and settle
--    instead of raising when the row already exists.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_account_type TEXT;
  v_full_name TEXT;
  v_phone TEXT;
BEGIN
  v_account_type := COALESCE(
    new.raw_app_meta_data->>'account_type',
    new.raw_user_meta_data->>'account_type'
  );

  -- Fallback when metadata carries nothing usable. `new.email LIKE ...` yields NULL for a
  -- phone-only user, so the ELSE branch is taken and the account is a normal customer.
  IF v_account_type IS NULL OR v_account_type NOT IN ('customer', 'provisional_customer', 'claimed_provisional') THEN
    IF new.email LIKE 'provisional_%' OR new.email LIKE '%@provisional.DilMart.com' OR new.email LIKE '%@provisional.DilMart.org' THEN
      v_account_type := 'provisional_customer';
    ELSE
      v_account_type := 'customer';
    END IF;
  END IF;

  v_full_name := NULLIF(TRIM(COALESCE(new.raw_user_meta_data->>'full_name', '')), '');

  -- Store the local Iraqi form the rest of the system already uses, so the claim and
  -- reset lookups keep matching. auth.users.phone holds E.164 digits without the plus.
  v_phone := NULLIF(TRIM(COALESCE(new.phone, '')), '');
  IF v_phone IS NOT NULL THEN
    IF v_phone ~ '^9647[0-9]{9}$' THEN
      v_phone := '0' || SUBSTRING(v_phone FROM 4);
    ELSIF v_phone ~ '^\+9647[0-9]{9}$' THEN
      v_phone := '0' || SUBSTRING(v_phone FROM 5);
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, role, account_type, full_name, phone)
  VALUES (new.id, new.email, 'customer', v_account_type, v_full_name, v_phone)
  ON CONFLICT (id) DO UPDATE
    SET email      = COALESCE(public.profiles.email, EXCLUDED.email),
        full_name  = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        phone      = COALESCE(public.profiles.phone, EXCLUDED.phone),
        account_type = COALESCE(public.profiles.account_type, EXCLUDED.account_type);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The trigger binding itself is unchanged; recreated only so a fresh database wires the
-- new function even if the original CREATE TRIGGER ran earlier in the chain.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
