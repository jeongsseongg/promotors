const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {PGlite} = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
// JSON string escapes preserve the inspected function body newlines on every Git platform.
const legacy = JSON.parse(read('fixtures/branch-access-legacy.json')).map(x=>x.source+';').join('\n\n');
const native = read('../native-sync-read.sql');
const patches = () => [read('../branch-read-access.sql'), read('../branch-write-access.sql'), read('../branch-delete-access.sql')];
const branches = ['프로모터스 안산점', '프로모터스 부천점', '프로모터스 새솔점'];
const secretKeys = new Set(['password', 'password_hash', 'passwordHash', 'token', 'sessionToken']);
const schema = `
create role anon; create role authenticated; create schema extensions; create schema pm_privacy;
create table public.pm_accounts(login_id text primary key,password_hash text not null default 'synthetic',role text not null,
 branches jsonb not null default '[]',profile jsonb not null default '{}',active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.pm_sessions(token_hash text primary key,login_id text references public.pm_accounts(login_id),
 expires_at timestamptz not null,created_at timestamptz default now(),last_seen_at timestamptz default now());
create table public.site_data(data_key text primary key,payload jsonb,page_url text,updated_at timestamptz default now());
create table pm_privacy.config(singleton boolean primary key default true,epoch integer default 1);
insert into pm_privacy.config values(true,1);
create function public.pm_token_hash(token text) returns text language sql immutable as $$select md5(token)$$;
create function pm_privacy.before_write(token text) returns void language plpgsql as $$begin return;end$$;
create function pm_privacy.customer_write(token text,k text,p jsonb) returns void language plpgsql as $$begin return;end$$;
create function pm_privacy.exact_owner(item jsonb,owner_id text) returns boolean language sql immutable as $$
 select (item->>'memberId'=owner_id or item#>>'{customer,id}'=owner_id)
 and coalesce(nullif(item->>'memberId',''),owner_id)=owner_id
 and coalesce(nullif(item#>>'{customer,id}',''),owner_id)=owner_id$$;
create function public.pm_push_inquiry_branch(message jsonb) returns text language sql stable as $$
 with owner as (select case when nullif(message->>'memberId','') is not null and nullif(message#>>'{customer,id}','') is not null
 and message->>'memberId'<>message#>>'{customer,id}' then null else coalesce(nullif(message->>'memberId',''),nullif(message#>>'{customer,id}','')) end as id),
 matches as (select item->>'branch' as branch from public.site_data sd cross join lateral jsonb_array_elements(sd.payload) item cross join owner
 where sd.data_key in ('pm-bookings','pm-service-runs') and jsonb_typeof(sd.payload)='array'
 and item->>'memberId'=owner.id and nullif(item->>'branch','') is not null and coalesce(item->>'guest','false')<>'true'
 and coalesce(item->>'status','')<>'취소' and case
 when nullif(message#>>'{serviceContext,runId}','') is not null then sd.data_key='pm-service-runs' and item->>'id'=message#>>'{serviceContext,runId}'
 when nullif(message#>>'{serviceContext,bookingId}','') is not null then sd.data_key='pm-bookings' and item->>'id'=message#>>'{serviceContext,bookingId}' else true end)
 select case when count(distinct branch)=1 then min(branch) else null end from matches$$;
`;
const bookings = branches.map((branch, i) => ({id: `b${i}`, branch, memberId: `c${i}`, name: `Synthetic ${i}`,
 customer: {id: `c${i}`, password: 'synthetic-nested'}, status: '예약', nested: {sessionToken: 'synthetic-only'}}));
const runs = branches.map((branch, i) => ({id: `r${i}`, branch, memberId: `c${i}`, bookingKey: `b${i}`,
 currentStep: 0, status: '정비중', steps: [{name: '점검', approvalRequired: false, approved: false, memo: ''}]}));
