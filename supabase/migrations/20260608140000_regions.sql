-- PR-F1: Regions table + seed data (non-blocker, per supervisor directive)
-- Regions are sub-areas within governorates (e.g. كرادة, مدينة الصدر within بغداد).

-- ── Table ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate_id UUID NOT NULL REFERENCES public.governorates(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regions_governorate_id ON public.regions(governorate_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

-- Public read (anyone can see regions for checkout dropdown)
CREATE POLICY regions_read_all ON public.regions FOR SELECT USING (true);

-- Only service_role can write (admin CRUD via backend)
CREATE POLICY regions_write_admin ON public.regions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Seed: 3-5 regions for Baghdad (testing) ─────────────────────────────────
-- First, find Baghdad's ID dynamically
DO $$
DECLARE
  v_baghdad_id UUID;
BEGIN
  SELECT id INTO v_baghdad_id FROM public.governorates WHERE name ILIKE '%بغداد%' LIMIT 1;
  IF v_baghdad_id IS NOT NULL THEN
    INSERT INTO public.regions (governorate_id, name, sort_order)
    VALUES
      (v_baghdad_id, 'الكرادة', 1),
      (v_baghdad_id, 'المنصور', 2),
      (v_baghdad_id, 'الأعظمية', 3),
      (v_baghdad_id, 'مدينة الصدر', 4),
      (v_baghdad_id, 'الكاظمية', 5)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;
