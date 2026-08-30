-- M31: Allow barber_app_checkout in orders.channel check constraint (Phase 5A)
--
-- Phase 5A cart checkout writes channel = 'barber_app_checkout' via place_order (M30).
-- M9 added orders_channel_check allowing only web/whatsapp/manual channels.
-- Without this migration, place_order INSERT fails with a check constraint violation → HTTP 500.

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_channel_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_channel_check
  CHECK (channel IN (
    'web_checkout',
    'whatsapp_assisted',
    'manual_assisted',
    'barber_app_checkout'
  ));
