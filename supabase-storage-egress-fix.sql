-- 1단계 준비: 이미지 base64 대신 사용할 Supabase Storage와 접근 정책을 만듭니다.
-- Supabase SQL Editor에서 이 파일 전체를 먼저 실행하세요.
-- 기존 pm_assets 데이터와 기존 pm_asset_put 함수는 그대로 보존합니다.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promotors-public', 'promotors-public', true, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'promotors-private', 'promotors-private', false, 5242880,
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.pm_storage_is_admin(p_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists(
    select 1
    from public.pm_sessions s
    join public.pm_accounts a on a.login_id = s.login_id
    where s.token_hash = public.pm_token_hash(p_token)
      and s.expires_at > now()
      and a.active
      and a.role in ('main', 'general')
  );
$$;

create or replace function public.pm_storage_can_read_private(p_key text, p_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  car_number text;
begin
  select a.* into account
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
  limit 1;

  if account.login_id is null then return false; end if;
  if account.role in ('main', 'general') then return true; end if;
  if account.role <> 'customer' then return false; end if;

  car_number := account.profile->>'car';
  return exists(
    select 1
    from public.site_data sd
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end
    ) run
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(run->'steps') = 'array' then run->'steps' else '[]'::jsonb end
    ) step
    where sd.data_key = 'pm-service-runs'
      and (run->>'memberId' = account.login_id or run->>'car' = car_number)
      and coalesce((step->>'approved')::boolean, false)
      and coalesce(step->'photoKeys', '[]'::jsonb) ? p_key
  );
end;
$$;

revoke all on function public.pm_storage_is_admin(text) from public;
revoke all on function public.pm_storage_can_read_private(text, text) from public;
grant execute on function public.pm_storage_is_admin(text) to anon, authenticated;
grant execute on function public.pm_storage_can_read_private(text, text) to anon, authenticated;

drop policy if exists "promotors public asset upload" on storage.objects;
create policy "promotors public asset upload"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'promotors-public'
  and public.pm_storage_is_admin(
    coalesce((nullif(current_setting('request.headers', true), '')::jsonb)->>'x-promotors-token', '')
  )
);

drop policy if exists "promotors private asset upload" on storage.objects;
create policy "promotors private asset upload"
on storage.objects for insert to anon, authenticated
with check (
  bucket_id = 'promotors-private'
  and public.pm_storage_is_admin(
    coalesce((nullif(current_setting('request.headers', true), '')::jsonb)->>'x-promotors-token', '')
  )
);

drop policy if exists "promotors private asset read" on storage.objects;
create policy "promotors private asset read"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'promotors-private'
  and public.pm_storage_can_read_private(
    name,
    coalesce((nullif(current_setting('request.headers', true), '')::jsonb)->>'x-promotors-token', '')
  )
);

notify pgrst, 'reload schema';
commit;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id in ('promotors-public', 'promotors-private')
order by id;
