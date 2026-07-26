-- 이미 supabase-promotions-developer-migration.sql을 실행한 운영 DB용 후속 패치
-- 개발자 비밀번호 해시 갱신 + 이벤트 임시저장/공개 통제
begin;

update public.pm_accounts
set password_hash='$2a$12$nJqUnv0nObtPkoux8faCFefVqeT/40eWx0ecY0Ads5Snih6jcVmmm',
    role='main',
    profile=coalesce(profile,'{}'::jsonb)||'{"developer":true,"label":"개발자"}'::jsonb,
    active=true,
    updated_at=now()
where login_id='__developer__';

-- 이전에 만든 이벤트는 관리자가 직접 공개하기 전까지 노출하지 않는다.
update public.site_data
set payload=jsonb_set(
  coalesce(payload,'{}'::jsonb),
  '{events}',
  coalesce((
    select jsonb_agg(case when event_item ? 'status' then event_item else event_item||'{"status":"draft"}'::jsonb end)
    from jsonb_array_elements(coalesce(payload->'events','[]'::jsonb)) event_item
  ),'[]'::jsonb)
), updated_at=now()
where data_key='pm-promotions';

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
         and not exists(select 1 from jsonb_array_elements(coalesce(state->'assignments','[]'::jsonb)) assignment where assignment->>'memberId'=account.login_id and assignment->>'couponId'=coupon->>'id' and left(assignment->>'issuedAt',4)=to_char(current_date,'YYYY')) then
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

revoke all on function public.pm_promo_read(text) from public;
revoke all on function public.pm_event_enter(text,text,jsonb) from public;
grant execute on function public.pm_promo_read(text), public.pm_event_enter(text,text,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
commit;
