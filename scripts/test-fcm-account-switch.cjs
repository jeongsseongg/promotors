const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const deviceId = '11111111-1111-4111-8111-111111111111';
const oldToken = 'Synthetic-Old-Token-Not-A-Provider-Token';
const newToken = 'Synthetic-New-Token-After-Local-Revocation';

async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema pm_privacy; create schema pm_push_private;
    create table pm_accounts(login_id text primary key,active boolean,role text,branches jsonb);
    create table pm_sessions(login_id text,token_hash text primary key,expires_at timestamptz);
    create table pm_push_preferences(login_id text primary key,enabled boolean default true,marketing boolean default false);
    create table pm_push_devices(device_id uuid primary key,login_id text,session_hash text,subscription jsonb,
      endpoint text unique,binding uuid,revoked_at timestamptz,updated_at timestamptz default now());
    create function pm_token_hash(text) returns text language sql as 'select md5($1)';
    create function pm_privacy.before_write(p_token text) returns void language plpgsql as $$ begin
      if current_setting('request.headers',true)::jsonb->>'x-promotors-data-epoch' is distinct from '7' then
        raise exception 'PRIVACY_EPOCH_MISMATCH'; end if;
    end $$;
    create function pm_notifications(text,text,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    insert into pm_accounts values('a',true,'main','[]'),('b',true,'main','[]');
    insert into pm_sessions values('a',md5('session-a'),now()+interval '1 hour'),
      ('b',md5('session-b'),now()+interval '1 hour');
    set request.headers='{"x-promotors-data-epoch":"7"}';`);
  await db.exec(fs.readFileSync(path.join(__dirname, '../notifications/native-subscribe.sql'), 'utf8'));
  const call = async (owner = 'a', token = oldToken) =>
    (await db.query('select pm_native_push_subscribe($1,$2,$3::jsonb) result',
      ['session-' + owner, 'native_subscribe', JSON.stringify({deviceId, transport: 'fcm', token})])).rows[0].result;
  const first = await call();
  return {db, call, first};
}
async function using(run) {const value = await setup(); try {await run(value);} finally {await value.db.close();}}
async function assertTransferred({db, call, first}) {
  const current = await call('b', newToken);
  assert.notEqual(current.binding, first.binding, 'old account binding must never survive reassignment');
  const row = (await db.query('select login_id,session_hash,subscription,binding,revoked_at from pm_push_devices')).rows[0];
  assert.equal(row.login_id, 'b');
  assert.equal(row.session_hash, (await db.query("select md5('session-b') hash")).rows[0].hash);
  assert.equal(row.subscription.token, newToken);
  assert.equal(row.subscription.transport, 'fcm');
  assert.equal(row.revoked_at, null);
  assert.equal((await call('b', newToken)).binding, current.binding, 'same current session/token restore stays stable');
}

test('a different live account cannot take an unrevoked device with another endpoint', () => using(async ({call}) => {
  await assert.rejects(call('b', newToken), /DEVICE_CONFLICT/);
}));

test('explicitly revoked devices can bind a new account and new FCM token', () => using(async e => {
  await e.db.exec('update pm_push_devices set revoked_at=now()');
  await assertTransferred(e);
}));

test('expired previous sessions do not block account switch after FCM token deletion', () => using(async e => {
  await e.db.exec("update pm_sessions set expires_at=now()-interval '1 second' where login_id='a'");
  await assertTransferred(e);
}));

test('deleted previous sessions do not block account switch after FCM token deletion', () => using(async e => {
  await e.db.exec("delete from pm_sessions where login_id='a'");
  await assertTransferred(e);
}));

test('an inactive previous account has no valid device ownership lease', () => using(async e => {
  await e.db.exec("update pm_accounts set active=false where login_id='a'");
  await assertTransferred(e);
}));

test('reassignment still requires the new authenticated session and current privacy epoch', () => using(async ({db, call}) => {
  await db.exec('update pm_push_devices set revoked_at=now()');
  await assert.rejects(call('unknown', newToken), /AUTH_REQUIRED/);
  await db.exec("set request.headers='{\"x-promotors-data-epoch\":\"6\"}'");
  await assert.rejects(call('b', newToken), /PRIVACY_EPOCH_MISMATCH/);
  await db.exec("set request.headers='{\"x-promotors-data-epoch\":\"7\"}'; update pm_accounts set active=false where login_id='b'");
  await assert.rejects(call('b', newToken), /AUTH_REQUIRED/);
}));

async function installWorker(db) {
  await db.exec(`create table pm_push_inbox(id uuid primary key default gen_random_uuid(),login_id text,category text,
      target jsonb,title text,body text,due_at timestamptz default now(),cancelled_at timestamptz);
    create table pm_push_deliveries(id uuid primary key default gen_random_uuid(),notification_id uuid,device_id uuid,binding uuid,
      status text default 'pending',attempts int default 0,available_at timestamptz default now(),lease_until timestamptz,
      lease_id uuid,error_code text,sent_at timestamptz,updated_at timestamptz default now(),unique(notification_id,device_id));
    create table pm_push_private.config(job_secret text,public_key text,private_key text,subject text);
    create function pm_push_private.allowed(i pm_push_inbox,a pm_accounts) returns boolean language sql as $$select a.active$$;
    create function pm_push_private.category_enabled(c text,p pm_push_preferences) returns boolean language sql as $$select p.enabled$$;`);
  const sql = fs.readFileSync(path.join(__dirname, '../notifications/booking-push-context.sql'), 'utf8');
  await db.exec(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pm_push_worker')));
}

test('old account queued deliveries remain invalid after revoked-device reassignment', () => using(async ({db, call, first}) => {
  await installWorker(db);
  await db.exec("insert into pm_push_inbox(login_id,category,target,title,body) values('a','booking','{}','synthetic','synthetic')");
  const worker = async (action, data = {}) =>
    (await db.query('select pm_push_worker($1,$2) result', [action, JSON.stringify(data)])).rows[0].result;
  const rows = await worker('claim'); assert.equal(rows.length, 1);
  const lease = {id: rows[0].id, leaseId: rows[0].leaseId};
  assert.equal((await worker('validate', lease)).valid, true);
  await db.exec('update pm_push_devices set revoked_at=now()');
  const transferred = await call('b', newToken);
  assert.notEqual(transferred.binding, first.binding);
  assert.equal((await worker('validate', lease)).valid, false);
  assert.equal((await worker('claim')).length, 0);
  assert.equal((await db.query('select status from pm_push_deliveries')).rows[0].status, 'cancelled');
}));
