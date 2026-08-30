-- استبدال معرفات صور Unsplash لم تعد متوفرة (404) — كانت تظهر صوراً مكسورة بعد النشر
-- يُحدَّث كل من جدول المنتجات (مصفوفة images) وجدول الأقسام (image_url).

CREATE OR REPLACE FUNCTION public.DilMart_store_fix_unsplash_url(u text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE r text;
BEGIN
  IF u IS NULL OR length(trim(u)) = 0 THEN RETURN u; END IF;
  r := u;
  -- معرفات مُتحقق منها أنها تعيد 404؛ استبدالها بمعرفات تعمل (نفس أبنية unsplash.com)
  r := replace(r, 'photo-1585518269883-5f4b7b7c4c0a', 'photo-1556911220-bff31c812dba');
  r := replace(r, 'photo-1585659722903-038b5d6a1c5f', 'photo-1608039755401-742074f0548d');
  r := replace(r, 'photo-1570222094114-28a9d88a2ef5', 'photo-1608039755401-742074f0548d');
  r := replace(r, 'photo-1584990347449-a0846bf1e305', 'photo-1556910103-1c02745aae4d');
  r := replace(r, 'photo-1585672840563-f2af2ced94c7', 'photo-1556910103-1c02745aae4d');
  r := replace(r, 'photo-1585338447937-7082f8fc2d99', 'photo-1560472354-b33ff0c44a43');
  r := replace(r, 'photo-1599351431202-6e0c0a3d47cd', 'photo-1511707171634-5f897ff02aa9');
  r := replace(r, 'photo-1621607512214-68297f3190ef', 'photo-1511707171634-5f897ff02aa9');
  r := replace(r, 'photo-1585572886472-88746bea878c', 'photo-1574269909862-7e1d70bb8078');
  r := replace(r, 'photo-1522335208453-2cf36df48380', 'photo-1526170375885-4d8ecf77b99f');
  r := replace(r, 'photo-1616854580665-cd04d197607a', 'photo-1492144534655-ae79c964c9d7');
  r := replace(r, 'photo-1594910609325-1311b98b92b6', 'photo-1583454110551-21f2fa2afe61');
  RETURN r;
END;
$$;

UPDATE public.products
SET images = ARRAY(
  SELECT public.DilMart_store_fix_unsplash_url(x)
  FROM unnest(images) AS x
);

UPDATE public.categories
SET image_url = public.DilMart_store_fix_unsplash_url(image_url)
WHERE image_url IS NOT NULL AND image_url LIKE '%images.unsplash.com%';

DROP FUNCTION public.DilMart_store_fix_unsplash_url(text);
