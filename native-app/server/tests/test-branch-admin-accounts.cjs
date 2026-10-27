const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const source = fs.readFileSync(path.join(__dirname, '../branch-admin-accounts.sql'), 'utf8');
const guard = fs.readFileSync(path.join(__dirname, '../branch-admin-legacy-guard.sql'), 'utf8');
// Synthetic crypto isolates authorization/transaction behavior; this does not certify real pgcrypto hashing.
const fixtures = `
create role anon; create role authenticated; create schema extensions; create schema pm_privacy;
create function extensions.crypt(secret text,salt text) returns text language sql immutable as $$ select md5(secret || 'synthetic-only') $$;
create function extensions.gen_salt(kind text,cost int) returns text language sql as $$ select 'synthetic-salt'::text $$;
create function extensions.gen_random_bytes(size int) returns bytea language sql as $$ select decode(md5(random()::text)||md5(random()::text),'hex') $$;
create table public.pm_accounts(login_id text primary key,password_hash text not null,role text not null,
  branches jsonb not null default '[]',profile jsonb not null default '{}',active boolean not null default true,
  created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.pm_sessions(token_hash text primary key,login_id text not null references public.pm_accounts(login_id),expires_at timestamptz);
create table public.site_data(data_key text primary key,payload jsonb);
create table public.privacy_checks(calls int); insert into public.privacy_checks values(0);
create function public.pm_token_hash(token text) returns text language sql immutable as $$ select md5(token) $$;
create function pm_privacy.before_write(token text) returns void language sql as $$ update public.privacy_checks set calls=calls+1 $$;
insert into public.site_data values('pm-branches','[{"name":"안산점"},{"name":"새솔점"}]');
insert into public.pm_accounts(login_id,password_hash,role,branches,profile) values
 ('main-owner',extensions.crypt('MainSecret901','x'),'main','[]','{"id":"main-owner"}'),
 ('customer-one',extensions.crypt('CustomerSecret901','x'),'customer','[]','{}'),
 ('__general__legacy',extensions.crypt('LegacySecret901','x'),'general','["안산점"]','{"label":"기존 관리자"}'),
 ('empty-branch',extensions.crypt('EmptySecret901','x'),'general','[]','{}'),
 ('inactive-main',extensions.crypt('InactiveSecret901','x'),'main','[]','{}');
update public.pm_accounts set active=false where login_id='inactive-main';
insert into public.pm_sessions values
 (md5('main-token'),'main-owner',now()+interval '1 hour'),
 (md5('general-token'),'__general__legacy',now()+interval '1 hour'),
 (md5('customer-token'),'customer-one',now()+interval '1 hour'),
 (md5('inactive-token'),'inactive-main',now()+interval '1 hour'),
 (md5('expired-token'),'main-owner',now()-interval '1 hour');
`;
const legacyFixtures = [false, true].map(remember => `
create function public.pm_admin_login(p_password text${remember ? ',p_remember boolean' : ''})
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare account public.pm_accounts%rowtype; raw_token text; expiry timestamptz := now()+${remember ? "case when p_remember then interval '30 days' else interval '12 hours' end" : "interval '12 hours'"};
begin
  select * into account from public.pm_accounts
  where role in ('main', 'general') and active
    and password_hash=crypt(coalesce(p_password,''),password_hash)
  order by case when profile->>'developer'='true' then -1 when role='main' then 0 else 1 end limit 1;
  if account.login_id is null then raise exception 'INVALID_LOGIN'; end if;
  raw_token:=encode(gen_random_bytes(32),'hex');
  insert into public.pm_sessions values(public.pm_token_hash(raw_token),account.login_id,expiry);
  return jsonb_build_object('token',raw_token,'expiresAt',expiry,'role',case when account.profile->>'developer'='true' then 'developer' else account.role end);
end $$;
`).join('\n');
const input = change => ({loginId: 'ansan-manager', label: '안산점 관리자', password: 'NewBranch901', branches: ['안산점'], ...change});
async function database(run) {
  const db = new PGlite();
  try {await db.exec(fixtures); await db.exec(legacyFixtures); await db.exec(guard); await db.exec(source); await run(db);} finally {await db.close();}
}
async function manage(db, token, action, data = {}) {
  return (await db.query('select public.pm_branch_admin_manage($1,$2,$3::jsonb) as result', [token, action, JSON.stringify(data)])).rows[0].result;
}
async function login(db, id, password, remember = false) {
  return (await db.query('select public.pm_branch_admin_login($1,$2,$3) as result', [id, password, remember])).rows[0].result;
}
function safe(value) {
  const text = JSON.stringify(value);
  for (const key of ['password', 'password_hash', 'passwordHash', 'token', 'sessionToken']) assert.ok(!new RegExp('"' + key + '"').test(text));
}

