-- DilMart-ARD-AL-KHALEEJ-CATEGORY-TAXONOMY-001 Phase B
-- OPTION_C_PLUS_REUSE_EXISTING_EMPTY_ROOTS
-- Idempotent. Fail-closed on slug parent conflicts and partial Pilot sets.
-- Local/CI: creates fixed-ID roots if missing; skips Pilot move only when 0 Pilot rows exist.

BEGIN;

DO $$
DECLARE
  v_frag_root CONSTANT uuid := 'fc662e9f-ea22-454e-bb29-cdb7bf5ea90c';
  v_care_root CONSTANT uuid := 'd7df20e8-011c-430e-a8a7-77b9506936ac';
  v_merchant  CONSTANT uuid := 'ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7';
  v_similar   CONSTANT uuid := '1689ae4a-41f5-425b-bebe-c99c74880008';
  v_cnt int;
  v_pilot_existing int;
  v_parent uuid;
  r record;
BEGIN
  -- Ensure fragrance root exists (production already has it; local reset may not)
  INSERT INTO public.categories (id, name, slug, parent_id, sort_order, is_active)
  VALUES (v_frag_root, 'العطور والمعطرات', 'fragrances-and-scents', NULL, 10, true)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        parent_id = NULL,
        is_active = true;

  -- Ensure personal-care root exists (reuse former empty skin-care id)
  INSERT INTO public.categories (id, name, slug, parent_id, sort_order, is_active)
  VALUES (v_care_root, 'العناية الشخصية والتجميل', 'personal-care-beauty', NULL, 11, true)
  ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        parent_id = NULL,
        is_active = true;

  CREATE TEMP TABLE _tax_children (
    parent_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sort_order int NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO _tax_children (parent_id, name, slug, sort_order) VALUES
    (v_frag_root, 'العطور', 'perfumes', 1),
    (v_frag_root, 'العطور الصغيرة والميني', 'mini-travel-perfume', 2),
    (v_frag_root, 'معطرات الجسم والبودي مست', 'body-mist-splash', 3),
    (v_frag_root, 'معطرات المنزل والمفارش والجو', 'home-linen-air', 4),
    (v_frag_root, 'البخور والمعمول', 'incense-maamoul', 5),
    (v_frag_root, 'المسك والمخمريات والعطور الزيتية', 'musk-oils-mukhammaria', 6),
    (v_care_root, 'العناية بالبشرة', 'skin-care', 1),
    (v_care_root, 'العناية بالجسم والاستحمام', 'body-bath-care', 2),
    (v_care_root, 'العناية بالشعر وعطور الشعر', 'hair-care-fragrance', 3),
    (v_care_root, 'البودرة ومنتجات التجميل', 'powder-makeup', 4);

  FOR r IN SELECT * FROM _tax_children LOOP
    SELECT c.parent_id INTO v_parent
    FROM public.categories c
    WHERE c.slug = r.slug
    LIMIT 1;

    IF FOUND THEN
      IF v_parent IS DISTINCT FROM r.parent_id THEN
        RAISE EXCEPTION
          'TAXONOMY_FAIL: slug % exists under parent % but expected parent %',
          r.slug, v_parent, r.parent_id;
      END IF;
      UPDATE public.categories
      SET name = r.name,
          sort_order = r.sort_order,
          is_active = true,
          parent_id = r.parent_id
      WHERE slug = r.slug
        AND (
          name IS DISTINCT FROM r.name
          OR sort_order IS DISTINCT FROM r.sort_order
          OR is_active IS DISTINCT FROM true
          OR parent_id IS DISTINCT FROM r.parent_id
        );
    ELSE
      INSERT INTO public.categories (id, name, slug, parent_id, sort_order, is_active)
      VALUES (gen_random_uuid(), r.name, r.slug, r.parent_id, r.sort_order, true);
    END IF;
  END LOOP;

  SELECT COUNT(*) INTO v_cnt
  FROM public.categories c
  WHERE c.parent_id IN (v_frag_root, v_care_root)
    AND c.slug IN (
      'perfumes','mini-travel-perfume','body-mist-splash','home-linen-air',
      'incense-maamoul','musk-oils-mukhammaria',
      'skin-care','body-bath-care','hair-care-fragrance','powder-makeup'
    );
  IF v_cnt <> 10 THEN
    RAISE EXCEPTION 'TAXONOMY_FAIL: expected 10 approved children, found %', v_cnt;
  END IF;

  -- Pilot move: exact-10 or skip-if-absent (local reset without pilot seed)
  SELECT COUNT(*) INTO v_pilot_existing
  FROM public.products p
  WHERE p.merchant_id = v_merchant
    AND p.merchant_sku IN (
      'ARD-1015','ARD-1042','ARD-1065','ARD-1172','ARD-1173',
      'ARD-1191','ARD-1826','ARD-2800','ARD-3270','ARD-3723'
    );

  IF v_pilot_existing = 0 THEN
    RAISE NOTICE 'TAXONOMY: Pilot 10 products absent — skipping Pilot category move';
  ELSIF v_pilot_existing <> 10 THEN
    RAISE EXCEPTION
      'TAXONOMY_FAIL: found % Pilot SKUs for target merchant (expected 0 or 10)',
      v_pilot_existing;
  ELSE
    UPDATE public.products p
    SET category_id = (
          SELECT c.id FROM public.categories c
          WHERE c.slug = 'perfumes' AND c.parent_id = v_frag_root
          LIMIT 1
        )
    WHERE p.merchant_id = v_merchant
      AND p.merchant_sku IN (
        'ARD-1015','ARD-1042','ARD-1065','ARD-1172','ARD-1173',
        'ARD-1191','ARD-1826','ARD-2800','ARD-3270','ARD-3723'
      );

    GET DIAGNOSTICS v_cnt = ROW_COUNT;
    IF v_cnt <> 10 THEN
      RAISE EXCEPTION 'TAXONOMY_FAIL: Pilot 10 move affected % rows (expected 10)', v_cnt;
    END IF;

    SELECT COUNT(*) INTO v_cnt
    FROM public.products p
    WHERE p.merchant_id = v_merchant
      AND p.merchant_sku IN (
        'ARD-1015','ARD-1042','ARD-1065','ARD-1172','ARD-1173',
        'ARD-1191','ARD-1826','ARD-2800','ARD-3270','ARD-3723'
      )
      AND p.is_active = false
      AND p.is_published = false
      AND p.visibility_status = 'private'
      AND p.stock = 0
      AND p.category_id = (
        SELECT c.id FROM public.categories c
        WHERE c.slug = 'perfumes' AND c.parent_id = v_frag_root
        LIMIT 1
      );
    IF v_cnt <> 10 THEN
      RAISE EXCEPTION 'TAXONOMY_FAIL: Pilot safety/category assert failed (matched %)', v_cnt;
    END IF;
  END IF;

  -- Similar merchant must not have been modified by Pilot UPDATE (merchant_id scoped).
  -- If similar merchant exists in this DB, keep product count stable at 15 when that is the
  -- production baseline; otherwise skip.
  IF EXISTS (SELECT 1 FROM public.merchants WHERE id = v_similar) THEN
    SELECT COUNT(*) INTO v_cnt FROM public.products WHERE merchant_id = v_similar;
    IF v_cnt NOT IN (0, 15) AND v_pilot_existing = 10 THEN
      -- Only enforce 15 when running against a production-like dataset that has Pilot 10.
      RAISE EXCEPTION
        'TAXONOMY_FAIL: similar merchant product count is % (expected 15 on production-like DB)',
        v_cnt;
    END IF;
  END IF;
END $$;

COMMIT;
