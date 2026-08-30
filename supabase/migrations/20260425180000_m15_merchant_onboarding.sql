-- M15: Merchant auth/register + approval onboarding

-- 1) Expand profile role model with merchant applicant
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'admin', 'customer', 'agent', 'merchant_owner', 'merchant_manager', 'merchant_staff', 'merchant_applicant'));

-- 2) Expand merchant status lifecycle and add approval metadata
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchants_status_check'
      AND conrelid = 'public.merchants'::regclass
  ) THEN
    ALTER TABLE public.merchants DROP CONSTRAINT merchants_status_check;
  END IF;
END $$;

ALTER TABLE public.merchants
  ADD CONSTRAINT merchants_status_check
  CHECK (status IN ('draft', 'pending_review', 'active', 'suspended', 'archived', 'rejected'));

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_merchants_status_created_at ON public.merchants(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_merchants_status_submitted_at ON public.merchants(status, submitted_at DESC);
