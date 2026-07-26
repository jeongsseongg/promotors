-- 기존 public.pm_assets의 base64 사진을 Storage로 옮기기 위한 1회용 키 목록 RPC입니다.
-- 사진 본문을 한꺼번에 반환하지 않고, 아직 Storage에 없는 키만 관리자에게 반환합니다.

begin;

create or replace function public.pm_legacy_asset_keys(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  if not public.pm_storage_is_admin(p_token) then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(a.asset_key order by a.asset_key), '[]'::jsonb)
  into result
  from public.pm_assets a
  where not exists (
    select 1
    from storage.objects o
    where o.bucket_id = case
      when a.asset_key ~ '^(branch|notice|case|intro|event)-' then 'promotors-public'
      else 'promotors-private'
    end
      and o.name = a.asset_key
  );

  return result;
end;
$$;

revoke all on function public.pm_legacy_asset_keys(text) from public;
grant execute on function public.pm_legacy_asset_keys(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

select
  (select count(*) from public.pm_assets) as 기존_DB_사진,
  (select count(*) from storage.objects where bucket_id in ('promotors-public','promotors-private')) as 이전된_Storage_사진;

