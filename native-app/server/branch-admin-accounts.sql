-- Local prepared API only: do not apply without checking the live auth/privacy schema.
-- Existing password-only RPCs, accounts and sessions are preserved.
-- Fail closed if the prerequisite that excludes new ID accounts from both old login routes is missing.
do $branch_admin_prerequisite$
declare signature text; routine regprocedure; definition text;
begin
  foreach signature in array array['public.pm_admin_login(text)','public.pm_admin_login(text,boolean)'] loop
    routine := pg_catalog.to_regprocedure(signature);
    if routine is null then raise exception 'LEGACY_LOGIN_SIGNATURE_MISSING'; end if;
    definition := pg_catalog.pg_get_functiondef(routine);
    if position('and coalesce(profile->>''loginMode'','''')<>''id_password''' in definition)=0 then
      raise exception 'LEGACY_LOGIN_GUARD_REQUIRED';
    end if;
  end loop;
end $branch_admin_prerequisite$;
create schema if not exists pm_branch_admin_private;
revoke all on schema pm_branch_admin_private from public, anon, authenticated;

create or replace function pm_branch_admin_private.summary(a public.pm_accounts)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('id',a.login_id,'loginId',case when a.profile->>'loginMode'='id_password' then a.login_id else null end,
    'label',coalesce(nullif(a.profile->>'label',''),'기존 업체 관리자'),'branches',a.branches,
    'createdAt',a.created_at,'active',a.active,
    'loginMode',case when a.profile->>'loginMode'='id_password' then 'id_password' else 'legacy_password' end);
$$;
revoke all on function pm_branch_admin_private.summary(public.pm_accounts) from public, anon, authenticated;

create or replace function pm_branch_admin_private.create_account(p_data jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, extensions, public, pg_temp as $$
declare
  account public.pm_accounts%rowtype;
  account_id text := trim(coalesce(p_data->>'loginId',''));
  label_value text := trim(coalesce(p_data->>'label',''));
  secret text := p_data->>'password';
  selected jsonb := p_data->'branches';
  available jsonb;
begin
  if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'INVALID_PAYLOAD'; end if;
  if exists (
    select 1 from jsonb_object_keys(p_data) as k where k not in ('loginId','label','password','branches')) then
    raise exception 'INVALID_PAYLOAD';
  end if;
  if jsonb_typeof(p_data->'loginId') is distinct from 'string' or account_id !~ '^[A-Za-z0-9._-]{4,40}$' then raise exception 'INVALID_ID'; end if;
  if jsonb_typeof(p_data->'label') is distinct from 'string' or length(label_value) not between 1 and 60 then raise exception 'INVALID_PAYLOAD'; end if;
  if jsonb_typeof(p_data->'password') is distinct from 'string' or length(secret)<10 or octet_length(secret)>72
    or secret !~ '[A-Za-z]' or secret !~ '[0-9]' then raise exception 'WEAK_PASSWORD'; end if;
  if jsonb_typeof(selected) is distinct from 'array' then raise exception 'INVALID_BRANCH'; end if;
  if jsonb_array_length(selected) not between 1 and 20 then raise exception 'INVALID_BRANCH'; end if;
  select payload into available from public.site_data where data_key='pm-branches';
  if jsonb_typeof(available) is distinct from 'array' then raise exception 'INVALID_BRANCH'; end if;
  if exists (select 1 from jsonb_array_elements(selected) as b where jsonb_typeof(b)<>'string' or not exists (
    select 1 from jsonb_array_elements(available) as entry where entry->>'name'=b#>>'{}')) then raise exception 'INVALID_BRANCH'; end if;
  if jsonb_array_length(selected)<>(select count(distinct b) from jsonb_array_elements(selected) as b) then raise exception 'INVALID_BRANCH'; end if;
  perform pg_advisory_xact_lock(hashtext('pm_branch_admin_account_creation'));
  if exists(select 1 from public.pm_accounts where login_id=account_id) then raise exception 'DUPLICATE_ID'; end if;
  if exists(select 1 from public.pm_accounts where active and role in ('main','general') and password_hash=crypt(secret,password_hash)) then
    raise exception 'DUPLICATE_ADMIN_PASSWORD';
  end if;
  insert into public.pm_accounts(login_id,password_hash,role,branches,profile)
    values(account_id,crypt(secret,gen_salt('bf',11)),'general',selected,
      jsonb_build_object('id',account_id,'label',label_value,'loginMode','id_password')) returning * into account;
  return pm_branch_admin_private.summary(account);
end $$;
revoke all on function pm_branch_admin_private.create_account(jsonb) from public, anon, authenticated;

create or replace function public.pm_branch_admin_manage(p_token text,p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = pg_catalog, extensions, public, pg_temp as $$
declare account public.pm_accounts%rowtype; result jsonb;
begin
  select a.* into account from public.pm_sessions s join public.pm_accounts a using(login_id)
    where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active;
  if account.login_id is null or account.role is distinct from 'main'
    or coalesce(account.profile->>'developer','false')='true' then raise exception 'MAIN_ADMIN_REQUIRED'; end if;
  if p_action='list' then
    select coalesce(jsonb_agg(pm_branch_admin_private.summary(a) order by a.created_at,a.login_id),'[]'::jsonb)
      into result from public.pm_accounts a where a.role='general';
    return result;
  end if;
  if p_action='create' then
    perform pm_privacy.before_write(p_token);
    return pm_branch_admin_private.create_account(p_data);
  end if;
  raise exception 'INVALID_ACTION';
end $$;
revoke all on function public.pm_branch_admin_manage(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.pm_branch_admin_manage(text,text,jsonb) to anon, authenticated;

create or replace function public.pm_branch_admin_login(p_login_id text,p_password text,p_remember boolean default false)
returns jsonb language plpgsql security definer set search_path = pg_catalog, extensions, public, pg_temp as $$
declare account public.pm_accounts%rowtype; raw_token text;
  expiry timestamptz := now()+case when coalesce(p_remember,false) then interval '30 days' else interval '12 hours' end;
begin
  if trim(coalesce(p_login_id,'')) !~ '^[A-Za-z0-9._-]{4,40}$' or p_password is null
    or octet_length(p_password)>72 then raise exception 'INVALID_LOGIN'; end if;
  select * into account from public.pm_accounts where login_id=trim(p_login_id) and active and role in ('main','general')
    and password_hash=crypt(p_password,password_hash);
  if account.login_id is null then raise exception 'INVALID_LOGIN'; end if;
  if account.role='general' then
    if jsonb_typeof(account.branches) is distinct from 'array' then raise exception 'INVALID_LOGIN'; end if;
    if jsonb_array_length(account.branches)=0 then raise exception 'INVALID_LOGIN'; end if;
  end if;
  raw_token := encode(gen_random_bytes(32),'hex');
  insert into public.pm_sessions(token_hash,login_id,expires_at) values(public.pm_token_hash(raw_token),account.login_id,expiry);
  return jsonb_build_object('token',raw_token,'expiresAt',expiry);
end $$;
revoke all on function public.pm_branch_admin_login(text,text,boolean) from public, anon, authenticated;
grant execute on function public.pm_branch_admin_login(text,text,boolean) to anon, authenticated;
