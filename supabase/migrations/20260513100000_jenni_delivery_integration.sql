-- Jenni external delivery provider (Phase 1)

ALTER TABLE public.delivery_companies
  ADD COLUMN IF NOT EXISTS provider_code text,
  ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'manual_internal';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_companies_provider_type_check'
  ) THEN
    ALTER TABLE public.delivery_companies
      ADD CONSTRAINT delivery_companies_provider_type_check
      CHECK (provider_type IN ('manual_internal', 'external_partner', 'hybrid'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_companies_provider_code
  ON public.delivery_companies (provider_code)
  WHERE provider_code IS NOT NULL;

ALTER TABLE public.governorates
  ADD COLUMN IF NOT EXISTS jenni_governorate_code text;

CREATE TABLE IF NOT EXISTS public.order_delivery_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  delivery_company_id uuid REFERENCES public.delivery_companies(id) ON DELETE SET NULL,
  provider_code text NOT NULL DEFAULT 'jenni',
  external_shipment_id text NOT NULL,
  external_shipment_number text NOT NULL,
  provider_shipment_id text,
  airway_bill_number text,
  provider_current_step text,
  provider_current_step_ar text,
  provider_current_stage text,
  provider_last_payload jsonb,
  dispatch_status text NOT NULL DEFAULT 'pending',
  dispatch_error text,
  amount_change_flag boolean NOT NULL DEFAULT false,
  dispatched_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_delivery_integrations_dispatch_status_check
    CHECK (dispatch_status IN ('pending', 'dispatched', 'failed', 'synced', 'cancelled')),
  CONSTRAINT order_delivery_integrations_provider_code_external_unique
    UNIQUE (provider_code, external_shipment_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_delivery_integrations_order_id
  ON public.order_delivery_integrations (order_id);

CREATE TABLE IF NOT EXISTS public.delivery_provider_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_code text NOT NULL DEFAULT 'jenni',
  provider_shipment_id text,
  shipment_number text,
  action_code text,
  current_step text,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  source text NOT NULL,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_provider_sync_events_source_check
    CHECK (source IN ('webhook', 'query_sync', 'manual_sync')),
  CONSTRAINT delivery_provider_sync_events_provider_payload_unique
    UNIQUE (provider_code, payload_hash)
);

CREATE INDEX IF NOT EXISTS idx_delivery_provider_sync_events_shipment
  ON public.delivery_provider_sync_events (provider_shipment_id, shipment_number);

-- Extend delivery_events for provider audit trail
ALTER TABLE public.delivery_events DROP CONSTRAINT IF EXISTS delivery_events_event_type_check;
ALTER TABLE public.delivery_events
  ADD CONSTRAINT delivery_events_event_type_check
  CHECK (
    event_type IN (
      'assigned_to_company',
      'assigned_to_agent',
      'picked_up',
      'in_transit',
      'delivered',
      'failed',
      'returned',
      'cancelled',
      'note_added',
      'provider_dispatched',
      'provider_synced',
      'amount_change_reported',
      'provider_postponed'
    )
  );

ALTER TABLE public.delivery_events DROP CONSTRAINT IF EXISTS delivery_events_actor_type_check;
ALTER TABLE public.delivery_events
  ADD CONSTRAINT delivery_events_actor_type_check
  CHECK (actor_type IN ('admin', 'delivery_company', 'agent', 'system', 'external_provider'));

-- Seed Jenni delivery company
INSERT INTO public.delivery_companies (name, phone, is_active, provider_code, provider_type, default_sla_minutes)
SELECT 'Jenni / Al Zaeem Express', NULL, true, 'jenni', 'external_partner', 1440
WHERE NOT EXISTS (SELECT 1 FROM public.delivery_companies WHERE provider_code = 'jenni');

-- Backfill provider_code on existing row if name matches
UPDATE public.delivery_companies
SET provider_code = 'jenni', provider_type = 'external_partner', is_active = true
WHERE lower(name) LIKE '%jenni%' OR lower(name) LIKE '%zaeem%';

-- Governorate → Jenni code mapping (common Iraq codes)
UPDATE public.governorates SET jenni_governorate_code = 'BGD' WHERE name LIKE '%بغداد%';
UPDATE public.governorates SET jenni_governorate_code = 'BAS' WHERE name LIKE '%البصرة%' OR name LIKE '%بصرة%';
UPDATE public.governorates SET jenni_governorate_code = 'NIN' WHERE name LIKE '%نينوى%' OR name LIKE '%موصل%';
UPDATE public.governorates SET jenni_governorate_code = 'ARB' WHERE name LIKE '%أربيل%' OR name LIKE '%اربيل%';
UPDATE public.governorates SET jenni_governorate_code = 'NJF' WHERE name LIKE '%نجف%';
UPDATE public.governorates SET jenni_governorate_code = 'KAR' WHERE name LIKE '%كربلاء%';
UPDATE public.governorates SET jenni_governorate_code = 'BAB' WHERE name LIKE '%بابل%' OR name LIKE '%حلة%';
UPDATE public.governorates SET jenni_governorate_code = 'ANA' WHERE name LIKE '%أنبار%' OR name LIKE '%انبار%';
UPDATE public.governorates SET jenni_governorate_code = 'DYL' WHERE name LIKE '%ديالى%';
UPDATE public.governorates SET jenni_governorate_code = 'KRK' WHERE name LIKE '%كركوك%';
UPDATE public.governorates SET jenni_governorate_code = 'SAL' WHERE name LIKE '%صلاح الدين%';
UPDATE public.governorates SET jenni_governorate_code = 'WAS' WHERE name LIKE '%واسط%' OR name LIKE '%كوت%';
UPDATE public.governorates SET jenni_governorate_code = 'QAD' WHERE name LIKE '%قادسية%' OR name LIKE '%ديوانية%';
UPDATE public.governorates SET jenni_governorate_code = 'DHI' WHERE name LIKE '%ذي قار%' OR name LIKE '%ناصرية%';
UPDATE public.governorates SET jenni_governorate_code = 'MAY' WHERE name LIKE '%ميسان%' OR name LIKE '%عمارة%';
UPDATE public.governorates SET jenni_governorate_code = 'MUT' WHERE name LIKE '%مثنى%' OR name LIKE '%سماوة%';
UPDATE public.governorates SET jenni_governorate_code = 'SU' WHERE name LIKE '%سليمانية%';
UPDATE public.governorates SET jenni_governorate_code = 'DAH' WHERE name LIKE '%دهوك%';
UPDATE public.governorates SET jenni_governorate_code = 'HAL' WHERE name LIKE '%حلبجة%';

-- Copy governorate delivery_price into Jenni delivery_prices (local tariff source for checkout)
INSERT INTO public.delivery_prices (company_id, governorate_id, price)
SELECT dc.id, g.id, g.delivery_price
FROM public.delivery_companies dc
CROSS JOIN public.governorates g
WHERE dc.provider_code = 'jenni'
ON CONFLICT (company_id, governorate_id) DO UPDATE SET price = EXCLUDED.price;

ALTER TABLE public.order_delivery_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_provider_sync_events ENABLE ROW LEVEL SECURITY;
