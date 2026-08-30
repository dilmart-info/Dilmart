-- Fix broken demo product images (Attempt 2 with new URLs)

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1574269909862-7e1d70bb8078?auto=format&fit=crop&w=600&q=80'] 
WHERE slug = 'multi-function-blender';

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1520970014086-2208d157c9e2?auto=format&fit=crop&w=600&q=80'] 
WHERE slug = 'espresso-machine';

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1631214500115-598fc2cb8d2d?auto=format&fit=crop&w=600&q=80'] 
WHERE slug = 'makeup-brushes-set';

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1621607512214-68297f3190ef?auto=format&fit=crop&w=600&q=80'] 
WHERE slug = 'mens-shaver';
