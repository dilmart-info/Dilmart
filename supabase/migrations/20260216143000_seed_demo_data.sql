-- Seed Demo Data (Categories and Products)

DO $$ 
DECLARE 
    cat_electronics_id UUID;
    cat_home_id UUID;
    cat_fashion_id UUID;
    cat_beauty_id UUID;
    cat_sports_id UUID;
BEGIN

    -- 1. Insert Categories (if not exist)
    INSERT INTO public.categories (name, slug, image_url, sort_order)
    VALUES 
        ('إلكترونيات', 'electronics', 'https://images.unsplash.com/photo-1498049860654-af1a5c5668ba?w=500&auto=format&fit=crop', 1),
        ('منزل وديكور', 'home-decor', 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=500&auto=format&fit=crop', 2),
        ('أزياء وموضة', 'fashion', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=500&auto=format&fit=crop', 3),
        ('جمال وعناية', 'beauty', 'https://images.unsplash.com/photo-1596462502278-27bfdd403348?w=500&auto=format&fit=crop', 4),
        ('رياضة ولياقة', 'sports', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=500&auto=format&fit=crop', 5)
    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
    
    -- 2. fetch IDs safely (LIMIT 1 is implicit with unique slug, but good practice)
    SELECT id INTO cat_electronics_id FROM public.categories WHERE slug = 'electronics';
    IF cat_electronics_id IS NULL THEN
        INSERT INTO public.categories (name, slug, image_url, sort_order) VALUES ('إلكترونيات', 'electronics', 'https://images.unsplash.com/photo-1498049860654-af1a5c5668ba?w=500&auto=format&fit=crop', 1) RETURNING id INTO cat_electronics_id;
    END IF;

    SELECT id INTO cat_home_id FROM public.categories WHERE slug = 'home-decor';
    IF cat_home_id IS NULL THEN
        INSERT INTO public.categories (name, slug, image_url, sort_order) VALUES ('منزل وديكور', 'home-decor', 'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=500&auto=format&fit=crop', 2) RETURNING id INTO cat_home_id;
    END IF;

    SELECT id INTO cat_fashion_id FROM public.categories WHERE slug = 'fashion';
    IF cat_fashion_id IS NULL THEN
        INSERT INTO public.categories (name, slug, image_url, sort_order) VALUES ('أزياء وموضة', 'fashion', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=500&auto=format&fit=crop', 3) RETURNING id INTO cat_fashion_id;
    END IF;

    SELECT id INTO cat_beauty_id FROM public.categories WHERE slug = 'beauty';
    IF cat_beauty_id IS NULL THEN
        INSERT INTO public.categories (name, slug, image_url, sort_order) VALUES ('جمال وعناية', 'beauty', 'https://images.unsplash.com/photo-1596462502278-27bfdd403348?w=500&auto=format&fit=crop', 4) RETURNING id INTO cat_beauty_id;
    END IF;

    SELECT id INTO cat_sports_id FROM public.categories WHERE slug = 'sports';
    IF cat_sports_id IS NULL THEN
        INSERT INTO public.categories (name, slug, image_url, sort_order) VALUES ('رياضة ولياقة', 'sports', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=500&auto=format&fit=crop', 5) RETURNING id INTO cat_sports_id;
    END IF;


    -- 2. Insert Products
    -- Electronics
    INSERT INTO public.products (name, slug, description, price, discount_price, images, category_id, stock, is_active, is_new, is_best_seller, created_at)
    VALUES 
    (
        'ساعة ذكية الترا برو', 
        'smart-watch-ultra-pro', 
        'ساعة ذكية بمواصفات عالية، تدعم المكالمات وقياس نبضات القلب ومقاومة للماء. بطارية تدوم طويلاً.', 
        45000, 
        35000, 
        ARRAY['https://images.unsplash.com/photo-1579586337278-3befd40fd17a?w=600&auto=format&fit=crop'], 
        cat_electronics_id, 
        50, 
        true, 
        true, 
        true,
        NOW()
    ),
    (
        'سماعات بلوتوث لاسلكية', 
        'wireless-earbuds', 
        'سماعات لاسلكية بصوت نقي وعزل ضوضاء ممتاز. تصميم مريح للأذن.', 
        25000, 
        null, 
        ARRAY['https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=600&auto=format&fit=crop'], 
        cat_electronics_id, 
        100, 
        true, 
        false, 
        true,
        NOW() - INTERVAL '1 day'
    ),
    (
        'شاحن متنقل 20000 ملي أمبير', 
        'powerbank-20000', 
        'شاحن متنقل بسعة كبيرة وشحن سريع. منفذين USB ومنفذ Type-C.', 
        30000, 
        25000, 
        ARRAY['https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=600&auto=format&fit=crop'], 
        cat_electronics_id, 
        30, 
        true, 
        true, 
        false,
        NOW() - INTERVAL '2 days'
    );

    -- Home
    INSERT INTO public.products (name, slug, description, price, discount_price, images, category_id, stock, is_active, is_new, is_best_seller, created_at)
    VALUES 
    (
        'خلاط كهربائي متعدد الوظائف', 
        'multi-function-blender', 
        'خلاط قوي لتحضير العصائر والسموذي وطحن الحبوب. شفرات ستانلس ستيل.', 
        55000, 
        48000, 
        ARRAY['https://images.unsplash.com/photo-1570222094114-28a9d88a2ef5?w=600&auto=format&fit=crop'], 
        cat_home_id, 
        20, 
        true, 
        false, 
        true,
        NOW() - INTERVAL '3 days'
    ),
    (
        'طقم أواني طهي جرانيت', 
        'granite-cookware-set', 
        'طقم قدور ومقالي جرانيت غير لاصق، صحي وسهل التنظيف. 7 قطع.', 
        85000, 
        null, 
        ARRAY['https://images.unsplash.com/photo-1584990347449-a0846bf1e305?w=600&auto=format&fit=crop'], 
        cat_home_id, 
        15, 
        true, 
        true, 
        false,
        NOW() - INTERVAL '4 days'
    ),
    (
        'ماكينة قهوة اسبريسو', 
        'espresso-machine', 
        'استمتع بقهوة مثل الكافيهات في منزلك. ماكينة اسبريسو بضغط 15 بار.', 
        120000, 
        99000, 
        ARRAY['https://images.unsplash.com/photo-1517912447953-e9a3b68019d0?w=600&auto=format&fit=crop'], 
        cat_home_id, 
        10, 
        true, 
        false, 
        true,
        NOW() - INTERVAL '5 days'
    );

    -- Fashion
    INSERT INTO public.products (name, slug, description, price, discount_price, images, category_id, stock, is_active, is_new, is_best_seller, created_at)
    VALUES 
    (
        'حقيبة جلدية كلاسيكية', 
        'classic-leather-bag', 
        'حقيبة يد نسائية من الجلد الصناعي العالي الجودة. تصميم عصري وأنيق.', 
        35000, 
        null, 
        ARRAY['https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=600&auto=format&fit=crop'], 
        cat_fashion_id, 
        40, 
        true, 
        true, 
        false,
        NOW() - INTERVAL '6 days'
    ),
    (
        'نظارة شمسية', 
        'sunglasses-fashion', 
        'نظارة شمسية بعدسات حماية UV400 وإطار خفيف الوزن.', 
        15000, 
        10000, 
        ARRAY['https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=600&auto=format&fit=crop'], 
        cat_fashion_id, 
        60, 
        true, 
        false, 
        true,
        NOW() - INTERVAL '7 days'
    );

    -- Beauty
    INSERT INTO public.products (name, slug, description, price, discount_price, images, category_id, stock, is_active, is_new, is_best_seller, created_at)
    VALUES 
    (
        'مجموعة فرش مكياج احترافية', 
        'makeup-brushes-set', 
        'مجموعة فرش مكياج ناعمة وكثيفة، تناسب جميع أنواع المكياج. 12 قطعة.', 
        20000, 
        15000, 
        ARRAY['https://images.unsplash.com/photo-1596462502278-27bfdd403348?w=600&auto=format&fit=crop'], 
        cat_beauty_id, 
        100, 
        true, 
        true, 
        true,
        NOW() - INTERVAL '8 days'
    ),
    (
        'سيروم فيتامين سي', 
        'vitamin-c-serum', 
        'سيروم للوجه يعزز النضارة ويحارب التصبغات. مناسب لجميع أنواع البشرة.', 
        18000, 
        null, 
        ARRAY['https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&auto=format&fit=crop'], 
        cat_beauty_id, 
        50, 
        true, 
        false, 
        true,
        NOW() - INTERVAL '9 days'
    );
    
    -- Sports
    INSERT INTO public.products (name, slug, description, price, discount_price, images, category_id, stock, is_active, is_new, is_best_seller, created_at)
    VALUES 
    (
        'دامبلز 5 كغم (زوج)', 
        'dumbbells-5kg', 
        'أوزان يدوية مطلية بالفينيل لتمارين اللياقة المنزلية. وزن 5 كغم.', 
        25000, 
        20000, 
        ARRAY['https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?w=600&auto=format&fit=crop'], 
        cat_sports_id, 
        30, 
        true, 
        false, 
        true,
        NOW() - INTERVAL '10 days'
    ),
    (
        'سجادة يوغا', 
        'yoga-mat', 
        'سجادة تمارين رياضية مانعة للانزلاق، سميكة ومريحة للمفاصل.', 
        12000, 
        null, 
        ARRAY['https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=600&auto=format&fit=crop'], 
        cat_sports_id, 
        45, 
        true, 
        true, 
        false,
        NOW() - INTERVAL '11 days'
    );

    -- More Offers
     INSERT INTO public.products (name, slug, description, price, discount_price, images, category_id, stock, is_active, is_new, is_best_seller, created_at)
    VALUES 
    (
        'ماكينة حلاقة رجالية', 
        'mens-shaver', 
        'ماكينة حلاقة متعددة الرؤوس للاستخدام الجاف والرطب.', 
        35000, 
        25000, 
        ARRAY['https://images.unsplash.com/photo-1621607512214-68297f3190ef?w=600&auto=format&fit=crop'], 
        cat_electronics_id, 
        25, 
        true, 
        false, 
        false,
        NOW() - INTERVAL '12 days'
    );

    
    -- Safe insert to avoid duplicate error on slug
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'Some products or categories already exist, skipping duplicates.';
END;
$$ LANGUAGE plpgsql;
