-- Service-only context for an already-authorized, currently leased delivery.
create or replace function public.pm_booking_push_context(p_id uuid,p_lease uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
declare a public.pm_accounts%rowtype; notice public.pm_push_inbox%rowtype;
  rows jsonb; item jsonb; first_item jsonb; pending_rows jsonb; upcoming_rows jsonb; starts_at double precision:=0;
begin
  if not coalesce((public.pm_push_worker('validate',jsonb_build_object('id',p_id,'leaseId',p_lease))->>'valid')::boolean,false) then return null; end if;
  select i.* into notice from public.pm_push_deliveries q join public.pm_push_inbox i on i.id=q.notification_id where q.id=p_id;
  select * into a from public.pm_accounts where login_id=notice.login_id;
  if a.role not in ('general','main','developer') or notice.category<>'booking' or notice.target->>'kind'<>'booking' then return null; end if;
  select coalesce(payload,'[]') into rows from public.site_data where data_key='pm-bookings';
  select x into item from jsonb_array_elements(rows) x where x->>'id'=notice.target->>'id';
  if item is null then return null; end if;
  select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'id'),'[]') into pending_rows from jsonb_array_elements(rows) x
   where x->>'status' in ('신규','승인대기') and (a.role in ('main','developer') or a.branches ? (x->>'branch'));
  select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'id'),'[]') into upcoming_rows from jsonb_array_elements(rows) x
   where x->>'status'='예약' and coalesce(x->>'historyOnly','false')<>'true'
    and replace(x->>'date','.','-')>=to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
    and (a.role in ('main','developer') or a.branches ? (x->>'branch'));
  first_item:=coalesce(pending_rows->0,upcoming_rows->0);
  begin starts_at:=extract(epoch from ((replace(first_item->>'date','.','-')||' '||(first_item->>'time'))::timestamp at time zone 'Asia/Seoul'));
  exception when others then starts_at:=0; end;
  return jsonb_build_object('id',item->>'id','pending',item->>'status' in ('신규','승인대기'),
   'branch',item->>'branch','schedule',concat(item->>'date',' · ',item->>'time'),
   'snapshot',jsonb_build_object('pendingCount',jsonb_array_length(pending_rows),'upcomingCount',jsonb_array_length(upcoming_rows),
    'branch',coalesce(first_item->>'branch','프로모터스'),'schedule',case when first_item is null then '' else concat(first_item->>'date',' · ',first_item->>'time') end,
    'bookingId',coalesce(first_item->>'id',''),'startsAt',coalesce(starts_at,0)));
end $$;
revoke all on function public.pm_booking_push_context(uuid,uuid) from public,anon,authenticated;
grant execute on function public.pm_booking_push_context(uuid,uuid) to service_role;

