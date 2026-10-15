const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const device = '11111111-1111-4111-8111-111111111111';
const binding = '22222222-2222-4222-8222-222222222222';
const native = { nativeDeviceId: device, nativeBinding: binding };

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema pm_privacy; create schema pm_push_private;
    create table pm_accounts(login_id text primary key, active boolean, role text, branches jsonb, profile jsonb default '{}');
    create table pm_sessions(login_id text,token_hash text primary key,expires_at timestamptz);
    create table pm_push_devices(device_id uuid primary key,login_id text,session_hash text,subscription jsonb,binding uuid,revoked_at timestamptz);
    create table site_data(data_key text primary key,payload jsonb);
    create table action_audit(payload jsonb);
    create function pm_token_hash(text) returns text language sql as 'select md5($1)';
    create function pm_privacy.before_write(p_token text) returns void language plpgsql as $$ begin
      if current_setting('request.headers',true)::jsonb->>'x-promotors-data-epoch' is distinct from '7' then
        raise exception 'PRIVACY_EPOCH_MISMATCH'; end if;
    end $$;
    create function pm_notifications(text,text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function pm_sync_merge_by_id(p_token text,p_key text,p_rows jsonb,p_unused jsonb) returns void language plpgsql as $$ begin
      update site_data set payload=(select jsonb_agg(case when item->>'id'=p_rows->0->>'id' then p_rows->0 else item end)
        from jsonb_array_elements(payload) item) where data_key=p_key;
      insert into action_audit values(p_rows);
    end $$;
    insert into pm_accounts(login_id,active,role,branches) values('a',true,'general','["안산"]'),('b',true,'general','["새솔"]');
    insert into pm_sessions values('a',md5('token-a'),now()+interval '1 hour'),('a',md5('token-a-2'),now()+interval '1 hour'),('b',md5('token-b'),now()+interval '1 hour');
    insert into pm_push_devices values('${device}','a',md5('token-a'),'{"transport":"fcm"}','${binding}',null);
    insert into site_data values('pm-bookings','[{"id":"example","branch":"안산","status":"신규","name":"예시 고객","model":"예시 차량","car":"비공개"}]');
    set request.headers='{"x-promotors-data-epoch":"7"}';`);
  await db.exec(fs.readFileSync(path.join(__dirname, '../notifications/admin-booking-actions.sql'), 'utf8'));
  const call = async (data = native, token = 'token-a', action = 'accept') =>
    (await db.query('select pm_admin_booking_actions($1,$2,$3::jsonb) result', [token, action, JSON.stringify({ id: 'example', ...data })])).rows[0].result;
  const unchanged = async () => {
    assert.equal((await db.query("select payload->0->>'status' status from site_data where data_key='pm-bookings'")).rows[0].status, '신규');
    assert.equal((await db.query('select count(*) count from action_audit')).rows[0].count, 0);
  };
  return { db, call, unchanged };
}
async function using(fn) { const state = await setup(); try { await fn(state); } finally { await state.db.close(); } }

test('a valid current native action changes once and legacy UI calls still work', () => using(async ({ db, call }) => {
  assert.equal((await call()).changed, true);
  assert.equal((await call()).changed, false);
  assert.equal((await db.query('select count(*) count from action_audit')).rows[0].count, 1);
  await db.exec("update site_data set payload=jsonb_set(payload,'{0,status}','\"신규\"')");
  assert.equal((await call({})).changed, true);
}));

test('partial, null, wrong-format and stale native bindings cannot change a booking', () => using(async ({ call, unchanged }) => {
  for (const data of [{ nativeDeviceId: device }, { nativeBinding: binding }, { ...native, nativeBinding: null },
    { ...native, nativeDeviceId: null }, { ...native, nativeBinding: 'not-a-uuid' },
    { ...native, nativeBinding: '33333333-3333-4333-8333-333333333333' },
    { ...native, nativeDeviceId: '33333333-3333-4333-8333-333333333333' }]) {
    await assert.rejects(call(data), /DEVICE_BINDING_REQUIRED/); await unchanged();
  }
}));

test('the native action is tied to the exact session, account, native transport and revocation state', () => using(async ({ db, call, unchanged }) => {
  await assert.rejects(call(native, 'token-a-2'), /DEVICE_BINDING_REQUIRED/); await unchanged();
  await assert.rejects(call(native, 'token-b'), /DEVICE_BINDING_REQUIRED/); await unchanged();
  await db.exec('update pm_push_devices set revoked_at=now()');
  await assert.rejects(call(), /DEVICE_BINDING_REQUIRED/); await unchanged();
  await db.exec("update pm_push_devices set revoked_at=null,subscription='{\"endpoint\":\"https://example.invalid\"}'");
  await assert.rejects(call(), /DEVICE_BINDING_REQUIRED/); await unchanged();
}));

test('expired/logout sessions, inactive accounts, branch changes and privacy epoch fail closed', () => using(async ({ db, call, unchanged }) => {
  await db.exec("update pm_sessions set expires_at=now()-interval '1 second' where token_hash=md5('token-a')");
  await assert.rejects(call(), /ADMIN_REQUIRED/); await unchanged();
  await db.exec("update pm_sessions set expires_at=now()+interval '1 hour'; update pm_accounts set active=false where login_id='a'");
  await assert.rejects(call(), /ADMIN_REQUIRED/); await unchanged();
  await db.exec("update pm_accounts set active=true,branches='[\"새솔\"]' where login_id='a'");
  await assert.rejects(call(), /BOOKING_UNAVAILABLE/); await unchanged();
  await db.exec("update pm_accounts set branches='[\"안산\"]' where login_id='a'; set request.headers='{\"x-promotors-data-epoch\":\"6\"}'");
  await assert.rejects(call(), /PRIVACY_EPOCH_MISMATCH/); await unchanged();
  await db.exec("set request.headers='{\"x-promotors-data-epoch\":\"7\"}'; delete from pm_sessions where token_hash=md5('token-a')");
  await assert.rejects(call(), /ADMIN_REQUIRED/); await unchanged();
}));

test('APNs native actions and explicit rejection preserve existing idempotent behavior', () => using(async ({ db, call }) => {
  await db.exec("update pm_push_devices set subscription='{\"transport\":\"apns\"}'");
  const result = await call({ ...native, reason: '관리자 알림에서 거절' }, 'token-a', 'reject');
  assert.equal(result.changed, true); assert.equal(result.booking.status, '취소');
  assert.equal((await call({ ...native, reason: '다른 사유' }, 'token-a', 'reject')).changed, false);
  assert.equal((await db.query('select count(*) count from action_audit')).rows[0].count, 1);
}));

test('a synthetic action and its audit are rolled back together', () => using(async ({ db, call, unchanged }) => {
  await db.exec('begin');
  assert.equal((await call()).changed, true);
  assert.equal((await db.query('select count(*) count from action_audit')).rows[0].count, 1);
  await db.exec('rollback');
  await unchanged();
}));
