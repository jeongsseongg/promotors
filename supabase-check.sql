-- ============================================================
-- 프로모터스 Supabase 등록 상태 검사
-- 사용법: 이 파일 전체를 Supabase SQL Editor에 붙여넣고 Run.
--   마지막에 점검 결과 표가 나옵니다. (구분 / 항목 / 상태 / 상세)
-- 상태가 '위험' 또는 '누락'이면 임의로 schema 파일을 재실행하지 말고
-- supabase-security-migration.sql과 supabase-auth-null-hotfix.sql을 확인하세요.
-- ============================================================

create or replace function pg_temp.promotors_check()
returns table(구분 text, 항목 text, 상태 text, 상세 text)
language plpgsql
as $fn$
declare
  required_tables text[] := array[
    'site_data','site_logs','members','bookings','customer_records','customer_memos',
    'messages','products','service_runs','service_steps','admin_accounts','site_settings','admin_notifications'
  ];
  required_keys text[] := array[
    'pm-branches','pm-notices','promotors-cases','pm-products','pm-blocked','pm-customers',
    'pm-bookings','pm-members','pm-blog-settings','pm-intro-slides','pm-assets','pm-service-runs',
    'pm-messages','pm-sub-admin','pm-main-admin','pm-security-settings','pm-home-view','pm-admin-notifications',
    'pm-branch-transfer-requests','pm-work-audit'
  ];
  required_settings text[] := array['home_view','realtime_service'];
  t text;
  missing text;
