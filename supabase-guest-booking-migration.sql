-- 비회원 예약 저장 + 관리자 신규 알림
-- Supabase SQL Editor에서 파일 전체를 1회 실행하세요.
-- 기존 예약 데이터는 변경하지 않습니다.

begin;

insert into public.site_data(data_key, payload, page_url, updated_at)
values ('pm-branch-hours', '{}'::jsonb, 'https://www.promotors.kr/', now())
on conflict(data_key) do nothing;

create or replace function public.pm_branch_hours_read()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce((select payload from public.site_data where data_key = 'pm-branch-hours'), '{}'::jsonb)
$$;

create or replace function public.pm_branch_hours_write(
  p_token text,
  p_branch text,
  p_settings jsonb,
  p_page_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  account public.pm_accounts%rowtype;
  clean_branch text := btrim(coalesce(p_branch, ''));
  merged jsonb;
begin
  select a.* into account
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now() and a.active
  limit 1;

  if account.login_id is null or account.role not in ('main', 'general') then
    raise exception 'ADMIN_REQUIRED' using errcode = 'P0001';
  end if;
  if account.role = 'general'
     and jsonb_array_length(coalesce(account.branches, '[]'::jsonb)) > 0
     and not coalesce(account.branches ? clean_branch, false) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_settings) is distinct from 'object'
     or octet_length(p_settings::text) > 5000
     or length(coalesce(p_page_url, '')) > 500 then
    raise exception 'INVALID_BRANCH_HOURS' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.site_data sd
    cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end) branch
    where sd.data_key = 'pm-branches' and branch->>'name' = clean_branch
  ) then
    raise exception 'INVALID_BRANCH' using errcode = 'P0001';
  end if;

  insert into public.site_data(data_key, payload, page_url, updated_at)
  values ('pm-branch-hours', jsonb_build_object(clean_branch, p_settings), p_page_url, now())
  on conflict(data_key) do update
  set payload = (case when jsonb_typeof(public.site_data.payload) = 'object' then public.site_data.payload else '{}'::jsonb end)
                || jsonb_build_object(clean_branch, p_settings),
      page_url = excluded.page_url,
      updated_at = now()
  returning payload into merged;
  return merged;
end
$$;

