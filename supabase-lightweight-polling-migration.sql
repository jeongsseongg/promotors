-- 하루 종일 열린 관리자/채팅 화면이 전체 JSON을 반복 다운로드하지 않도록
-- 변경 시각만 가볍게 확인하는 RPC를 추가합니다.

begin;

create or replace function public.pm_booking_version(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  role_name text;
  version_value text;
begin
  select a.role into role_name
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
  limit 1;

  if role_name not in ('main', 'general') then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  select updated_at::text into version_value
  from public.site_data
  where data_key = 'pm-bookings';
  return coalesce(version_value, '');
end;
$$;

create or replace function public.pm_messages_version(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  account_ok boolean;
  version_value text;
begin
  select exists(
    select 1
    from public.pm_sessions s
    join public.pm_accounts a on a.login_id = s.login_id
    where s.token_hash = public.pm_token_hash(p_token)
      and s.expires_at > now()
      and a.active
  ) into account_ok;

  if not account_ok then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  select updated_at::text into version_value
  from public.site_data
  where data_key = 'pm-messages';
  return coalesce(version_value, '');
end;
$$;

revoke all on function public.pm_booking_version(text) from public;
revoke all on function public.pm_messages_version(text) from public;
grant execute on function public.pm_booking_version(text) to anon, authenticated;
grant execute on function public.pm_messages_version(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

select
  to_regprocedure('public.pm_booking_version(text)') is not null as booking_version_ready,
  to_regprocedure('public.pm_messages_version(text)') is not null as messages_version_ready;

