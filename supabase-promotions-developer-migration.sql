-- 프로모터스 쿠폰·이벤트·개발자 활동 로그 마이그레이션
-- supabase-security-migration.sql 적용 후 Supabase SQL Editor에서 1회 실행합니다.
begin;

insert into public.site_data(data_key, payload, page_url, updated_at)
values ('pm-promotions', '{"coupons":[],"assignments":[],"couponUsage":[],"events":[],"entries":[]}'::jsonb, 'https://www.promotors.kr/', now())
on conflict (data_key) do nothing;

-- 개발자 비밀번호 원문은 저장하지 않습니다. 아래에는 bcrypt 해시만 존재합니다.
insert into public.pm_accounts(login_id, password_hash, role, branches, profile, active, updated_at)
values (
  '__developer__',
  '$2a$12$nJqUnv0nObtPkoux8faCFefVqeT/40eWx0ecY0Ads5Snih6jcVmmm',
  'main', '[]'::jsonb, '{"developer":true,"label":"개발자"}'::jsonb, true, now()
)
on conflict (login_id) do update
set password_hash=excluded.password_hash, role='main', profile=excluded.profile, active=true, updated_at=now();

create or replace function public.pm_admin_login(p_password text)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare account public.pm_accounts%rowtype; raw_token text; expiry timestamptz := now()+interval '12 hours';
begin
  delete from public.pm_sessions where expires_at<=now();
  select * into account from public.pm_accounts
  where role in ('main','general') and active
    and password_hash=crypt(coalesce(p_password,''),password_hash)
  order by case when profile->>'developer'='true' then 0 when role='main' then 1 else 2 end limit 1;
  if account.login_id is null then raise exception 'INVALID_LOGIN' using errcode='P0001'; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.pm_sessions(token_hash,login_id,expires_at) values(public.pm_token_hash(raw_token),account.login_id,expiry);
  return jsonb_build_object('token',raw_token,'expiresAt',expiry,'role',case when account.profile->>'developer'='true' then 'developer' else account.role end,'branches',account.branches,'profile',account.profile);
end $$;

create or replace function public.pm_is_developer(p_token text)
returns boolean language sql security definer set search_path=public,extensions as $$
  select coalesce(bool_or(a.profile->>'developer'='true'),false)
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active
$$;

create or replace function public.pm_promo_read(p_token text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare account public.pm_accounts%rowtype; state jsonb; clean jsonb; month_day text; coupon jsonb;
begin
  select a.* into account from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if account.login_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  select payload into state from public.site_data where data_key='pm-promotions' for update;
  state:=coalesce(state,'{"coupons":[],"assignments":[],"couponUsage":[],"events":[],"entries":[]}'::jsonb);
  if account.role in ('main','general') then return state; end if;

  month_day:=substring(coalesce(account.profile->>'birthday','') from 6 for 5);
  if month_day=to_char(current_date,'MM-DD') then
    for coupon in select value from jsonb_array_elements(coalesce(state->'coupons','[]'::jsonb))
    loop
      if coalesce((coupon->>'birthday')::boolean,false)
         and current_date between (coupon->>'startDate')::date and (coupon->>'endDate')::date
         and not exists(select 1 from jsonb_array_elements(coalesce(state->'assignments','[]'::jsonb)) a where a->>'memberId'=account.login_id and a->>'couponId'=coupon->>'id' and left(a->>'issuedAt',4)=to_char(current_date,'YYYY')) then
        state:=jsonb_set(state,'{assignments}',coalesce(state->'assignments','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id','birthday-'||account.login_id||'-'||coupon->>'id'||'-'||to_char(current_date,'YYYY'),'couponId',coupon->>'id','memberId',account.login_id,'customerName',account.profile->>'name','issuedAt',now())));
      end if;
    end loop;
    update public.site_data set payload=state,updated_at=now() where data_key='pm-promotions';
  end if;
  clean:=jsonb_build_object(
    'coupons',state->'coupons',
    'assignments',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(state->'assignments','[]'::jsonb)) x where x->>'memberId'=account.login_id),'[]'::jsonb),
    'couponUsage',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(state->'couponUsage','[]'::jsonb)) x where x->>'memberId'=account.login_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(x-'numbers') from jsonb_array_elements(coalesce(state->'events','[]'::jsonb)) x where coalesce(x->>'status','draft')='published'),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(state->'entries','[]'::jsonb)) x where x->>'memberId'=account.login_id),'[]'::jsonb)
  );
  return clean;
end $$;

