UPDATE public.products 
SET images = ARRAY[
    '/products/hyderon/_HYDERON_(1).jpg',
    '/products/hyderon/_HYDERON_(2).jpg',
    '/products/hyderon/_HYDERON_(3).jpg',
    '/products/hyderon/_HYDERON_(4).jpg',
    '/products/hyderon/_HYDERON_(5).jpg',
    '/products/hyderon/_HYDERON_(6).jpg',
    '/products/hyderon/_HYDERON_(7).jpg'
]
WHERE slug = 'hyderon-sealing-strip-5m';
