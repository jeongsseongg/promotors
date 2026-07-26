-- 작업사진 30장 확장용 이미지 저장소 정규화
-- 기존 public.site_data의 pm-assets JSON은 삭제하지 않고 pm_assets로 복사합니다.
-- Supabase SQL Editor에서 전체 실행한 뒤 마지막 확인 쿼리가 모두 true인지 확인하세요.

begin;

create table if not exists public.pm_assets (
  asset_key text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.pm_assets enable row level security;
revoke all on table public.pm_assets from public, anon, authenticated;

-- 기존 단일 JSON 이미지들을 키별 행으로 안전하게 복사합니다.
insert into public.pm_assets (asset_key, payload, updated_at)
select item.key, item.value, coalesce(sd.updated_at, now())
from public.site_data sd
cross join lateral jsonb_each(
  case when jsonb_typeof(sd.payload) = 'object' then sd.payload else '{}'::jsonb end
) item
where sd.data_key = 'pm-assets'
on conflict (asset_key) do nothing;

create or replace function public.pm_asset_get(p_key text, p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  car_number text;
  allowed boolean := false;
  asset jsonb;
begin
  if coalesce(p_key, '') = '' then return null; end if;

  select a.* into account
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
  limit 1;

  if account.role in ('main', 'general') then
    allowed := true;
  elsif p_key ~ '^(branch|notice|case|intro|event)-' then
    -- 홈페이지에 공개되는 이미지 키는 거대한 JSON 검색 없이 바로 허용합니다.
    allowed := true;
  elsif account.role = 'customer' then
    car_number := account.profile->>'car';
    select exists(
      select 1
      from public.site_data sd
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end
      ) x
      where sd.data_key in ('pm-service-runs', 'pm-messages')
        and (
          x->>'memberId' = account.login_id
          or x->>'car' = car_number
          or x#>>'{customer,id}' = account.login_id
          or x#>>'{customer,car}' = car_number
        )
        and x::text like '%' || to_jsonb(p_key)::text || '%'
    ) into allowed;
  end if;

  if not allowed then
    raise exception 'ASSET_FORBIDDEN' using errcode = 'P0001';
  end if;

  select a.payload into asset
  from public.pm_assets a
  where a.asset_key = p_key;

  -- 마이그레이션 전에 누락된 키가 있을 때만 기존 저장소를 한 번 조회합니다.
  if asset is null then
    select sd.payload->p_key into asset
    from public.site_data sd
    where sd.data_key = 'pm-assets';
  end if;
  return asset;
end
$$;

create or replace function public.pm_asset_put(p_token text, p_key text, p_asset jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
  limit 1;

  if role_name is null or role_name not in ('main', 'general') then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;
  if coalesce(p_key, '') = '' or length(coalesce(p_asset->>'dataUrl', '')) > 2500000 then
    raise exception 'INVALID_ASSET' using errcode = 'P0001';
  end if;

  insert into public.pm_assets (asset_key, payload, updated_at)
  values (p_key, p_asset, now())
  on conflict (asset_key) do update
    set payload = excluded.payload,
        updated_at = excluded.updated_at;

  return jsonb_build_object('ok', true);
end
$$;

revoke all on function public.pm_asset_get(text, text) from public;
revoke all on function public.pm_asset_put(text, text, jsonb) from public;
grant execute on function public.pm_asset_get(text, text) to anon, authenticated;
grant execute on function public.pm_asset_put(text, text, jsonb) to anon, authenticated;

commit;

select
  to_regclass('public.pm_assets') is not null as asset_table_exists,
  to_regprocedure('public.pm_asset_get(text,text)') is not null as asset_get_exists,
  to_regprocedure('public.pm_asset_put(text,text,jsonb)') is not null as asset_put_exists,
  (select count(*) from public.pm_assets) > 0 as existing_assets_migrated;
