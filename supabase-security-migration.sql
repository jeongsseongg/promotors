-- PRO MOTORS production security migration
-- Run ONCE in Supabase Dashboard > SQL Editor.
-- Existing site_data rows are preserved. Plain-text passwords are migrated to bcrypt hashes,
-- then removed from the shared JSON payloads.

begin;

create extension if not exists pgcrypto;

create table if not exists public.pm_accounts (
  login_id text primary key,
  password_hash text not null,
  role text not null check (role in ('customer', 'main', 'general')),
  branches jsonb not null default '[]'::jsonb,
  profile jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_sessions (
  token_hash text primary key,
  login_id text not null references public.pm_accounts(login_id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists pm_sessions_login_id_idx on public.pm_sessions(login_id);
create index if not exists pm_sessions_expires_at_idx on public.pm_sessions(expires_at);

alter table public.pm_accounts enable row level security;
alter table public.pm_sessions enable row level security;

revoke all on public.pm_accounts from anon, authenticated;
revoke all on public.pm_sessions from anon, authenticated;

-- Existing customer accounts: hash the current password and preserve the profile.
insert into public.pm_accounts (login_id, password_hash, role, branches, profile)
select
  member->>'id',
  crypt(member->>'password', gen_salt('bf', 11)),
  'customer',
  '[]'::jsonb,
  member - 'password'
from public.site_data sd
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end
) member
where sd.data_key = 'pm-members'
  and coalesce(member->>'id', '') <> ''
  and coalesce(member->>'password', '') <> ''
on conflict (login_id) do update
set profile = excluded.profile,
    updated_at = now();

-- Existing main administrator password.
insert into public.pm_accounts (login_id, password_hash, role, branches, profile)
select
  '__main_admin__',
  crypt(sd.payload->>'password', gen_salt('bf', 11)),
  'main',
  '[]'::jsonb,
  jsonb_build_object('label', 'main')
from public.site_data sd
where sd.data_key = 'pm-main-admin'
  and coalesce(sd.payload->>'password', '') <> ''
on conflict (login_id) do nothing;

-- Existing branch administrator accounts.
insert into public.pm_accounts (login_id, password_hash, role, branches, profile)
select
  '__general__' || encode(digest(account->>'password', 'sha256'), 'hex'),
  crypt(account->>'password', gen_salt('bf', 11)),
  'general',
  coalesce(account->'branches', '[]'::jsonb),
  account - 'password'
from public.site_data sd
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(sd.payload->'accounts') = 'array' then sd.payload->'accounts'
    else '[]'::jsonb
  end
) account
where sd.data_key = 'pm-sub-admin'
  and coalesce(account->>'password', '') <> ''
on conflict (login_id) do update
set branches = excluded.branches,
    profile = excluded.profile,
    updated_at = now();

create or replace function public.pm_token_hash(p_token text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

create or replace function public.pm_login(
  p_login_id text,
  p_password text,
  p_remember boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  raw_token text;
  expiry timestamptz;
begin
  delete from public.pm_sessions where expires_at <= now();

  select * into account
  from public.pm_accounts
  where login_id = trim(p_login_id)
    and role = 'customer'
    and active
  limit 1;

  if account.login_id is null
     or account.password_hash <> crypt(coalesce(p_password, ''), account.password_hash) then
    raise exception 'INVALID_LOGIN' using errcode = 'P0001';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  expiry := now() + case when p_remember then interval '30 days' else interval '12 hours' end;

  insert into public.pm_sessions(token_hash, login_id, expires_at)
  values (public.pm_token_hash(raw_token), account.login_id, expiry);

  return jsonb_build_object(
    'token', raw_token,
    'expiresAt', expiry,
    'role', account.role,
    'branches', account.branches,
    'profile', account.profile
  );
end
$$;

create or replace function public.pm_admin_login(p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  raw_token text;
  expiry timestamptz := now() + interval '12 hours';
begin
  delete from public.pm_sessions where expires_at <= now();

  select * into account
  from public.pm_accounts
  where role in ('main', 'general')
    and active
    and password_hash = crypt(coalesce(p_password, ''), password_hash)
  order by case when role = 'main' then 0 else 1 end
  limit 1;

  if account.login_id is null then
    raise exception 'INVALID_LOGIN' using errcode = 'P0001';
  end if;

  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.pm_sessions(token_hash, login_id, expires_at)
  values (public.pm_token_hash(raw_token), account.login_id, expiry);

  return jsonb_build_object(
    'token', raw_token,
    'expiresAt', expiry,
    'role', account.role,
    'branches', account.branches,
    'profile', account.profile
  );
end
$$;

create or replace function public.pm_register(
  p_login_id text,
  p_password text,
  p_profile jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  clean_id text := trim(coalesce(p_login_id, ''));
  clean_profile jsonb;
  raw_token text;
  expiry timestamptz := now() + interval '12 hours';
  current_members jsonb;
begin
  if clean_id !~ '^[A-Za-z0-9._-]{4,40}$' then
    raise exception 'INVALID_ID' using errcode = 'P0001';
  end if;
  if length(coalesce(p_password, '')) < 10
     or p_password !~ '[0-9]'
     or p_password !~ '[A-Za-z가-힣]' then
    raise exception 'WEAK_PASSWORD' using errcode = 'P0001';
  end if;
  if coalesce(trim(p_profile->>'name'), '') = ''
     or coalesce(trim(p_profile->>'car'), '') = ''
     or coalesce(trim(p_profile->>'phone'), '') = '' then
    raise exception 'MISSING_PROFILE' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.pm_accounts where login_id = clean_id) then
    raise exception 'DUPLICATE_ID' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.pm_accounts
    where role = 'customer' and profile->>'car' = p_profile->>'car'
  ) then
    raise exception 'DUPLICATE_CAR' using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.site_data sd
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sd.payload)='array' then sd.payload else '[]'::jsonb end
    ) blocked
    where sd.data_key='pm-banned-members'
      and blocked->>'type' in ('blocked','deleted')
      and regexp_replace(coalesce(blocked#>>'{member,phone}',''),'[^0-9]','','g') =
          regexp_replace(coalesce(p_profile->>'phone',''),'[^0-9]','','g')
  ) then
    raise exception 'ACCOUNT_BLOCKED' using errcode = 'P0001';
  end if;

  clean_profile := (coalesce(p_profile, '{}'::jsonb) - 'password')
    || jsonb_build_object('id', clean_id, 'role', 'customer');

  insert into public.pm_accounts(login_id, password_hash, role, profile)
  values (clean_id, crypt(p_password, gen_salt('bf', 11)), 'customer', clean_profile);

  select payload into current_members from public.site_data where data_key = 'pm-members' for update;
  current_members := case when jsonb_typeof(current_members) = 'array' then current_members else '[]'::jsonb end;
  update public.site_data
  set payload = current_members || jsonb_build_array(clean_profile), updated_at = now()
  where data_key = 'pm-members';

  raw_token := encode(gen_random_bytes(32), 'hex');
  insert into public.pm_sessions(token_hash, login_id, expires_at)
  values (public.pm_token_hash(raw_token), clean_id, expiry);

  return jsonb_build_object(
    'token', raw_token,
    'expiresAt', expiry,
    'role', 'customer',
    'branches', '[]'::jsonb,
    'profile', clean_profile
  );
end
$$;

create or replace function public.pm_sync_read(p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  car_number text;
  result jsonb := '[]'::jsonb;
  row_item record;
  scoped jsonb;
  public_keys constant text[] := array[
    'pm-branches','pm-notices','promotors-cases','pm-products','pm-blocked',
    'pm-blog-settings','pm-intro-slides','pm-home-view','pm-event-banners'
  ];
  private_keys constant text[] := array[
    'pm-customers','pm-bookings','pm-members','pm-service-runs','pm-messages',
    'pm-admin-notifications','pm-branch-transfer-requests','pm-work-audit',
    'pm-banned-members'
  ];
begin
  if coalesce(p_token, '') <> '' then
    select a.* into account
    from public.pm_sessions s
    join public.pm_accounts a on a.login_id = s.login_id
    where s.token_hash = public.pm_token_hash(p_token)
      and s.expires_at > now()
      and a.active
    limit 1;
  end if;

  for row_item in
    select data_key, payload from public.site_data where data_key = any(public_keys)
  loop
    result := result || jsonb_build_array(jsonb_build_object('data_key', row_item.data_key, 'payload', row_item.payload));
  end loop;

  if account.login_id is null then
    return result || jsonb_build_array(jsonb_build_object(
      'data_key','pm-auth-context','payload',jsonb_build_object('authenticated',false)
    ));
  end if;

  update public.pm_sessions
  set last_seen_at = now()
  where token_hash = public.pm_token_hash(p_token);

  result := result || jsonb_build_array(jsonb_build_object(
    'data_key','pm-auth-context',
    'payload',jsonb_build_object(
      'authenticated',true,'role',account.role,'branches',account.branches,'profile',account.profile
    )
  ));

  if account.role in ('main', 'general') then
    for row_item in
      select data_key,
        case
          when data_key = 'pm-members' and jsonb_typeof(payload) = 'array' then
            coalesce((select jsonb_agg(x - 'password') from jsonb_array_elements(payload) x), '[]'::jsonb)
          else payload
        end as payload
      from public.site_data
      where data_key = any(private_keys)
    loop
      result := result || jsonb_build_array(jsonb_build_object('data_key', row_item.data_key, 'payload', row_item.payload));
    end loop;
    return result;
  end if;

  car_number := account.profile->>'car';

  result := result || jsonb_build_array(jsonb_build_object(
    'data_key','pm-members','payload',jsonb_build_array(account.profile)
  ));

  select coalesce(jsonb_agg(x), '[]'::jsonb) into scoped
  from public.site_data sd
  cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload)='array' then sd.payload else '[]'::jsonb end) x
  where sd.data_key='pm-bookings'
    and (x->>'memberId'=account.login_id or x->>'car'=car_number);
  result := result || jsonb_build_array(jsonb_build_object('data_key','pm-bookings','payload',scoped));

  select coalesce(jsonb_agg(x), '[]'::jsonb) into scoped
  from public.site_data sd
  cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload)='array' then sd.payload else '[]'::jsonb end) x
  where sd.data_key='pm-service-runs'
    and (x->>'memberId'=account.login_id or x->>'car'=car_number);
  result := result || jsonb_build_array(jsonb_build_object('data_key','pm-service-runs','payload',scoped));

  select coalesce(jsonb_agg(x), '[]'::jsonb) into scoped
  from public.site_data sd
  cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload)='array' then sd.payload else '[]'::jsonb end) x
  where sd.data_key='pm-messages'
    and (
      x->>'memberId'=account.login_id or x->>'car'=car_number
      or x#>>'{customer,id}'=account.login_id or x#>>'{customer,car}'=car_number
    );
  result := result || jsonb_build_array(jsonb_build_object('data_key','pm-messages','payload',scoped));

  select case
    when jsonb_typeof(payload)='object' and payload ? car_number
      then jsonb_build_object(car_number, payload->car_number)
    else '{}'::jsonb
  end into scoped
  from public.site_data where data_key='pm-customers';
  result := result || jsonb_build_array(jsonb_build_object('data_key','pm-customers','payload',coalesce(scoped,'{}'::jsonb)));

  return result;