test('only a current active main session may list or create branch accounts', async () => database(async db => {
  for (const token of [null, '', 'unknown', 'general-token', 'customer-token', 'expired-token', 'inactive-token']) {
    for (const action of ['list', 'create']) await assert.rejects(manage(db, token, action, input()), /MAIN_ADMIN_REQUIRED/);
  }
  assert.equal((await db.query('select count(*)::int as n from public.pm_accounts')).rows[0].n, 5);
  const rows = await manage(db, 'main-token', 'list'); safe(rows);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(x => x.id === '__general__legacy'), {id: '__general__legacy', loginId: null,
    label: '기존 관리자', branches: ['안산점'], createdAt: rows.find(x => x.id === '__general__legacy').createdAt,
    active: true, loginMode: 'legacy_password'});
  await assert.rejects(manage(db, 'main-token', 'delete', {id: '__general__legacy'}), /INVALID_ACTION/);
}));

test('main creates a fixed general role with valid branches and safe metadata, then exact-ID login works', async () => database(async db => {
  const beforeSessions = (await db.query('select count(*)::int as n from public.pm_sessions')).rows[0].n;
  const created = await manage(db, 'main-token', 'create', input()); safe(created);
  assert.equal(created.loginId, 'ansan-manager'); assert.equal(created.loginMode, 'id_password');
  assert.deepEqual(created.branches, ['안산점']);
  const stored = (await db.query("select role,branches,profile,password_hash<>$1 as hashed from public.pm_accounts where login_id='ansan-manager'", [input().password])).rows[0];
  assert.equal(stored.role, 'general'); assert.equal(stored.hashed, true);
  assert.deepEqual(stored.profile, {id: 'ansan-manager', label: '안산점 관리자', loginMode: 'id_password'});
  assert.equal((await db.query('select calls from public.privacy_checks')).rows[0].calls, 1);
  const result = await login(db, 'ansan-manager', input().password);
  assert.deepEqual(Object.keys(result).sort(), ['expiresAt', 'token']); assert.equal(result.token.length, 64);
  const owner = (await db.query('select login_id from public.pm_sessions where token_hash=public.pm_token_hash($1)', [result.token])).rows[0].login_id;
  assert.equal(owner, created.id);
  assert.equal((await db.query('select count(*)::int as n from public.pm_sessions')).rows[0].n, beforeSessions + 1);
  safe(await manage(db, 'main-token', 'list'));
}));

