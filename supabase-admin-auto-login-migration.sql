-- 관리자 자동로그인: 비밀번호 대신 30일 만료 세션 토큰을 발급합니다.
-- supabase-promotions-developer-migration.sql 적용 후 Supabase SQL Editor에서 1회 실행합니다.
begin;

create or replace function public.pm_admin_login(
  p_password text,
  p_remember boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  raw_token text;
  expiry timestamptz;
begin
  delete from public.pm_sessions where expires_at <= now();

  select * into account
  from public.pm_accounts
  where role in ('main', 'general')
    and active
    and password_hash = crypt(coalesce(p_password, ''), password_hash)
  order by case
    when profile->>'developer' = 'true' then 0
    when role = 'main' then 1
    else 2
  end
  limit 1;

  if account.login_id is null then
    raise exception 'INVALID_LOGIN' using errcode = 'P0001';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  expiry := now() + case
    when p_remember then interval '30 days'
    else interval '12 hours'
  end;

  insert into public.pm_sessions(token_hash, login_id, expires_at)
  values(public.pm_token_hash(raw_token), account.login_id, expiry);

  return jsonb_build_object(
    'token', raw_token,
    'expiresAt', expiry,
    'role', case
      when account.profile->>'developer' = 'true' then 'developer'
      else account.role
    end,
    'branches', account.branches,
    'profile', account.profile
  );
end
$$;

revoke all on function public.pm_admin_login(text, boolean) from public;
grant execute on function public.pm_admin_login(text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

select
  p.proname as 함수,
  pg_get_function_identity_arguments(p.oid) as 인자
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'pm_admin_login';
