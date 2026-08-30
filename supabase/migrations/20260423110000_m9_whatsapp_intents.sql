create table if not exists whatsapp_intents (
  id uuid primary key default gen_random_uuid(),
  intent_token text unique not null,
  merchant_id uuid not null references merchants(id) on delete cascade,
  product_id uuid null references products(id) on delete set null,
  cart_snapshot jsonb null,
  user_id uuid null references profiles(id) on delete set null,
  session_id text null,
  source_surface text not null check (source_surface in ('product', 'store', 'cart')),
  status text not null default 'CREATED' check (status in ('CREATED', 'OPENED', 'EXPIRED', 'CONVERTED')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  converted_order_id uuid null references orders(id) on delete set null
);

create index if not exists idx_whatsapp_intents_merchant on whatsapp_intents(merchant_id);
create index if not exists idx_whatsapp_intents_status on whatsapp_intents(status);
create index if not exists idx_whatsapp_intents_expires_at on whatsapp_intents(expires_at);

alter table orders
  add column if not exists channel text not null default 'web_checkout';

alter table orders
  add constraint orders_channel_check
  check (channel in ('web_checkout', 'whatsapp_assisted', 'manual_assisted'));

alter table orders
  add column if not exists whatsapp_intent_id uuid references whatsapp_intents(id) on delete set null;

alter table merchants
  add column if not exists whatsapp_restricted boolean not null default false;

alter table merchants
  add column if not exists direct_phone_visible boolean not null default false;
