# DilMart Store Integration — Data Model and Migration Direction

## 1. Goal

Add enough Store metadata to support native dynamic segmented marketplace behavior.

## 2. Product Metadata Additions

Suggested columns or related tables:

```sql
-- Product visibility/channel
visible_in text[] not null default array['web_store'];

-- Target audiences
 target_audience text[] not null default array['customer'];

-- Business type tags
business_type_tags text[] not null default array['all'];

-- Product use cases
product_use_case text null;

-- Purchase mode
purchase_mode text not null default 'retail';

-- Optional B2B flags
is_b2b_offer boolean not null default false;
requires_verified_salon boolean not null default false;
min_order_qty int null;
max_order_qty int null;
```

Use exact implementation style according to the current Store DB conventions. Arrays can be replaced by join tables if the current schema prefers normalized relations.

## 3. Suggested Enum Values

### visible_in

```txt
web_store
barber_app
customer_app
all
```

### target_audience

```txt
customer
barber_staff
salon_owner
professional_buyer
all
```

### business_type_tags

```txt
men_barbershop
women_salon
nail_studio
beauty_center
spa
all
```

### product_use_case

```txt
personal_tool
salon_equipment
consumable
furniture
professional_cosmetic
setup_package
wholesale
```

### purchase_mode

```txt
retail
b2b
wholesale
quote_request
```

## 4. Store Linked Profiles

```sql
create table store_linked_profiles (
  id uuid primary key default gen_random_uuid(),
  DilMart_user_id uuid null,
  DilMart_role text null,
  DilMart_barbershop_id uuid null,
  store_customer_id uuid null,
  segment text not null,
  display_name text null,
  phone text null,
  city text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_store_linked_profiles_DilMart_user_id
  on store_linked_profiles(DilMart_user_id);

create index idx_store_linked_profiles_barbershop_id
  on store_linked_profiles(DilMart_barbershop_id);
```

## 5. Store Orders Metadata

Store orders should include optional DilMart references:

```sql
DilMart_user_id uuid null;
DilMart_barbershop_id uuid null;
source_app text null;
segment text null;
business_type text null;
```

This enables reporting without moving orders into the Main DB.

## 6. Campaigns and Dynamic Layout

Recommended entities if not already present:

```txt
store_banners
store_campaigns
store_collections
store_home_sections
```

These should support:

```txt
placement = barber_app_home / web_home / customer_app_home
audience
business_type_tags
start_at
end_at
priority
status
```

## 7. Migration Principle

Do not block launch on a perfect CMS. Minimum acceptable first version:

- product audience fields
- business type tags
- visible_in
- dynamic barber home endpoint
- admin ability to assign visibility metadata

Everything else can be iterated.