begin
  -- 1. 테이블 존재 여부 ------------------------------------------------
  foreach t in array required_tables loop
    return query select '1. 테이블'::text, t,
      case when to_regclass('public.' || t) is null then '누락' else 'OK' end,
      case when to_regclass('public.' || t) is null then 'supabase-schema.sql을 실행해 생성하세요' else '' end;
  end loop;

  -- 2. 필수 컬럼 (누락된 컬럼이 있는 테이블만 표시) ---------------------
  for t, missing in
    select r.tbl, string_agg(r.col, ', ' order by r.col)
    from (values
      ('site_data','data_key'),('site_data','payload'),('site_data','page_url'),('site_data','updated_at'),
      ('site_logs','event_type'),('site_logs','payload'),('site_logs','page_url'),('site_logs','created_at'),
      ('members','login_id'),('members','password_hash'),('members','name'),('members','car_name'),
      ('members','car_number'),('members','phone'),('members','email'),('members','address'),('members','role'),
      ('bookings','member_id'),('bookings','branch'),('bookings','booking_date'),('bookings','booking_time'),
      ('bookings','services'),('bookings','memo'),('bookings','status'),('bookings','amount'),
      ('bookings','pay_type'),('bookings','paid'),
      ('customer_records','member_id'),('customer_records','service_date'),('customer_records','service'),
      ('customer_records','amount'),('customer_records','pay_type'),('customer_records','paid'),('customer_records','memo'),
      ('customer_memos','member_id'),('customer_memos','memo'),
      ('messages','member_id'),('messages','sender'),('messages','message'),('messages','service_context'),
      ('products','name'),('products','description'),('products','workflow_steps'),('products','workflow_config'),
      ('service_runs','member_id'),('service_runs','product_id'),('service_runs','booking_id'),
      ('service_runs','booking_key'),('service_runs','booking_date'),('service_runs','booking_time'),
      ('service_runs','branch'),('service_runs','car_number'),('service_runs','customer_name'),
      ('service_runs','customer_phone'),('service_runs','car_model'),('service_runs','service_name'),
      ('service_runs','reason'),('service_runs','current_step'),('service_runs','status'),('service_runs','completed_at'),
      ('service_steps','run_id'),('service_steps','step_order'),('service_steps','step_name'),
      ('service_steps','photo_urls'),('service_steps','photo_required'),('service_steps','memo_required'),
      ('service_steps','memo'),('service_steps','submitted'),('service_steps','submitted_at'),
      ('service_steps','approved'),('service_steps','approved_at'),('service_steps','rejected_at'),('service_steps','reject_reason'),
      ('admin_accounts','role'),('admin_accounts','password_hash'),('admin_accounts','active'),('admin_accounts','updated_at'),
      ('site_settings','setting_key'),('site_settings','payload'),('site_settings','updated_at'),
      ('admin_notifications','message'),('admin_notifications','payload'),('admin_notifications','read')
    ) as r(tbl, col)
    left join information_schema.columns c
      on c.table_schema = 'public' and c.table_name = r.tbl and c.column_name = r.col
    where c.column_name is null and to_regclass('public.' || r.tbl) is not null
    group by r.tbl
  loop
    return query select '2. 컬럼'::text, t, '누락'::text, '누락 컬럼: ' || missing;
  end loop;
  if not found then
    return query select '2. 컬럼'::text, '전체 테이블'::text, 'OK'::text, '필수 컬럼이 모두 존재합니다'::text;
  end if;

  -- 3. RLS(행 수준 보안) 활성화 여부 ------------------------------------
  foreach t in array required_tables loop
    if to_regclass('public.' || t) is not null then
      return query select '3. RLS'::text, t,
        case when (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then 'OK' else '누락' end,
        case when (select relrowsecurity from pg_class where oid = to_regclass('public.' || t)) then ''
             else format('alter table public.%I enable row level security; 실행 필요', t) end;
    end if;
  end loop;

  -- 4. anon/authenticated 직접 테이블 접근은 없어야 함 -----------------
  return query
  select '4. 직접 접근'::text, 'anon RLS 정책'::text,
    case when count(*)=0 then 'OK' else '위험' end,
    case when count(*)=0 then 'RPC만 허용됨' else format('anon 정책 %s개가 남아 있습니다',count(*)) end
  from pg_policies
  where schemaname='public' and roles::text like '%anon%';

  return query
  select '4. 직접 접근'::text, '테이블 권한'::text,
    case when count(*)=0 then 'OK' else '위험' end,
    case when count(*)=0 then 'anon/authenticated 직접 권한 없음' else format('직접 권한 %s개가 남아 있습니다',count(*)) end
  from information_schema.role_table_grants
  where table_schema='public' and grantee in ('anon','authenticated');

  -- 5. site_data 필수 키 (사이트가 실제 저장에 사용하는 키) --------------
  if to_regclass('public.site_data') is not null then
    select string_agg(k, ', ') into missing
    from unnest(required_keys) as k
    where not exists (select 1 from public.site_data d where d.data_key = k);
    return query select '5. site_data 키'::text,
      format('pm-* 저장 키 %s개', array_length(required_keys, 1)),
      case when missing is null then 'OK' else '누락' end,
      coalesce('누락 키: ' || missing || ' — supabase-schema.sql의 insert 블록 실행 필요', '');
  else
    return query select '5. site_data 키'::text, 'site_data'::text, '건너뜀'::text, 'site_data 테이블이 없어 확인 불가'::text;
  end if;

  -- 6. site_settings 필수 키 --------------------------------------------
  if to_regclass('public.site_settings') is not null then
    select string_agg(k, ', ') into missing
    from unnest(required_settings) as k
    where not exists (select 1 from public.site_settings s where s.setting_key = k);
    return query select '6. site_settings 키'::text,
      array_to_string(required_settings, ', '),
      case when missing is null then 'OK' else '누락' end,
      coalesce('누락 키: ' || missing, '');
  else
    return query select '6. site_settings 키'::text, 'site_settings'::text, '건너뜀'::text, 'site_settings 테이블이 없어 확인 불가'::text;
  end if;

  -- 7. 관리자 RPC의 NULL 세션 우회 차단 여부 --------------------------
  return query select '7. RPC 보안'::text, 'pm_admin_accounts'::text,
    case when to_regprocedure('public.pm_admin_accounts(text)') is not null
           and position('is distinct from ''main''' in pg_get_functiondef(to_regprocedure('public.pm_admin_accounts(text)')))>0
         then 'OK' else '위험' end,
    '유효하지 않은 토큰은 MAIN_ADMIN_REQUIRED로 차단되어야 합니다'::text;

  return query select '7. RPC 보안'::text, 'pm_asset_put'::text,
    case when to_regprocedure('public.pm_asset_put(text,text,jsonb)') is not null
           and position('role_name is null' in pg_get_functiondef(to_regprocedure('public.pm_asset_put(text,text,jsonb)')))>0
         then 'OK' else '위험' end,
    '유효하지 않은 토큰은 ADMIN_REQUIRED로 차단되어야 합니다'::text;
end
$fn$;

select * from pg_temp.promotors_check()
order by 구분, case 상태 when '누락' then 0 when '건너뜀' then 1 else 2 end, 항목;
