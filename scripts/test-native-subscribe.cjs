const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
test('native subscription respects auth gates, ownership, token validation and logout revocation', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create table pm_accounts(login_id text primary key, active boolean);
      create table pm_sessions(login_id text, token_hash text primary key, expires_at timestamptz);
      create table pm_push_preferences(login_id text primary key);
      create table pm_push_devices(device_id uuid primary key,login_id text,session_hash text,subscription jsonb,endpoint text unique,
        binding uuid,revoked_at timestamptz,updated_at timestamptz default now());
      create function pm_token_hash(text) returns text language sql as 'select md5($1)';
      create function pm_notifications(p_token text,p_action text,p_data jsonb) returns jsonb language plpgsql as $$
      begin if p_token='erasing' then raise exception 'ACCOUNT_RESTRICTED'; end if; return '{}'::jsonb; end $$;
      insert into pm_accounts values('a',true),('b',true);
      insert into pm_sessions values('a',md5('token-a'),now()+interval '1 hour'),('b',md5('token-b'),now()+interval '1 hour');
    `);
    await db.exec(fs.readFileSync(path.join(__dirname, '../notifications/native-subscribe.sql'), 'utf8'));
    const did = '11111111-1111-4111-8111-111111111111';
    async function subscribe(auth, token = 'a'.repeat(64), deviceId = did) {
      return (await db.query('select pm_native_push_subscribe($1,$2,$3::jsonb) as result',
        [auth, 'native_subscribe', JSON.stringify({ token, deviceId })])).rows[0].result;
    }
    await assert.rejects(subscribe('invalid'), /AUTH_REQUIRED/);
    await assert.rejects(subscribe('erasing'), /ACCOUNT_RESTRICTED/);
    await assert.rejects(subscribe('token-a', 'bad'), /INVALID_DEVICE/);
    const first = await subscribe('token-a');
    assert.ok(first.binding); assert.equal((await subscribe('token-a')).binding, first.binding);
    await assert.rejects(subscribe('token-b', 'b'.repeat(64)), /DEVICE_CONFLICT/);
    await db.exec('update pm_push_devices set revoked_at=now()');
    const renewed = await subscribe('token-a'); assert.notEqual(renewed.binding, first.binding);
    const switched = await subscribe('token-b'); assert.notEqual(switched.binding, renewed.binding);
    const row = (await db.query('select login_id, subscription, revoked_at from pm_push_devices')).rows[0];
    assert.equal(row.login_id, 'b'); assert.equal(row.subscription.transport, 'apns'); assert.equal(row.revoked_at, null);
    const reinstall = await subscribe('token-b', 'a'.repeat(64), '22222222-2222-4222-8222-222222222222');
    assert.notEqual(reinstall.binding, switched.binding);
    const devices = (await db.query('select device_id, revoked_at from pm_push_devices order by device_id')).rows;
    assert.equal(devices.length, 2); assert.ok(devices[0].revoked_at); assert.equal(devices[1].revoked_at, null);
    const allowed = (await db.query("select has_function_privilege('anon','pm_native_push_subscribe(text,text,jsonb)','execute') as allowed")).rows[0];
    assert.equal(allowed.allowed, true);
  } finally { await db.close(); }
});
