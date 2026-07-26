-- 프로모터스 개발자 전용 실제 방문·행동 분석
-- Supabase SQL Editor에서 1회 실행합니다.
begin;

alter table public.site_logs
  add column if not exists ip_address inet,
  add column if not exists visitor_key text,
  add column if not exists user_agent text,
  add column if not exists referrer text,
  add column if not exists member_id text,
  add column if not exists actor_role text;

create index if not exists site_logs_created_at_idx on public.site_logs(created_at desc);
create index if not exists site_logs_visitor_created_idx on public.site_logs(visitor_key, created_at desc);
create index if not exists site_logs_member_created_idx on public.site_logs(member_id, created_at desc);

-- IP와 로그인 회원은 브라우저 payload를 신뢰하지 않고 Supabase 요청 헤더·세션에서 확인합니다.
create or replace function public.pm_log_v2(
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_page_url text default null,
  p_token text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  raw_ip text;
  client_ip inet;
  verified_member text;
  verified_role text;
  stable_visitor text;
begin
  if length(coalesce(p_event_type, '')) not between 1 and 80 then return false; end if;

  raw_ip := nullif(coalesce(
    headers->>'cf-connecting-ip',
    split_part(headers->>'x-forwarded-for', ',', 1),
    headers->>'x-real-ip'
  ), '');
  begin
    client_ip := trim(raw_ip)::inet;
  exception when invalid_text_representation then
    client_ip := null;
  end;

  select a.login_id, a.role into verified_member, verified_role
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
  limit 1;

  stable_visitor := case
    when client_ip is not null then encode(digest(client_ip::text, 'sha256'), 'hex')
    else null
  end;

  insert into public.site_logs(
    event_type, payload, page_url, ip_address, visitor_key,
    user_agent, referrer, member_id, actor_role
  ) values (
    p_event_type,
    coalesce(p_payload, '{}'::jsonb) - 'memberId',
    left(p_page_url, 500),
    client_ip,
    stable_visitor,
    left(headers->>'user-agent', 500),
    left(headers->>'referer', 500),
    verified_member,
    verified_role
  );

  return true;
end
$$;

create or replace function public.pm_activity_read_v2(
  p_token text,
  p_from timestamptz,
  p_to timestamptz,
  p_limit integer default 10000
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  developer_ok boolean;
  result jsonb;
  safe_from timestamptz;
  safe_to timestamptz;
begin
  select coalesce(bool_or(a.profile->>'developer' = 'true'), false)
  into developer_ok
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active;

  if not developer_ok then
    raise exception 'DEVELOPER_REQUIRED' using errcode = 'P0001';
  end if;

  safe_from := greatest(coalesce(p_from, now() - interval '30 days'), now() - interval '90 days');
  safe_to := least(coalesce(p_to, now()), now() + interval '1 day');
  if safe_from >= safe_to then
    raise exception 'INVALID_DATE_RANGE' using errcode = 'P0001';
  end if;

  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb)
  into result
  from (
    select id, event_type, payload, page_url, host(ip_address) as ip_address, visitor_key,
           user_agent, referrer, member_id, actor_role, created_at
    from public.site_logs
    where created_at >= safe_from and created_at < safe_to
    order by created_at desc
    limit least(greatest(coalesce(p_limit, 10000), 1), 10000)
  ) q;

  return result;
end
$$;

revoke all on function public.pm_log_v2(text, jsonb, text, text) from public;
revoke all on function public.pm_activity_read_v2(text, timestamptz, timestamptz, integer) from public;
grant execute on function public.pm_log_v2(text, jsonb, text, text) to anon, authenticated;
grant execute on function public.pm_activity_read_v2(text, timestamptz, timestamptz, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
