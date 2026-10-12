-- Reuses existing custom-session and privacy gates; never trusts client role/branch/status.
begin;
create or replace function public.pm_admin_booking_actions(p_token text, p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  account public.pm_accounts%rowtype;
  bookings jsonb; booking jsonb; result jsonb; upcoming jsonb; branch text; reason text;
begin
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
  bookings := coalesce(bookings,'[]'::jsonb);
  if p_action='pending' then
    select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'id'),'[]') into result
    from jsonb_array_elements(bookings) x
    where x->>'status' in ('신규','승인대기') and
      (account.role in ('main','developer') or coalesce(account.branches ? (x->>'branch'),false));
    select coalesce(jsonb_agg(x order by x->>'date',x->>'time',x->>'id'),'[]') into upcoming
    from jsonb_array_elements(bookings) x
    where x->>'status'='예약' and coalesce(x->>'historyOnly','false')<>'true'
      and replace(x->>'date','.','-') >= to_char(now() at time zone 'Asia/Seoul','YYYY-MM-DD')
      and (account.role in ('main','developer') or coalesce(account.branches ? (x->>'branch'),false));
    return jsonb_build_object('ok',true,'items',result,'upcoming',upcoming);
  end if;
  select x into booking from jsonb_array_elements(bookings) x where x->>'id'=p_data->>'id';
  branch := booking->>'branch';
  if booking is null or (account.role='general' and not coalesce(account.branches ? branch,false)) then
    raise exception 'BOOKING_UNAVAILABLE' using errcode='P0001';
  end if;
  if p_action='get' then return jsonb_build_object('ok',true,'booking',booking); end if;
  if booking->>'status' not in ('신규','승인대기') or booking->>'status' is null then
    return jsonb_build_object('ok',true,'changed',false,'booking',booking);
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
  return jsonb_build_object('ok',true,'changed',true,'booking',booking);
end $$;
revoke all on function public.pm_admin_booking_actions(text,text,jsonb) from public;
grant execute on function public.pm_admin_booking_actions(text,text,jsonb) to anon, authenticated;
commit;
