-- 긴급 보안 수정: 유효하지 않은 세션에서 role_name이 NULL일 때 관리자 검사를 통과하는 문제 차단
-- Supabase SQL Editor에서 파일 전체를 한 번 실행하세요. 기존 고객/예약/정비/메모 데이터는 변경하지 않습니다.

begin;

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
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active
  limit 1;
  if role_name is null or role_name not in ('main','general') then
    raise exception 'ADMIN_REQUIRED' using errcode='P0001';
  end if;
  if coalesce(p_key,'')='' or length(coalesce(p_asset->>'dataUrl',''))>2500000 then
    raise exception 'INVALID_ASSET' using errcode='P0001';
  end if;
  update public.site_data
  set payload=jsonb_set(case when jsonb_typeof(payload)='object' then payload else '{}'::jsonb end,array[p_key],p_asset,true),
      updated_at=now()
  where data_key='pm-assets';
  return jsonb_build_object('ok',true);
end
$$;

create or replace function public.pm_admin_accounts(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then
    raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',login_id,
      'label',coalesce(nullif(profile->>'label',''),'일반 관리자'),
      'branches',branches,
      'createdAt',created_at
    ) order by created_at)
    from public.pm_accounts where role='general' and active
  ),'[]'::jsonb);
end
$$;

create or replace function public.pm_admin_account_create(p_token text, p_password text, p_branches jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text; account_id text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then
    raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001';
  end if;
  if length(coalesce(p_password,''))<10 or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'WEAK_PASSWORD' using errcode='P0001';
  end if;
  account_id := '__general__' || encode(digest(p_password || encode(gen_random_bytes(8),'hex'),'sha256'),'hex');
  insert into public.pm_accounts(login_id,password_hash,role,branches,profile)
  values(account_id,crypt(p_password,gen_salt('bf',11)),'general',coalesce(p_branches,'[]'::jsonb),jsonb_build_object('label','일반 관리자'));
  return jsonb_build_object('ok',true,'id',account_id);
end
$$;

create or replace function public.pm_admin_account_branches(p_token text, p_account_id text, p_branches jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then
    raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001';
  end if;
  update public.pm_accounts set branches=coalesce(p_branches,'[]'::jsonb),updated_at=now()
  where login_id=p_account_id and role='general';
  return jsonb_build_object('ok',found);
end
$$;

create or replace function public.pm_admin_account_delete(p_token text, p_account_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then
    raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001';
  end if;
  delete from public.pm_accounts where login_id=p_account_id and role='general';
  return jsonb_build_object('ok',found);
end
$$;

-- CREATE OR REPLACE 후에도 기존 권한은 유지되지만 명시적으로 재고정합니다.
revoke all on function public.pm_asset_put(text,text,jsonb) from public;
revoke all on function public.pm_admin_accounts(text) from public;
revoke all on function public.pm_admin_account_create(text,text,jsonb) from public;
revoke all on function public.pm_admin_account_branches(text,text,jsonb) from public;
revoke all on function public.pm_admin_account_delete(text,text) from public;

grant execute on function public.pm_asset_put(text,text,jsonb) to anon, authenticated;
grant execute on function public.pm_admin_accounts(text) to anon, authenticated;
grant execute on function public.pm_admin_account_create(text,text,jsonb) to anon, authenticated;
grant execute on function public.pm_admin_account_branches(text,text,jsonb) to anon, authenticated;
grant execute on function public.pm_admin_account_delete(text,text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- 실행 후 아래 결과는 role_check='PASS'여야 합니다.
select case
  when position('is distinct from ''main''' in pg_get_functiondef('public.pm_admin_accounts(text)'::regprocedure)) > 0
   and position('role_name is null' in pg_get_functiondef('public.pm_asset_put(text,text,jsonb)'::regprocedure)) > 0
  then 'PASS' else 'FAIL'
end as role_check;