const audits = branches.map((branch, i) => ({id: `a${i}`, branch, runId: `r${i}`, memo: 'Synthetic audit'}));
const message = (id, branch, memberId, bookingId) => ({id, branch, memberId, customer: {id: memberId}, from: 'admin',
 message: 'Synthetic message', serviceContext: {branch, bookingId}});
const messages = branches.map((branch, i) => message(`m${i}`, branch, `c${i}`, `b${i}`));
function clone(value) { return JSON.parse(JSON.stringify(value)); }
async function seeded() {
 const db = new PGlite(); await db.exec(schema); await db.exec(legacy); await db.exec(native);
 for (const [id, role, branch, profile] of [
  ...branches.map((b,i)=>[`g${i}`,'general',[b],{id:`g${i}`,password:'synthetic',password_hash:'synthetic',passwordHash:'synthetic',token:'synthetic',sessionToken:'synthetic'}]),
  ['empty','general',[],{}],['malformed','general','not-an-array',{}],['main','main',[],{id:'main'}],
  ['developer','main',[],{id:'developer',developer:true}],...branches.map((b,i)=>[`c${i}`,'customer',[],{id:`c${i}`,car:`SYNTH${i}`}]),
  ['shared','customer',[],{id:'shared'}]]) {
  await db.query('insert into pm_accounts(login_id,role,branches,profile) values($1,$2,$3::jsonb,$4::jsonb)',[id,role,JSON.stringify(branch),JSON.stringify(profile)]);
  await db.query("insert into pm_sessions values(md5($1),$1,now()+interval '1 day',now(),now())",[id]);
 }
 const bad = {id:'bad-owner',branch:branches[0],memberId:'c0',customer:{id:'c1'}};
 const shared = branches.slice(0,2).map((branch,i)=>({id:`shared-${i}`,branch,memberId:'shared',status:'예약'}));
 const payloads = {'pm-branches':branches.map(name=>({name})),'pm-notices':[{id:'public',branch:branches[1]}],
  'pm-bookings':[...clone(bookings),bad,...shared,{id:'unassigned'}],'pm-service-runs':clone(runs),'pm-work-audit':clone(audits),
  'pm-messages':[...clone(messages),{id:'ambiguous',memberId:'shared',message:'Synthetic unscoped'},
   {...message('forged',branches[0],'c1','b1'),serviceContext:{branch:branches[1],bookingId:'b1'}},
   {...message('bad-message',branches[0],'c0','b0'),customer:{id:'c1'}}],
  'pm-members':branches.map((b,i)=>({id:`c${i}`,password:'synthetic-only',phone:'synthetic'})),
  'pm-customers':{SYNTH0:{password:'synthetic-only'}},'pm-banned-members':[{id:'global-ban'}],
  'pm-admin-notifications':[{id:'global-admin'}],'pm-branch-transfer-requests':[{id:'global-transfer'}]};
 for (const [key,value] of Object.entries(payloads)) await db.query('insert into site_data(data_key,payload) values($1,$2::jsonb)',[key,JSON.stringify(value)]);
 return db;
}
async function apply(db) { for (const patch of patches()) await db.exec(patch); }
async function database(run, patch = true) {
 const db=await seeded(); try {if(patch) await apply(db);await run(db);}finally{await db.close();}
}
async function rpc(db,name,token,...args) {
 const params=[token,...args], hasJson=['pm_sync_write','pm_sync_merge_by_id','pm_branch_hours_write'].includes(name);
 const values=params.map((_,i)=>`$${i+1}${hasJson&&i===2?'::jsonb':''}`).join(',');
 return (await db.query(`select public.${name}(${values}) as result`,params)).rows[0].result;
}
async function data(db,key) {return (await db.query('select payload from site_data where data_key=$1',[key])).rows[0]?.payload;}
const payload = (rows,key) => rows.find(x=>x.data_key===key)?.payload;
function noSecrets(value) {
 if (!value || typeof value!=='object') return;
 for(const [key,item] of Object.entries(value)){assert.ok(!secretKeys.has(key),`credential field ${key}`);noSecrets(item);}
}
async function write(db,mode,key,rows,token='g0') {return rpc(db,mode,token,key,JSON.stringify(rows),'synthetic://test');}
async function rejectNoChange(db,operation,pattern=/BRANCH|FORBIDDEN|KEY_NOT_ALLOWED|MAIN_ADMIN_REQUIRED|INVALID/) {
 const before=(await db.query('select data_key,payload from site_data order by data_key')).rows;
 await assert.rejects(operation,pattern);
 assert.deepEqual((await db.query('select data_key,payload from site_data order by data_key')).rows,before);
}

