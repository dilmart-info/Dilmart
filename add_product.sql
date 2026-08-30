INSERT INTO public.categories (name, slug, sort_order) 
VALUES ('أدوات منزلية', 'home-tools', 1) 
ON CONFLICT (slug) DO NOTHING;

DO $$
DECLARE
    cat_id UUID;
BEGIN
    SELECT id INTO cat_id FROM public.categories WHERE slug = 'home-tools';

    INSERT INTO public.products (category_id, name, slug, description, price, stock, is_active, is_featured, images)
    VALUES (
        cat_id,
        'شريط عزل الأبواب والنوافذ HYDERON – بطول 5 متر',
        'hyderon-sealing-strip-5m',
        'ودّع دخول الغبار، الهواء البارد، والحشرات نهائيًا' || chr(10) || 
        'مع شريط العزل HYDERON الحل العملي والاقتصادي لكل بيت' || chr(10) || 
        '✅ المميزات:' || chr(10) || 
        '🔹 عزل ممتاز للهواء والضوضاء' || chr(10) || 
        '🔹 يقلل اصطدام الأبواب ويخفف الصوت' || chr(10) || 
        '🔹 يمنع دخول الغبار والحشرات' || chr(10) || 
        '🔹 سهل التركيب بدون أدوات (DIY)' || chr(10) || 
        '🔹 مناسب للأبواب والنوافذ' || chr(10) || 
        '🔹 خامة مرنة وعمر استخدام طويل' || chr(10) || 
        '🔹 طول 5 متر يكفي أكثر من باب' || chr(10) || 
        'مثالي للبيوت، المكاتب، والمحلات' || chr(10) || 
        'راحة أكثر هدوء أكثر توفير بالطاقة',
        15000,
        50,
        true,
        true,
        '{}'
    ) ON CONFLICT (slug) DO UPDATE SET stock = 50;
END $$;
