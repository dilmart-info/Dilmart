-- Cache Jenni reference cities for validation / admin review (synced from GET /v2/reference/cities)
CREATE TABLE IF NOT EXISTS public.jenni_cities_reference (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  governorate_code TEXT NOT NULL,
  name_ar TEXT,
  name_en TEXT,
  jenni_code TEXT,
  payload JSONB,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (governorate_code, name_ar)
);

CREATE INDEX IF NOT EXISTS idx_jenni_cities_reference_governorate
  ON public.jenni_cities_reference (governorate_code);

ALTER TABLE public.jenni_cities_reference ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access jenni_cities_reference"
  ON public.jenni_cities_reference
  FOR ALL
  USING (true)
  WITH CHECK (true);
