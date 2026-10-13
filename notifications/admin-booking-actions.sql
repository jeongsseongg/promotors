-- Reuses existing custom-session and privacy gates; never trusts client role/branch/status.
begin;
-- Private helpers are callable only by privileged RPC owners.
create or replace function pm_push_private.booking_array(items jsonb)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(
   case when jsonb_typeof(items)='array' then items else '[]' end) x where jsonb_typeof(x)='object' and x<>'{}'::jsonb;
$$;
create or replace function pm_push_private.booking_note_owned(notes jsonb, identity jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select jsonb_typeof(notes)='object' and not coalesce((identity->>'blocked')::boolean,true)
  and coalesce(notes->>'deidentified','false')<>'true'
  and nullif(identity->>'ownerId','') is not null
  and (nullif(notes->>'memberId','') is not null or nullif(notes->>'ownerId','') is not null)
  and coalesce(nullif(notes->>'memberId',''),identity->>'ownerId')=identity->>'ownerId'
  and coalesce(nullif(notes->>'ownerId',''),identity->>'ownerId')=identity->>'ownerId';
$$;

create or replace function pm_push_private.booking_fields(item jsonb, fields text[])
returns jsonb language sql immutable set search_path=pg_catalog as $$
  select coalesce(jsonb_object_agg(k,v),'{}') from jsonb_each(case when jsonb_typeof(item)='object' then item else '{}' end) e(k,v) where k=any(fields);
$$;
create or replace function pm_push_private.booking_future(item jsonb)
returns boolean language plpgsql stable set search_path=pg_catalog as $$
declare stamp timestamptz;
begin
  if coalesce(item->>'date','') !~ '^\d{4}[.-]\d{2}[.-]\d{2}$'
    or coalesce(item->>'time','') !~ '^([01]\d|2[0-3]):[0-5]\d$' then return false; end if;
  begin stamp:=(replace(item->>'date','.','-')||' '||(item->>'time'))::timestamp at time zone 'Asia/Seoul';
  exception when others then return false; end;
  return stamp>=now();
end $$;
create or replace function pm_push_private.booking_identity(booking jsonb)
returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare owner_id text:=nullif(booking->>'memberId',''); candidates text[]; blocked boolean:=false;
  plate text:=regexp_replace(coalesce(booking->>'car',''),'[[:space:]-]','','g');
  phone text:=regexp_replace(coalesce(booking->>'phone',''),'[^0-9]','','g');
begin
  if owner_id is not null then
    blocked:=not exists(select 1 from public.pm_accounts where login_id=owner_id and role='customer' and active);
  elsif plate<>'' and phone<>'' then
    select array_agg(distinct id) into candidates from (
      select a.login_id id from public.pm_accounts a where a.role='customer' and a.active
        and regexp_replace(coalesce(a.profile->>'car',''),'[[:space:]-]','','g')=plate
        and regexp_replace(coalesce(a.profile->>'phone',''),'[^0-9]','','g')=phone
      union all
      select x->>'memberId' from public.site_data s cross join lateral jsonb_array_elements(
        case when jsonb_typeof(s.payload)='array' then s.payload else '[]' end) x
      where s.data_key in ('pm-bookings','pm-service-runs') and nullif(x->>'memberId','') is not null
        and coalesce(x->>'deidentified','false')<>'true'
        and regexp_replace(coalesce(x->>'car',''),'[[:space:]-]','','g')=plate
        and regexp_replace(coalesce(x->>'phone',''),'[^0-9]','','g')=phone
    ) c;
    blocked:=coalesce(cardinality(candidates),0)>1;
    if cardinality(candidates)=1 then
      owner_id:=candidates[1];
      blocked:=not exists(select 1 from public.pm_accounts where login_id=owner_id and role='customer' and active);
    end if;
  else blocked:=true; end if;
  return jsonb_build_object('ownerId',coalesce(owner_id,''),'plate',plate,'phone',phone,'blocked',blocked,
    'matchKind',case when blocked then '연결 확인 필요' when owner_id is not null then '회원 정보 일치' else '차량·연락처 일치' end);
end $$;
create or replace function pm_push_private.booking_matches(item jsonb, identity jsonb)
returns boolean language sql immutable set search_path=pg_catalog as $$
 select not coalesce((identity->>'blocked')::boolean,true) and coalesce(item->>'deidentified','false')<>'true'
  and case when nullif(item->>'memberId','') is not null then
    item->>'memberId'=nullif(identity->>'ownerId','')
  else coalesce(identity->>'plate','')<>'' and coalesce(identity->>'phone','')<>''
    and regexp_replace(coalesce(item->>'car',''),'[[:space:]-]','','g')=identity->>'plate'
    and regexp_replace(coalesce(item->>'phone',''),'[^0-9]','','g')=identity->>'phone' end;
$$;
create or replace function pm_push_private.booking_customer_context(booking jsonb, role_name text, branches jsonb)
returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare identity jsonb:=pm_push_private.booking_identity(booking); previous jsonb; runs jsonb; audit jsonb;
  memos jsonb:='[]'; records jsonb:='[]'; notes jsonb; limited boolean:=role_name='general'; safe_notes boolean;
begin
  select coalesce(jsonb_agg(pm_push_private.booking_fields(x,array[
    'id','branch','date','time','model','car','status','services','memo','mileage','couponName','createdAt']) order by x->>'date' desc,x->>'time' desc),'[]')
  into previous from (select x from public.site_data s cross join lateral jsonb_array_elements(pm_push_private.booking_array(s.payload)) x
    where s.data_key='pm-bookings' and x->>'id' is distinct from booking->>'id'
      and pm_push_private.booking_matches(x,identity) and (role_name<>'general' or branches ? (x->>'branch'))
    order by x->>'date' desc,x->>'time' desc limit 20) q;
  select coalesce(jsonb_agg(pm_push_private.booking_fields(x,array[
    'id','branch','bookingDate','bookingTime','service','status','mileage','reason','createdAt','completedAt']) order by x->>'bookingDate' desc,x->>'createdAt' desc),'[]')
  into runs from (select x from public.site_data s cross join lateral jsonb_array_elements(pm_push_private.booking_array(s.payload)) x
    where s.data_key='pm-service-runs' and pm_push_private.booking_matches(x,identity)
      and (role_name<>'general' or branches ? (x->>'branch'))
    order by x->>'bookingDate' desc,x->>'createdAt' desc limit 20) q;
  select coalesce(jsonb_agg(pm_push_private.booking_fields(x,array[
    'id','at','branch','action','step','detail','memo','by','service','photos']) order by x->>'at' desc),'[]')
  into audit from (select x from public.site_data s cross join lateral jsonb_array_elements(pm_push_private.booking_array(s.payload)) x
    where s.data_key='pm-work-audit' and coalesce(x->>'deidentified','false')<>'true'
      and (role_name<>'general' or branches ? (x->>'branch'))
      and not coalesce((identity->>'blocked')::boolean,true) and (
        exists(select 1 from jsonb_array_elements(runs) r where nullif(x->>'runId','')=r->>'id')
        or exists(select 1 from jsonb_array_elements(previous || jsonb_build_array(booking)) b
          where x->>'branch'=b->>'branch' and x->>'bookingDate'=b->>'date' and x->>'bookingTime'=b->>'time'
            and regexp_replace(coalesce(x->>'car',''),'[[:space:]-]','','g')=identity->>'plate'
            and regexp_replace(coalesce(x->>'phone',''),'[^0-9]','','g')=identity->>'phone'))
    order by x->>'at' desc limit 20) q;
  safe_notes:=not coalesce((identity->>'blocked')::boolean,true) and identity->>'plate'<>''
    and not exists(select 1 from public.site_data s cross join lateral jsonb_array_elements(
      case when jsonb_typeof(s.payload)='array' then s.payload else '[]' end) x
      where s.data_key in ('pm-bookings','pm-service-runs','pm-members')
      and coalesce(x->>'deidentified','false')<>'true'
      and regexp_replace(coalesce(x->>'car',''),'[[:space:]-]','','g')=identity->>'plate'
      and regexp_replace(coalesce(x->>'phone',''),'[^0-9]','','g') is distinct from identity->>'phone');
  if role_name<>'general' and safe_notes then
    select n.value into notes from public.site_data s cross join lateral jsonb_each(case when jsonb_typeof(s.payload)='object' then s.payload else '{}' end) n
      where s.data_key='pm-customers' and regexp_replace(n.key,'[[:space:]-]','','g')=identity->>'plate';
    if pm_push_private.booking_note_owned(notes,identity) then
    select coalesce(jsonb_agg(pm_push_private.booking_fields(x,array['id','title','body','createdAt','updatedAt','amount']) order by x->>'createdAt' desc),'[]')
      into memos from (select x from jsonb_array_elements(pm_push_private.booking_array(notes->'memoEntries')) x order by x->>'createdAt' desc limit 20) q;
    if jsonb_array_length(memos)=0 and nullif(notes->>'memo','') is not null then
      memos:=jsonb_build_array(jsonb_build_object('id','legacy-memo','body',notes->>'memo','createdAt',notes->>'memoUpdatedAt')); end if;
    select coalesce(jsonb_agg(pm_push_private.booking_fields(x,array['date','service','note','amount','payType','paid']) order by x->>'date' desc),'[]')
      into records from (select x from jsonb_array_elements(pm_push_private.booking_array(notes->'records')) x order by x->>'date' desc limit 20) q;
    else limited:=true; end if;
  elsif role_name<>'general' then limited:=true; end if;
  return jsonb_build_object('existing',jsonb_array_length(previous)+jsonb_array_length(runs)+jsonb_array_length(memos)+jsonb_array_length(records)>0,
    'matchKind',identity->>'matchKind','bookings',previous,'runs',runs,'audit',audit,'memos',memos,'records',records,'limited',limited);
end $$;
revoke all on function pm_push_private.booking_array(jsonb),pm_push_private.booking_note_owned(jsonb,jsonb),
  pm_push_private.booking_fields(jsonb,text[]),pm_push_private.booking_future(jsonb),
  pm_push_private.booking_identity(jsonb),pm_push_private.booking_matches(jsonb,jsonb),
  pm_push_private.booking_customer_context(jsonb,text,jsonb) from public,anon,authenticated;

create or replace function public.pm_admin_booking_actions(p_token text, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  account public.pm_accounts%rowtype;
  bookings jsonb; booking jsonb; result jsonb; upcoming jsonb; branch text; reason text;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('pm-privacy',0));
  perform public.pm_notifications(p_token, 'state', '{}'::jsonb);
  select a.* into account from public.pm_sessions s join public.pm_accounts a using(login_id)
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active;
  if account.login_id is null or account.role not in ('main','general','developer') then
    raise exception 'ADMIN_REQUIRED' using errcode='P0001';
  end if;
  if p_action not in ('pending','get','accept','reject') or p_action is null then raise exception 'INVALID_ACTION'; end if;
  if p_action in ('accept','reject') then
    perform pm_privacy.before_write(p_token);
    select payload into bookings from public.site_data where data_key='pm-bookings' for update;
  else
    select payload into bookings from public.site_data where data_key='pm-bookings';
  end if;
  bookings := pm_push_private.booking_array(bookings);
  if p_action='pending' then
    select coalesce(jsonb_agg(x - 'guestLookupHash' - 'trackingSessionId' - 'acquisition' order by x->>'date',x->>'time',x->>'id'),'[]') into result
    from jsonb_array_elements(bookings) x
    where x->>'status' in ('신규','승인대기') and
      (account.role in ('main','developer') or coalesce(account.branches ? (x->>'branch'),false));
    select coalesce(jsonb_agg(x - 'guestLookupHash' - 'trackingSessionId' - 'acquisition' order by x->>'date',x->>'time',x->>'id'),'[]') into upcoming
    from jsonb_array_elements(bookings) x
    where x->>'status'='예약' and coalesce(x->>'historyOnly','false')<>'true'
      and pm_push_private.booking_future(x)
      and (account.role in ('main','developer') or coalesce(account.branches ? (x->>'branch'),false));
    return jsonb_build_object('ok',true,'items',result,'upcoming',upcoming);
  end if;
  select x into booking from jsonb_array_elements(bookings) x where x->>'id'=p_data->>'id';
  branch := booking->>'branch';
  if booking is null or (account.role='general' and not coalesce(account.branches ? branch,false)) then
    raise exception 'BOOKING_UNAVAILABLE' using errcode='P0001';
  end if;
  if p_action='get' then return jsonb_build_object('ok',true,'booking',booking - 'guestLookupHash' - 'trackingSessionId' - 'acquisition',
    'customerContext',pm_push_private.booking_customer_context(booking,account.role,account.branches)); end if;
  if booking->>'status' not in ('신규','승인대기') or booking->>'status' is null then
    return jsonb_build_object('ok',true,'changed',false,'booking',booking - 'guestLookupHash' - 'trackingSessionId' - 'acquisition');
  end if;
  if p_action='accept' then
    booking := booking || jsonb_build_object('status','예약','checkedAt',now(),'checkedBy',account.login_id);
  else
    reason := btrim(coalesce(p_data->>'reason',''));
    if length(reason)<1 or length(reason)>200 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
    booking := booking || jsonb_build_object('status','취소','cancelledAt',now(),'cancelledBy',account.login_id,
      'rejectedAt',now(),'rejectionReason',reason);
  end if;
  -- Existing merge owns booking triggers, privacy checks and timestamps. Send one changed row only.
  perform public.pm_sync_merge_by_id(p_token,'pm-bookings',jsonb_build_array(booking),null);
  return jsonb_build_object('ok',true,'changed',true,'booking',booking - 'guestLookupHash' - 'trackingSessionId' - 'acquisition');
end $$;
revoke all on function public.pm_admin_booking_actions(text,text,jsonb) from public;
grant execute on function public.pm_admin_booking_actions(text,text,jsonb) to anon, authenticated;
commit;
