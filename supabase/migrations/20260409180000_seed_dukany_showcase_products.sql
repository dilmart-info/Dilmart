-- Showcase/demo data for DilMartStore: parent category images + 26 products across hierarchy
-- Covers: offers (discount_price), new, best_seller, offer_ends_at countdown, sold_count,
-- loyalty_points_enabled, out-of-stock + low-stock samples, subcategories under parents.

-- 1) صور للأقسام الرئيسية
UPDATE public.categories AS cat SET image_url = v.url
FROM (VALUES
  ('large-home-appliances', 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&auto=format&fit=crop'),
  ('kitchen-appliances', 'https://images.unsplash.com/photo-1556911220-bff31c812dba?w=600&auto=format&fit=crop'),
  ('kitchen-tools-cookware', 'https://images.unsplash.com/photo-1584990347449-a0846bf1e305?w=600&auto=format&fit=crop'),
  ('cookers-ovens', 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=600&auto=format&fit=crop'),
  ('electric-cleaning-tools', 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=600&auto=format&fit=crop'),
  ('garden-tools', 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&auto=format&fit=crop'),
  ('heaters', 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=600&auto=format&fit=crop'),
  ('sports-fitness', 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&auto=format&fit=crop'),
  ('clothing', 'https://images.unsplash.com/photo-1445205170230-053b83016050?w=600&auto=format&fit=crop'),
  ('bags', 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&auto=format&fit=crop'),
  ('gifts', 'https://images.unsplash.com/photo-1513885535751-8b9238be345a?w=600&auto=format&fit=crop'),
  ('toys', 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=600&auto=format&fit=crop'),
  ('small-electric-bikes-scooters', 'https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=600&auto=format&fit=crop'),
  ('networking-internet', 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop')
) AS v(slug, url)
WHERE cat.slug = v.slug;

-- 2) 24 منتجاً في فئات فرعية + دمج مع الأقسام
INSERT INTO public.products (
  category_id, name, slug, description, price, discount_price, images,
  stock, is_active, is_featured, is_new, is_best_seller, sort_order,
  offer_ends_at, sold_count, low_stock_threshold, loyalty_points_enabled, created_at
)
SELECT
  c.id,
  v.name,
  v.slug,
  v.description,
  v.price,
  v.discount_price,
  v.images,
  v.stock,
  true,
  v.is_featured,
  v.is_new,
  v.is_best_seller,
  v.sort_order,
  CASE WHEN v.has_countdown THEN (now() + interval '7 days') ELSE NULL END,
  v.sold_count,
  v.low_stock_threshold,
  v.loyalty_points_enabled,
  now() - (v.days_old || ' days')::interval
FROM (VALUES
  ('refrigerators', 'ثلاجة نوفروست 14 قدم', 'DilMart-store-showcase-01',
    'تبريد سريع، رفوف زجاجية قوية، موفر للطاقة. مثالية للعائلة.'::text,
    1850000::numeric, 1590000::numeric, ARRAY['https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800&auto=format&fit=crop']::text[],
    8, true, true, true, 1, true, 420, 3, true, 0),
  ('washing-machines', 'غسالة أوتوماتيك 8 كغم', 'DilMart-store-showcase-02',
    'برنامج بخار، حماية للأقمشة، تشغيل هادئ.',
    980000, 849000, ARRAY['https://images.unsplash.com/photo-1626806787461-102c1bfaaea1?w=800&auto=format&fit=crop'],
    12, false, true, true, 2, true, 310, 4, true, 1),
  ('air-fryers', 'قلاية هوائية سعة 6 لتر', 'DilMart-store-showcase-03',
    'قلي صحي بدون زيت زائد، لوحة لمس، وصفات جاهزة.',
    245000, 199000, ARRAY['https://images.unsplash.com/photo-1585518269883-5f4b7b7c4c0a?w=800&auto=format&fit=crop'],
    25, true, true, true, 3, true, 180, 5, true, 2),
  ('microwave', 'ميكروويف 30 لتر مع شواية', 'DilMart-store-showcase-04',
    'تسخين متساوٍ، قفل أطفال، تصميم أنيق.',
    195000, NULL::numeric, ARRAY['https://images.unsplash.com/photo-1585659722903-038b5d6a1c5f?w=800&auto=format&fit=crop'],
    18, false, true, false, 4, false, 90, 5, true, 3),
  ('blenders-processors', 'خلاط قوي 1500 واط', 'DilMart-store-showcase-05',
    'أواني ترايتان، سرعات متعددة، مناسب للثلج.',
    125000, 99000, ARRAY['https://images.unsplash.com/photo-1570222094114-28a9d88a2ef5?w=800&auto=format&fit=crop'],
    30, true, false, true, 5, true, 240, 5, true, 4),
  ('coffee-machines', 'ماكينة قهوة اسبريسو', 'DilMart-store-showcase-06',
    'ضغط 15 بار، بخار للحليب، فلتر مدمج.',
    450000, 379000, ARRAY['https://images.unsplash.com/photo-1517912447953-e9a3b68019d0?w=800&auto=format&fit=crop'],
    10, true, true, true, 6, true, 150, 3, true, 5),
  ('pots-pans', 'طقم قدور جرانيت 10 قطع', 'DilMart-store-showcase-07',
    'غير لاصق، مقابض باردة، مناسب لجميع المواقد.',
    175000, NULL::numeric, ARRAY['https://images.unsplash.com/photo-1584990347449-a0846bf1e305?w=800&auto=format&fit=crop'],
    22, false, false, false, 7, false, 60, 5, true, 6),
  ('frying-pans', 'مقلاة عميقة 28 سم', 'DilMart-store-showcase-08',
    'جرانيت، غطاء زجاجي، توزيع حرارة ممتاز.',
    48000, 39000, ARRAY['https://images.unsplash.com/photo-1585672840563-f2af2ced94c7?w=800&auto=format&fit=crop'],
    40, true, false, true, 8, true, 95, 5, false, 7),
  ('vacuum-cleaners', 'مكنسة كهربائية 2200 واط', 'DilMart-store-showcase-09',
    'فلتر HEPA، خزان غبار كبير، ملحقات متعددة.',
    210000, 175000, ARRAY['https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800&auto=format&fit=crop'],
    14, true, true, true, 9, true, 275, 4, true, 8),
  ('cordless-vacuums', 'مكنسة لاسلكية خفيفة', 'DilMart-store-showcase-10',
    'بطارية تدوم 45 دقيقة، قاعدة شحن.',
    320000, NULL::numeric, ARRAY['https://images.unsplash.com/photo-1527515637462-cff94eecc1ac?w=800&auto=format&fit=crop'],
    9, false, true, false, 10, false, 88, 5, true, 9),
  ('electric-heaters', 'دفاية كهربائية 2000 واط', 'DilMart-store-showcase-11',
    'حماية من الانقلاب، 3 مستويات، صامتة.',
    135000, 115000, ARRAY['https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop'],
    20, true, false, true, 11, true, 130, 5, true, 10),
  ('air-conditioners', 'مبرد صحراوي متنقل', 'DilMart-store-showcase-12',
    'خزان ماء كبير، ريموت، مناسب للصيف.',
    185000, 159000, ARRAY['https://images.unsplash.com/photo-1585338447937-7082f8fc2d99?w=800&auto=format&fit=crop'],
    11, true, true, true, 12, true, 105, 4, true, 11),
  ('treadmills', 'جهاز مشي كهربائي', 'DilMart-store-showcase-13',
    'برامج متعددة، منحدر بسيط، شاشة LCD.',
    1250000, 1090000, ARRAY['https://images.unsplash.com/photo-1576678927484-cc907957088c?w=800&auto=format&fit=crop'],
    4, true, true, true, 13, true, 45, 2, true, 12),
  ('exercise-bikes', 'دراجة ثابتة مغناطيسية', 'DilMart-store-showcase-14',
    'مقاومة قابلة، مقعد مريح، عداد مدمج.',
    450000, NULL::numeric, ARRAY['https://images.unsplash.com/photo-1538805060514-97d9cc17730c?w=800&auto=format&fit=crop'],
    7, false, false, true, 14, false, 52, 5, true, 13),
  ('men-clothing', 'قميص كاجوال قطني', 'DilMart-store-showcase-15',
    'قصة عصرية، ألوان ثابتة، مقاسات متعددة.',
    35000, 28000, ARRAY['https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&auto=format&fit=crop'],
    60, true, false, true, 15, true, 410, 5, true, 14),
  ('women-clothing', 'فستان كاجوال نسائي', 'DilMart-store-showcase-16',
    'قماش ناعم، مناسب للمناسبات اليومية.',
    52000, NULL::numeric, ARRAY['https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=800&auto=format&fit=crop'],
    35, false, true, false, 16, false, 120, 5, true, 15),
  ('backpacks', 'حقيبة ظهر لابتوب 15.6', 'DilMart-store-showcase-17',
    'مقاومة للماء، جيوب منظمة، حزام مبطن.',
    78000, 65000, ARRAY['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&auto=format&fit=crop'],
    28, true, true, true, 17, true, 190, 5, true, 16),
  ('home-gifts', 'طقم هدايا شموع معطرة', 'DilMart-store-showcase-18',
    'تغليف فاخر، روائح هادئة، مناسب للتقديم.',
    45000, 35000, ARRAY['https://images.unsplash.com/photo-1513885535751-8b9238be345a?w=800&auto=format&fit=crop'],
    50, true, false, true, 18, true, 220, 5, true, 17),
  ('children-toys', 'سيارة تحكم عن بعد', 'DilMart-store-showcase-19',
    'بطارية قابلة للشحن، إضاءة LED، سهلة التحكم.',
    65000, NULL::numeric, ARRAY['https://images.unsplash.com/photo-1594787318286-3d835c1d207f?w=800&auto=format&fit=crop'],
    33, false, true, false, 19, false, 140, 5, true, 18),
  ('educational-toys', 'مكعبات تركيب تعليمية', 'DilMart-store-showcase-20',
    'تنمية المهارات، ألوان آمنة، 120 قطعة.',
    38000, 29000, ARRAY['https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800&auto=format&fit=crop'],
    45, true, false, true, 20, true, 95, 5, true, 19),
  ('electric-scooters', 'سكوتر كهربائي للأطفال', 'DilMart-store-showcase-21',
    'سرعة آمنة، مقعد قابل للتعديل، بطارية معتمدة.',
    195000, 169000, ARRAY['https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800&auto=format&fit=crop'],
    6, true, true, true, 21, true, 55, 3, true, 20),
  ('wifi-extenders', 'مقوي واي فاي ثنائي النطاق', 'DilMart-store-showcase-22',
    'تغطية أوسع، إعداد سهل عبر التطبيق.',
    85000, NULL::numeric, ARRAY['https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=800&auto=format&fit=crop'],
    24, false, true, true, 22, false, 170, 5, false, 21),
  ('routers-modems', 'راوتر واي فاي 6', 'DilMart-store-showcase-23',
    'سرعات عالية، منافذ جيجابت، أمان WPA3.',
    165000, 139000, ARRAY['https://images.unsplash.com/photo-1606904825846-647eb07f9be2?w=800&auto=format&fit=crop'],
    16, true, true, true, 23, true, 205, 4, true, 22),
  ('freezers', 'فريزر أفقي 300 لتر', 'DilMart-store-showcase-24',
    'تجميد سريع، قفل أمان، استهلاك منخفض.',
    1100000, 950000, ARRAY['https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=800&auto=format&fit=crop'],
    3, true, true, true, 24, true, 30, 2, true, 23)
) AS v(
  cat_slug, name, slug, description, price, discount_price, images,
  stock, is_featured, is_new, is_best_seller, sort_order, has_countdown,
  sold_count, low_stock_threshold, loyalty_points_enabled, days_old
)
JOIN public.categories c ON c.slug = v.cat_slug
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  discount_price = EXCLUDED.discount_price,
  images = EXCLUDED.images,
  stock = EXCLUDED.stock,
  is_featured = EXCLUDED.is_featured,
  is_new = EXCLUDED.is_new,
  is_best_seller = EXCLUDED.is_best_seller,
  sort_order = EXCLUDED.sort_order,
  offer_ends_at = EXCLUDED.offer_ends_at,
  sold_count = EXCLUDED.sold_count,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  loyalty_points_enabled = EXCLUDED.loyalty_points_enabled,
  category_id = EXCLUDED.category_id;

-- 3) عينات نفاد / مخزون منخفض
INSERT INTO public.products (
  category_id, name, slug, description, price, discount_price, images,
  stock, is_active, is_featured, is_new, is_best_seller, sort_order,
  offer_ends_at, sold_count, low_stock_threshold, loyalty_points_enabled
)
SELECT c.id,
  'عينة نفادت (عرض واجهة)', 'DilMart-store-showcase-oos',
  'منتج وهمي لاختبار شارة «نفد المخزون» في الواجهة.',
  50000, 35000,
  ARRAY['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop'],
  0, true, false, false, false, 100,
  now() + interval '5 days', 999, 1, true
FROM public.categories c WHERE c.slug = 'networking-internet' LIMIT 1
ON CONFLICT (slug) DO UPDATE SET
  stock = EXCLUDED.stock,
  discount_price = EXCLUDED.discount_price,
  offer_ends_at = EXCLUDED.offer_ends_at,
  category_id = EXCLUDED.category_id;

INSERT INTO public.products (
  category_id, name, slug, description, price, discount_price, images,
  stock, is_active, is_featured, is_new, is_best_seller, sort_order,
  offer_ends_at, sold_count, low_stock_threshold, loyalty_points_enabled
)
SELECT c.id,
  'عينة مخزون منخفض', 'DilMart-store-showcase-low-stock',
  'كمية قليلة لاختبار تنبيهات المخزون في لوحة التحكم.',
  25000, NULL,
  ARRAY['https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop'],
  2, true, false, true, false, 101,
  NULL, 5, 5, true
FROM public.categories c WHERE c.slug = 'gifts' LIMIT 1
ON CONFLICT (slug) DO UPDATE SET
  stock = EXCLUDED.stock,
  low_stock_threshold = EXCLUDED.low_stock_threshold,
  category_id = EXCLUDED.category_id;