create or replace function public.pm_guest_booking_create(
  p_booking jsonb,
  p_page_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  clean_booking jsonb;
  booking_id text := 'book-' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text || '-' || encode(gen_random_bytes(6), 'hex');
  branch_name text := btrim(coalesce(p_booking->>'branch', ''));
  booking_date_text text := btrim(coalesce(p_booking->>'date', ''));
  booking_day date;
  booking_time text := btrim(coalesce(p_booking->>'time', ''));
  customer_name text := btrim(coalesce(p_booking->>'name', ''));
  car_number text := regexp_replace(coalesce(p_booking->>'car', ''), '\s', '', 'g');
  phone_number text := regexp_replace(coalesce(p_booking->>'phone', ''), '[^0-9]', '', 'g');
  car_model text := btrim(coalesce(p_booking->>'model', ''));
  memo_text text := btrim(coalesce(p_booking->>'memo', ''));
  service_list jsonb := coalesce(p_booking->'services', '[]'::jsonb);
  bookings_payload jsonb;
  schedule jsonb;
  day_schedule jsonb;
  day_number integer;
  open_time text;
  close_time text;
  now_text text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if jsonb_typeof(p_booking) is distinct from 'object' then
    raise exception 'GUEST_BOOKING_INVALID' using errcode = 'P0001';
  end if;

  if octet_length(p_booking::text) > 5000
     or length(coalesce(p_page_url, '')) > 500
     or length(customer_name) not between 1 and 40
     or length(car_number) not between 4 and 20
     or length(phone_number) not between 9 and 11
     or length(car_model) not between 1 and 60
     or length(memo_text) > 1000
     or jsonb_typeof(service_list) is distinct from 'array'
     or jsonb_array_length(service_list) > 20 then
    raise exception 'GUEST_BOOKING_INVALID' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from jsonb_array_elements(service_list) service
    where jsonb_typeof(service) <> 'string' or length(service #>> '{}') > 80
  ) then
    raise exception 'GUEST_BOOKING_INVALID' using errcode = 'P0001';
  end if;

  if booking_date_text !~ '^\d{4}\.\d{2}\.\d{2}$' then
    raise exception 'GUEST_BOOKING_INVALID_DATE' using errcode = 'P0001';
  end if;
  booking_day := to_date(booking_date_text, 'YYYY.MM.DD');
  if to_char(booking_day, 'YYYY.MM.DD') <> booking_date_text
     or booking_day < current_date
     or booking_day > current_date + 365 then
    raise exception 'GUEST_BOOKING_INVALID_DATE' using errcode = 'P0001';
  end if;

  if booking_time <> all(array['09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00']) then
    raise exception 'GUEST_BOOKING_INVALID_TIME' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.site_data sd
    cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end) branch
    where sd.data_key = 'pm-branches' and branch->>'name' = branch_name
  ) then
    raise exception 'GUEST_BOOKING_INVALID_BRANCH' using errcode = 'P0001';
  end if;

  select payload->branch_name into schedule
  from public.site_data where data_key = 'pm-branch-hours';
  day_number := extract(dow from booking_day);
  if schedule is null then
    if day_number = 0 then
      raise exception 'GUEST_BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
    end if;
  else
    if coalesce(schedule->'closedDates', '[]'::jsonb) ? booking_date_text then
      raise exception 'GUEST_BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
    end if;
    day_schedule := schedule->'days'->day_number::text;
    if jsonb_typeof(day_schedule) = 'object' then
      if not coalesce((day_schedule->>'open')::boolean, false) then
        raise exception 'GUEST_BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
      end if;
      open_time := coalesce(day_schedule->>'start', '09:00');
      close_time := coalesce(day_schedule->>'end', '18:00');
    else
      if day_number = 0 and coalesce((schedule->>'sundayClosed')::boolean, true) then
        raise exception 'GUEST_BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
      end if;
      open_time := case day_number
        when 0 then coalesce(schedule->>'sundayOpen', '09:00')
        when 6 then coalesce(schedule->>'saturdayOpen', '09:00')
        else coalesce(schedule->>'weekdayOpen', '09:00') end;
      close_time := case day_number
        when 0 then coalesce(schedule->>'sundayClose', '18:00')
        when 6 then coalesce(schedule->>'saturdayClose', '18:00')
        else coalesce(schedule->>'weekdayClose', '18:00') end;
    end if;
    if booking_time < open_time or booking_time >= close_time then
      raise exception 'GUEST_BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
    end if;
    if coalesce((schedule->>'lunchEnabled')::boolean, false)
       and booking_time >= coalesce(schedule->>'lunchStart', '12:00')
       and booking_time < coalesce(schedule->>'lunchEnd', '13:00') then
      raise exception 'GUEST_BOOKING_LUNCH_TIME' using errcode = 'P0001';
    end if;
  end if;

  insert into public.site_data(data_key, payload, page_url, updated_at)
  values ('pm-bookings', '[]'::jsonb, p_page_url, now())
  on conflict (data_key) do nothing;

  select case when jsonb_typeof(payload) = 'array' then payload else '[]'::jsonb end
  into bookings_payload
  from public.site_data
  where data_key = 'pm-bookings'
  for update;

  if exists (
    select 1 from jsonb_array_elements(bookings_payload) item
    where item->>'branch' = branch_name
      and item->>'date' = booking_date_text
      and item->>'time' = booking_time
      and coalesce(item->>'status', '') <> '취소'
  ) or exists (
    select 1 from public.site_data sd
    cross join lateral jsonb_array_elements(case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end) item
    where sd.data_key = 'pm-blocked'
      and item->>'branch' = branch_name
      and item->>'date' = booking_date_text
      and item->>'time' = booking_time
  ) then
    raise exception 'GUEST_BOOKING_SLOT_TAKEN' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from jsonb_array_elements(bookings_payload) item
    where regexp_replace(coalesce(item->>'car', ''), '\s', '', 'g') = car_number
      and coalesce(item->>'status', '') <> '취소'
      and coalesce(item->>'date', '') >= to_char(current_date, 'YYYY.MM.DD')
  ) then
    raise exception 'GUEST_ACTIVE_BOOKING_EXISTS' using errcode = 'P0001';
  end if;

  clean_booking := jsonb_build_object(
    'id', booking_id,
    'branch', branch_name,
    'date', booking_date_text,
    'time', booking_time,
    'memberId', '',
    'guest', true,
    'car', car_number,
    'name', customer_name,
    'phone', phone_number,
    'model', car_model,
    'services', service_list,
    'memo', memo_text,
    'status', '신규',
    'createdAt', now_text
  );

  update public.site_data
  set payload = bookings_payload || jsonb_build_array(clean_booking),
      page_url = p_page_url,
      updated_at = now()
  where data_key = 'pm-bookings';

  insert into public.site_data(data_key, payload, page_url, updated_at)
  values (
    'pm-admin-notifications',
    jsonb_build_array(jsonb_build_object(
      'id', 'note-' || booking_id,
      'message', customer_name || ' ' || car_number || ' ' || branch_name || ' ' || booking_date_text || ' ' || booking_time || ' 비회원 예약 확인 요청',
      'payload', jsonb_build_object('bookingId', booking_id, 'branch', branch_name),
      'read', false,
      'createdAt', now_text
    )),
    p_page_url,
    now()
  )
  on conflict(data_key) do update
  set payload = jsonb_path_query_array(
        jsonb_build_array(excluded.payload->0) ||
        case when jsonb_typeof(public.site_data.payload) = 'array' then public.site_data.payload else '[]'::jsonb end,
        '$[0 to 199]'
      ),
      page_url = excluded.page_url,
      updated_at = now();

  insert into public.site_data(data_key, payload, page_url, updated_at)
  values (
    'pm-work-audit',
    jsonb_build_array(jsonb_build_object(
      'id', 'audit-' || booking_id,
      'at', now_text,
      'by', '비회원',
      'action', '고객 예약',
      'runId', '',
      'car', car_number,
      'customer', customer_name,
      'phone', phone_number,
      'model', car_model,
      'branch', branch_name,
      'service', coalesce((select string_agg(service #>> '{}', ', ') from jsonb_array_elements(service_list) service), '서비스 미선택'),
      'bookingDate', booking_date_text,
      'bookingTime', booking_time,
      'step', '',
      'memo', '',
      'photos', 0,
      'detail', case when memo_text = '' then '' else '요청메모: ' || memo_text end
    )),
    p_page_url,
    now()
  )
  on conflict(data_key) do update
  set payload = jsonb_path_query_array(
        jsonb_build_array(excluded.payload->0) ||
        case when jsonb_typeof(public.site_data.payload) = 'array' then public.site_data.payload else '[]'::jsonb end,
        '$[0 to 499]'
      ),
      page_url = excluded.page_url,
      updated_at = now();

  return clean_booking;
end
$$;

revoke all on function public.pm_guest_booking_create(jsonb, text) from public;
revoke all on function public.pm_branch_hours_read() from public;
revoke all on function public.pm_branch_hours_write(text, text, jsonb, text) from public;
grant execute on function public.pm_guest_booking_create(jsonb, text) to anon, authenticated;
grant execute on function public.pm_branch_hours_read() to anon, authenticated;
grant execute on function public.pm_branch_hours_write(text, text, jsonb, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;

-- 적용 확인: function_exists가 true여야 합니다.
select
  to_regprocedure('public.pm_guest_booking_create(jsonb,text)') is not null as guest_booking_function_exists,
  to_regprocedure('public.pm_branch_hours_read()') is not null as branch_hours_read_exists,
  to_regprocedure('public.pm_branch_hours_write(text,text,jsonb,text)') is not null as branch_hours_write_exists;
