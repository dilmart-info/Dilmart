-- Fix broken demo product image for Men's Shaver (Attempt 3)

UPDATE public.products 
SET images = ARRAY['https://images.unsplash.com/photo-1599351431202-6e0c0a3d47cd?auto=format&fit=crop&w=600&q=80'] 
WHERE slug = 'mens-shaver';
