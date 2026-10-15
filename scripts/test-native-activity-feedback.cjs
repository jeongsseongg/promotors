const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const root = path.join(__dirname, '..');
const token = 'c'.repeat(64), fresh = 'd'.repeat(64), start = 'b'.repeat(64), normal = 'a'.repeat(64);
const delivery = '11111111-1111-4111-8111-111111111111', lease = '22222222-2222-4222-8222-222222222222';
const device = '33333333-3333-4333-8333-333333333333', binding = '44444444-4444-4444-8444-444444444444';
const inbox = '55555555-5555-4555-8555-555555555555', other = '66666666-6666-4666-8666-666666666666';
const schema = `
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA auth; CREATE SCHEMA pm_push_private;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
SET request.jwt.claim.role = 'service_role';
CREATE TABLE public.pm_accounts (login_id text PRIMARY KEY, active boolean, role text, profile jsonb);
CREATE TABLE public.pm_sessions (token_hash text PRIMARY KEY, login_id text, expires_at timestamptz);
CREATE TABLE public.pm_push_preferences (login_id text PRIMARY KEY, enabled boolean, booking boolean);
CREATE TABLE public.pm_push_devices (device_id uuid PRIMARY KEY, login_id text, session_hash text, subscription jsonb, binding uuid, revoked_at timestamptz, updated_at timestamptz);
CREATE TABLE public.pm_push_inbox (id uuid PRIMARY KEY, login_id text, category text, target jsonb, cancelled_at timestamptz, due_at timestamptz);
CREATE TABLE public.pm_push_deliveries (id uuid PRIMARY KEY, notification_id uuid, device_id uuid, binding uuid, lease_id uuid, lease_until timestamptz, status text);
CREATE TABLE public.qa_validation_calls (count integer); INSERT INTO public.qa_validation_calls VALUES(0);
CREATE FUNCTION pm_push_private.allowed(i public.pm_push_inbox,a public.pm_accounts) RETURNS boolean LANGUAGE sql AS $$ SELECT a.active $$;
CREATE FUNCTION pm_push_private.category_enabled(category text,p public.pm_push_preferences) RETURNS boolean LANGUAGE sql AS $$ SELECT p.enabled AND p.booking $$;
`;
function guardDefinition() {
  const source = fs.readFileSync(path.join(root, 'notifications/booking-push-context.sql'), 'utf8');
  const branch = source.match(/elsif p_action='validate' then\s*([\s\S]*?)\s*elsif p_action='ack'/);
  assert.ok(branch, 'reuse the current worker validation branch without rewriting it');
  return `CREATE FUNCTION public.pm_push_worker(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql AS $guard$
    BEGIN
      IF p_action <> 'validate' THEN RAISE EXCEPTION 'SYNTHETIC_ACTION_FORBIDDEN'; END IF;
      UPDATE public.qa_validation_calls SET count=count+1;
      ${branch[1]}
    END $guard$;`;
}
async function reset(db) {
  await db.exec(`TRUNCATE public.pm_accounts,public.pm_sessions,public.pm_push_preferences,public.pm_push_devices,public.pm_push_inbox,public.pm_push_deliveries;
    UPDATE public.qa_validation_calls SET count=0; SET request.jwt.claim.role='service_role';
    INSERT INTO public.pm_accounts VALUES('qa-admin',true,'main','{}');
    INSERT INTO public.pm_sessions VALUES('qa-session','qa-admin',now()+interval '1 hour');
    INSERT INTO public.pm_push_preferences VALUES('qa-admin',true,true);
    INSERT INTO public.pm_push_inbox VALUES('${inbox}','qa-admin','booking','{}',NULL,now());
    INSERT INTO public.pm_push_deliveries VALUES('${delivery}','${inbox}','${device}','${binding}','${lease}',now()+interval '5 minutes','sending');`);
  await db.query(`INSERT INTO public.pm_push_devices VALUES($1,'qa-admin','qa-session',$2,$3,NULL,'2030-01-01T00:00:00Z')`,
    [device, {transport: 'apns', token: normal, activityStart: start, activityUpdate: token, customMetadata: 'preserve'}, binding]);
}
async function clear(db, expected = token, targetLease = lease) {
  const result = await db.query('SELECT public.pm_push_activity_clear($1,$2,$3) AS result', [delivery,targetLease,expected]);
  return result.rows[0].result;
}
async function subscription(db) {return (await db.query('SELECT subscription FROM public.pm_push_devices')).rows[0].subscription;}
test('activity feedback executes real SQL with existing validation and exact-token compare-and-swap guards', async t => {
  const db = new PGlite();
  try {
    await db.exec(schema); await db.exec(guardDefinition());
    const before = (await db.query("SELECT pg_get_functiondef('public.pm_push_worker(text,jsonb)'::regprocedure) AS definition")).rows[0].definition;
    await db.exec(fs.readFileSync(path.join(root, 'notifications/native-activity-feedback.sql'), 'utf8'));
    assert.equal((await db.query("SELECT pg_get_functiondef('public.pm_push_worker(text,jsonb)'::regprocedure) AS definition")).rows[0].definition,before);
    await t.test('only activityUpdate is removed while start, device token, metadata and timestamp stay unchanged', async () => {
      await reset(db); const result = await clear(db); assert.equal(result.cleared,true);
      const value = await subscription(db); assert.equal(value.activityUpdate,undefined); assert.equal(value.activityStart,start);
      assert.equal(value.token,normal); assert.equal(value.customMetadata,'preserve');
      assert.equal((await db.query('SELECT count FROM public.qa_validation_calls')).rows[0].count,1);
      assert.equal(new Date((await db.query('SELECT updated_at FROM public.pm_push_devices')).rows[0].updated_at).toISOString(),'2030-01-01T00:00:00.000Z');
      assert.equal((await clear(db)).cleared,false, 'feedback is idempotent');
    });
    await t.test('a newly registered update token wins against stale feedback', async () => {
      await reset(db); await db.query("UPDATE public.pm_push_devices SET subscription=jsonb_set(subscription,'{activityUpdate}',to_jsonb($1::text))",[fresh]);
      assert.equal((await clear(db)).cleared,false); assert.equal((await subscription(db)).activityUpdate,fresh);
    });
    await t.test('SQL execution grants are service_role only, and the JWT role gate is enforced', async () => {
      await reset(db);
      for (const role of ['anon','authenticated']) {
        const privilege = await db.query("SELECT has_function_privilege($1,'public.pm_push_activity_clear(uuid,uuid,text)','EXECUTE') AS allowed",[role]);
        assert.equal(privilege.rows[0].allowed,false);
        await db.exec(`SET request.jwt.claim.role='${role}'`); await assert.rejects(clear(db),/FORBIDDEN/);
        assert.equal((await subscription(db)).activityUpdate,token);
      }
      await db.exec("SET request.jwt.claim.role='service_role'");
      assert.equal((await db.query("SELECT has_function_privilege('service_role','public.pm_push_activity_clear(uuid,uuid,text)','EXECUTE') AS allowed")).rows[0].allowed,true);
    });
    const denied = [
      ['expired session', "UPDATE public.pm_sessions SET expires_at=now()-interval '1 second'"],
      ['replaced session', "UPDATE public.pm_push_devices SET session_hash='qa-missing-session'"],
      ['revoked device', 'UPDATE public.pm_push_devices SET revoked_at=now()'],
      ['inactive account', 'UPDATE public.pm_accounts SET active=false'],
      ['disabled preference', 'UPDATE public.pm_push_preferences SET enabled=false'],
      ['cancelled notification', 'UPDATE public.pm_push_inbox SET cancelled_at=now()'],
      ['expired lease', "UPDATE public.pm_push_deliveries SET lease_until=now()-interval '1 second'"],
      ['completed delivery', "UPDATE public.pm_push_deliveries SET status='sent'"],
      ['changed binding', `UPDATE public.pm_push_devices SET binding='${other}'`],
      ['changed device', `UPDATE public.pm_push_deliveries SET device_id='${other}'`],
      ['other owner', "UPDATE public.pm_push_devices SET login_id='qa-other-owner'"],
      ['other notification owner', "UPDATE public.pm_push_inbox SET login_id='qa-other-owner'"],
      ['non-APNs subscription', "UPDATE public.pm_push_devices SET subscription=jsonb_set(subscription,'{transport}','\"fcm\"')"],
    ];
    for (const [name, sql] of denied) await t.test(`${name} cannot clear the old field`, async () => {
      await reset(db); await db.exec(sql); assert.equal((await clear(db)).cleared,false); assert.equal((await subscription(db)).activityUpdate,token);
    });
    await t.test('a stale lease token and malformed expected token cannot authorize cleanup', async () => {
      await reset(db); assert.equal((await clear(db,token,other)).cleared,false);
      await assert.rejects(clear(db,'not-a-token'),/INVALID_DEVICE/); assert.equal((await subscription(db)).activityUpdate,token);
    });
  } finally {await db.close();}
});
