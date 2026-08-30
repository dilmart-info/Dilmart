-- Fix broken demo product images

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1585572886472-88746bea878c?q=80&w=600&auto=format&fit=crop'] 
WHERE slug = 'multi-function-blender';

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1594910609325-1311b98b92b6?q=80&w=600&auto=format&fit=crop'] 
WHERE slug = 'espresso-machine';

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1522335208453-2cf36df48380?q=80&w=600&auto=format&fit=crop'] 
WHERE slug = 'makeup-brushes-set';

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1616854580665-cd04d197607a?q=80&w=600&auto=format&fit=crop'] 
WHERE slug = 'mens-shaver';
