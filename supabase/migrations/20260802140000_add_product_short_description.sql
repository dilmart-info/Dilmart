-- DilMart-PRODUCT-SHORT-DESCRIPTION-001
-- Add optional short_description for catalog cards/details.
-- Legacy rows may remain NULL. Does not modify any product data rows.

BEGIN;

DO $$
DECLARE
  v_data_type text;
BEGIN
  SELECT c.data_type
    INTO v_data_type
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'products'
    AND c.column_name = 'short_description';

  IF v_data_type IS NULL THEN
    ALTER TABLE public.products
      ADD COLUMN short_description text NULL;
  ELSIF v_data_type <> 'text' THEN
    RAISE EXCEPTION
      'products.short_description exists with unexpected type % (expected text)',
      v_data_type;
  END IF;
END $$;

COMMENT ON COLUMN public.products.short_description IS
  'Mandatory for new products and new import batches; optional NULL for legacy rows. Editorial target 90–180 chars; hard constraint 40–280 after trim. Independent from description.';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_short_description_len_chk;

ALTER TABLE public.products
  ADD CONSTRAINT products_short_description_len_chk
  CHECK (
    short_description IS NULL
    OR (
      char_length(btrim(short_description)) >= 40
      AND char_length(btrim(short_description)) <= 280
    )
  );

COMMIT;
