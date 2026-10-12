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