create or replace function public.pm_promo_write(p_token text,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare account public.pm_accounts%rowtype;
begin
  select a.* into account from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if account.role is distinct from 'main' then raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001'; end if;
  insert into public.site_data(data_key,payload,page_url,updated_at) values('pm-promotions',p_payload,'https://www.promotors.kr/',now())
  on conflict(data_key) do update set payload=excluded.payload,updated_at=now();
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.pm_coupon_use(p_token text,p_assignment_id text,p_branch text default '매장 방문')
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare account public.pm_accounts%rowtype; state jsonb; assignment jsonb; coupon jsonb; next_assignments jsonb;
begin
  select a.* into account from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if account.login_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  select payload into state from public.site_data where data_key='pm-promotions' for update;
  select x into assignment from jsonb_array_elements(coalesce(state->'assignments','[]'::jsonb)) x where x->>'id'=p_assignment_id and (account.role='main' or x->>'memberId'=account.login_id) limit 1;
  if assignment is null then raise exception 'COUPON_NOT_FOUND' using errcode='P0001'; end if;
  select x into coupon from jsonb_array_elements(coalesce(state->'coupons','[]'::jsonb)) x where x->>'id'=assignment->>'couponId' limit 1;
  select coalesce(jsonb_agg(x),'[]'::jsonb) into next_assignments from jsonb_array_elements(coalesce(state->'assignments','[]'::jsonb)) x where x->>'id'<>p_assignment_id;
  state:=jsonb_set(state,'{assignments}',next_assignments);
  state:=jsonb_set(state,'{couponUsage}',coalesce(state->'couponUsage','[]'::jsonb)||jsonb_build_array(assignment||jsonb_build_object('couponName',coupon->>'name','couponCode',coupon->>'code','usedAt',now(),'usedBranch',left(coalesce(p_branch,'매장 방문'),80),'usedBy',account.login_id)));
  update public.site_data set payload=state,updated_at=now() where data_key='pm-promotions';
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.pm_event_enter(p_token text,p_event_id text,p_numbers jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare account public.pm_accounts%rowtype; state jsonb; event_item jsonb; sorted_numbers jsonb; winning_numbers jsonb; winner boolean := false;
begin
  select a.* into account from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active and a.role='customer' limit 1;
  if account.login_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  select payload into state from public.site_data where data_key='pm-promotions' for update;
  if exists(select 1 from jsonb_array_elements(coalesce(state->'entries','[]'::jsonb)) x where x->>'eventId'=p_event_id and x->>'memberId'=account.login_id) then raise exception 'ALREADY_ENTERED' using errcode='P0001'; end if;
  select x into event_item from jsonb_array_elements(coalesce(state->'events','[]'::jsonb)) x where x->>'id'=p_event_id and coalesce(x->>'status','draft')='published' and current_date between (x->>'startDate')::date and (x->>'endDate')::date limit 1;
  if event_item is null then raise exception 'EVENT_NOT_ACTIVE' using errcode='P0001'; end if;
  select jsonb_agg(v order by v) into sorted_numbers from (select (value::text)::int v from jsonb_array_elements(p_numbers)) s;
  if jsonb_array_length(coalesce(event_item->'numbers','[]'::jsonb))=6 then
    select jsonb_agg(v order by v) into winning_numbers from (select (value::text)::int v from jsonb_array_elements(event_item->'numbers')) s;
    winner:=sorted_numbers=winning_numbers;
  end if;
  state:=jsonb_set(state,'{entries}',coalesce(state->'entries','[]'::jsonb)||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'eventId',p_event_id,'memberId',account.login_id,'customerName',account.profile->>'name','numbers',sorted_numbers,'winner',winner,'prize',event_item->>'prize','enteredAt',now())));
  update public.site_data set payload=state,updated_at=now() where data_key='pm-promotions';
  return jsonb_build_object('ok',true,'winner',winner,'prize',case when winner then event_item->>'prize' else null end);
end $$;

create or replace function public.pm_activity_read(p_token text,p_days integer default 30,p_limit integer default 3000)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare developer_ok boolean; result jsonb;
begin
  select coalesce(bool_or(a.profile->>'developer'='true'),false) into developer_ok from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active;
  if not developer_ok then raise exception 'DEVELOPER_REQUIRED' using errcode='P0001'; end if;
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (select id,event_type,payload,page_url,created_at from public.site_logs where created_at>=now()-make_interval(days=>least(greatest(p_days,1),90)) order by created_at desc limit least(greatest(p_limit,1),5000)) q;
  return result;
end $$;

revoke all on function public.pm_is_developer(text) from public;
revoke all on function public.pm_promo_read(text) from public;
revoke all on function public.pm_promo_write(text,jsonb) from public;
revoke all on function public.pm_coupon_use(text,text,text) from public;
revoke all on function public.pm_event_enter(text,text,jsonb) from public;
revoke all on function public.pm_activity_read(text,integer,integer) from public;
grant execute on function public.pm_is_developer(text), public.pm_promo_read(text), public.pm_promo_write(text,jsonb), public.pm_coupon_use(text,text,text), public.pm_event_enter(text,text,jsonb), public.pm_activity_read(text,integer,integer) to anon,authenticated;

notify pgrst,'reload schema';
commit;