end
$$;

create or replace function public.pm_sync_write(
  p_token text,
  p_key text,
  p_payload jsonb,
  p_page_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  car_number text;
  current_payload jsonb;
  merged jsonb;
  item jsonb;
  allowed_admin_keys constant text[] := array[
    'pm-branches','pm-notices','promotors-cases','pm-products','pm-blocked',
    'pm-customers','pm-bookings','pm-members','pm-blog-settings','pm-intro-slides',
    'pm-service-runs','pm-messages','pm-admin-notifications','pm-branch-transfer-requests',
    'pm-work-audit','pm-banned-members','pm-event-banners','pm-home-view'
  ];
begin
  select a.* into account
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token)
    and s.expires_at>now() and a.active
  limit 1;

  if account.login_id is null then
    raise exception 'AUTH_REQUIRED' using errcode='P0001';
  end if;

  if account.role in ('main','general') then
    if not (p_key = any(allowed_admin_keys)) then
      raise exception 'KEY_NOT_ALLOWED' using errcode='P0001';
    end if;
    if p_key='pm-members' and jsonb_typeof(p_payload)='array' then
      select coalesce(jsonb_agg(x-'password'),'[]'::jsonb) into merged from jsonb_array_elements(p_payload) x;
    else
      merged := p_payload;
    end if;
    insert into public.site_data(data_key,payload,page_url,updated_at)
    values(p_key,merged,p_page_url,now())
    on conflict(data_key) do update
      set payload=excluded.payload,page_url=excluded.page_url,updated_at=now();
    if p_key='pm-banned-members' then
      update public.pm_accounts a
      set active = not exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(merged)='array' then merged else '[]'::jsonb end) b
        where b->>'type' in ('blocked','deleted')
          and (
            b#>>'{member,id}'=a.login_id
            or regexp_replace(coalesce(b#>>'{member,phone}',''),'[^0-9]','','g') =
               regexp_replace(coalesce(a.profile->>'phone',''),'[^0-9]','','g')
          )
      )
      where a.role='customer';
    end if;
    return jsonb_build_object('ok',true);
  end if;

  car_number := account.profile->>'car';

  if p_key in ('pm-bookings','pm-service-runs','pm-messages') then
    if jsonb_typeof(p_payload) <> 'array' then
      raise exception 'INVALID_PAYLOAD' using errcode='P0001';
    end if;
    for item in select value from jsonb_array_elements(p_payload)
    loop
      if not (
        item->>'memberId'=account.login_id or item->>'car'=car_number
        or item#>>'{customer,id}'=account.login_id or item#>>'{customer,car}'=car_number
      ) then
        raise exception 'FORBIDDEN_ROW' using errcode='P0001';
      end if;
    end loop;
    select payload into current_payload from public.site_data where data_key=p_key for update;
    select coalesce(jsonb_agg(x),'[]'::jsonb) into merged
    from jsonb_array_elements(case when jsonb_typeof(current_payload)='array' then current_payload else '[]'::jsonb end) x
    where not (
      x->>'memberId'=account.login_id or x->>'car'=car_number
      or x#>>'{customer,id}'=account.login_id or x#>>'{customer,car}'=car_number
    );
    merged := coalesce(merged,'[]'::jsonb) || p_payload;
    update public.site_data set payload=merged,page_url=p_page_url,updated_at=now() where data_key=p_key;
    return jsonb_build_object('ok',true);
  end if;

  if p_key='pm-customers' then
    if jsonb_typeof(p_payload)<>'object'
       or exists(select 1 from jsonb_object_keys(p_payload) k where k<>car_number) then
      raise exception 'FORBIDDEN_ROW' using errcode='P0001';
    end if;
    update public.site_data
    set payload=(case when jsonb_typeof(payload)='object' then payload else '{}'::jsonb end) || p_payload,
        page_url=p_page_url,updated_at=now()
    where data_key=p_key;
    return jsonb_build_object('ok',true);
  end if;

  if p_key='pm-members' then
    item := (case when jsonb_typeof(p_payload)='array' then p_payload->0 else p_payload end) - 'password';
    if item->>'id'<>account.login_id or item->>'car'<>car_number then
      raise exception 'FORBIDDEN_ROW' using errcode='P0001';
    end if;
    update public.pm_accounts set profile=item,updated_at=now() where login_id=account.login_id;
    select payload into current_payload from public.site_data where data_key=p_key for update;
    select coalesce(jsonb_agg(x),'[]'::jsonb) into merged
    from jsonb_array_elements(case when jsonb_typeof(current_payload)='array' then current_payload else '[]'::jsonb end) x
    where x->>'id'<>account.login_id;
    update public.site_data set payload=merged||jsonb_build_array(item),updated_at=now() where data_key=p_key;
    return jsonb_build_object('ok',true);
  end if;

  if p_key in ('pm-admin-notifications','pm-work-audit') and jsonb_typeof(p_payload)='array' then
    update public.site_data
    set payload=(case when jsonb_typeof(payload)='array' then payload else '[]'::jsonb end) || p_payload,
        page_url=p_page_url,updated_at=now()
    where data_key=p_key;
    return jsonb_build_object('ok',true);
  end if;

  raise exception 'KEY_NOT_ALLOWED' using errcode='P0001';
end
$$;

create or replace function public.pm_asset_get(p_key text, p_token text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  car_number text;
  allowed boolean := false;
  asset jsonb;
begin
  if coalesce(p_key,'')='' then return null; end if;

  select a.* into account
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active
  limit 1;

  if account.role in ('main','general') then
    allowed := true;
  else
    select exists(
      select 1 from public.site_data
      where data_key=any(array['pm-branches','pm-notices','promotors-cases','pm-intro-slides','pm-event-banners'])
        and payload::text like '%' || to_jsonb(p_key)::text || '%'
    ) into allowed;

    if not allowed and account.role='customer' then
      car_number := account.profile->>'car';
      select exists(
        select 1 from public.site_data sd
        cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload)='array' then sd.payload else '[]'::jsonb end) x
        where sd.data_key in ('pm-service-runs','pm-messages')
          and (x->>'memberId'=account.login_id or x->>'car'=car_number or x#>>'{customer,id}'=account.login_id or x#>>'{customer,car}'=car_number)
          and x::text like '%' || to_jsonb(p_key)::text || '%'
      ) into allowed;
    end if;
  end if;

  if not allowed then raise exception 'ASSET_FORBIDDEN' using errcode='P0001'; end if;
  select payload->p_key into asset from public.site_data where data_key='pm-assets';
  return asset;
end
$$;

create or replace function public.pm_messages_read(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare account public.pm_accounts%rowtype; car_number text;
begin
  select a.* into account
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if account.login_id is null then raise exception 'AUTH_REQUIRED' using errcode='P0001'; end if;
  if account.role in ('main','general') then
    return coalesce((select payload from public.site_data where data_key='pm-messages'),'[]'::jsonb);
  end if;
  car_number := account.profile->>'car';
  return coalesce((
    select jsonb_agg(x)
    from public.site_data sd
    cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload)='array' then sd.payload else '[]'::jsonb end) x
    where sd.data_key='pm-messages'
      and (x->>'memberId'=account.login_id or x->>'car'=car_number or x#>>'{customer,id}'=account.login_id or x#>>'{customer,car}'=car_number)
  ),'[]'::jsonb);
end
$$;

create or replace function public.pm_asset_put(p_token text, p_key text, p_asset jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active
  limit 1;
  if role_name is null or role_name not in ('main','general') then raise exception 'ADMIN_REQUIRED' using errcode='P0001'; end if;
  if coalesce(p_key,'')='' or length(coalesce(p_asset->>'dataUrl',''))>2500000 then
    raise exception 'INVALID_ASSET' using errcode='P0001';
  end if;
  update public.site_data
  set payload=jsonb_set(case when jsonb_typeof(payload)='object' then payload else '{}'::jsonb end,array[p_key],p_asset,true),
      updated_at=now()
  where data_key='pm-assets';
  return jsonb_build_object('ok',true);
end
$$;

create or replace function public.pm_change_password(p_token text, p_current text, p_next text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare account public.pm_accounts%rowtype;
begin
  select a.* into account
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if account.login_id is null or account.password_hash<>crypt(coalesce(p_current,''),account.password_hash) then
    raise exception 'INVALID_PASSWORD' using errcode='P0001';
  end if;
  if length(coalesce(p_next,''))<10 or p_next !~ '[A-Za-z]' or p_next !~ '[0-9]' then
    raise exception 'WEAK_PASSWORD' using errcode='P0001';
  end if;
  update public.pm_accounts set password_hash=crypt(p_next,gen_salt('bf',11)),updated_at=now() where login_id=account.login_id;
  delete from public.pm_sessions where login_id=account.login_id and token_hash<>public.pm_token_hash(p_token);
  return jsonb_build_object('ok',true);
end
$$;

create or replace function public.pm_admin_accounts(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id',login_id,
      'label',coalesce(nullif(profile->>'label',''),'일반 관리자'),
      'branches',branches,
      'createdAt',created_at
    ) order by created_at)
    from public.pm_accounts where role='general' and active
  ),'[]'::jsonb);