test('invalid branch, identity, privilege, password and duplicate inputs never create an account', async () => database(async db => {
  const cases = [
    [null, 'INVALID_PAYLOAD'], [[], 'INVALID_PAYLOAD'], [input({loginId:'x'}), 'INVALID_ID'],
    [input({label:''}), 'INVALID_PAYLOAD'], [input({label:'x'.repeat(61)}), 'INVALID_PAYLOAD'],
    [input({branches:[]}), 'INVALID_BRANCH'], [input({branches:['다른 매장']}), 'INVALID_BRANCH'],
    [input({branches:['안산점','안산점']}), 'INVALID_BRANCH'], [input({branches:[1]}), 'INVALID_BRANCH'],
    [input({role:'main'}), 'INVALID_PAYLOAD'], [input({active:false}), 'INVALID_PAYLOAD'],
    [input({password:'short1'}), 'WEAK_PASSWORD'], [input({password:'onlyletters'}), 'WEAK_PASSWORD'],
    [input({password:'1234567890'}), 'WEAK_PASSWORD'], [input({password:'A1'+'가'.repeat(24)}), 'WEAK_PASSWORD'],
    [input({loginId:'customer-one'}), 'DUPLICATE_ID'], [input({password:'MainSecret901'}), 'DUPLICATE_ADMIN_PASSWORD'],
    [input({password:'LegacySecret901'}), 'DUPLICATE_ADMIN_PASSWORD'],
  ];
  for (const [data, code] of cases) await assert.rejects(manage(db, 'main-token', 'create', data), new RegExp(code));
  assert.equal((await db.query('select count(*)::int as n from public.pm_accounts')).rows[0].n, 5);
  await manage(db, 'main-token', 'create', input());
  await assert.rejects(manage(db, 'main-token', 'create', input({loginId:'another-manager'})), /DUPLICATE_ADMIN_PASSWORD/);
  await assert.rejects(manage(db, 'main-token', 'create', input({password:'DifferentSecret901'})), /DUPLICATE_ID/);
}));

test('exact-ID login refuses wrong, customer, inactive, empty-branch and oversized credentials without sessions', async () => database(async db => {
  for (const [id, secret] of [['missing','NewBranch901'], ['main-owner','WrongSecret901'],
    ['customer-one','CustomerSecret901'], ['inactive-main','InactiveSecret901'], ['empty-branch','EmptySecret901'],
    ['main-owner',null], ['main-owner','A1'+'가'.repeat(24)]]) await assert.rejects(login(db,id,secret), /INVALID_LOGIN/);
  assert.equal((await db.query('select count(*)::int as n from public.pm_sessions')).rows[0].n, 5);
  const result = await login(db, 'main-owner', 'MainSecret901'); assert.equal(result.token.length, 64);
  const privileges = (await db.query(`select has_function_privilege('anon','public.pm_branch_admin_manage(text,text,jsonb)','EXECUTE') as manage,
    has_function_privilege('anon','public.pm_branch_admin_login(text,text,boolean)','EXECUTE') as login,
    has_schema_privilege('anon','pm_branch_admin_private','USAGE') as private`)).rows[0];
  assert.deepEqual(privileges, {manage:true, login:true, private:false});
}));

test('anonymous transport cannot bypass the main token gate or call private creation directly', async () => database(async db => {
  await db.exec('set role anon');
  try {
    await assert.rejects(manage(db, null, 'list'), /MAIN_ADMIN_REQUIRED/);
    await assert.rejects(db.query('select pm_branch_admin_private.create_account($1::jsonb)', [JSON.stringify(input())]), /permission denied/);
    const result = await manage(db, 'main-token', 'create', input());
    assert.equal(result.loginId, 'ansan-manager'); safe(result);
    await assert.rejects(db.query('select password_hash from public.pm_accounts'), /permission denied/);
  } finally {await db.exec('reset role');}
}));

test('a developer alias stored as main cannot list or create branch accounts', async () => database(async db => {
  for (const developer of [true, 'true']) {
    await db.query("update public.pm_accounts set profile=jsonb_build_object('id',login_id,'developer',$1::jsonb) where login_id='main-owner'", [JSON.stringify(developer)]);
    for (const action of ['list', 'create']) await assert.rejects(manage(db,'main-token',action,input()), /MAIN_ADMIN_REQUIRED/);
  }
  assert.equal((await db.query('select count(*)::int as n from public.pm_accounts')).rows[0].n, 5);
  assert.equal((await db.query('select calls from public.privacy_checks')).rows[0].calls, 0);
}));

