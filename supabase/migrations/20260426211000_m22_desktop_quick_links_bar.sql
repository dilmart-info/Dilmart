-- M22: Desktop quick links bar (21vek-like strip under desktop header)

create table if not exists public.desktop_quick_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  href text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists desktop_quick_links_sort_idx
  on public.desktop_quick_links (is_active, sort_order, created_at);

create or replace function public.set_desktop_quick_links_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_desktop_quick_links_updated_at on public.desktop_quick_links;
create trigger trg_desktop_quick_links_updated_at
before update on public.desktop_quick_links
for each row
execute procedure public.set_desktop_quick_links_updated_at();

alter table public.desktop_quick_links enable row level security;

drop policy if exists "desktop_quick_links_public_read_active" on public.desktop_quick_links;
create policy "desktop_quick_links_public_read_active"
on public.desktop_quick_links
for select
using (is_active = true);

drop policy if exists "desktop_quick_links_admin_all" on public.desktop_quick_links;
create policy "desktop_quick_links_admin_all"
on public.desktop_quick_links
for all
using (public.is_admin())
with check (public.is_admin());

insert into public.desktop_quick_links (label, href, sort_order, is_active)
select * from (
  values
    ('كل العروض', '/offers', 1, true),
    ('العناية الرجالية', '/products?search=%D8%AD%D9%84%D8%A7%D9%82%D8%A9', 2, true),
    ('أدوات الصالونات النسائية', '/products?search=%D8%B5%D8%A7%D9%84%D9%88%D9%86%D8%A7%D8%AA%20%D9%86%D8%B3%D8%A7%D8%A6%D9%8A%D8%A9', 3, true),
    ('الأحدث', '/products?sort=newest', 4, true),
    ('الأكثر مبيعاً', '/products', 5, true)
) as seed(label, href, sort_order, is_active)
where not exists (select 1 from public.desktop_quick_links);
