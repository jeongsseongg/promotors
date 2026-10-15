const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const token = 'AbCdEF0123:_-'.repeat(12);
const device = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema pm_privacy; create schema pm_push_private;
    create table pm_accounts(login_id text primary key, active boolean, role text, branches jsonb);
    create table pm_sessions(login_id text, token_hash text primary key, expires_at timestamptz);
    create table pm_push_preferences(login_id text primary key,enabled boolean default false,marketing boolean default false);
    create table pm_push_devices(device_id uuid primary key,login_id text,session_hash text,subscription jsonb,endpoint text unique,
      binding uuid,revoked_at timestamptz,updated_at timestamptz default now());
    create function pm_token_hash(text) returns text language sql as 'select md5($1)';
    create function pm_privacy.before_write(p_token text) returns void language plpgsql as $$ begin
      if p_token='erasing' then raise exception 'ACCOUNT_RESTRICTED'; end if;
      if current_setting('request.headers',true)::jsonb->>'x-promotors-data-epoch' is distinct from '7' then raise exception 'PRIVACY_EPOCH_MISMATCH'; end if;
    end $$;
    create function pm_notifications(p_token text,p_action text,p_data jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    insert into pm_accounts values('a',true,'general','["안산"]'),('b',true,'general','["새솔"]');
    insert into pm_sessions values('a',md5('token-a'),now()+interval '1 hour'),('b',md5('token-b'),now()+interval '1 hour');
    set request.headers='{"x-promotors-data-epoch":"7"}';
  `);
  await db.exec(fs.readFileSync(path.join(__dirname, '../notifications/native-subscribe.sql'), 'utf8'));
  const call = async (auth='token-a', data={}, action='native_subscribe') =>
    (await db.query('select pm_native_push_subscribe($1,$2,$3::jsonb) result',
      [auth, action, JSON.stringify({deviceId:device(1),transport:'fcm',token,...data})])).rows[0].result;
  return {db,call};
}
async function using(fn) { const state=await setup(); try { await fn(state); } finally { await state.db.close(); } }

test('FCM registration preserves the exact opaque token, hashes endpoint and does not opt in', () => using(async ({db,call}) => {
  const first=await call(); assert.ok(first.binding);
  const row=(await db.query('select * from pm_push_devices')).rows[0];
  assert.equal(row.subscription.transport,'fcm'); assert.equal(row.subscription.token,token);
  assert.match(row.endpoint,/^fcm:promotors-8ddec:kr\.promotors\.app:[a-f0-9]{64}$/);
  assert.equal(row.endpoint.includes(token),false);
  assert.equal((await call()).binding,first.binding);
  assert.equal((await db.query('select enabled from pm_push_preferences')).rows[0].enabled,false);
  const changed=await call('token-a',{token:token.toLowerCase()}); assert.notEqual(changed.binding,first.binding);
}));

test('native auth, active-account, erasure, epoch and device-conflict gates remain enforced', () => using(async ({db,call}) => {
  await assert.rejects(call('invalid'),/AUTH_REQUIRED/);
  await assert.rejects(call('erasing'),/ACCOUNT_RESTRICTED/);
  await db.exec("set request.headers='{\"x-promotors-data-epoch\":\"6\"}'");
  await assert.rejects(call(),/PRIVACY_EPOCH_MISMATCH/);
  await db.exec("set request.headers='{\"x-promotors-data-epoch\":\"7\"}'");
  await call(); await assert.rejects(call('token-b',{token:token+'other'}),/DEVICE_CONFLICT/);
  await db.exec("update pm_accounts set active=false where login_id='a'");
  await assert.rejects(call(),/AUTH_REQUIRED/);
}));

test('rotation, reinstall and account switch revoke old bindings without deleting audit ownership', () => using(async ({db,call}) => {
  const first=await call();
  const rotation=await call('token-a',{token:token+'ROTATED'}); assert.notEqual(rotation.binding,first.binding);
  const reinstall=await call('token-a',{token:token+'ROTATED',deviceId:device(2)});
  assert.notEqual(reinstall.binding,rotation.binding);
  const old=(await db.query('select revoked_at from pm_push_devices where device_id=$1',[device(1)])).rows[0];
  assert.ok(old.revoked_at);
  const switched=await call('token-b',{token:token+'ROTATED',deviceId:device(2)});
  assert.notEqual(switched.binding,reinstall.binding);
  await db.exec("delete from pm_sessions where login_id='b'");
  await assert.rejects(call('token-b',{token:token+'ROTATED',deviceId:device(2)}),/AUTH_REQUIRED/);
}));

test('FCM validation is bounded, APNs remains compatible and Live Activity stays APNs-only', () => using(async ({db,call}) => {
  for(const data of [{token:''},{token:'x'.repeat(4097)},{token:token+'\n'},{transport:'unknown'},{deviceId:null}])
    await assert.rejects(call('token-a',data),/INVALID_DEVICE/);
  const apns=await call('token-a',{transport:'apns',token:'A'.repeat(64)});
  assert.equal((await db.query('select subscription from pm_push_devices')).rows[0].subscription.token,'a'.repeat(64));
  await call('token-a',{deviceId:device(1),binding:apns.binding,kind:'update',token:'b'.repeat(64)},'native_activity');
  const fcm=await call();
  await assert.rejects(call('token-a',{binding:fcm.binding,kind:'update',token:'b'.repeat(64)},'native_activity'),/DEVICE_BINDING_REQUIRED/);
  await assert.rejects(call('token-a',{transport:'apns',token:'not-hex'}),/INVALID_DEVICE/);
  const allowed=(await db.query("select has_function_privilege('anon','pm_native_push_subscribe(text,text,jsonb)','EXECUTE') allowed")).rows[0];
  assert.equal(allowed.allowed,true);
}));

test('native registration keeps the existing per-account device limit', () => using(async ({call}) => {
  for(let n=1;n<=20;n++)await call('token-a',{deviceId:device(n),token:token+n});
  await call('token-a',{deviceId:device(1),token:token+1});
  await assert.rejects(call('token-a',{deviceId:device(21),token:token+21}),/DEVICE_LIMIT/);
}));

async function addWorker(db) {
  await db.exec(`create table pm_push_inbox(id uuid primary key default gen_random_uuid(),login_id text,category text,target jsonb,title text,body text,due_at timestamptz default now(),cancelled_at timestamptz);
    create table pm_push_deliveries(id uuid primary key default gen_random_uuid(),notification_id uuid,device_id uuid,binding uuid,status text default 'pending',attempts int default 0,
      available_at timestamptz default now(),lease_until timestamptz,lease_id uuid,error_code text,sent_at timestamptz,updated_at timestamptz default now(),unique(notification_id,device_id));
    create table pm_push_private.config(job_secret text,public_key text,private_key text,subject text);
    create function pm_push_private.allowed(i pm_push_inbox,a pm_accounts) returns boolean language sql as $$select a.active and (a.role in ('main','developer') or a.branches ? (i.target->>'branch'))$$;
    create function pm_push_private.category_enabled(c text,p pm_push_preferences) returns boolean language sql as $$select p.enabled and (c<>'marketing' or p.marketing)$$;
  `);
  const sql=fs.readFileSync(path.join(__dirname,'../notifications/booking-push-context.sql'),'utf8');
  await db.exec(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.pm_push_worker')));
}

test('registered FCM devices use the unchanged claim/validate/ack queue with lease, scope and revocation gates', () => using(async ({db,call}) => {
  await addWorker(db); await db.exec('begin'); await call();
  await db.exec("update pm_push_preferences set enabled=true; insert into pm_push_inbox(login_id,category,target,title,body) values('a','booking','{\"kind\":\"booking\",\"branch\":\"안산\"}','예시','예시')");
  const worker=async(action,data={})=>(await db.query('select pm_push_worker($1,$2) result',[action,JSON.stringify(data)])).rows[0].result;
  const rows=await worker('claim'); assert.equal(rows.length,1); assert.equal(rows[0].subscription.transport,'fcm');
  assert.equal((await worker('claim')).length,0,'active lease prevents duplicate claim');
  const ack={id:rows[0].id,leaseId:rows[0].leaseId};
  assert.equal((await worker('validate',ack)).valid,true);
  assert.equal((await worker('validate',{...ack,leaseId:device(9)})).valid,false);
  await db.exec("update pm_accounts set branches='[\"새솔\"]' where login_id='a'");
  assert.equal((await worker('validate',ack)).valid,false);
  await db.exec("update pm_accounts set branches='[\"안산\"]' where login_id='a'; update pm_sessions set expires_at=now()-interval '1 second'");
  assert.equal((await worker('validate',ack)).valid,false);
  await db.exec("update pm_sessions set expires_at=now()+interval '1 hour'; update pm_push_preferences set enabled=false");
  assert.equal((await worker('validate',ack)).valid,false);
  await db.exec('update pm_push_preferences set enabled=true');
  await worker('ack',{...ack,result:'failed',code:'FCM_404_NOT_FOUND'});
  assert.equal((await db.query('select revoked_at from pm_push_devices')).rows[0].revoked_at,null);
  await db.exec("update pm_push_deliveries set status='sending',lease_until=now()+interval '5 minutes'");
  await worker('ack',{...ack,result:'failed',code:'410'});
  assert.ok((await db.query('select revoked_at from pm_push_devices')).rows[0].revoked_at);
  await db.exec('rollback');
}));