end
$$;

create or replace function public.pm_admin_account_create(p_token text, p_password text, p_branches jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text; account_id text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001'; end if;
  if length(coalesce(p_password,''))<10 or p_password !~ '[A-Za-z]' or p_password !~ '[0-9]' then
    raise exception 'WEAK_PASSWORD' using errcode='P0001';
  end if;
  account_id := '__general__' || encode(digest(p_password || encode(gen_random_bytes(8),'hex'),'sha256'),'hex');
  insert into public.pm_accounts(login_id,password_hash,role,branches,profile)
  values(account_id,crypt(p_password,gen_salt('bf',11)),'general',coalesce(p_branches,'[]'::jsonb),jsonb_build_object('label','일반 관리자'));
  return jsonb_build_object('ok',true,'id',account_id);
end
$$;

create or replace function public.pm_admin_account_branches(p_token text, p_account_id text, p_branches jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001'; end if;
  update public.pm_accounts set branches=coalesce(p_branches,'[]'::jsonb),updated_at=now()
  where login_id=p_account_id and role='general';
  return jsonb_build_object('ok',found);
end
$$;

create or replace function public.pm_admin_account_delete(p_token text, p_account_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare role_name text;
begin
  select a.role into role_name
  from public.pm_sessions s join public.pm_accounts a on a.login_id=s.login_id
  where s.token_hash=public.pm_token_hash(p_token) and s.expires_at>now() and a.active limit 1;
  if role_name is distinct from 'main' then raise exception 'MAIN_ADMIN_REQUIRED' using errcode='P0001'; end if;
  delete from public.pm_accounts where login_id=p_account_id and role='general';
  return jsonb_build_object('ok',found);
end
$$;

create or replace function public.pm_logout(p_token text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  delete from public.pm_sessions where token_hash=public.pm_token_hash(p_token) returning true
$$;

create or replace function public.pm_log(
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_page_url text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_event_type,'')) not between 1 and 80 then return false; end if;
  insert into public.site_logs(event_type,payload,page_url)
  values(p_event_type,coalesce(p_payload,'{}'::jsonb),left(p_page_url,500));
  return true;
end
$$;

-- Remove every legacy public table policy. Access is RPC-only after this point.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'site_data','site_logs','members','bookings','customer_records','customer_memos',
    'messages','products','service_runs','service_steps','admin_accounts','site_settings',
    'admin_notifications','pm_accounts','pm_sessions'
  ]
  loop
    for policy_name in
      select policyname from pg_policies where schemaname='public' and tablename=table_name
    loop
      execute format('drop policy if exists %I on public.%I',policy_name,table_name);
    end loop;
    execute format('revoke all on table public.%I from anon, authenticated',table_name);
  end loop;
end
$$;

-- Plain-text credentials are no longer kept in shared JSON.
update public.site_data
set payload=coalesce((select jsonb_agg(x-'password') from jsonb_array_elements(payload) x),'[]'::jsonb),
    updated_at=now()
where data_key='pm-members' and jsonb_typeof(payload)='array';

update public.site_data set payload='{}'::jsonb,updated_at=now() where data_key='pm-main-admin';
update public.site_data set payload='{"accounts":[]}'::jsonb,updated_at=now() where data_key='pm-sub-admin';

revoke all on function public.pm_token_hash(text) from public, anon, authenticated;
revoke all on function public.pm_login(text,text,boolean) from public;
revoke all on function public.pm_admin_login(text) from public;
revoke all on function public.pm_register(text,text,jsonb) from public;
revoke all on function public.pm_sync_read(text) from public;
revoke all on function public.pm_sync_write(text,text,jsonb,text) from public;
revoke all on function public.pm_asset_get(text,text) from public;
revoke all on function public.pm_messages_read(text) from public;
revoke all on function public.pm_asset_put(text,text,jsonb) from public;
revoke all on function public.pm_change_password(text,text,text) from public;
revoke all on function public.pm_admin_accounts(text) from public;
revoke all on function public.pm_admin_account_create(text,text,jsonb) from public;
revoke all on function public.pm_admin_account_branches(text,text,jsonb) from public;
revoke all on function public.pm_admin_account_delete(text,text) from public;
revoke all on function public.pm_logout(text) from public;
revoke all on function public.pm_log(text,jsonb,text) from public;

grant execute on function public.pm_login(text,text,boolean) to anon, authenticated;
grant execute on function public.pm_admin_login(text) to anon, authenticated;
grant execute on function public.pm_register(text,text,jsonb) to anon, authenticated;
grant execute on function public.pm_sync_read(text) to anon, authenticated;
grant execute on function public.pm_sync_write(text,text,jsonb,text) to anon, authenticated;
grant execute on function public.pm_asset_get(text,text) to anon, authenticated;
grant execute on function public.pm_messages_read(text) to anon, authenticated;
grant execute on function public.pm_asset_put(text,text,jsonb) to anon, authenticated;
grant execute on function public.pm_change_password(text,text,text) to anon, authenticated;
grant execute on function public.pm_admin_accounts(text) to anon, authenticated;
grant execute on function public.pm_admin_account_create(text,text,jsonb) to anon, authenticated;
grant execute on function public.pm_admin_account_branches(text,text,jsonb) to anon, authenticated;
grant execute on function public.pm_admin_account_delete(text,text) to anon, authenticated;
grant execute on function public.pm_logout(text) to anon, authenticated;
grant execute on function public.pm_log(text,jsonb,text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- Verification: every count must be 0 except rpc_count.
select
  (select count(*) from pg_policies where schemaname='public' and roles::text like '%anon%') as anon_policy_count,
  (select count(*) from information_schema.routine_privileges
   where specific_schema='public' and grantee='anon' and privilege_type='EXECUTE'
     and routine_name like 'pm_%') as rpc_count;
