-- Add Subcategories
DO $$
DECLARE
    v_parent_id UUID;
BEGIN
    -- 1. الأجهزة الكهربائية الكبيرة
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'large-home-appliances';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('ثلاجات', 'refrigerators', v_parent_id, 1),
        ('غسالات', 'washing-machines', v_parent_id, 2),
        ('مجففات', 'dryers', v_parent_id, 3),
        ('مكيفات ومبردات', 'air-conditioners', v_parent_id, 4),
        ('فريزرات', 'freezers', v_parent_id, 5)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 2. أجهزة المطبخ
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'kitchen-appliances';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('قلايات هوائية', 'air-fryers', v_parent_id, 1),
        ('خلاطات ومحضرات', 'blenders-processors', v_parent_id, 2),
        ('ميكروويف', 'microwave', v_parent_id, 3),
        ('ماكينات قهوة', 'coffee-machines', v_parent_id, 4),
        ('غلايات ومحامص', 'kettles-toasters', v_parent_id, 5),
        ('عصّارات', 'juicers', v_parent_id, 6),
        ('مفرمات وماكينات فرم', 'grinders-meat-mincers', v_parent_id, 7)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 3. أدوات المطبخ والأواني
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'kitchen-tools-cookware';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('قدور وطناجر', 'pots-pans', v_parent_id, 1),
        ('مقالي', 'frying-pans', v_parent_id, 2),
        ('سكاكين وأدوات تقطيع', 'knives-cutting', v_parent_id, 3),
        ('أطقم صحون وتقديم', 'plates-serving', v_parent_id, 4),
        ('أدوات الطبخ', 'cooking-utensils', v_parent_id, 5),
        ('علب حفظ وتنظيم', 'food-storage', v_parent_id, 6),
        ('أكواب وترمس', 'cups-thermos', v_parent_id, 7)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 4. الطباخات والأفران
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'cookers-ovens';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('أفران كهربائية', 'electric-ovens', v_parent_id, 1),
        ('أفران غاز', 'gas-ovens', v_parent_id, 2),
        ('طباخات', 'cookers', v_parent_id, 3),
        ('سطوح طبخ', 'hobs', v_parent_id, 4),
        ('شفاطات', 'hoods', v_parent_id, 5)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 5. أجهزة التنظيف الكهربائية
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'electric-cleaning-tools';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('مكانس كهربائية', 'vacuum-cleaners', v_parent_id, 1),
        ('مكانس عمودية/لاسلكية', 'cordless-vacuums', v_parent_id, 2),
        ('منظفات بخار', 'steam-cleaners', v_parent_id, 3),
        ('غسالات ضغط (كارواش)', 'pressure-washers', v_parent_id, 4),
        ('أدوات تنظيف منزلية', 'household-cleaning-tools', v_parent_id, 5)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 6. أدوات الحدائق
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'garden-tools';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('أدوات زراعة', 'farming-tools', v_parent_id, 1),
        ('خراطيم ومرشات', 'hoses-sprayers', v_parent_id, 2),
        ('معدات قص وتشذيب', 'trimming-equipment', v_parent_id, 3),
        ('إضاءة حدائق', 'garden-lighting', v_parent_id, 4),
        ('تنظيم وحدائق منزلية', 'garden-organization', v_parent_id, 5)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 7. أجهزة التدفئة
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'heaters';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('دفايات كهربائية', 'electric-heaters', v_parent_id, 1),
        ('مدافئ غاز', 'gas-heaters', v_parent_id, 2),
        ('سخانات ماء', 'water-heaters', v_parent_id, 3),
        ('بطانيات كهربائية', 'electric-blankets', v_parent_id, 4),
        ('مراوح/هيتر 2×1', 'fan-heaters', v_parent_id, 5)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 8. الأجهزة الرياضية
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'sports-fitness';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('أجهزة مشي', 'treadmills', v_parent_id, 1),
        ('دراجات ثابتة', 'exercise-bikes', v_parent_id, 2),
        ('أجهزة تمارين منزلية', 'home-gym', v_parent_id, 3),
        ('دمبل وأوزان', 'dumbbells-weights', v_parent_id, 4),
        ('إكسسوارات رياضية', 'fitness-accessories', v_parent_id, 5)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 9. الملابس
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'clothing';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('رجالي', 'men-clothing', v_parent_id, 1),
        ('نسائي', 'women-clothing', v_parent_id, 2),
        ('أطفال', 'children-clothing', v_parent_id, 3),
        ('رياضية', 'sportswear', v_parent_id, 4),
        ('شتوية', 'winter-clothing', v_parent_id, 5)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 10. الحقائب
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'bags';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('حقائب ظهر', 'backpacks', v_parent_id, 1),
        ('حقائب سفر', 'travel-bags', v_parent_id, 2),
        ('حقائب نسائية', 'women-bags', v_parent_id, 3),
        ('محافظ وإكسسوارات', 'wallets-accessories', v_parent_id, 4)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 11. الهدايا
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'gifts';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('هدايا منزلية', 'home-gifts', v_parent_id, 1),
        ('هدايا أطفال', 'children-gifts', v_parent_id, 2),
        ('عطور/إكسسوارات هدايا', 'perfume-accessories', v_parent_id, 3),
        ('تغليف وإكسسوارات', 'wrapping-accessories', v_parent_id, 4)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 12. الألعاب
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'toys';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('ألعاب أطفال', 'children-toys', v_parent_id, 1),
        ('ألعاب تعليمية', 'educational-toys', v_parent_id, 2),
        ('ألعاب إلكترونية', 'electronic-toys', v_parent_id, 3),
        ('ألعاب ذكاء وتركيب', 'brain-toys', v_parent_id, 4)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 13. الدراجات الكهربائية الصغيرة
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'small-electric-bikes-scooters';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('سكوتر كهربائي', 'electric-scooters', v_parent_id, 1),
        ('دراجات كهربائية صغيرة', 'mini-electric-bikes', v_parent_id, 2),
        ('ملحقات الدراجات', 'bike-accessories', v_parent_id, 3)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

    -- 14. الشبكات والإنترنت
    SELECT id INTO v_parent_id FROM public.categories WHERE slug = 'networking-internet';
    IF v_parent_id IS NOT NULL THEN
        INSERT INTO public.categories (name, slug, parent_id, sort_order) VALUES
        ('مقويات واي فاي', 'wifi-extenders', v_parent_id, 1),
        ('راوترات ومودمات', 'routers-modems', v_parent_id, 2),
        ('أجهزة Mesh', 'mesh-networking', v_parent_id, 3),
        ('اكسسوارات الشبكات', 'networking-accessories', v_parent_id, 4)
        ON CONFLICT (slug) DO UPDATE SET parent_id = v_parent_id;
    END IF;

END $$;
