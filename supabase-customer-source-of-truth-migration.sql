-- 고객관리 화면은 site_data의 복제본이 아니라 실제 로그인 계정(pm_accounts)을 원본으로 사용합니다.
begin;

create or replace function public.pm_customer_accounts(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  requester public.pm_accounts%rowtype;
begin
  select a.* into requester
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
  limit 1;

  if requester.login_id is null or requester.role not in ('main', 'general') then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;

  return coalesce((
    select jsonb_agg(
      (coalesce(a.profile, '{}'::jsonb) - 'password')
      || jsonb_build_object('id', a.login_id)
      order by a.created_at, a.login_id
    )
    from public.pm_accounts a
    where a.role = 'customer' and a.active
  ), '[]'::jsonb);
end
$$;

revoke all on function public.pm_customer_accounts(text) from public;
grant execute on function public.pm_customer_accounts(text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

-- 실행 확인: 현재 활성 고객 원본 수와 기존 화면 복제 목록 수를 비교합니다.
select
  (select count(*) from public.pm_accounts where role = 'customer' and active) as 실제_활성_고객,
  (select count(*)
     from public.site_data sd
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end
     ) item
    where sd.data_key = 'pm-members') as 기존_화면_목록,
  (select coalesce(jsonb_agg(
     jsonb_build_object('id', login_id, 'name', profile->>'name') order by created_at
   ), '[]'::jsonb)
     from public.pm_accounts
    where role = 'customer' and active) as 표시될_고객;
