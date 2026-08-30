-- Pilot 10 rollback (DO NOT RUN automatically)
-- Scoped exclusively to draft merchant + pilot SKUs.

-- Optional: export first
-- copy (select * from public.products
--   where merchant_id = 'ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7'
--     and merchant_sku in (
--       'ARD-1015','ARD-1042','ARD-1065','ARD-1172','ARD-1173',
--       'ARD-1191','ARD-3270','ARD-1826','ARD-2800','ARD-3723'
--     )) to stdout with csv header;

delete from public.products
where merchant_id = 'ac7c356b-bcdf-4700-b31f-c6d2c5b53ca7'
  and merchant_sku in (
    'ARD-1015',
    'ARD-1042',
    'ARD-1065',
    'ARD-1172',
    'ARD-1173',
    'ARD-1191',
    'ARD-3270',
    'ARD-1826',
    'ARD-2800',
    'ARD-3723'
  );
