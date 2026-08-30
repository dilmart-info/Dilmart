-- M11.0 (P0 Blocker): finance foundation and schema alignment.
-- This migration focuses on schema drift fixes and missing tables used by runtime services.

-- 1) Orders contract hardening (existing code references these fields).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS merchant_notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS financial_snapshot_version INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_payment_method_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_payment_method_check
      CHECK (payment_method IS NULL OR payment_method IN ('cod', 'online', 'bank_transfer', 'other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_financial_snapshot_version ON public.orders(financial_snapshot_version);

-- Keep updated_at maintained for rows changing over time.
CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_orders_set_updated_at ON public.orders;
CREATE TRIGGER trg_orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_orders_updated_at();

-- 2) Runtime tables that were used in code but missing from migrations.
CREATE TABLE IF NOT EXISTS public.outbound_dispatch_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_key TEXT NOT NULL,
  alert_id TEXT,
  alert_type TEXT,
  alert_title TEXT,
  alert_message TEXT,
  alert_link TEXT,
  channel TEXT,
  provider_name TEXT,
  provider_message_id TEXT,
  provider_error_code TEXT,
  ack_status TEXT,
  ack_at TIMESTAMPTZ,
  attempt_no INTEGER NOT NULL DEFAULT 1,
  status_code TEXT,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outbound_dispatch_attempts_dispatch_key
  ON public.outbound_dispatch_attempts(dispatch_key);
CREATE INDEX IF NOT EXISTS idx_outbound_dispatch_attempts_created_at
  ON public.outbound_dispatch_attempts(created_at DESC);

CREATE TABLE IF NOT EXISTS public.outbound_dead_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_key TEXT NOT NULL UNIQUE,
  alert_id TEXT,
  alert_type TEXT,
  alert_title TEXT,
  alert_message TEXT,
  alert_link TEXT,
  failure_category TEXT,
  state TEXT NOT NULL DEFAULT 'dead_lettered',
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error_message TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'outbound_dead_letters_state_check'
      AND conrelid = 'public.outbound_dead_letters'::regclass
  ) THEN
    ALTER TABLE public.outbound_dead_letters
      ADD CONSTRAINT outbound_dead_letters_state_check
      CHECK (state IN ('new', 'retrying', 'dead_lettered', 'resolved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_outbound_dead_letters_state
  ON public.outbound_dead_letters(state);
CREATE INDEX IF NOT EXISTS idx_outbound_dead_letters_updated_at
  ON public.outbound_dead_letters(updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_outbound_dead_letters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_outbound_dead_letters_set_updated_at ON public.outbound_dead_letters;
CREATE TRIGGER trg_outbound_dead_letters_set_updated_at
BEFORE UPDATE ON public.outbound_dead_letters
FOR EACH ROW
EXECUTE FUNCTION public.set_outbound_dead_letters_updated_at();

CREATE TABLE IF NOT EXISTS public.governance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  severity TEXT NOT NULL DEFAULT 'medium',
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'governance_tasks_status_check'
      AND conrelid = 'public.governance_tasks'::regclass
  ) THEN
    ALTER TABLE public.governance_tasks
      ADD CONSTRAINT governance_tasks_status_check
      CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'governance_tasks_severity_check'
      AND conrelid = 'public.governance_tasks'::regclass
  ) THEN
    ALTER TABLE public.governance_tasks
      ADD CONSTRAINT governance_tasks_severity_check
      CHECK (severity IN ('low', 'medium', 'high', 'critical'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_governance_tasks_merchant_status
  ON public.governance_tasks(merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_governance_tasks_created_at
  ON public.governance_tasks(created_at DESC);

CREATE OR REPLACE FUNCTION public.set_governance_tasks_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_governance_tasks_set_updated_at ON public.governance_tasks;
CREATE TRIGGER trg_governance_tasks_set_updated_at
BEFORE UPDATE ON public.governance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_governance_tasks_updated_at();

CREATE TABLE IF NOT EXISTS public.merchant_policy_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  policy_code TEXT NOT NULL,
  policy_version TEXT,
  assignment_status TEXT NOT NULL DEFAULT 'active',
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  notes TEXT,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (merchant_id, policy_code)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'merchant_policy_assignments_status_check'
      AND conrelid = 'public.merchant_policy_assignments'::regclass
  ) THEN
    ALTER TABLE public.merchant_policy_assignments
      ADD CONSTRAINT merchant_policy_assignments_status_check
      CHECK (assignment_status IN ('active', 'inactive', 'suspended'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_merchant_policy_assignments_merchant
  ON public.merchant_policy_assignments(merchant_id);
CREATE INDEX IF NOT EXISTS idx_merchant_policy_assignments_status
  ON public.merchant_policy_assignments(assignment_status);
