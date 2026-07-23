-- VL Body Lab CMS — first-time setup
-- Run this once in VL Body Lab CMS > SQL Editor.
-- This project is independent from Echelon and only luther.casimir@gmail.com
-- is allowed to manage CMS content.

create extension if not exists pgcrypto;

create table if not exists public.brand_content_items (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'vl-body-lab',
  placement text not null check (placement in ('homepage','lab','shop','etsy','essentials','creator','travel','updates')),
  status text not null default 'Draft' check (status in ('Draft','Published','Scheduled')),
  eyebrow text,
  title text not null,
  body text,
  cta_label text,
  cta_url text,
  image_url text,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > publish_at)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists brand_content_items_set_updated_at on public.brand_content_items;
create trigger brand_content_items_set_updated_at
before update on public.brand_content_items
for each row execute function public.set_updated_at();

-- Only the named VL Body Lab operator can write CMS records.
create or replace function public.is_vl_body_lab_admin()
returns boolean language sql stable security definer set search_path = auth, public as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid() and lower(email) = 'luther.casimir@gmail.com'
  );
$$;

alter table public.brand_content_items enable row level security;

drop policy if exists "Public can view active VL content" on public.brand_content_items;
create policy "Public can view active VL content"
on public.brand_content_items for select to anon, authenticated
using (
  brand = 'vl-body-lab'
  and status in ('Published','Scheduled')
  and publish_at <= now()
  and (expires_at is null or expires_at > now())
);

drop policy if exists "VL admin manages content" on public.brand_content_items;
create policy "VL admin manages content"
on public.brand_content_items for all to authenticated
using ((select public.is_vl_body_lab_admin()))
with check ((select public.is_vl_body_lab_admin()));

grant usage on schema public to anon, authenticated;
grant select on public.brand_content_items to anon, authenticated;
grant insert, update, delete on public.brand_content_items to authenticated;

create table if not exists public.brand_media_assets (
  id uuid primary key default gen_random_uuid(),
  brand text not null default 'vl-body-lab',
  target text not null,
  image_url text not null,
  alt_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand, target)
);

drop trigger if exists brand_media_assets_set_updated_at on public.brand_media_assets;
create trigger brand_media_assets_set_updated_at before update on public.brand_media_assets
for each row execute function public.set_updated_at();
alter table public.brand_media_assets enable row level security;
create policy "Public can view VL image replacements" on public.brand_media_assets for select to anon, authenticated using (brand = 'vl-body-lab');
create policy "VL admin manages image replacements" on public.brand_media_assets for all to authenticated using ((select public.is_vl_body_lab_admin())) with check ((select public.is_vl_body_lab_admin()));
grant select on public.brand_media_assets to anon, authenticated;
grant insert, update, delete on public.brand_media_assets to authenticated;
