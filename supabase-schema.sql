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

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  password_hash text,
  name text not null,
  car_name text,
  car_number text unique,
  phone text,
  email text,
  address text,
  role text not null default 'customer',
  created_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  branch text not null,
  booking_date date not null,
  booking_time text not null,
  services jsonb not null default '[]'::jsonb,
  memo text,
  status text not null default '예약',
  amount numeric default 0,
  pay_type text,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_records (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  service_date date not null default current_date,
  service text not null,
  amount numeric default 0,
  pay_type text,
  paid boolean not null default false,
  memo text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_memos (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  memo text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete cascade,
  sender text not null check (sender in ('customer', 'admin')),
  message text not null,
  service_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  price_text text,
  description text,
  link text,
  workflow_steps text[] not null default array['입고','작업','출고'],
  created_at timestamptz not null default now()
);

create table if not exists public.service_runs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  car_number text,
  service_name text not null,
  reason text,
  current_step integer not null default 0,
  status text not null default '진행중',
  created_at timestamptz not null default now()
);

create table if not exists public.service_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.service_runs(id) on delete cascade,
  step_order integer not null,
  step_name text not null,
  photo_urls text[] not null default '{}',
  memo text,
  approved boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.site_data enable row level security;
alter table public.site_logs enable row level security;
alter table public.members enable row level security;
alter table public.bookings enable row level security;
alter table public.customer_records enable row level security;
alter table public.customer_memos enable row level security;
alter table public.messages enable row level security;
alter table public.products enable row level security;
alter table public.service_runs enable row level security;
alter table public.service_steps enable row level security;

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

do $$
declare
  t text;
begin
  foreach t in array array[
    'members',
    'bookings',
    'customer_records',
    'customer_memos',
    'messages',
    'products',
    'service_runs',
    'service_steps'
  ]
  loop
    execute format('drop policy if exists "public read %1$s" on public.%1$I', t);
    execute format('create policy "public read %1$s" on public.%1$I for select to anon using (true)', t);
    execute format('drop policy if exists "public insert %1$s" on public.%1$I', t);
    execute format('create policy "public insert %1$s" on public.%1$I for insert to anon with check (true)', t);
    execute format('drop policy if exists "public update %1$s" on public.%1$I', t);
    execute format('create policy "public update %1$s" on public.%1$I for update to anon using (true) with check (true)', t);
    execute format('drop policy if exists "public delete %1$s" on public.%1$I', t);
    execute format('create policy "public delete %1$s" on public.%1$I for delete to anon using (true)', t);
  end loop;
end $$;
