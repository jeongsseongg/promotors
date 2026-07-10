-- Promotors site_data sync minimum patch
-- Run in Supabase SQL Editor if mobile cannot read shared images / notices / branches / cases.

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

alter table public.site_data enable row level security;

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
  ('pm-admin-notifications', '[]'::jsonb, 'https://www.promotors.kr/')
on conflict (data_key) do nothing;
