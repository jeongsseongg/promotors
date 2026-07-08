-- Promotors website Supabase schema
-- Run this in Supabase SQL Editor before entering Project URL / anon key in the site.

create table if not exists public.site_data (
  data_key text primary key,
  payload jsonb not null,
  page_url text,
  updated_at timestamptz not null default now()
);

create table if not exists public.site_logs (
  id bigserial primary key,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  page_url text,
  created_at timestamptz not null default now()
);

alter table public.site_data enable row level security;
alter table public.site_logs enable row level security;

drop policy if exists "public read site data" on public.site_data;
create policy "public read site data"
on public.site_data
for select
to anon
using (true);

drop policy if exists "public upsert site data" on public.site_data;
create policy "public upsert site data"
on public.site_data
for insert
to anon
with check (true);

drop policy if exists "public update site data" on public.site_data;
create policy "public update site data"
on public.site_data
for update
to anon
using (true)
with check (true);

drop policy if exists "public insert site logs" on public.site_logs;
create policy "public insert site logs"
on public.site_logs
for insert
to anon
with check (true);
