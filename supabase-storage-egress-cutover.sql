-- 2단계 최종 차단: Storage 이전과 새 프론트엔드 배포가 끝난 뒤에만 실행합니다.
-- 기존 pm_assets 테이블과 저장된 사진은 삭제하지 않습니다.

begin;

do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
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

  if missing_count > 0 then
    raise exception 'STORAGE_MIGRATION_INCOMPLETE: % assets are missing', missing_count;
  end if;
end;
$$;

create or replace function public.pm_asset_put(p_token text, p_key text, p_asset jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  raise exception 'ASSET_STORAGE_REQUIRED' using errcode = 'P0001';
end;
$$;

notify pgrst, 'reload schema';
commit;

select
  to_regclass('public.pm_assets') is not null as legacy_table_preserved,
  (select count(*) from public.pm_assets) as legacy_asset_count;
