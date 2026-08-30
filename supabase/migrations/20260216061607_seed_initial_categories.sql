-- Seed initial categories
INSERT INTO public.categories (name, slug, sort_order, image_url)
VALUES 
    ('الأجهزة الكهربائية الكبيرة', 'large-home-appliances', 1, NULL),
    ('أجهزة المطبخ', 'kitchen-appliances', 2, NULL),
    ('أدوات المطبخ والأواني', 'kitchen-tools-cookware', 3, NULL),
    ('الطباخات والأفران', 'cookers-ovens', 4, NULL),
    ('أجهزة التنظيف الكهربائية', 'electric-cleaning-tools', 5, NULL),
    ('أدوات الحدائق', 'garden-tools', 6, NULL),
    ('أجهزة التدفئة', 'heaters', 7, NULL),
    ('الأجهزة الرياضية', 'sports-fitness', 8, NULL),
    ('الملابس', 'clothing', 9, NULL),
    ('الحقائب', 'bags', 10, NULL),
    ('الهدايا', 'gifts', 11, NULL),
    ('الألعاب', 'toys', 12, NULL),
    ('الدراجات الكهربائية الصغيرة', 'small-electric-bikes-scooters', 13, NULL),
    ('الشبكات والإنترنت', 'networking-internet', 14, NULL)
ON CONFLICT (slug) DO UPDATE 
SET 
    name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order;