-- Retry Live Activity without replaying an already delivered alert.
CREATE OR REPLACE FUNCTION public.pm_push_worker(p_action text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare result jsonb;
begin
  if p_action='config' then
    return (select to_jsonb(c) from pm_push_private.config c);
  elsif p_action='initialize' then
    update pm_push_private.config set public_key=p_data->>'publicKey',private_key=p_data->>'privateKey'
      where public_key is null and length(p_data->>'publicKey')=87 and length(p_data->>'privateKey')=43;
    return jsonb_build_object('ok',true);
  elsif p_action='claim' then
    insert into public.pm_push_deliveries(notification_id,device_id,binding)
    select i.id,d.device_id,d.binding from public.pm_push_inbox i
    join public.pm_accounts a on a.login_id=i.login_id
    join public.pm_push_preferences p on p.login_id=i.login_id
    join public.pm_push_devices d on d.login_id=i.login_id
    join public.pm_sessions s on s.token_hash=d.session_hash
    where i.cancelled_at is null and i.due_at<=now() and i.due_at>now()-interval '24 hours'
      and i.due_at>=d.updated_at-interval '1 minute' and d.revoked_at is null and s.expires_at>now()
      and ((i.category<>'test' and not (i.target ? 'deviceId')) or i.target->>'deviceId'=d.device_id::text)
      and pm_push_private.allowed(i,a) and pm_push_private.category_enabled(i.category,p)
    on conflict(notification_id,device_id) do nothing;
    update public.pm_push_deliveries q set status='cancelled',error_code='REVOKED_OR_EXPIRED',updated_at=now()
    where q.status in ('pending','sending') and not exists(
      select 1 from public.pm_push_inbox i join public.pm_accounts a on a.login_id=i.login_id
      join public.pm_push_preferences p on p.login_id=i.login_id
      join public.pm_push_devices d on d.device_id=q.device_id and d.login_id=i.login_id and d.binding=q.binding
      join public.pm_sessions s on s.token_hash=d.session_hash
      where i.id=q.notification_id and i.cancelled_at is null and i.due_at<=now() and i.due_at>now()-interval '24 hours'
      and ((i.category<>'test' and not (i.target ? 'deviceId')) or i.target->>'deviceId'=d.device_id::text)
      and d.revoked_at is null and s.expires_at>now() and pm_push_private.allowed(i,a) and pm_push_private.category_enabled(i.category,p)
    );
    update public.pm_push_deliveries set status='failed',error_code='RETRY_LIMIT',updated_at=now()
      where status='sending' and lease_until<now() and attempts>=5;
    with candidates as (
      select q.id from public.pm_push_deliveries q join public.pm_push_inbox i on i.id=q.notification_id
      where q.attempts<5 and q.available_at<=now()
      and (i.category<>'marketing' or (now() at time zone 'Asia/Seoul')::time between time '08:00' and time '20:59:59')
      and (q.status='pending' or (q.status='sending' and q.lease_until<now())) order by q.available_at for update of q skip locked limit 30
    ), claimed as (
      update public.pm_push_deliveries q set status='sending',attempts=attempts+1,lease_until=now()+interval '5 minutes',
        lease_id=gen_random_uuid(),updated_at=now() from candidates c where c.id=q.id returning q.*
    ) select jsonb_agg(jsonb_build_object('id',q.id,'leaseId',q.lease_id,'subscription',d.subscription,
      'payload',jsonb_build_object('id',i.id,'category',i.category,'title',i.title,'body',i.body,'binding',q.binding,'target',i.target,'alertDelivered',coalesce(q.error_code like 'ACTIVITY_%_ALERT_SENT',false)))) into result
      from claimed q join public.pm_push_devices d using(device_id) join public.pm_push_inbox i on i.id=q.notification_id;
    return coalesce(result,'[]');
  elsif p_action='validate' then
    return jsonb_build_object('valid',exists(select 1 from public.pm_push_deliveries q
      join public.pm_push_inbox i on i.id=q.notification_id join public.pm_accounts a on a.login_id=i.login_id
      join public.pm_push_devices d on d.device_id=q.device_id and d.login_id=i.login_id and d.binding=q.binding
      join public.pm_push_preferences p on p.login_id=i.login_id join public.pm_sessions s on s.token_hash=d.session_hash
      where q.id=(p_data->>'id')::uuid and q.lease_id=(p_data->>'leaseId')::uuid and q.status='sending' and q.lease_until>now()
      and i.cancelled_at is null and d.revoked_at is null and s.expires_at>now()
      and i.due_at<=now() and i.due_at>now()-interval '24 hours'
      and ((i.category<>'test' and not (i.target ? 'deviceId')) or i.target->>'deviceId'=d.device_id::text)
      and (i.category<>'marketing' or (now() at time zone 'Asia/Seoul')::time between time '08:00' and time '20:59:59')
      and pm_push_private.allowed(i,a) and pm_push_private.category_enabled(i.category,p)));
  elsif p_action='ack' then
    update public.pm_push_deliveries set
      status=case when p_data->>'result'='sent' then 'sent' when p_data->>'result'='cancelled' then 'cancelled'
        when p_data->>'code' in ('404','410') or attempts>=5 then 'failed' else 'pending' end,
      error_code=left(p_data->>'code',80), sent_at=case when p_data->>'result'='sent' then now() else null end,
      available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::int)),lease_until=null,updated_at=now()
    where id=(p_data->>'id')::uuid and lease_id=(p_data->>'leaseId')::uuid and status='sending';
    if found and p_data->>'code' in ('404','410') then
      update public.pm_push_devices d set revoked_at=now() from public.pm_push_deliveries q
      where q.id=(p_data->>'id')::uuid and q.lease_id=(p_data->>'leaseId')::uuid and q.device_id=d.device_id and q.binding=d.binding;
    end if;
  else raise exception 'INVALID_ACTION'; end if;
  return jsonb_build_object('ok',true);
end $function$
