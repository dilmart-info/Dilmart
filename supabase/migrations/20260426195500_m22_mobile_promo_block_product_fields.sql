-- M22: Mobile promo block product controls
-- Adds product-level controls so admin can choose which products appear in the mobile promo block
-- and optionally upload a dedicated promo image sized for that block.

alter table public.products
  add column if not exists is_mobile_promo boolean not null default false,
  add column if not exists mobile_promo_image_url text null;

comment on column public.products.is_mobile_promo is
  'When true, product can appear in mobile promo offers block on homepage.';

comment on column public.products.mobile_promo_image_url is
  'Optional dedicated image for mobile promo block. Recommended 1400x600 (ratio ~ 7:3).';
