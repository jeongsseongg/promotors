-- Promotors website Supabase schema
-- Run this in Supabase SQL Editor before entering Project URL / anon key in the site.

create extension if not exists pgcrypto;

create table if not exists public.site_data (
  data_key text primary key,
  payload jsonb not null,
  page_url text,
  updated_at timestamptz not null default now()
);

alter table public.site_data
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists page_url text,
  add column if not exists updated_at timestamptz not null default now();

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
  description text,
  workflow_steps text[] not null default array['입고','작업','출고'],
  workflow_config jsonb not null default '[
    {"name":"입고","photoRequired":true,"memoRequired":false,"approvalRequired":false},
    {"name":"작업","photoRequired":true,"memoRequired":false,"approvalRequired":false},
    {"name":"출고","photoRequired":true,"memoRequired":false,"approvalRequired":false}
  ]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.products
  drop column if exists price_text,
  drop column if exists link,
  add column if not exists workflow_config jsonb not null default '[
    {"name":"입고","photoRequired":true,"memoRequired":false,"approvalRequired":false},
    {"name":"작업","photoRequired":true,"memoRequired":false,"approvalRequired":false},
    {"name":"출고","photoRequired":true,"memoRequired":false,"approvalRequired":false}
  ]'::jsonb;

create table if not exists public.service_runs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references public.members(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  booking_key text,
  booking_date date,
  booking_time text,
  branch text,
  car_number text,
  customer_name text,
  customer_phone text,
  car_model text,
  service_name text not null,
  reason text,
  current_step integer not null default 0,
  status text not null default '입고 대기',
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.service_runs
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists booking_key text,
  add column if not exists booking_date date,
  add column if not exists booking_time text,
  add column if not exists branch text,
  add column if not exists customer_name text,
  add column if not exists customer_phone text,
  add column if not exists car_model text,
  add column if not exists completed_at timestamptz;

create table if not exists public.service_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.service_runs(id) on delete cascade,
  step_order integer not null,
  step_name text not null,
  photo_urls text[] not null default '{}',
  photo_required boolean not null default true,
  memo_required boolean not null default false,
  memo text,
  submitted boolean not null default false,
  submitted_at timestamptz,
  approved boolean not null default false,
  approved_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now()
);

alter table public.service_steps
  add column if not exists photo_required boolean not null default true,
  add column if not exists memo_required boolean not null default false,
  add column if not exists submitted boolean not null default false,
  add column if not exists submitted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists reject_reason text;

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('main', 'general')),
  password_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  setting_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (setting_key, payload)
values
  ('home_view', '{"view":"intro"}'::jsonb),
  ('realtime_service', '{"enabled":true}'::jsonb)
on conflict (setting_key) do nothing;

create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  read boolean not null default false,
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
alter table public.admin_accounts enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_notifications enable row level security;

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

drop policy if exists "public delete site data" on public.site_data;
create policy "public delete site data"
on public.site_data
for delete
to anon
using (true);

insert into public.site_data (data_key, payload, page_url)
values
  ('pm-branches', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-notices', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('promotors-cases', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-products', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-blocked', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-customers', '{}'::jsonb, 'https://www.promotors.kr/'),
  ('pm-bookings', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-members', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-blog-settings', '{"url":"https://blog.naver.com/lsh861124","rss":"https://rss.blog.naver.com/lsh861124.xml","proxy":"https://promotors-site.pages.dev/api/naver-blog?url=","imageProxy":"https://promotors-site.pages.dev/api/naver-blog?img="}'::jsonb, 'https://www.promotors.kr/'),
  ('pm-intro-slides', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-assets', '{}'::jsonb, 'https://www.promotors.kr/'),
  ('pm-service-runs', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-messages', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-sub-admin', '{"password":"","accounts":[]}'::jsonb, 'https://www.promotors.kr/'),
  ('pm-main-admin', '{"password":"goodpro1!"}'::jsonb, 'https://www.promotors.kr/'),
  ('pm-security-settings', '{"password":"tmdgus123"}'::jsonb, 'https://www.promotors.kr/'),
  ('pm-home-view', '"intro"'::jsonb, 'https://www.promotors.kr/'),
  ('pm-admin-notifications', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-work-audit', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-banned-members', '[]'::jsonb, 'https://www.promotors.kr/'),
  ('pm-event-banners', '[]'::jsonb, 'https://www.promotors.kr/')
on conflict (data_key) do nothing;

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
    'service_steps',
    'admin_accounts',
    'site_settings',
    'admin_notifications'
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
