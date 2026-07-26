-- 관리자·개발자 활동은 저장하지 않고, 기존 관리자 세션 로그도 제거합니다.
begin;

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

  select a.login_id, a.role into verified_member, verified_role
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
  limit 1;

  -- 관리자와 개발자는 방문·클릭·체류 로그를 서버에 남기지 않습니다.
  if verified_role in ('main', 'general') then return true; end if;

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

create or replace function public.pm_activity_forget_admin_session(
  p_token text,
  p_session_id text
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  admin_ok boolean;
  removed integer := 0;
begin
  select coalesce(bool_or(a.role in ('main', 'general')), false)
  into admin_ok
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active;

  if not admin_ok then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;
  if length(coalesce(p_session_id, '')) < 8 then return 0; end if;

  delete from public.site_logs
  where payload->>'sessionId' = p_session_id;
  get diagnostics removed = row_count;
  return removed;
end
$$;

-- 기존 관리자 로그와, 로그인 전에 같은 세션에서 쌓인 로그를 함께 제거합니다.
delete from public.site_logs
where actor_role in ('main', 'general')
   or payload->>'sessionId' in (
     select distinct payload->>'sessionId'
     from public.site_logs
     where actor_role in ('main', 'general')
       and coalesce(payload->>'sessionId', '') <> ''
   );

revoke all on function public.pm_log_v2(text, jsonb, text, text) from public;
revoke all on function public.pm_activity_forget_admin_session(text, text) from public;
grant execute on function public.pm_log_v2(text, jsonb, text, text) to anon, authenticated;
grant execute on function public.pm_activity_forget_admin_session(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
commit;

select count(*) as 남아있는_관리자_로그
from public.site_logs
where actor_role in ('main', 'general')
   or coalesce(payload->>'view', '') like 'adm-%';
