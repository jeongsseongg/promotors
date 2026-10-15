-- Additive API: reuses the existing inbox, preferences, session revocation and delivery queue.
create or replace function public.pm_native_push_subscribe(p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,extensions,pg_temp as $$
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
    if a.role not in ('general','main','developer') then raise exception 'ADMIN_REQUIRED'; end if;
    if coalesce(p_data->>'kind','') not in ('start','update') or coalesce(p_data->>'token','') !~ '^[a-f0-9]{64,}$' or length(p_data->>'token')>256 then raise exception 'INVALID_DEVICE'; end if;
    update public.pm_push_devices set subscription=jsonb_set(subscription,
      array[case p_data->>'kind' when 'start' then 'activityStart' else 'activityUpdate' end],to_jsonb(p_data->>'token'))
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
  if dev.device_id is not null and dev.login_id<>a.login_id and dev.endpoint<>endpoint_value then
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
end $$;
revoke all on function public.pm_native_push_subscribe(text,text,jsonb) from public;
grant execute on function public.pm_native_push_subscribe(text,text,jsonb) to anon,authenticated;
