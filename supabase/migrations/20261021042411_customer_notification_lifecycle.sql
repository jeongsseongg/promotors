-- Customer lifecycle uses only the existing authenticated member relation.
-- Private helpers are never executable by anonymous/API roles.
create or replace function pm_push_private.customer_state(item jsonb, is_run boolean)
returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare phase text; stamp double precision:=0; expires double precision:=0; approved int:=0;
  total int:=0; label text:=''; step jsonb; complete boolean:=false; progress int:=0;
begin
 if item is null or coalesce(item->>'deidentified','false')='true' then return null; end if;
 if item->>'status' in ('취소','거절') then return null; end if;
 if is_run then
   complete:=nullif(item->>'completedAt','') is not null or item->>'status' in ('완료','출고 완료');
   for step in select x from jsonb_array_elements(public.pm_push_array(item->'steps')) x loop
     total:=total+1;
     if step->>'approved'='true' then approved:=approved+1; label:=left(coalesce(step->>'name','작업 단계'),40)||' 확인 완료'; end if;
   end loop;
   if complete then
     begin expires:=extract(epoch from (item->>'completedAt')::timestamptz)+7200; exception when others then expires:=0; end;
     if expires<extract(epoch from now()) then return null; end if;
     phase:='completed'; progress:=100; label:='정비가 완료되었어요';
   elsif coalesce(item->>'status','') in ('입고 대기','예약','') and approved=0 then return null;
   else phase:='repair'; progress:=66+case when total>0 then least(33,approved*33/total) else 0 end;
     label:=coalesce(nullif(label,''),'정비를 진행하고 있어요'); end if;
 else
   if item->>'status' is distinct from '예약' or coalesce(item->>'historyOnly','false')='true' then return null; end if;
   begin stamp:=extract(epoch from ((replace(item->>'date','.','-')||' '||(item->>'time'))::timestamp at time zone 'Asia/Seoul'));
   exception when others then return null; end;
   if stamp<extract(epoch from now())-14400 then return null; end if;
   phase:=case when stamp-extract(epoch from now())<=86400 then 'visit' else 'confirmed' end;
   progress:=case when phase='visit' then 33 else 0 end;
   label:=case when stamp<=extract(epoch from now()) then '예약 시간이 되었어요' when phase='visit' then '방문을 기다리고 있어요' else '예약이 확정되었어요' end;
 end if;
 return jsonb_build_object('audience','customer','active',true,'phase',phase,'progress',progress,'stageLabel',label,
   'runId',case when is_run then item->>'id' else '' end,'bookingId',case when is_run then coalesce(item->>'bookingKey','') else item->>'id' end,
   'branch',left(coalesce(item->>'branch','프로모터스'),60),'schedule',case when is_run then concat(item->>'bookingDate',' · ',item->>'bookingTime') else concat(item->>'date',' · ',item->>'time') end,
   'startsAt',stamp,'expiresAt',expires,'customerName','','vehicleName',left(coalesce(item->>'model',item#>>'{customer,model}',''),80),
   'vehiclePlate',left(coalesce(item->>'car',item#>>'{customer,car}',''),30),'pendingCount',0,'upcomingCount',0);
end $$;
create or replace function pm_push_private.customer_snapshot(owner_id text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare result jsonb;
begin
 select state into result from (
   select pm_push_private.customer_state(x,s.data_key='pm-service-runs') state
   from public.site_data s cross join lateral jsonb_array_elements(public.pm_push_array(s.payload)) x
   where s.data_key in ('pm-bookings','pm-service-runs') and nullif(x->>'memberId','')=owner_id
   and coalesce(x->>'guest','false')<>'true'
 ) scoped where state is not null
 order by case state->>'phase' when 'repair' then 0 when 'completed' then 1 when 'visit' then 2 else 3 end,
   case when state->>'phase'='completed' then -(state->>'expiresAt')::double precision else (state->>'startsAt')::double precision end
 limit 1;
 return coalesce(result,jsonb_build_object('audience','customer','active',false,'phase','cancelled','progress',0,'stageLabel','',
   'runId','','bookingId','','branch','','schedule','','startsAt',0,'expiresAt',0,'customerName','','vehicleName','','vehiclePlate','','pendingCount',0,'upcomingCount',0));
end $$;
create or replace function public.pm_customer_activity(p_token text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare a public.pm_accounts%rowtype; prefs public.pm_push_preferences%rowtype; result jsonb;
begin
 perform pm_privacy.before_write(p_token);
 perform public.pm_notifications(p_token,'state','{}');
 select ac.* into a from public.pm_sessions s join public.pm_accounts ac using(login_id)
 where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and ac.active and ac.role='customer';
 if a.login_id is null then raise exception 'AUTH_REQUIRED'; end if;
 result:=pm_push_private.customer_snapshot(a.login_id);
 select * into prefs from public.pm_push_preferences where login_id=a.login_id;
 if not coalesce(prefs.enabled,false) or not coalesce(case when result->>'phase' in ('repair','completed') then prefs.repair else prefs.booking end,false)
 then result:=jsonb_set(result,'{active}','false'); end if;
 return result;
end $$;
revoke all on function pm_push_private.customer_state(jsonb,boolean) from public,anon,authenticated;
revoke all on function pm_push_private.customer_snapshot(text) from public,anon,authenticated;
revoke all on function public.pm_customer_activity(text) from public;
grant execute on function public.pm_customer_activity(text) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.pm_booking_push_context(p_id uuid, p_lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare a public.pm_accounts%rowtype; notice public.pm_push_inbox%rowtype; customer_state jsonb; prefs public.pm_push_preferences%rowtype;
  rows jsonb; item jsonb; first_item jsonb; pending_rows jsonb; upcoming_rows jsonb; starts_at double precision:=0;
begin
  perform pg_advisory_xact_lock_shared(hashtextextended('pm-privacy',0));
  if not coalesce((public.pm_push_worker('validate',jsonb_build_object('id',p_id,'leaseId',p_lease))->>'valid')::boolean,false) then return null; end if;
  select i.* into notice from public.pm_push_deliveries q join public.pm_push_inbox i on i.id=q.notification_id where q.id=p_id;
  select * into a from public.pm_accounts where login_id=notice.login_id;
  if a.role='customer' then
    -- pm_push_worker.validate above rechecks device, session, preference and ownership.
    if notice.category not in ('booking','repair','reminders') or notice.target->>'kind' not in ('booking','repair') then return null; end if;
    customer_state:=pm_push_private.customer_snapshot(a.login_id);
    select * into prefs from public.pm_push_preferences where login_id=a.login_id;
    if not coalesce(case when customer_state->>'phase' in ('repair','completed') then prefs.repair else prefs.booking end,false)
      then customer_state:=jsonb_set(customer_state,'{active}','false'); end if;
    return jsonb_build_object('customer',jsonb_build_object('title',notice.title,'body',notice.body,'snapshot',customer_state));
  end if;
  if a.role not in ('general','main','developer') or notice.category<>'booking' or notice.target->>'kind'<>'booking' then return null; end if;
  select pm_push_private.booking_array(payload) into rows from public.site_data where data_key='pm-bookings';
  select x into item from jsonb_array_elements(pm_push_private.booking_array(rows)) x where x->>'id'=notice.target->>'id';
  if item is null or not a.active or (a.role='general' and not coalesce(a.branches ? (item->>'branch'),false)) then return null; end if;
  select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'id'),'[]') into pending_rows from jsonb_array_elements(pm_push_private.booking_array(rows)) x
   where x->>'status' in ('신규','승인대기') and (a.role in ('main','developer') or a.branches ? (x->>'branch'));
  select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'id'),'[]') into upcoming_rows from jsonb_array_elements(pm_push_private.booking_array(rows)) x
   where x->>'status'='예약' and coalesce(x->>'historyOnly','false')<>'true'
    and pm_push_private.booking_future(x)
    and (a.role in ('main','developer') or a.branches ? (x->>'branch'));
  first_item:=coalesce(pending_rows->0,upcoming_rows->0);
  begin starts_at:=extract(epoch from ((replace(first_item->>'date','.','-')||' '||(first_item->>'time'))::timestamp at time zone 'Asia/Seoul'));
  exception when others then starts_at:=0; end;
  return jsonb_build_object('id',item->>'id','pending',item->>'status' in ('신규','승인대기'),
   'customerName',item->>'name','vehicleName',item->>'model','vehiclePlate',item->>'car',
   'branch',item->>'branch','schedule',concat(item->>'date',' · ',item->>'time'),
   'snapshot',jsonb_build_object('pendingCount',jsonb_array_length(pending_rows),'upcomingCount',jsonb_array_length(upcoming_rows),
    'branch',coalesce(first_item->>'branch','프로모터스'),'schedule',case when first_item is null then '' else concat(first_item->>'date',' · ',first_item->>'time') end,
    'customerName',coalesce(first_item->>'name',''),'vehicleName',coalesce(first_item->>'model',''),'vehiclePlate',coalesce(first_item->>'car',''),
    'bookingId',coalesce(first_item->>'id',''),'startsAt',coalesce(starts_at,0)));
end $function$
;
CREATE OR REPLACE FUNCTION public.pm_native_push_subscribe(p_token text, p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  a public.pm_accounts%rowtype; dev public.pm_push_devices%rowtype;
  did uuid; value text; endpoint_value text; current_binding uuid; transport text;
begin
  perform pm_privacy.before_write(p_token);
  -- Preserve the live notification API's account/erasure/session gates.
  perform public.pm_notifications(p_token,'state','{}'::jsonb);
  select ac.* into a from public.pm_sessions s join public.pm_accounts ac using(login_id)
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and ac.active;
  if a.login_id is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_action='native_activity' then
    if a.role not in ('customer','general','main','developer') then raise exception 'FORBIDDEN'; end if;
    if coalesce(p_data->>'kind','') not in ('start','update') or coalesce(p_data->>'token','') !~ '^[a-f0-9]{64,}$' or length(p_data->>'token')>256 then raise exception 'INVALID_DEVICE'; end if;
    update public.pm_push_devices set subscription=jsonb_set(subscription,
      array[case p_data->>'kind' when 'start' then 'activityStart' else 'activityUpdate' end],to_jsonb(p_data->>'token')) || jsonb_build_object('activityAudience',case when a.role='customer' then 'customer' else 'admin' end)
    where device_id=(p_data->>'deviceId')::uuid and login_id=a.login_id
      and session_hash=public.pm_token_hash(p_token) and binding=(p_data->>'binding')::uuid
      and revoked_at is null and subscription->>'transport'='apns';
    if not found then raise exception 'DEVICE_BINDING_REQUIRED'; end if;
    return jsonb_build_object('ok',true);
  end if;
  if p_action is distinct from 'native_subscribe' then raise exception 'INVALID_ACTION'; end if;
  did=(p_data->>'deviceId')::uuid; value=p_data->>'token'; transport=coalesce(p_data->>'transport','apns');
  if did is null or transport not in ('apns','fcm') then raise exception 'INVALID_DEVICE'; end if;
  if transport='apns' then
    value=lower(value);
    if value is null or value !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_DEVICE'; end if;
    endpoint_value='apns:kr.promotors.app:'||value;
  else
    if value is null or length(value) not between 32 and 4096 or value !~ '^[!-~]+$' then raise exception 'INVALID_DEVICE'; end if;
    endpoint_value='fcm:promotors-8ddec:kr.promotors.app:'||encode(sha256(convert_to(value,'UTF8')),'hex');
  end if;
  insert into public.pm_push_preferences(login_id) values(a.login_id) on conflict do nothing;
  perform 1 from public.pm_push_preferences where login_id=a.login_id for update;
  if (select count(*) from public.pm_push_devices where login_id=a.login_id and revoked_at is null)>=20
    and not exists(select 1 from public.pm_push_devices where (device_id=did or endpoint=endpoint_value) and login_id=a.login_id) then
    raise exception 'DEVICE_LIMIT';
  end if;
  select * into dev from public.pm_push_devices where device_id=did for update;
  if dev.device_id is not null and dev.login_id<>a.login_id and dev.endpoint<>endpoint_value
    and dev.revoked_at is null and exists(
      select 1 from public.pm_sessions previous_session join public.pm_accounts previous_account using(login_id)
      where previous_session.token_hash=dev.session_hash and previous_session.login_id=dev.login_id
        and previous_session.expires_at>now() and previous_account.active
    ) then
    raise exception 'DEVICE_CONFLICT';
  end if;
  -- Token-preserving reinstalls revoke the old binding and retain delivery audit rows.
  update public.pm_push_devices set revoked_at=now(),binding=gen_random_uuid(),
    endpoint='revoked:'||device_id::text||':'||endpoint
  where endpoint=endpoint_value and device_id<>did;
  current_binding=case when dev.device_id=did and dev.session_hash=public.pm_token_hash(p_token)
    and dev.endpoint=endpoint_value and dev.revoked_at is null then dev.binding else gen_random_uuid() end;
  insert into public.pm_push_devices(device_id,login_id,session_hash,subscription,endpoint,binding)
  values(did,a.login_id,public.pm_token_hash(p_token),jsonb_build_object('transport',transport,'token',value),endpoint_value,current_binding)
  on conflict(device_id) do update set login_id=excluded.login_id,session_hash=excluded.session_hash,
    subscription=case when pm_push_devices.binding=excluded.binding then pm_push_devices.subscription||excluded.subscription else excluded.subscription end,endpoint=excluded.endpoint,binding=excluded.binding,revoked_at=null,
    updated_at=case when pm_push_devices.binding=excluded.binding then pm_push_devices.updated_at else now() end;
  return jsonb_build_object('binding',current_binding);
end $function$
;
CREATE OR REPLACE FUNCTION public.pm_push_booking_event(p_item jsonb, p_old jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id text := p_item->>'id'; v_login text; v_branch text := nullif(p_item->>'branch', '');
  v_state jsonb; v_previous jsonb; v_event text; v_title text; v_target jsonb; v_due timestamptz;
begin
  if nullif(v_id, '') is null then return; end if;
  v_state := jsonb_build_array(p_item->'status', p_item->'date', p_item->'time',
    p_item->'branch', p_item->'memberId', p_item->'guest', p_item->'services');
  v_previous := jsonb_build_array(p_old->'status', p_old->'date', p_old->'time',
    p_old->'branch', p_old->'memberId', p_old->'guest', p_old->'services');
  if p_old is not null and v_state = v_previous then return; end if;
  -- A source transition is the event. Equal snapshots exit above, including RPC retries.
  -- A fresh ID also preserves repeated A -> B -> A transitions inside one transaction.
  v_event := 'booking:' || v_id || ':' || gen_random_uuid();
  v_target := jsonb_build_object('kind', 'booking', 'id', v_id, 'branch', v_branch);
  v_login := public.pm_push_customer(p_item);
  v_title := case when p_item->>'status' = '취소' then '예약이 취소되었어요'
    when p_old is null then '예약이 접수되었어요'
    when p_item->>'status' = '예약' and p_old->>'status' is distinct from '예약' then '예약이 확정되었어요'
    else '예약 정보가 변경되었어요' end;
  if v_login is not null then
    perform public.pm_push_enqueue(v_login, v_event, 'booking', v_title,
      concat(v_branch,' · ',p_item->>'date',' ',p_item->>'time',' · 앱에서 예약 내용을 확인해 주세요.'), v_target, now(), v_branch);
  end if;
  perform public.pm_push_admin_event(v_event, 'booking',
    case when p_old is null then '새 예약이 접수되었어요' else v_title end,
    '예약관리에서 확인해 주세요.', v_target, v_branch);
  perform public.pm_push_cancel_booking_reminders(v_id);
  if v_login is null or p_item->>'status' is distinct from '예약' then return; end if;
  -- Invalid imported dates must not break a legitimate booking save.
  begin
    if coalesce(p_item->>'date', '') !~ '^\d{4}[.-]\d{2}[.-]\d{2}$' then return; end if;
    v_due := (replace(p_item->>'date','.','-')::date - 1 + time '18:00') at time zone 'Asia/Seoul';
  exception when invalid_datetime_format or datetime_field_overflow then return;
  end;
  if v_due > now() then
    perform public.pm_push_enqueue(v_login, v_event || ':reminder', 'reminders',
      '내일 정비 예약이 있어요', '앱에서 예약 시간과 지점을 확인해 주세요.',
      v_target, v_due, v_branch);
  end if;
  begin v_due:=((replace(p_item->>'date','.','-')||' '||(p_item->>'time'))::timestamp at time zone 'Asia/Seoul')-interval '1 hour';
  exception when others then return; end;
  if v_due>now() then
    perform public.pm_push_enqueue(v_login,v_event||':visit-hour','reminders','방문 예약 1시간 전이에요',
      concat(v_branch,' · ',p_item->>'time',' 예약입니다. 앱에서 방문 정보를 확인해 주세요.'),v_target,v_due,v_branch);
  end if;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.pm_push_repair_event(p_item jsonb, p_old jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id text := p_item->>'id'; v_login text := public.pm_push_customer(p_item);
  v_branch text := nullif(p_item->>'branch', ''); v_event text; v_title text;
  v_target jsonb; v_state jsonb; v_previous jsonb; v_complete boolean; v_was_complete boolean;
  v_photos jsonb; v_old_photos jsonb;
begin
  if nullif(v_id, '') is null or v_login is null then return; end if;
  v_target := jsonb_build_object('kind', 'repair', 'id', v_id, 'branch', v_branch);
  v_complete := nullif(p_item->>'completedAt', '') is not null
    or coalesce(p_item->>'status', '') in ('완료', '출고 완료');
  v_was_complete := nullif(p_old->>'completedAt', '') is not null
    or coalesce(p_old->>'status', '') in ('완료', '출고 완료');
  v_state := jsonb_build_array(p_item->'status', p_item->'currentStep', v_complete);
  v_previous := jsonb_build_array(p_old->'status', p_old->'currentStep', v_was_complete);
  v_event := 'repair:' || v_id || ':' || gen_random_uuid();
  -- Creating a waiting record is not a claim that actual repair has started.
  if v_complete and not v_was_complete then v_title := '정비가 완료되었어요';
  elsif v_state is distinct from v_previous
    and coalesce(p_item->>'status', '') not in ('입고 대기', '예약', '취소', '') then
    v_title := case when p_old is null or p_old->>'status' in ('입고 대기', '예약')
      then '정비가 시작되었어요' else '정비 진행 상황이 변경되었어요' end;
  end if;
  if v_title is not null then
    if nullif(p_item->>'bookingKey','') is not null then
      perform public.pm_push_cancel_booking_reminders(p_item->>'bookingKey'); end if;
    perform public.pm_push_enqueue(v_login, v_event, 'repair', v_title,
      '앱에서 정비 진행 상황을 확인해 주세요.', v_target, now(), v_branch);
  end if;
  v_photos := public.pm_push_approved_photos(p_item);
  v_old_photos := public.pm_push_approved_photos(p_old);
  if exists(select 1 from jsonb_array_elements(v_photos) photo
    where not v_old_photos @> jsonb_build_array(photo)) then
    -- Group uploads for the same repair into one pending notice, bounded to five minutes.
    if not exists(select 1 from public.pm_push_inbox n where n.login_id = v_login
      and n.event_key like 'repair:photos:%' and n.target->>'id' = v_id
      and n.cancelled_at is null and n.due_at > now()
      and n.created_at > now() - interval '5 minutes') then
      perform public.pm_push_enqueue(v_login, 'repair:photos:' || v_id || ':' || gen_random_uuid(),
        'repair', '정비 사진이 업데이트되었어요', '앱에서 승인된 정비 사진을 확인해 주세요.',
        v_target, now() + interval '90 seconds', v_branch);
    end if;
  end if;
end;
$function$
;
notify pgrst, 'reload schema';