async function legacyLogin(db, password, remember) {
  const args = remember === undefined ? [password] : [password, remember];
  return (await db.query(`select public.pm_admin_login($1${remember === undefined ? '' : ',$2::boolean'}) as result`, args)).rows[0].result;
}
test('both legacy overloads retain existing logins but require the new branch account ID, and guard reruns are no-ops', async () => database(async db => {
  const before = await db.query("select oid::regprocedure::text as signature,pg_get_functiondef(oid) as definition from pg_proc where proname='pm_admin_login' order by oid");
  await db.exec(guard);
  assert.deepEqual((await db.query("select oid::regprocedure::text as signature,pg_get_functiondef(oid) as definition from pg_proc where proname='pm_admin_login' order by oid")).rows, before.rows);
  await manage(db,'main-token','create',input());
  for (const remember of [undefined, false, true]) {
    await assert.rejects(legacyLogin(db,input().password,remember), /INVALID_LOGIN/);
    for (const [secret, expectedOwner] of [['MainSecret901','main-owner'],['LegacySecret901','__general__legacy']]) {
      const result = await legacyLogin(db,secret,remember);
      const owner = (await db.query('select login_id from public.pm_sessions where token_hash=public.pm_token_hash($1)',[result.token])).rows[0].login_id;
      assert.equal(owner,expectedOwner);
      const hours = (Date.parse(result.expiresAt)-Date.now())/3600000;
      assert.ok(hours>(remember === true ? 719 : 11) && hours<(remember === true ? 721 : 13));
    }
  }
  const result=await login(db,input().loginId,input().password); assert.equal(result.token.length,64);
}));

test('legacy guard refuses an unknown filter or missing overload atomically and the new API cannot install first', async () => {
  const db=new PGlite();
  try {
    await db.exec(fixtures); await db.exec(legacyFixtures);
    await assert.rejects(db.exec(source), /LEGACY_LOGIN_GUARD_REQUIRED/);
    await db.exec('drop function public.pm_admin_login(text,boolean)');
    await assert.rejects(db.exec(guard), /LEGACY_LOGIN_SIGNATURE_MISSING/);
    const definition=(await db.query("select pg_get_functiondef('public.pm_admin_login(text)'::regprocedure) as source")).rows[0].source;
    assert.ok(!definition.includes('id_password'), 'a failed second overload must roll back the first patch');
    await db.exec(legacyFixtures.replaceAll('create function','create or replace function').replaceAll("where role in ('main', 'general') and active", "where role = 'main' and active"));
    await assert.rejects(db.exec(guard), /LEGACY_LOGIN_FILTER_MISMATCH/);
    await db.exec(legacyFixtures.replaceAll('create function','create or replace function').replaceAll('end $$;', () => "-- where role in ('main', 'general') and active\nend $$;"));
    await assert.rejects(db.exec(guard), /LEGACY_LOGIN_FILTER_MISMATCH/);
  } finally {await db.close();}
});

test('new branch ID login preserves 12-hour default and 30-day remembered sessions', async () => database(async db => {
  await manage(db,'main-token','create',input());
  for (const remember of [false,true]) {
    const result=await login(db,input().loginId,input().password,remember);
    const hours=(Date.parse(result.expiresAt)-Date.now())/3600000;
    assert.ok(hours>(remember ? 719 : 11) && hours<(remember ? 721 : 13));
    const session=(await db.query('select login_id,expires_at=$2::timestamptz as same_expiry from public.pm_sessions where token_hash=public.pm_token_hash($1)',[result.token,result.expiresAt])).rows[0];
    assert.equal(session.login_id,input().loginId);
    assert.equal(session.same_expiry,true);
  }
  const defaults=(await db.query('select public.pm_branch_admin_login($1,$2) as result',[input().loginId,input().password])).rows[0].result;
  const defaultHours=(Date.parse(defaults.expiresAt)-Date.now())/3600000;
  assert.ok(defaultHours>11 && defaultHours<13);
}));