test('raw and native reads return only each general branch and remove credential fields',async()=>database(async db=>{
 for(let i=0;i<branches.length;i++) for(const method of ['pm_sync_read','pm_native_sync_read']){
  const rows=await rpc(db,method,`g${i}`); noSecrets(rows);
  for(const key of ['pm-bookings','pm-service-runs','pm-work-audit']) assert.ok(payload(rows,key).every(x=>x.branch===branches[i]));
  for(const key of ['pm-members','pm-customers','pm-banned-members','pm-admin-notifications','pm-branch-transfer-requests']) assert.equal(payload(rows,key),undefined);
  assert.equal(payload(rows,'pm-notices')[0].branch,branches[1]);
 }
}));
test('the unpatched fixture reproduces raw cross-branch and global-directory access',async()=>database(async db=>{
 const rows=await rpc(db,'pm_sync_read','g0');
 assert.ok(payload(rows,'pm-bookings').some(x=>x.branch===branches[1]));
 assert.ok(Array.isArray(payload(rows,'pm-members')));
 assert.equal((await rpc(db,'pm_customer_accounts','g0')).length,4);
},false));
test('ambiguous, contradictory and forged inquiries are absent from branch snapshots',async()=>database(async db=>{
 const rows=await rpc(db,'pm_sync_read','g0');
 assert.deepEqual(payload(rows,'pm-messages').map(x=>x.id),['m0']);
 assert.ok(!payload(rows,'pm-bookings').some(x=>x.id==='bad-owner'));
}));
test('empty and malformed branch assignments disclose no private rows',async()=>database(async db=>{
 for(const token of ['empty','malformed']){
  const rows=await rpc(db,'pm_sync_read',token);
  for(const key of ['pm-bookings','pm-service-runs','pm-work-audit','pm-messages']) assert.equal(payload(rows,key)?.length||0,0);
 }
}));
test('main, developer alias, customer and guest read behavior stays unchanged',async()=>database(async db=>{
 const before={};for(const token of ['main','developer','c0',null]) before[String(token)]=await rpc(db,'pm_sync_read',token);
 await apply(db);
 for(const token of ['main','developer','c0',null]) assert.deepEqual(await rpc(db,'pm_sync_read',token),before[String(token)]);
},false));
test('global customer-directory API denies generals while main and developer keep access',async()=>database(async db=>{
 for(const token of ['g0','g1','g2','empty','malformed']) await assert.rejects(rpc(db,'pm_customer_accounts',token),/MAIN_ADMIN_REQUIRED|ADMIN_REQUIRED|FORBIDDEN/);
 for(const token of ['main','developer']) assert.equal((await rpc(db,'pm_customer_accounts',token)).length,4);
}));
test('global full writes and transfer writes are rejected without touching data',async()=>database(async db=>{
 for(const mode of ['pm_sync_write','pm_sync_merge_by_id']) for(const key of ['pm-members','pm-customers','pm-notices','pm-banned-members','pm-branch-transfer-requests'])
  await rejectNoChange(db,()=>write(db,mode,key,[{id:'attempt',branch:branches[0]}]));
}));
test('full branch replacement preserves every other branch row',async()=>database(async db=>{
 const old=await data(db,'pm-bookings');
 const changed={...clone(bookings[0]),status:'신규'};
 await write(db,'pm_sync_write','pm-bookings',[changed]);
 const actual=await data(db,'pm-bookings');assert.deepEqual(actual.find(x=>x.id==='b0').status,'신규');
 for(const row of old.filter(x=>x.branch!==branches[0])) assert.deepEqual(actual.find(x=>x.id===row.id),row);
 assert.deepEqual(actual.find(x=>x.id==='bad-owner'),old.find(x=>x.id==='bad-owner'));
}));
test('merge checks existing and incoming branches, blocking cross-branch ID replacement',async()=>database(async db=>{
 for(const mode of ['pm_sync_write','pm_sync_merge_by_id']){
  await rejectNoChange(db,()=>write(db,mode,'pm-service-runs',[{...clone(runs[1]),branch:branches[0]}]));
  await rejectNoChange(db,()=>write(db,mode,'pm-service-runs',[{...clone(runs[0]),branch:branches[1]}]));
  await rejectNoChange(db,()=>write(db,mode,'pm-service-runs',[{id:'no-branch'}]));
 }
}));
test('existing work owner and booking identity cannot be reassigned',async()=>database(async db=>{
 for(const altered of [{...clone(runs[0]),memberId:'c1'},{...clone(runs[0]),bookingKey:'b1'}])
  await rejectNoChange(db,()=>write(db,'pm_sync_merge_by_id','pm-service-runs',[altered]));
}));
test('new work cannot bind to another branch booking or its customer',async()=>database(async db=>{
 await rejectNoChange(db,()=>write(db,'pm_sync_merge_by_id','pm-service-runs',[
  {...clone(runs[1]),id:'new-foreign-booking',branch:branches[0]}]));
}));
test('new work can be created from a verified own-branch booking',async()=>database(async db=>{
 const booking={...clone(bookings[0]),id:'new-own-booking'};
 await db.query("update site_data set payload=payload||jsonb_build_array($1::jsonb) where data_key='pm-bookings'",[JSON.stringify(booking)]);
 const run={...clone(runs[0]),id:'run-native-new-own-booking',bookingKey:booking.id,status:'입고 대기'};
 await write(db,'pm_sync_merge_by_id','pm-service-runs',[run]);
 assert.deepEqual((await data(db,'pm-service-runs')).find(x=>x.id===run.id),run);
}));
test('new and existing audit rows cannot be linked to another branch work item',async()=>database(async db=>{
 for(const id of ['audit-forged','a0']) await rejectNoChange(db,()=>write(db,'pm_sync_merge_by_id','pm-work-audit',[
  {id,branch:branches[0],runId:'r1',memo:'Synthetic audit'}]));
}));
test('a mixed-branch batch fails atomically and duplicate IDs are rejected',async()=>database(async db=>{
 await rejectNoChange(db,()=>write(db,'pm_sync_merge_by_id','pm-service-runs',[
  {...clone(runs[0]),status:'synthetic changed'},clone(runs[1])]));
 await rejectNoChange(db,()=>write(db,'pm_sync_merge_by_id','pm-service-runs',[clone(runs[0]),clone(runs[0])]),/DUPLICATE|INVALID/);
}));
test('empty and malformed generals cannot write any branch',async()=>database(async db=>{
 for(const token of ['empty','malformed']) for(const mode of ['pm_sync_write','pm_sync_merge_by_id'])
  await rejectNoChange(db,()=>write(db,mode,'pm-service-runs',[clone(runs[0])],token));
}));
test('normal work progress, audit, admin inquiry and booking writes remain usable',async()=>database(async db=>{
 const progressed={...clone(runs[0]),currentStep:1,status:'완료',completedAt:'synthetic-date',steps:[{...runs[0].steps[0],approved:true,submitted:true}]};
 for(const [key,row] of [['pm-service-runs',progressed],['pm-work-audit',{id:'audit-new',branch:branches[0],runId:'r0',action:'Synthetic'}],
  ['pm-messages',message('reply-new',branches[0],'c0','b0')],['pm-bookings',{...clone(bookings[0]),status:'예약'}]]){
  await write(db,'pm_sync_merge_by_id',key,[row]);assert.deepEqual((await data(db,key)).find(x=>x.id===row.id),row);
 }
 assert.deepEqual((await data(db,'pm-service-runs')).find(x=>x.id==='r1'),runs[1]);
}));
test('forged customer inquiry and cross-branch message IDs cannot be changed',async()=>database(async db=>{
 await rejectNoChange(db,()=>write(db,'pm_sync_merge_by_id','pm-messages',[message('spoof',branches[0],'c1','b1')]));
 await rejectNoChange(db,()=>write(db,'pm_sync_merge_by_id','pm-messages',[message('m1',branches[0],'c0','b0')]));
}));
test('branch hours are limited to the assigned branch including empty-scope accounts',async()=>database(async db=>{
 await rpc(db,'pm_branch_hours_write','g0',branches[0],JSON.stringify({open:'10:00'}),'synthetic://test');
 for(const [token,branch] of [['g0',branches[1]],['empty',branches[0]],['malformed',branches[0]]])
  await rejectNoChange(db,()=>rpc(db,'pm_branch_hours_write',token,branch,JSON.stringify({open:'09:00'}),'synthetic://test'));
}));
test('main and customer write behavior remains available',async()=>database(async db=>{
 await write(db,'pm_sync_write','pm-notices',[{id:'main-only'}],'main');assert.deepEqual(await data(db,'pm-notices'),[{id:'main-only'}]);
 await write(db,'pm_sync_merge_by_id','pm-bookings',[{...clone(bookings[0]),reason:'customer edit'}],'c0');
 assert.equal((await data(db,'pm-bookings')).find(x=>x.id==='b0').reason,'customer edit');
}));
test('an own-branch deletion preserves other work rows and returns only own remaining count',async()=>database(async db=>{
 const before=await data(db,'pm-service-runs');
 const result=await rpc(db,'pm_sync_delete_by_id','g0','pm-service-runs','r0','synthetic://delete');
 assert.equal(result.ok,true);assert.equal(result.count,0);
 assert.deepEqual(await data(db,'pm-service-runs'),before.filter(x=>x.id!=='r0'));
}));
test('cross-branch, missing and unassigned work IDs cannot be deleted by a branch account',async()=>database(async db=>{
 await db.query("update site_data set payload=payload||jsonb_build_array($1::jsonb) where data_key='pm-service-runs'",[JSON.stringify({id:'unassigned-run'})]);
 for(const id of ['r1','r2','does-not-exist','unassigned-run'])
  await rejectNoChange(db,()=>rpc(db,'pm_sync_delete_by_id','g0','pm-service-runs',id,'synthetic://delete'));
}));
test('duplicate work IDs spanning branches make deletion fail atomically',async()=>database(async db=>{
 await db.query("update site_data set payload=payload||jsonb_build_array($1::jsonb) where data_key='pm-service-runs'",[JSON.stringify({...runs[1],id:'r0'})]);
 await rejectNoChange(db,()=>rpc(db,'pm_sync_delete_by_id','g0','pm-service-runs','r0','synthetic://delete'));
}));
test('empty and malformed branch accounts cannot delete records',async()=>database(async db=>{
 for(const token of ['empty','malformed']) await rejectNoChange(db,()=>rpc(db,'pm_sync_delete_by_id',token,'pm-service-runs','r0','synthetic://delete'));
}));
test('main and developer retain global work deletion while customer deletion remains forbidden',async()=>database(async db=>{
 for(const [token,id] of [['main','r1'],['developer','r2']]) {
  const result=await rpc(db,'pm_sync_delete_by_id',token,'pm-service-runs',id,'synthetic://delete');assert.equal(result.ok,true);
 }
 assert.deepEqual((await data(db,'pm-service-runs')).map(x=>x.id),['r0']);
 await rejectNoChange(db,()=>rpc(db,'pm_sync_delete_by_id','c0','pm-service-runs','r0','synthetic://delete'));
}));
test('private helper schemas and functions are inaccessible to client roles',async()=>database(async db=>{
 for(const role of ['anon','authenticated']){
  assert.equal((await db.query("select has_schema_privilege($1,'pm_branch_access_private','USAGE') as allowed",[role])).rows[0].allowed,false);
  const permissions=(await db.query("select has_function_privilege($1,p.oid,'EXECUTE') as allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='pm_branch_access_private'",[role])).rows;
  assert.ok(permissions.length>0);assert.ok(permissions.every(x=>x.allowed===false));
 }
}));
test('anonymous client role can use scoped public RPC but cannot invoke a private helper',async()=>database(async db=>{
 await db.exec('set role anon');
 try {
  const rows=await rpc(db,'pm_native_sync_read','g0');
  assert.ok(payload(rows,'pm-bookings').every(x=>x.branch===branches[0]));
  await assert.rejects(db.query("select pm_branch_access_private.filter_snapshot('[]'::jsonb,'[]'::jsonb)"),/permission denied/);
 } finally {await db.exec('reset role');}
}));
test('public routine owner and execute privileges are preserved',async()=>database(async db=>{
 const metadata=async()=> (await db.query("select oid::regprocedure::text as signature,proowner,proacl from pg_proc where proname in ('pm_sync_read','pm_customer_accounts','pm_sync_write','pm_sync_merge_by_id','pm_branch_hours_write','pm_sync_delete_by_id') order by 1")).rows;
 const before=await metadata();await apply(db);assert.deepEqual(await metadata(),before);
},false));
test('applying the patches twice leaves the same routine definitions',async()=>database(async db=>{
 const definitions=async()=> (await db.query("select p.oid::regprocedure::text as signature,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','pm_branch_access_private') order by 1")).rows;
 const first=await definitions();await apply(db);assert.deepEqual(await definitions(),first);
}));
test('unsupported source aborts the entire patch transaction',async()=>database(async db=>{
 await db.exec("create or replace function public.pm_sync_read(p_token text default null) returns jsonb language sql as $$select '[]'::jsonb$$");
 const before=(await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d;
 await assert.rejects(db.exec('begin;'+patches()[0]+'commit;'));
 await db.exec('rollback');
 assert.equal((await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d,before);
 assert.equal((await db.query("select to_regnamespace('pm_branch_access_private') as n")).rows[0].n,null);
},false));
test('an unsupported write body rolls back the read patch and helper schema too',async()=>database(async db=>{
 await db.exec("create or replace function public.pm_sync_write(p_token text,p_key text,p_payload jsonb,p_page_url text default null) returns jsonb language sql as $$select '{}'::jsonb$$");
 const before=(await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d;
 await assert.rejects(db.exec('begin;'+patches().join('\n')+'commit;'));
 await db.exec('rollback');
 assert.equal((await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d,before);
 assert.equal((await db.query("select to_regnamespace('pm_branch_access_private') as n")).rows[0].n,null);
},false));
test('an unsupported delete body rolls back the preceding read and write patches',async()=>database(async db=>{
 await db.exec("create or replace function public.pm_sync_delete_by_id(p_token text,p_key text,p_id text,p_page_url text default null) returns jsonb language sql as $$select '{}'::jsonb$$");
 const before=(await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d;
 await assert.rejects(db.exec('begin;'+patches().join('\n')+'commit;'));
 await db.exec('rollback');
 assert.equal((await db.query("select pg_get_functiondef('public.pm_sync_read(text)'::regprocedure) as d")).rows[0].d,before);
 assert.equal((await db.query("select to_regnamespace('pm_branch_access_private') as n")).rows[0].n,null);
},false));
