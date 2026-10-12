-- Preserve the existing member authentication, ownership, privacy, and slot checks.
CREATE OR REPLACE FUNCTION public.pm_member_booking_create(p_token text, p_booking jsonb, p_page_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  account public.pm_accounts%rowtype;
  bookings_payload jsonb;
  clean_booking jsonb;
  booking_id text := btrim(coalesce(p_booking->>'id', ''));
  branch_name text := btrim(coalesce(p_booking->>'branch', ''));
  booking_date_text text := btrim(coalesce(p_booking->>'date', ''));
  booking_time text := btrim(coalesce(p_booking->>'time', ''));
  schedule jsonb;
  day_schedule jsonb;
  day_number integer;
  open_time text;
  close_time text;
  car_number text;
  customer_name text;
  phone_number text;
  car_model text;
  service_list jsonb;
  memo_text text := left(btrim(coalesce(p_booking->>'memo', '')), 2000);
  booking_date_value date;
  now_text text := to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  perform pm_privacy.before_write(p_token);
  select a.*
  into account
  from public.pm_sessions s
  join public.pm_accounts a on a.login_id = s.login_id
  where s.token_hash = public.pm_token_hash(p_token)
    and s.expires_at > now()
    and a.active
    and a.role = 'customer'
  limit 1;

  if account.login_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if booking_id = '' or length(booking_id) > 160 then
    raise exception 'BOOKING_INVALID_ID' using errcode = 'P0001';
  end if;

  if branch_name = '' or length(branch_name) > 100
     or not exists (
       select 1
       from public.site_data sd
       cross join lateral jsonb_array_elements(
         case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end
       ) branch
       where sd.data_key = 'pm-branches'
         and branch->>'name' = branch_name
     ) then
    raise exception 'BOOKING_INVALID_BRANCH' using errcode = 'P0001';
  end if;

  if booking_date_text !~ '^\d{4}\.\d{2}\.\d{2}$' then
    raise exception 'BOOKING_INVALID_DATE' using errcode = 'P0001';
  end if;
  booking_date_value := to_date(booking_date_text, 'YYYY.MM.DD');
  if to_char(booking_date_value, 'YYYY.MM.DD') <> booking_date_text
     or booking_date_value < current_date then
    raise exception 'BOOKING_INVALID_DATE' using errcode = 'P0001';
  end if;

  if booking_time not in (
    '09:00', '10:00', '11:00', '12:00', '13:00',
    '14:00', '15:00', '16:00', '17:00', '18:00'
  ) then
    raise exception 'BOOKING_INVALID_TIME' using errcode = 'P0001';
  end if;

  -- Use the same persisted branch schedule as the web and app calendars.
  select payload->branch_name into schedule
  from public.site_data where data_key = 'pm-branch-hours';
  if jsonb_typeof(schedule) is distinct from 'object' then
    raise exception 'BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
  end if;
  if coalesce(schedule->'closedDates', '[]'::jsonb) ? booking_date_text then
    raise exception 'BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
  end if;
  day_number := extract(dow from booking_date_value);
  day_schedule := schedule->'days'->day_number::text;
  if jsonb_typeof(day_schedule) = 'object' then
    if not coalesce((day_schedule->>'open')::boolean, false) then
      raise exception 'BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
    end if;
    open_time := coalesce(day_schedule->>'start', '09:00');
    close_time := coalesce(day_schedule->>'end', '18:00');
  else
    if day_number = 0 and coalesce((schedule->>'sundayClosed')::boolean, true) then
      raise exception 'BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
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
    raise exception 'BOOKING_BUSINESS_CLOSED' using errcode = 'P0001';
  end if;
  if coalesce((schedule->>'lunchEnabled')::boolean, false)
     and booking_time >= coalesce(schedule->>'lunchStart', '12:00')
     and booking_time < coalesce(schedule->>'lunchEnd', '13:00') then
    raise exception 'BOOKING_LUNCH_TIME' using errcode = 'P0001';
  end if;

  car_number := regexp_replace(coalesce(account.profile->>'car', ''), '\s', '', 'g');
  customer_name := left(btrim(coalesce(account.profile->>'name', '')), 100);
  phone_number := regexp_replace(coalesce(account.profile->>'phone', ''), '[^0-9]', '', 'g');
  car_model := left(btrim(coalesce(account.profile->>'model', p_booking->>'model', '')), 200);
  service_list := case
    when jsonb_typeof(p_booking->'services') = 'array' then p_booking->'services'
    else '[]'::jsonb
  end;

  if car_number = '' or customer_name = '' or length(phone_number) not between 10 and 11 then
    raise exception 'BOOKING_INVALID_PROFILE' using errcode = 'P0001';
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
    select 1
    from jsonb_array_elements(bookings_payload) item
    where item->>'branch' = branch_name
      and item->>'date' = booking_date_text
      and item->>'time' = booking_time
      and coalesce(item->>'status', '') <> U&'\CDE8\C18C'
  ) or exists (
    select 1
    from public.site_data sd
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(sd.payload) = 'array' then sd.payload else '[]'::jsonb end
    ) item
    where sd.data_key = 'pm-blocked'
      and item->>'branch' = branch_name
      and item->>'date' = booking_date_text
      and item->>'time' = booking_time
  ) then
    raise exception 'BOOKING_SLOT_TAKEN' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(bookings_payload) item
    where (
        item->>'memberId' = account.login_id
        or regexp_replace(coalesce(item->>'car', ''), '\s', '', 'g') = car_number
      )
      and coalesce(item->>'status', '') <> U&'\CDE8\C18C'
      and coalesce(item->>'date', '') >= to_char(current_date, 'YYYY.MM.DD')
  ) then
    raise exception 'ACTIVE_BOOKING_EXISTS' using errcode = 'P0001';
  end if;

  clean_booking := jsonb_build_object(
    'id', booking_id,
    'branch', branch_name,
    'date', booking_date_text,
    'time', booking_time,
    'memberId', account.login_id,
    'guest', false,
    'car', car_number,
    'name', customer_name,
    'phone', phone_number,
    'model', car_model,
    'services', service_list,
    'memo', memo_text,
    'couponAssignmentId', left(coalesce(p_booking->>'couponAssignmentId', ''), 160),
    'couponName', left(coalesce(p_booking->>'couponName', ''), 300),
    'status', U&'\C2E0\ADDC',
    'createdAt', now_text
  );

  update public.site_data
  set payload = bookings_payload || jsonb_build_array(clean_booking),
      page_url = p_page_url,
      updated_at = now()
  where data_key = 'pm-bookings';

  update public.pm_sessions
  set last_seen_at = now()
  where token_hash = public.pm_token_hash(p_token);

  return clean_booking;
end
$function$;
