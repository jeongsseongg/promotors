const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
const migration = 'supabase/migrations/20261021042411_customer_notification_lifecycle.sql';
const did = '11111111-1111-4111-8111-111111111111';
async function using(fn) {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema extensions;
      create schema pm_privacy; create schema pm_push_private;
      create table site_data(data_key text primary key,payload jsonb);
      create table pm_accounts(login_id text primary key,active boolean,role text,branches jsonb);
      create table pm_sessions(login_id text,token_hash text primary key,expires_at timestamptz);
      create table pm_push_preferences(login_id text primary key,enabled boolean default false,booking boolean default true,repair boolean default true);
      create table pm_push_devices(device_id uuid primary key,login_id text,session_hash text,subscription jsonb,endpoint text unique,binding uuid,revoked_at timestamptz,updated_at timestamptz default now());
      create table pm_push_inbox(id uuid primary key,login_id text,category text,target jsonb,title text,body text,event_key text,cancelled_at timestamptz,due_at timestamptz,created_at timestamptz);
      create table pm_push_deliveries(id uuid primary key,notification_id uuid);
      create function pm_token_hash(text) returns text language sql as 'select md5($1)';
      create function pm_push_array(jsonb) returns jsonb language sql immutable as $$select case when jsonb_typeof($1)='array' then $1 else '[]'::jsonb end$$;
      create function pm_notifications(text,text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
      create function pm_privacy.before_write(text) returns void language plpgsql as $$begin
        if current_setting('request.headers',true)::jsonb->>'x-promotors-data-epoch' is distinct from '7' then raise exception 'PRIVACY_EPOCH_MISMATCH'; end if;
      end$$;
      set request.headers='{"x-promotors-data-epoch":"7"}';
      insert into pm_accounts values('own',true,'customer','[]'),('other',true,'customer','[]'),('admin',true,'main','[]');
      insert into pm_sessions values('own',md5('own-token'),now()+interval '1 hour'),('other',md5('other-token'),now()+interval '1 hour'),('admin',md5('admin-token'),now()+interval '1 hour');
      insert into pm_push_preferences values('own',true,true,true),('other',true,true,true);
    `);
    await db.exec(fs.readFileSync(migration,'utf8'));
    const call = async (auth='own-token') => (await db.query('select pm_customer_activity($1) value',[auth])).rows[0].value;
    const put = async (key,items) => db.query('insert into site_data values($1,$2) on conflict(data_key) do update set payload=excluded.payload',[key,JSON.stringify(items)]);
    const state = async item => (await db.query('select pm_push_private.customer_state($1,true) value',[JSON.stringify(item)])).rows[0].value;
    await fn({db,call,put,state});
  } finally {await db.close();}
}
const run = {id:'own-run',memberId:'own',status:'정비 중',bookingKey:'own-booking',branch:'안산',car:'00가9071',model:'점검 차량',steps:[{name:'입고 점검',approved:true},{name:'내부 기록',approved:false}]};

test('현재 고객 SQL은 같은 차량번호의 타인 기록과 미승인 단계 정보를 반환하지 않는다', () => using(async ({put,call,db}) => {
  await put('pm-service-runs',[{...run,id:'foreign-run',memberId:'other'},run]);
  const mine=await call(); assert.equal(mine.runId,'own-run'); assert.equal(mine.bookingId,'own-booking');
  assert.equal(mine.stageLabel,'입고 점검 확인 완료'); assert.equal(JSON.stringify(mine).includes('내부 기록'),false);
  assert.equal((await call('other-token')).runId,'foreign-run');
  await db.exec("update pm_accounts set active=false where login_id='own'");
  await assert.rejects(call(),/AUTH_REQUIRED/);
}));

test('현재 고객 SQL은 구분된 세션·역할·시점 검사와 비공개 함수 접근을 보존한다', () => using(async ({call,db}) => {
  for(const auth of ['invalid','admin-token']) await assert.rejects(call(auth),/AUTH_REQUIRED/);
  await db.exec("update pm_sessions set expires_at=now()-interval '1 minute' where login_id='own'");
  await assert.rejects(call(),/AUTH_REQUIRED/);
  await db.exec("set request.headers='{\"x-promotors-data-epoch\":\"6\"}'");
  await assert.rejects(call(),/PRIVACY_EPOCH_MISMATCH/);
  const row=(await db.query("select has_function_privilege('anon','pm_push_private.customer_snapshot(text)','execute') allowed")).rows[0];
  assert.equal(row.allowed,false);
}));

test('고객 수신 설정을 끄면 실제 마이그레이션 RPC가 오류 없이 상시알림 해제를 반환한다', () => using(async ({db,put,call}) => {
  await put('pm-service-runs',[run]); assert.equal((await call()).active,true);
  await db.exec("update pm_push_preferences set repair=false where login_id='own'"); assert.equal((await call()).active,false);
  await db.exec("update pm_push_preferences set repair=true,enabled=false where login_id='own'"); assert.equal((await call()).active,false);
  await db.exec("delete from pm_push_preferences where login_id='own'"); assert.equal((await call()).active,false);
}));

test('입고 완료는 정비 완료로 표시하지 않고 완료 요약과 익명화 기록은 만료한다', () => using(async ({state}) => {
  assert.equal((await state({...run,status:'입고 완료'})).phase,'repair');
  const complete=await state({...run,status:'완료',completedAt:new Date().toISOString()});
  assert.equal(complete.phase,'completed'); assert.equal(complete.progress,100);
  assert.equal(await state({...run,status:'완료',completedAt:new Date(Date.now()-3*3600000).toISOString()}),null);
  assert.equal(await state({...run,deidentified:true}),null);
  assert.equal(await state({...run,status:'취소'}),null);
}));

test('고객 Live Activity 토큰은 본인의 현재 아이폰 연결에만 저장한다', () => using(async ({db}) => {
  const subscribe=async(auth,data,action='native_subscribe') => (await db.query('select pm_native_push_subscribe($1,$2,$3) value',[auth,action,JSON.stringify(data)])).rows[0].value;
  const first=await subscribe('own-token',{deviceId:did,transport:'apns',token:'a'.repeat(64)});
  const activity={deviceId:did,binding:first.binding,kind:'update',token:'b'.repeat(64)};
  await subscribe('own-token',activity,'native_activity');
  const stored=(await db.query('select subscription from pm_push_devices')).rows[0].subscription;
  assert.equal(stored.activityAudience,'customer'); assert.equal(stored.activityUpdate,'b'.repeat(64));
  await assert.rejects(subscribe('other-token',activity,'native_activity'),/DEVICE_BINDING_REQUIRED/);
  await db.exec('update pm_push_devices set revoked_at=now()');
  await assert.rejects(subscribe('own-token',activity,'native_activity'),/DEVICE_BINDING_REQUIRED/);
}));
