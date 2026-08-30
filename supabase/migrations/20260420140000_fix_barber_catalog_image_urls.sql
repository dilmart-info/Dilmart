-- إصلاح صور أقسام/منتجات لا تُحمَّل (روابط Unsplash قديمة أو معرفات منتهية)
-- طبّق على المشروع المرتبط: supabase db push

-- أقسام الصفحة الرئيسية: روابط موثوقة (صالون / أدوات / تجميل)
UPDATE public.categories
SET image_url = 'https://images.unsplash.com/photo-1516975080664-ed2fc6a32937?w=800&q=85&auto=format&fit=crop'
WHERE slug = 'women-salon-styling';

UPDATE public.categories
SET image_url = 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=800&q=85&auto=format&fit=crop'
WHERE slug = 'sanitation-disposables';

UPDATE public.categories
SET image_url = 'https://images.unsplash.com/photo-1596462502278-27bfdd403348?w=800&q=85&auto=format&fit=crop'
WHERE slug = 'pro-hair-color-care';

UPDATE public.categories
SET image_url = 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=85&auto=format&fit=crop'
WHERE slug = 'salon-accessories';

-- منتج «مشط تثبيت تسريحات» وغيره إن وُجدت نفس المعرف المعطوب
UPDATE public.products
SET images = ARRAY['https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=85&auto=format&fit=crop']::text[]
WHERE slug = 'DilMart-salon-section-clips-01';

-- استبدال معرفات صور شائعة العطب داخل مصفوفة الصور (منتج بصورة واحدة غالباً)
UPDATE public.products
SET images = ARRAY['https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=85&auto=format&fit=crop']::text[]
WHERE images IS NOT NULL AND array_length(images, 1) = 1 AND images[1] LIKE '%photo-1527799820374%';

UPDATE public.products
SET images = ARRAY['https://images.unsplash.com/photo-1596462502278-27bfdd403348?w=800&q=85&auto=format&fit=crop']::text[]
WHERE images IS NOT NULL AND array_length(images, 1) = 1 AND images[1] LIKE '%photo-1560066989%';

UPDATE public.products
SET images = ARRAY['https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=85&auto=format&fit=crop']::text[]
WHERE images IS NOT NULL AND array_length(images, 1) = 1 AND images[1] LIKE '%photo-1584483766114%';

UPDATE public.products
SET images = ARRAY['https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800&q=85&auto=format&fit=crop']::text[]
WHERE images IS NOT NULL AND array_length(images, 1) = 1 AND images[1] LIKE '%photo-1582735689369%';

UPDATE public.products
SET images = ARRAY['https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=800&q=85&auto=format&fit=crop']::text[]
WHERE images IS NOT NULL AND array_length(images, 1) = 1 AND images[1] LIKE '%photo-1562322140%';
